// ─────────────────────────────────────────────────────────────
//  WGSL
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

const WGSL_COMMON = /* wgsl */`
struct U {
  viewProj: mat4x4f,
  view: mat4x4f,
  invViewProj: mat4x4f,
  lightVP: mat4x4f,
  topVP: mat4x4f,
  camPos: vec4f,     // xyz, w = time
  camFwd: vec4f,
  keyDir: vec4f,     // xyz toward light, w = intensity
  screen: vec4f,     // w, h, 1/w, 1/h
  art: vec4f,        // where the drawing sits in the rest plane: origin (u, w), 1 / size
  jelly: vec4f,      // absorption strength, milkiness, albedo gain, unused
  misc: vec4f,       // exposure, meshAlpha, floorY, material kind
  bg: vec4f,
  shadowTint: vec4f,
};

const PI = 3.14159265;

fn hash3(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hash3(i + vec3f(0,0,0)), hash3(i + vec3f(1,0,0)), u.x), mix(hash3(i + vec3f(0,1,0)), hash3(i + vec3f(1,1,0)), u.x), u.y);
  let b = mix(mix(hash3(i + vec3f(0,0,1)), hash3(i + vec3f(1,0,1)), u.x), mix(hash3(i + vec3f(0,1,1)), hash3(i + vec3f(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
fn fbm(p: vec3f) -> f32 {
  return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 7.1) + 0.15 * vnoise(p * 4.37 + 3.3);
}

// rounded rectangle softbox seen along direction d
fn softbox(d: vec3f, c: vec3f, up: vec3f, size: vec2f, blur: f32) -> f32 {
  let cd = dot(d, c);
  if (cd <= 0.0) { return 0.0; }
  let t1 = normalize(cross(up, c));
  let t2 = cross(c, t1);
  let uv = vec2f(dot(d, t1), dot(d, t2)) / cd;
  let q = abs(uv) - size;
  let sd = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;
  return 1.0 - smoothstep(-blur, blur, sd);
}

// procedural photo studio: pale cyclorama, overhead softbox, back-left strip, front-right fill card
fn studioEnv(d: vec3f, rough: f32, bg: vec3f) -> vec3f {
  let b = 0.012 + rough * 0.55;
  let y = d.y;
  var col = mix(bg * 0.62, bg * 1.05, smoothstep(-0.35, 0.25, y));
  // the bright paper sweep near the horizon gives vertical walls something to reflect
  col += bg * 0.55 * (1.0 - smoothstep(0.0, 0.3, abs(y + 0.08)));
  col = mix(col, bg * 0.8, smoothstep(0.3, 1.0, y));
  col += vec3f(1.0, 0.985, 0.96) * 3.2 * softbox(d, normalize(vec3f(0.05, 1.0, -0.15)), vec3f(0.0, 0.0, 1.0), vec2f(0.55, 0.32), b);
  col += vec3f(1.0, 0.98, 0.95) * 3.0 * softbox(d, normalize(vec3f(-0.42, 0.34, -0.8)), vec3f(0.0, 1.0, 0.0), vec2f(0.7, 0.06), b);
  col += vec3f(1.0, 0.97, 0.93) * 4.0 * softbox(d, normalize(vec3f(-0.8, 0.38, -0.2)), vec3f(0.0, 1.0, 0.0), vec2f(0.08, 0.55), b);
  col += vec3f(0.95, 0.97, 1.0) * 1.2 * softbox(d, normalize(vec3f(0.85, 0.3, 0.55)), vec3f(0.0, 1.0, 0.0), vec2f(0.45, 0.5), b * 1.3);
  return col;
}

fn ggx(N: vec3f, V: vec3f, L: vec3f, rough: f32) -> f32 {
  let H = normalize(V + L);
  let a = max(rough * rough, 0.002);
  let a2 = a * a;
  let NdH = max(dot(N, H), 0.0);
  let NdL = max(dot(N, L), 0.0);
  let NdV = max(dot(N, V), 1e-3);
  let dd = NdH * NdH * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * dd * dd);
  let k = a * 0.5;
  let G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
  return D * G / max(4.0 * NdL * NdV, 1e-3) * NdL;
}

fn linearDepth(p: vec3f) -> f32 { return dot(p - u.camPos.xyz, u.camFwd.xyz); }
`;

const WGSL_DEPTH = /* wgsl */`
@group(0) @binding(0) var<uniform> m: mat4x4f;
@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f { return m * vec4f(p, 1.0); }
`;

// ── scene: background / floor with soft shadows, then bubbles and the knife ──
const WGSL_SCENE = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var heightMap: texture_depth_2d;
@group(0) @binding(3) var cmp: sampler_comparison;

struct FSOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vsFull(@builtin(vertex_index) i: u32) -> FSOut {
  var o: FSOut;
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  o.pos = vec4f(p, 0.0, 1.0); o.ndc = p; return o;
}

var<private> POISSON: array<vec2f, 16> = array<vec2f, 16>(
  vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725), vec2f(-0.094184101, -0.92938870), vec2f(0.34495938, 0.29387760),
  vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464), vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379),
  vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420), vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188),
  vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590), vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790));

fn keyShadow(P: vec3f) -> f32 {
  let lp = u.lightVP * vec4f(P, 1.0);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  let z = lp.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  // blocker search → penumbra size (PCSS-lite)
  let dims = vec2f(textureDimensions(shadowMap));
  var blk = 0.0; var nb = 0.0;
  for (var i = 0; i < 16; i++) {
    let s = uv + POISSON[i] * 0.02;
    let d = textureLoad(shadowMap, vec2i(clamp(s, vec2f(0.0), vec2f(0.999)) * dims), 0);
    if (d < z - 0.002) { blk += d; nb += 1.0; }
  }
  if (nb < 0.5) { return 1.0; }
  blk /= nb;
  let pen = clamp((z - blk) * 0.45, 0.003, 0.022);
  var sum = 0.0;
  let rot = hash3(P * 91.7) * 6.2831;
  let cs = vec2f(cos(rot), sin(rot));
  for (var i = 0; i < 16; i++) {
    let o = POISSON[i];
    let r = vec2f(o.x * cs.x - o.y * cs.y, o.x * cs.y + o.y * cs.x);
    sum += textureSampleCompareLevel(shadowMap, cmp, uv + r * pen, z - 0.0015);
  }
  return sum / 16.0;
}

fn contactAO(P: vec3f) -> f32 {
  let tp = u.topVP * vec4f(P, 1.0);
  let uv = vec2f(tp.x * 0.5 + 0.5, 0.5 - tp.y * 0.5);
  let dims = vec2f(textureDimensions(heightMap));
  var occ = 0.0;
  // heightmap depth encodes y linearly over [-1, 4]
  for (var ring = 0; ring < 3; ring++) {
    let rad = 0.012 + f32(ring) * 0.028;
    for (var i = 0; i < 8; i++) {
      let a = f32(i) * 0.785398 + f32(ring) * 0.39;
      let s = uv + vec2f(cos(a), sin(a)) * rad;
      if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) { continue; }
      let d = textureLoad(heightMap, vec2i(s * dims), 0);
      let h = d * 5.0 - 1.0;
      if (d < 0.9999) {
        let dist = f32(ring) * 0.028 * 5.2 + 0.05;
        occ += (1.0 - smoothstep(0.0, 0.55 + dist, h)) * (1.0 - f32(ring) * 0.22);
      }
    }
  }
  return clamp(occ / 16.0, 0.0, 1.0);
}

struct BgOut { @location(0) c: vec4f };
@fragment fn fsBackground(i: FSOut) -> BgOut {
  let a = u.invViewProj * vec4f(i.ndc, 0.0, 1.0);
  let b = u.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let ro = a.xyz / a.w;
  let rd = normalize(b.xyz / b.w - ro);
  var col = u.bg.rgb;
  var dep = 1000.0;
  // slight falloff above the horizon, like a paper sweep lit from above
  col *= 1.0 - 0.08 * smoothstep(0.0, 0.6, rd.y);
  if (rd.y < -1e-4) {
    let t = (u.misc.z - ro.y) / rd.y;
    let P = ro + rd * t;
    dep = linearDepth(P);
    let sh = keyShadow(P);
    let ao = contactAO(P);
    // a translucent body casts a tinted shadow, an opaque one a plain shadow; contact occlusion stays neutral
    let shadowCol = mix(vec3f(1.0), u.shadowTint.rgb, 1.0 - sh);
    var fl = u.bg.rgb * (0.9 + 0.1 * clamp(1.0 - length(P.xz - vec2f(0.0, 0.8)) * 0.12, 0.0, 1.0));
    fl *= shadowCol;
    fl *= 1.0 - ao * 0.72;
    let fade = smoothstep(7.0, 22.0, t);
    col = mix(fl, col, fade);
  }
  var o: BgOut; o.c = vec4f(col, dep); return o;
}

struct VIn { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) rest: vec3f, @location(3) mat: f32 };
struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) rest: vec3f, @location(3) mat: f32 };
@vertex fn vsMesh(v: VIn) -> VOut {
  var o: VOut;
  o.pos = u.viewProj * vec4f(v.p, 1.0);
  o.wp = v.p; o.n = v.n; o.rest = v.rest; o.mat = v.mat;
  return o;
}

@fragment fn fsProps(i: VOut) -> BgOut {
  let N = normalize(i.n);
  let V = normalize(u.camPos.xyz - i.wp);
  let NdV = max(dot(N, V), 1e-3);
  let L = u.keyDir.xyz;
  var col: vec3f;
  if (i.mat > 2.8 && i.mat < 4.5) {
    // knife steel: a product-shot gradient (dark board below, bright sweep above) across the blade,
    // brushed along its length, a lighter satin bevel at the edge and a polished bolster
    let bevel = 1.0 - smoothstep(3.05, 3.4, i.mat);
    let bolster = smoothstep(3.55, 3.65, i.mat);
    let brush = vnoise(vec3f(i.rest.x * 3.0, i.rest.y * 260.0, i.rest.z * 40.0));
    let rough = mix(mix(0.12 + 0.06 * brush, 0.22, bevel), 0.06, bolster);
    let F0 = vec3f(0.56, 0.57, 0.585);
    let fres = F0 + (vec3f(1.0) - F0) * pow(1.0 - NdV, 5.0);
    let R = reflect(-V, N);
    let hz = R.y * 0.8 + (i.rest.y / 0.63 - 0.45) * 1.1 + 0.28 + (brush - 0.5) * 0.06;
    let sweep = smoothstep(-0.35, 0.45, hz);
    var env = mix(vec3f(0.045, 0.047, 0.05), vec3f(0.5, 0.51, 0.53), sweep);
    // the studio's softboxes still show up as crisp streaks
    env += max(studioEnv(R, rough, u.bg.rgb) - u.bg.rgb * 1.15, vec3f(0.0)) * 0.9;
    env *= 0.92 + 0.16 * brush;
    let spec = ggx(N, V, L, max(rough, 0.1)) * u.keyDir.w;
    col = env * fres + fres * spec * 0.5 + vec3f(0.02) * max(dot(N, L), 0.0);
    col = mix(col, col * 0.85 + vec3f(0.12, 0.122, 0.125), bevel * 0.7);
    col = min(col, vec3f(6.0));
  } else if (i.mat > 4.5) {
    // handle: dark walnut, straight grain along the handle, a satin oil finish and three steel rivets
    let p = clamp((-i.rest.x - 0.07) / 0.84, 0.0, 1.0);
    let cy = 0.56 - 0.028 * p * p;
    var rivet = 0.0;
    for (var k = 0; k < 3; k++) {
      let rx = -0.24 - f32(k) * 0.25;
      let dd = length(vec2f(i.rest.x - rx, i.rest.y - cy));
      rivet = max(rivet, 1.0 - smoothstep(0.017, 0.021, dd));
    }
    rivet *= smoothstep(0.03, 0.045, abs(i.rest.z));
    let g = fbm(vec3f(i.rest.x * 2.2, i.rest.y * 38.0 + vnoise(i.rest * 9.0) * 2.0, i.rest.z * 38.0));
    let wood = mix(vec3f(0.028, 0.014, 0.008), vec3f(0.085, 0.045, 0.024), smoothstep(0.3, 0.75, g));
    let dif = max(dot(N, L), 0.0) * 0.8 + 0.3;
    let fr = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    let envW = studioEnv(reflect(-V, N), 0.35, u.bg.rgb);
    col = wood * dif + envW * fr * 0.35 + vec3f(ggx(N, V, L, 0.35)) * 0.08 * u.keyDir.w;
    let envR = studioEnv(reflect(-V, N), 0.1, u.bg.rgb);
    col = mix(col, envR * 0.7 + vec3f(ggx(N, V, L, 0.12)) * 0.4, rivet);
  } else {
    // air bubble, soft and low-contrast: a lighter pocket with a faint rim and one pin-point highlight
    let rim = pow(1.0 - NdV, 2.0);
    col = mix(vec3f(0.86, 0.88, 0.9), vec3f(0.56, 0.6, 0.64), rim) + vec3f(ggx(N, V, L, 0.08)) * 0.5;
  }
  var o: BgOut; o.c = vec4f(col, linearDepth(i.wp)); return o;
}
`;

// ── back faces → linear depth (for view-ray thickness) ──
const WGSL_BACK = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
struct VIn { @location(0) p: vec3f };
struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f };
@vertex fn vs(v: VIn) -> VOut { var o: VOut; o.pos = u.viewProj * vec4f(v.p, 1.0); o.wp = v.p; return o; }
@fragment fn fs(i: VOut) -> @location(0) vec4f { return vec4f(linearDepth(i.wp), 0.0, 0.0, 1.0); }
`;

// ── main: copy the scene, then the body itself in its material, then the optional mesh overlay ──
const WGSL_MAIN = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var backTex: texture_2d<f32>;
@group(0) @binding(3) var lin: sampler;
@group(0) @binding(4) var artTex: texture_2d<f32>;
@group(0) @binding(5) var artSmp: sampler;

@vertex fn vsFull(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
@fragment fn fsCopy(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(sceneTex, vec2i(fc.xy), 0).rgb, 1.0);
}

struct VIn { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) rest: vec3f, @location(3) mat: f32 };
struct VOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) rest: vec3f };
@vertex fn vsJelly(v: VIn) -> VOut {
  var o: VOut;
  o.pos = u.viewProj * vec4f(v.p, 1.0);
  o.wp = v.p; o.n = v.n; o.rest = v.rest;
  return o;
}

fn toUV(p: vec3f) -> vec2f {
  let c = u.viewProj * vec4f(p, 1.0);
  let n = c.xy / c.w;
  return vec2f(n.x * 0.5 + 0.5, 0.5 - n.y * 0.5);
}

// which branch draws the body: 0 jelly, then these — keep in step with "kind" in materials.js
const K_RUBBER = 1.0;
const K_FOAM = 2.0;
const K_METAL = 3.0;

// packed beads: distance to the nearest and second-nearest bead centre around p, and the nearest one's id
fn beads(p: vec3f) -> vec3f {
  let ip = floor(p); let fp = fract(p);
  var f1 = 8.0; var f2 = 8.0; var id = 0.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let g = vec3f(f32(x), f32(y), f32(z));
        let cell = ip + g;
        let o = vec3f(hash3(cell), hash3(cell + 17.3), hash3(cell + 41.7)) * 0.7 + 0.15;
        let d = length(g + o - fp);
        if (d < f1) { f2 = f1; f1 = d; id = hash3(cell + 5.5); } else if (d < f2) { f2 = d; }
      }
    }
  }
  return vec3f(f1, f2, id);
}

// the opaque materials: rubber, styrofoam, metal. c is the colour of the drawing at this point, Q the rest position.
fn solidBody(kind: f32, c: vec3f, Q: vec3f, N: vec3f, V: vec3f) -> vec3f {
  let L = u.keyDir.xyz;
  let key = u.keyDir.w;
  let NdV = max(dot(N, V), 1e-3);
  let NdL = dot(N, L);
  let R = reflect(-V, N);
  var albedo = c;
  var F0 = vec3f(0.04);
  var rough = 0.45;
  var wrap = 0.15;      // how far the key light creeps round the terminator
  var metal = 0.0;
  if (kind < K_RUBBER + 0.5) {
    // rubber: the drawing in a dense satin skin
    albedo = c * 0.82;
    rough = 0.42; wrap = 0.2;
  } else if (kind < K_FOAM + 0.5) {
    // styrofoam: pale pressed beads, dark in the seams between them, with almost no shine
    let b = beads(Q * 34.0);
    let seam = smoothstep(0.02, 0.3, b.y - b.x);
    albedo = mix(c, vec3f(0.94), 0.42) * mix(0.62, 1.0, seam) * (0.93 + 0.07 * b.z);
    F0 = vec3f(0.02); rough = 0.9; wrap = 0.5;
  } else {
    // metal: brushed along the fox; the drawing is the colour of its reflections
    let brush = vnoise(vec3f(Q.x * 4.0, Q.y * 90.0, Q.z * 220.0));
    F0 = mix(vec3f(0.78, 0.79, 0.81), c * c, 0.72);   // squared: reflections wash a tint out, so start deeper
    rough = 0.2 + 0.08 * brush;
    metal = 1.0;
  }
  let amb = u.bg.rgb * mix(0.3, 0.75, N.y * 0.5 + 0.5);
  let lit = amb + vec3f(1.0, 0.97, 0.92) * key * 0.45 * clamp((NdL + wrap) / (1.0 + wrap), 0.0, 1.0);
  // a rough surface never turns into a mirror, even at a grazing angle
  let F = F0 + (max(vec3f(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
  let env = min(studioEnv(R, rough, u.bg.rgb), vec3f(2.6));
  let spec = ggx(N, V, L, rough) * key * vec3f(1.0, 0.97, 0.93);
  let col = albedo * lit * (1.0 - metal) * (vec3f(1.0) - F) + (env + spec) * F;
  return min(col, vec3f(6.0));
}

@fragment fn fsJelly(i: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  // ── the drawing, running straight down through the body: rest-plane (u, w) → texture ──
  // i.rest is (u, height, w); on the walls u and w are already pulled in past the drawn contour
  let Q = i.rest;
  let c = textureSample(artTex, artSmp, (Q.xz - u.art.xy) * u.art.zw).rgb;
  // drawn lines and the dark of the eyes are dense gel that lets almost nothing through
  let line = 1.0 - smoothstep(0.015, 0.11, dot(c, vec3f(0.2126, 0.7152, 0.0722)));

  var N = normalize(i.n);
  if (!ff) { N = -N; }
  let P = i.wp;
  let V = normalize(u.camPos.xyz - P);
  let L = u.keyDir.xyz;
  let key = u.keyDir.w;
  let NdV = max(dot(N, V), 1e-3);

  let kind = u.misc.w;
  if (kind > 0.5) { return vec4f(solidBody(kind, c, Q, N, V), 1.0); }

  // ── thickness along the view ray ──
  let uv = i.pos.xy * u.screen.zw;
  let pix = vec2i(i.pos.xy);
  let fz = linearDepth(P);
  let bz = textureLoad(backTex, pix, 0).r;
  let sz = textureLoad(sceneTex, pix, 0).a;
  let cosv = max(dot(-V, u.camFwd.xyz), 0.35);
  let thick = clamp((min(bz, sz) - fz) / cosv, 0.0, 3.0);
  let thickBack = clamp((bz - fz) / cosv, 0.0, 3.0);

  // internal texture: a faint cloudy grain
  let grain = fbm(vec3f(Q.x * 9.0, Q.y * 11.0, Q.z * 9.0));
  let grain2 = vnoise(Q * 46.0);
  let dens = 1.0 + (grain - 0.5) * 0.35 + (grain2 - 0.5) * 0.12;

  // ── absorption / scattering: the colour of the drawing is the colour of the jelly ──
  let sigma = -log(clamp(c, vec3f(0.003), vec3f(0.985))) * u.jelly.x * dens + vec3f(line * 24.0);
  let scatK = mix(u.jelly.y, 26.0, line);
  let rough = 0.1 + 0.05 * line;

  // ── refraction: bend the view ray into the jelly, find where it leaves ──
  let ior = 1.42;
  let Rr = refract(-V, N, 1.0 / ior);
  let exitP = P + Rr * min(thickBack, 0.9) * 0.55;
  var ruv = toUV(exitP);
  ruv = mix(uv, ruv, 0.85);
  // a little diffusion inside the candy blurs what lies behind
  let blurR = (0.001 + 0.007 * min(thick, 1.0)) * (0.6 + scatK * 0.02);
  // each tap is absorbed over its own path length (to a bubble, the blade or out through the back)
  var transmitted = vec3f(0.0);
  var pathL = 0.0;
  for (var k = 0; k < 7; k++) {
    let a = f32(k) * 0.8976 + 0.3;
    let o = select(vec2f(cos(a), sin(a)) * blurR, vec2f(0.0), k == 6);
    let s = textureSampleLevel(sceneTex, lin, clamp(ruv + o, vec2f(0.001), vec2f(0.999)), 0.0);
    let pl = clamp(min(thickBack, max(s.a - fz, 0.0) / cosv + 0.03), 0.0, 3.0);
    transmitted += s.rgb * exp(-sigma * pl);
    pathL += pl;
  }
  transmitted /= 7.0; pathL /= 7.0;
  let scat = 1.0 - exp(-scatK * pathL * 0.5 - scatK * 0.02);

  // ── light arriving inside the body ──
  let NdL = dot(N, L);
  let wrap = clamp((NdL + 0.6) / 1.6, 0.0, 1.0);
  let amb = u.bg.rgb * mix(0.3, 0.75, N.y * 0.5 + 0.5);
  let inner = c * u.jelly.z * (amb + vec3f(1.0, 0.97, 0.92) * key * 0.45 * wrap);

  // thin edges glow when the key light is behind them
  let back = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0) * 1.4 + 0.25;
  let thinK = exp(-(sigma + vec3f(scatK * 0.35)) * (pathL * 0.6 + 0.05));
  let glow = mix(c, vec3f(1.0), 0.2) * thinK * back * key * 0.42 * (1.0 - line * 0.7) * clamp(1.0 - NdL * 0.6, 0.0, 1.0);

  // ── assemble body color ──
  var body = transmitted * (1.0 - scat) + inner * scat + glow;

  // tiny sub-surface glints (sugar crystals)
  let R = reflect(-V, N);
  let cell = floor(Q * vec3f(70.0, 70.0, 70.0));
  let spark = step(0.985, hash3(cell)) * pow(max(dot(R, L), 0.0), 40.0) * (1.0 - line);
  body += vec3f(1.0, 0.95, 0.9) * spark * 0.2;

  // ── surface: Fresnel reflection of the studio + key highlight ──
  let F0 = 0.036;
  let F = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  let env = studioEnv(R, rough, u.bg.rgb);
  let spec = ggx(N, V, L, rough) * key * vec3f(1.0, 0.97, 0.93);
  let col = body * (1.0 - F) + env * F + spec * 0.9;

  return vec4f(col, 1.0);
}

// ── mesh overlay ──
struct LOut { @builtin(position) pos: vec4f, @location(0) d: f32 };
@vertex fn vsLine(@location(0) p: vec3f) -> LOut {
  var o: LOut; o.pos = u.viewProj * vec4f(p, 1.0); o.d = linearDepth(p); return o;
}
@fragment fn fsLine(i: LOut) -> @location(0) vec4f {
  let a = u.misc.y * mix(0.9, 0.35, clamp((i.d - 5.0) * 0.5, 0.0, 1.0));
  return vec4f(vec3f(0.04, 0.05, 0.06) * a, a);
}
`;

// ── post: exposure, Khronos PBR Neutral tone mapping, sRGB, dither ──
const WGSL_POST = WGSL_COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var hdr: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
fn neutral(c0: vec3f) -> vec3f {
  let startC = 0.8 - 0.04;
  let desat = 0.15;
  let x = min(c0.r, min(c0.g, c0.b));
  let off = select(0.04, x - 6.25 * x * x, x < 0.08);
  var c = c0 - off;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < startC) { return c; }
  let d = 1.0 - startC;
  let np = 1.0 - d * d / (peak + d - startC);
  c *= np / peak;
  let g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(c, vec3f(np), g);
}
fn oetf(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  var c = textureLoad(hdr, vec2i(fc.xy), 0).rgb * u.misc.x;
  c = neutral(max(c, vec3f(0.0)));
  var s = oetf(clamp(c, vec3f(0.0), vec3f(1.0)));
  s += (hash3(vec3f(fc.xy, 1.0)) - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
`;
