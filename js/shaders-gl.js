// ─────────────────────────────────────────────────────────────
//  GLSL ES 3.00 — the WGSL of shaders.js, for the WebGL2 fallback renderer
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
// Keep in step with shaders.js. The differences are GL's: every vertex shader passes its clip
// position through clipGL (the matrices are WebGPU's, z ∈ [0,1]), and render-target textures
// run bottom-up, so a clip position maps to uv (x, y) * 0.5 + 0.5 instead of flipping y.
'use strict';

const GLSL_VS_HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
const GLSL_FS_HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
`;

const GLSL_COMMON = /* glsl */`
layout(std140) uniform U {
  mat4 viewProj;
  mat4 view;
  mat4 invViewProj;
  mat4 lightVP;
  mat4 topVP;
  vec4 camPos;     // xyz, w = time
  vec4 camFwd;
  vec4 keyDir;     // xyz toward light, w = intensity
  vec4 screen;     // w, h, 1/w, 1/h
  vec4 art;        // where the drawing sits in the rest plane: origin (u, w), 1 / size
  vec4 jelly;      // absorption strength, milkiness, albedo gain, unused
  vec4 misc;       // exposure, meshAlpha, floorY, material kind
  vec4 bg;
  vec4 shadowTint;
  vec4 lamp;       // a moving light (the flame, a muzzle flash): xyz, w = how fast it falls off
  vec4 lampCol;    // its colour; w = how many marks follow
  vec4 marks[24];  // what the tools left on the body: centre (u, w) in the rest plane, radius, kind
} u;

const float PI = 3.14159265;

// WebGPU clip z ∈ [0,1] → GL's [-1,1]; the depth that lands in a depth texture is then WebGPU's
vec4 clipGL(vec4 p) { p.z = 2.0 * p.z - p.w; return p; }

float hash3(vec3 p) {
  vec3 q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), u.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), u.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec3 p) {
  return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.13 + 7.1) + 0.15 * vnoise(p * 4.37 + 3.3);
}

// rounded rectangle softbox seen along direction d
float softbox(vec3 d, vec3 c, vec3 up, vec2 size, float blur) {
  float cd = dot(d, c);
  if (cd <= 0.0) { return 0.0; }
  vec3 t1 = normalize(cross(up, c));
  vec3 t2 = cross(c, t1);
  vec2 uv = vec2(dot(d, t1), dot(d, t2)) / cd;
  vec2 q = abs(uv) - size;
  float sd = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;
  return 1.0 - smoothstep(-blur, blur, sd);
}

// procedural photo studio: pale cyclorama, overhead softbox, back-left strip, front-right fill card
vec3 studioEnv(vec3 d, float rough, vec3 bg) {
  float b = 0.012 + rough * 0.55;
  float y = d.y;
  vec3 col = mix(bg * 0.62, bg * 1.05, smoothstep(-0.35, 0.25, y));
  // the bright paper sweep near the horizon gives vertical walls something to reflect
  col += bg * 0.55 * (1.0 - smoothstep(0.0, 0.3, abs(y + 0.08)));
  col = mix(col, bg * 0.8, smoothstep(0.3, 1.0, y));
  col += vec3(1.0, 0.985, 0.96) * 3.2 * softbox(d, normalize(vec3(0.05, 1.0, -0.15)), vec3(0.0, 0.0, 1.0), vec2(0.55, 0.32), b);
  col += vec3(1.0, 0.98, 0.95) * 3.0 * softbox(d, normalize(vec3(-0.42, 0.34, -0.8)), vec3(0.0, 1.0, 0.0), vec2(0.7, 0.06), b);
  col += vec3(1.0, 0.97, 0.93) * 4.0 * softbox(d, normalize(vec3(-0.8, 0.38, -0.2)), vec3(0.0, 1.0, 0.0), vec2(0.08, 0.55), b);
  col += vec3(0.95, 0.97, 1.0) * 1.2 * softbox(d, normalize(vec3(0.85, 0.3, 0.55)), vec3(0.0, 1.0, 0.0), vec2(0.45, 0.5), b * 1.3);
  return col;
}

float ggx(vec3 N, vec3 V, vec3 L, float rough) {
  vec3 H = normalize(V + L);
  float a = max(rough * rough, 0.002);
  float a2 = a * a;
  float NdH = max(dot(N, H), 0.0);
  float NdL = max(dot(N, L), 0.0);
  float NdV = max(dot(N, V), 1e-3);
  float dd = NdH * NdH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float k = a * 0.5;
  float G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
  return D * G / max(4.0 * NdL * NdV, 1e-3) * NdL;
}

float linearDepth(vec3 p) { return dot(p - u.camPos.xyz, u.camFwd.xyz); }

// the moving light, as it falls on a surface at P facing N
vec3 lampAt(vec3 P, vec3 N) {
  vec3 d = u.lamp.xyz - P;
  float r2 = dot(d, d);
  float k = clamp(dot(N, d) * inversesqrt(r2 + 1e-4) * 0.75 + 0.25, 0.0, 1.0);
  return u.lampCol.rgb * k / (1.0 + r2 * u.lamp.w);
}
`;

// ── vertex shaders ──
const GLSL_VS_FULL = GLSL_VS_HEAD + /* glsl */`
out vec2 vNdc;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, -1.0, 1.0); vNdc = p;
}
`;

const GLSL_VS_DEPTH = GLSL_VS_HEAD + /* glsl */`
uniform mat4 m;
layout(location = 0) in vec3 aP;
void main() { vec4 p = m * vec4(aP, 1.0); p.z = 2.0 * p.z - p.w; gl_Position = p; }
`;

const GLSL_VS_MESH = GLSL_VS_HEAD + GLSL_COMMON + /* glsl */`
layout(location = 0) in vec3 aP;
layout(location = 1) in vec3 aN;
layout(location = 2) in vec3 aRest;
layout(location = 3) in float aMat;
layout(location = 4) in vec2 aFx;
out vec3 vWp; out vec3 vN; out vec3 vRest; out float vMat; out vec2 vFx;
void main() {
  gl_Position = clipGL(u.viewProj * vec4(aP, 1.0));
  vWp = aP; vN = aN; vRest = aRest; vMat = aMat; vFx = aFx;
}
`;

const GLSL_VS_BACK = GLSL_VS_HEAD + GLSL_COMMON + /* glsl */`
layout(location = 0) in vec3 aP;
out vec3 vWp;
void main() { gl_Position = clipGL(u.viewProj * vec4(aP, 1.0)); vWp = aP; }
`;

const GLSL_VS_LINE = GLSL_VS_HEAD + GLSL_COMMON + /* glsl */`
layout(location = 0) in vec3 aP;
out float vD;
void main() { gl_Position = clipGL(u.viewProj * vec4(aP, 1.0)); vD = linearDepth(aP); }
`;

const GLSL_VS_FX = GLSL_VS_HEAD + GLSL_COMMON + /* glsl */`
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec4 aCol;
layout(location = 2) in vec4 aAxis;
out vec2 vUv; out vec4 vCol; out float vHard;
void main() {
  vec2 uv = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vec3 toCam = normalize(u.camPos.xyz - aPos.xyz);
  float r = aPos.w;
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)) * r;
  vec3 up = normalize(cross(toCam, side)) * r;
  float l = length(aAxis.xyz);
  if (l > 1e-5) {
    // a streak: as long as its travel (plus its own roundness), as wide as itself
    up = aAxis.xyz * (1.0 + r / l);
    side = normalize(cross(aAxis.xyz, toCam)) * r;
  }
  gl_Position = clipGL(u.viewProj * vec4(aPos.xyz + side * uv.x + up * uv.y, 1.0));
  vUv = uv; vCol = aCol; vHard = aAxis.w;
}
`;

// ── fragment shaders ──
const GLSL_FS_DEPTH = GLSL_FS_HEAD + `void main() {}\n`;

// scene: background / floor with soft shadows
const GLSL_FS_BACKGROUND = GLSL_FS_HEAD + GLSL_COMMON + /* glsl */`
uniform sampler2D shadowMap;       // the same depth texture twice: read as is…
uniform sampler2DShadow shadowCmp; // …and compared
uniform sampler2D heightMap;
in vec2 vNdc;
layout(location = 0) out vec4 oc;

const vec2 POISSON[16] = vec2[16](
  vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.094184101, -0.92938870), vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));

float keyShadow(vec3 P) {
  vec4 lp = u.lightVP * vec4(P, 1.0);
  vec2 uv = lp.xy * 0.5 + 0.5;
  float z = lp.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  // blocker search → penumbra size (PCSS-lite)
  vec2 dims = vec2(textureSize(shadowMap, 0));
  float blk = 0.0; float nb = 0.0;
  for (int i = 0; i < 16; i++) {
    vec2 s = uv + POISSON[i] * 0.02;
    float d = texelFetch(shadowMap, ivec2(clamp(s, vec2(0.0), vec2(0.999)) * dims), 0).r;
    if (d < z - 0.002) { blk += d; nb += 1.0; }
  }
  if (nb < 0.5) { return 1.0; }
  blk /= nb;
  float pen = clamp((z - blk) * 0.45, 0.003, 0.022);
  float sum = 0.0;
  float rot = hash3(P * 91.7) * 6.2831;
  vec2 cs = vec2(cos(rot), sin(rot));
  for (int i = 0; i < 16; i++) {
    vec2 o = POISSON[i];
    vec2 r = vec2(o.x * cs.x - o.y * cs.y, o.x * cs.y + o.y * cs.x);
    sum += texture(shadowCmp, vec3(uv + r * pen, z - 0.0015));
  }
  return sum / 16.0;
}

float contactAO(vec3 P) {
  vec4 tp = u.topVP * vec4(P, 1.0);
  vec2 uv = tp.xy * 0.5 + 0.5;
  vec2 dims = vec2(textureSize(heightMap, 0));
  float occ = 0.0;
  // heightmap depth encodes y linearly over [-1, 4]
  for (int ring = 0; ring < 3; ring++) {
    float rad = 0.012 + float(ring) * 0.028;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + float(ring) * 0.39;
      vec2 s = uv + vec2(cos(a), sin(a)) * rad;
      if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) { continue; }
      float d = texelFetch(heightMap, ivec2(s * dims), 0).r;
      float h = d * 5.0 - 1.0;
      if (d < 0.9999) {
        float dist = float(ring) * 0.028 * 5.2 + 0.05;
        occ += (1.0 - smoothstep(0.0, 0.55 + dist, h)) * (1.0 - float(ring) * 0.22);
      }
    }
  }
  return clamp(occ / 16.0, 0.0, 1.0);
}

void main() {
  vec4 a = u.invViewProj * vec4(vNdc, 0.0, 1.0);
  vec4 b = u.invViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 ro = a.xyz / a.w;
  vec3 rd = normalize(b.xyz / b.w - ro);
  vec3 col = u.bg.rgb;
  float dep = 1000.0;
  // slight falloff above the horizon, like a paper sweep lit from above
  col *= 1.0 - 0.08 * smoothstep(0.0, 0.6, rd.y);
  if (rd.y < -1e-4) {
    float t = (u.misc.z - ro.y) / rd.y;
    vec3 P = ro + rd * t;
    dep = linearDepth(P);
    float sh = keyShadow(P);
    float ao = contactAO(P);
    // a translucent body casts a tinted shadow, an opaque one a plain shadow; contact occlusion stays neutral
    vec3 shadowCol = mix(vec3(1.0), u.shadowTint.rgb, 1.0 - sh);
    vec3 fl = u.bg.rgb * (0.9 + 0.1 * clamp(1.0 - length(P.xz - vec2(0.0, 0.8)) * 0.12, 0.0, 1.0));
    fl *= shadowCol;
    fl += u.bg.rgb * lampAt(P, vec3(0.0, 1.0, 0.0));
    fl *= 1.0 - ao * 0.72;
    float fade = smoothstep(7.0, 22.0, t);
    col = mix(fl, col, fade);
  }
  oc = vec4(col, dep);
}
`;

// scene: bubbles and the tools
const GLSL_FS_PROPS = GLSL_FS_HEAD + GLSL_COMMON + /* glsl */`
in vec3 vWp; in vec3 vN; in vec3 vRest; in float vMat;
layout(location = 0) out vec4 oc;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(u.camPos.xyz - vWp);
  float NdV = max(dot(N, V), 1e-3);
  vec3 L = u.keyDir.xyz;
  vec3 col;
  if (vMat > 2.8 && vMat < 4.5) {
    // knife steel: a product-shot gradient (dark board below, bright sweep above) across the blade,
    // brushed along its length, a lighter satin bevel at the edge and a polished bolster
    float bevel = 1.0 - smoothstep(3.05, 3.4, vMat);
    float bolster = smoothstep(3.55, 3.65, vMat);
    float brush = vnoise(vec3(vRest.x * 3.0, vRest.y * 260.0, vRest.z * 40.0));
    float rough = mix(mix(0.12 + 0.06 * brush, 0.22, bevel), 0.06, bolster);
    vec3 F0 = vec3(0.56, 0.57, 0.585);
    vec3 fres = F0 + (vec3(1.0) - F0) * pow(1.0 - NdV, 5.0);
    vec3 R = reflect(-V, N);
    float hz = R.y * 0.8 + (vRest.y / 0.63 - 0.45) * 1.1 + 0.28 + (brush - 0.5) * 0.06;
    float sweep = smoothstep(-0.35, 0.45, hz);
    vec3 env = mix(vec3(0.045, 0.047, 0.05), vec3(0.5, 0.51, 0.53), sweep);
    // the studio's softboxes still show up as crisp streaks
    env += max(studioEnv(R, rough, u.bg.rgb) - u.bg.rgb * 1.15, vec3(0.0)) * 0.9;
    env *= 0.92 + 0.16 * brush;
    float spec = ggx(N, V, L, max(rough, 0.1)) * u.keyDir.w;
    col = env * fres + fres * spec * 0.5 + vec3(0.02) * max(dot(N, L), 0.0);
    col = mix(col, col * 0.85 + vec3(0.12, 0.122, 0.125), bevel * 0.7);
    col = min(col, vec3(6.0));
  } else if (vMat > 5.5) {
    // the other tools: steels and brass, two woods, rubber and paint — told apart by the material id
    float m = vMat;
    vec3 alb = vec3(0.02);
    vec3 F0 = vec3(0.04);
    float rough = 0.6;
    float metal = 0.0;
    if (m < 6.5) {
      float brush = vnoise(vec3(vRest.x * 6.0, vRest.y * 140.0, vRest.z * 140.0));
      metal = 1.0;
      if (m < 6.1) { F0 = vec3(0.62, 0.63, 0.65); rough = 0.18 + 0.06 * brush; }             // polished steel
      else if (m < 6.3) { F0 = vec3(0.17, 0.175, 0.19); rough = 0.36 + 0.1 * brush; }         // dark, forged or blued
      else { F0 = vec3(0.88, 0.62, 0.28); rough = 0.24 + 0.06 * brush; }                      // brass
    } else if (m < 7.5) {
      // wood, its grain running along the tool
      float g = fbm(vec3(vRest.x * 1.7, vRest.y * 30.0 + vnoise(vRest * 7.0) * 1.6, vRest.z * 30.0));
      float k = smoothstep(0.3, 0.75, g);
      if (m < 7.1) { alb = mix(vec3(0.4, 0.25, 0.115), vec3(0.62, 0.44, 0.24), k); rough = 0.45; }     // ash
      else { alb = mix(vec3(0.03, 0.015, 0.008), vec3(0.11, 0.055, 0.028), k); rough = 0.38; }        // walnut
    } else if (m < 8.1) { alb = vec3(0.022); rough = 0.62; }                                   // black rubber
    else if (m < 8.3) { alb = vec3(0.5, 0.03, 0.022); rough = 0.3; }                           // red paint
    else if (m < 8.5) { alb = vec3(0.03, 0.115, 0.4); rough = 0.3; }                           // blue paint
    else { alb = vec3(0.72, 0.7, 0.64); rough = 0.7; }                                         // a paper label
    vec3 R = reflect(-V, N);
    // a rough surface never turns into a mirror, even at a grazing angle
    vec3 F = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
    vec3 env = min(studioEnv(R, rough, u.bg.rgb), vec3(2.6));
    vec3 spec = ggx(N, V, L, rough) * u.keyDir.w * vec3(1.0, 0.97, 0.93);
    vec3 amb = u.bg.rgb * mix(0.3, 0.75, N.y * 0.5 + 0.5);
    vec3 lit = amb + vec3(1.0, 0.97, 0.92) * u.keyDir.w * 0.45 * clamp((dot(N, L) + 0.15) / 1.15, 0.0, 1.0) + lampAt(vWp, N);
    col = alb * lit * (1.0 - metal) * (vec3(1.0) - F) + (env + spec + lampAt(vWp, R) * 0.6) * F;
    col = min(col, vec3(6.0));
  } else if (vMat > 4.5) {
    // handle: dark walnut, straight grain along the handle, a satin oil finish and three steel rivets
    float p = clamp((-vRest.x - 0.07) / 0.84, 0.0, 1.0);
    float cy = 0.56 - 0.028 * p * p;
    float rivet = 0.0;
    for (int k = 0; k < 3; k++) {
      float rx = -0.24 - float(k) * 0.25;
      float dd = length(vec2(vRest.x - rx, vRest.y - cy));
      rivet = max(rivet, 1.0 - smoothstep(0.017, 0.021, dd));
    }
    rivet *= smoothstep(0.03, 0.045, abs(vRest.z));
    float g = fbm(vec3(vRest.x * 2.2, vRest.y * 38.0 + vnoise(vRest * 9.0) * 2.0, vRest.z * 38.0));
    vec3 wood = mix(vec3(0.028, 0.014, 0.008), vec3(0.085, 0.045, 0.024), smoothstep(0.3, 0.75, g));
    float dif = max(dot(N, L), 0.0) * 0.8 + 0.3;
    float fr = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    vec3 envW = studioEnv(reflect(-V, N), 0.35, u.bg.rgb);
    col = wood * dif + envW * fr * 0.35 + vec3(ggx(N, V, L, 0.35)) * 0.08 * u.keyDir.w;
    vec3 envR = studioEnv(reflect(-V, N), 0.1, u.bg.rgb);
    col = mix(col, envR * 0.7 + vec3(ggx(N, V, L, 0.12)) * 0.4, rivet);
  } else {
    // air bubble, soft and low-contrast: a lighter pocket with a faint rim and one pin-point highlight
    float rim = pow(1.0 - NdV, 2.0);
    col = mix(vec3(0.86, 0.88, 0.9), vec3(0.56, 0.6, 0.64), rim) + vec3(ggx(N, V, L, 0.08)) * 0.5;
  }
  oc = vec4(col, linearDepth(vWp));
}
`;

// back faces → linear depth (for view-ray thickness)
const GLSL_FS_BACK = GLSL_FS_HEAD + GLSL_COMMON + /* glsl */`
in vec3 vWp;
layout(location = 0) out vec4 oc;
void main() { oc = vec4(linearDepth(vWp), 0.0, 0.0, 1.0); }
`;

// main: copy the scene
const GLSL_FS_COPY = GLSL_FS_HEAD + /* glsl */`
uniform sampler2D sceneTex;
layout(location = 0) out vec4 oc;
void main() { oc = vec4(texelFetch(sceneTex, ivec2(gl_FragCoord.xy), 0).rgb, 1.0); }
`;

// main: the body itself in its material
const GLSL_FS_JELLY = GLSL_FS_HEAD + GLSL_COMMON + /* glsl */`
uniform sampler2D sceneTex;
uniform sampler2D backTex;
uniform sampler2D artTex;
// fx: what the tools have done here — how hot it is (x), how burnt (y)
in vec3 vWp; in vec3 vN; in vec3 vRest; in vec2 vFx;
layout(location = 0) out vec4 oc;

vec2 toUV(vec3 p) {
  vec4 c = u.viewProj * vec4(p, 1.0);
  return c.xy / c.w * 0.5 + 0.5;
}

// which branch draws the body: 0 jelly, then these — keep in step with "kind" in materials.js
const float K_RUBBER = 1.0;
const float K_FOAM = 2.0;
const float K_METAL = 3.0;

// What the tools have left on the body, read off in the rest plane: how far the surface is pressed
// in at q (x, negative), whether there is a hole through it (y), and how scuffed it is (z).
// Kinds — keep in step with MARK in main.js: 1 a bullet hole, 2 a dent, 3 a scuff.
vec3 marks(vec2 q) {
  float h = 0.0; float hole = 0.0; float scuff = 0.0;
  int n = int(u.lampCol.w);
  for (int k = 0; k < n; k++) {
    vec4 m = u.marks[k];
    float d = length(q - m.xy) / m.z;
    float isHole = step(m.w, 1.5);
    float isDent = step(1.5, m.w) * step(m.w, 2.5);
    float bowl = 1.0 - smoothstep(0.0, 1.0, d);
    hole = max(hole, isHole * (1.0 - smoothstep(0.75, 1.0, d)));
    // a hole is a pit with a pushed-up lip; a dent is a shallow bowl, a scuff a shallower one
    h += m.z * (isHole * (0.25 * (1.0 - smoothstep(1.0, 1.7, d)) - 1.1 * (1.0 - smoothstep(0.6, 1.15, d))) - mix(0.16, 0.34, isDent) * (1.0 - isHole) * bowl * bowl);
    scuff = max(scuff, (1.0 - isHole) * (1.0 - smoothstep(0.55, 1.05, d)) + isHole * 0.5 * (1.0 - smoothstep(1.0, 1.8, d)));
  }
  return vec3(h, hole, scuff);
}

// the normal of a surface at P, facing N, that has been raised by h (a height known only here in
// the shader, in world units) — from how h and P change across the screen
vec3 bumped(vec3 N, vec3 P, float h) {
  vec3 px = dFdx(P); vec3 py = dFdy(P);
  vec3 r1 = cross(py, N); vec3 r2 = cross(N, px);
  float det = dot(px, r1);
  vec3 g = (dFdx(h) * r1 + dFdy(h) * r2) * sign(det);
  return normalize(abs(det) * N - g);
}

// packed beads: distance to the nearest and second-nearest bead centre around p, and the nearest one's id
vec3 beads(vec3 p) {
  vec3 ip = floor(p); vec3 fp = fract(p);
  float f1 = 8.0; float f2 = 8.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 cell = ip + g;
        vec3 o = vec3(hash3(cell), hash3(cell + 17.3), hash3(cell + 41.7)) * 0.7 + 0.15;
        float d = length(g + o - fp);
        if (d < f1) { f2 = f1; f1 = d; id = hash3(cell + 5.5); } else if (d < f2) { f2 = d; }
      }
    }
  }
  return vec3(f1, f2, id);
}

// the opaque materials: rubber, styrofoam, metal. c is the colour of the drawing at this point, Q the
// rest position; heat and burn are what a flame has done here, mk what blows and bullets have (see marks).
vec3 solidBody(float kind, vec3 c, vec3 Q, vec3 P, vec3 N, vec3 V, float heat, float burn, vec3 mk) {
  vec3 L = u.keyDir.xyz;
  float key = u.keyDir.w;
  float NdV = max(dot(N, V), 1e-3);
  float NdL = dot(N, L);
  vec3 R = reflect(-V, N);
  vec3 albedo = c;
  vec3 F0 = vec3(0.04);
  float rough = 0.45;
  float wrap = 0.15;      // how far the key light creeps round the terminator
  float metal = 0.0;
  vec3 glow = vec3(0.0);
  if (kind < K_RUBBER + 0.5) {
    // rubber: the drawing in a dense satin skin
    albedo = c * 0.82;
    rough = 0.42; wrap = 0.2;
    // burnt, it is a dry black crust — and while it is still hot, the fire shows red in its cracks
    float soot = smoothstep(0.04, 0.5, burn * (0.75 + 0.5 * fbm(Q * 26.0)));
    albedo = mix(albedo, vec3(0.012, 0.011, 0.01), soot);
    rough = mix(rough, 0.88, soot);
    float crack = smoothstep(0.5, 0.72, fbm(Q * 58.0 + 3.1));
    glow = vec3(2.4, 0.5, 0.05) * smoothstep(0.45, 1.0, heat) * (0.2 + 1.1 * crack) * soot;
    // a bullet that bounced off leaves a grey smear of lead
    albedo = mix(albedo, vec3(0.2, 0.2, 0.21), mk.z * 0.7 * (1.0 - soot));
    rough = mix(rough, 0.6, mk.z);
  } else if (kind < K_FOAM + 0.5) {
    // styrofoam: pale pressed beads, dark in the seams between them, with almost no shine
    vec3 b = beads(Q * 34.0);
    float seam = smoothstep(0.02, 0.3, b.y - b.x);
    albedo = mix(c, vec3(0.94), 0.42) * mix(0.62, 1.0, seam) * (0.93 + 0.07 * b.z);
    F0 = vec3(0.02); rough = 0.9; wrap = 0.5;
    // in a flame the beads run together into a glossy skin, yellowed, then brown, then black
    float melted = smoothstep(0.0, 0.3, burn);
    albedo = mix(albedo, mix(c, vec3(0.6, 0.42, 0.16), 0.75) * 0.8, melted);
    albedo = mix(albedo, vec3(0.035, 0.026, 0.02), smoothstep(0.35, 0.95, burn));
    rough = mix(rough, 0.26, melted); F0 = mix(F0, vec3(0.05), melted); wrap = mix(wrap, 0.15, melted);
    // crushed beads are packed and dark; the bottom of a hole is in shadow
    albedo *= (1.0 - 0.35 * mk.z) * (1.0 - 0.85 * mk.y);
  } else {
    // metal: brushed along the fox; the drawing is the colour of its reflections
    float brush = vnoise(vec3(Q.x * 4.0, Q.y * 90.0, Q.z * 220.0));
    F0 = mix(vec3(0.78, 0.79, 0.81), c * c, 0.72);   // squared: reflections wash a tint out, so start deeper
    rough = 0.2 + 0.08 * brush;
    metal = 1.0;
    // heat leaves an oxide film on it for good — straw, then purple, then blue, then grey…
    vec3 film = mix(vec3(0.8, 0.6, 0.27), vec3(0.45, 0.2, 0.4), smoothstep(0.2, 0.42, burn));
    film = mix(film, vec3(0.13, 0.25, 0.62), smoothstep(0.42, 0.66, burn));
    film = mix(film, vec3(0.3, 0.36, 0.42), smoothstep(0.74, 1.0, burn));
    F0 = mix(F0, film, smoothstep(0.02, 0.22, burn) * 0.85);
    rough = mix(rough, 0.34, smoothstep(0.6, 1.0, burn));
    // …and while it is hot, it glows: dull red, then orange, then yellow
    glow = vec3(1.7, 0.2, 0.02) * smoothstep(0.18, 0.55, heat) + vec3(2.2, 1.15, 0.2) * smoothstep(0.5, 0.95, heat);
    // where it was struck, the brushed finish is scraped bright; a bullet's pit is dark at the bottom
    F0 = mix(F0, vec3(0.86, 0.87, 0.88), mk.z * 0.55) * (1.0 - 0.7 * mk.y);
    rough = mix(rough, 0.34, mk.z);
  }
  vec3 amb = u.bg.rgb * mix(0.3, 0.75, N.y * 0.5 + 0.5);
  vec3 lit = amb + vec3(1.0, 0.97, 0.92) * key * 0.45 * clamp((NdL + wrap) / (1.0 + wrap), 0.0, 1.0) + lampAt(P, N);
  // a rough surface never turns into a mirror, even at a grazing angle
  vec3 F = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
  vec3 env = min(studioEnv(R, rough, u.bg.rgb), vec3(2.6));
  vec3 spec = ggx(N, V, L, rough) * key * vec3(1.0, 0.97, 0.93);
  vec3 col = albedo * lit * (1.0 - metal) * (vec3(1.0) - F) + (env + spec + lampAt(P, R) * 0.7) * F;
  return min(col, vec3(6.0)) + glow;
}

void main() {
  // ── the drawing, running straight down through the body: rest-plane (u, w) → texture ──
  // vRest is (u, height, w); on the walls u and w are already pulled in past the drawn contour
  vec3 Q = vRest;
  vec3 art = texture(artTex, (Q.xz - u.art.xy) * u.art.zw).rgb;
  // drawn lines and the dark of the eyes are dense gel that lets almost nothing through
  float line = 1.0 - smoothstep(0.015, 0.11, dot(art, vec3(0.2126, 0.7152, 0.0722)));

  float kind = u.misc.w;
  // (both come from the coarse mesh of the simulation: a little grain keeps its facets from showing as contours)
  float fray = (fbm(Q * 11.0 + 5.3) - 0.5) * 0.36;
  float heat = clamp(vFx.x + fray * smoothstep(0.0, 0.2, vFx.x), 0.0, 1.0);
  float burn = clamp(vFx.y + fray * smoothstep(0.0, 0.2, vFx.y), 0.0, 1.0);
  vec3 mk = marks(Q.xz);

  vec3 N = normalize(vN);
  if (!gl_FrontFacing) { N = -N; }
  vec3 P = vWp;
  // dents and holes tilt the surface; so do the blisters of whatever a flame has cooked — the
  // slow bubbles of jelly, the crust of rubber, the lumps styrofoam melts into (metal has none)
  float blister = (0.55 * heat + 0.45 * burn) * fbm(Q * 26.0 + vec3(0.0, u.camPos.w * 1.6 * heat, 0.0));
  float rise = 0.006;
  if (kind > K_METAL - 0.5) { rise = 0.0; } else if (kind > K_FOAM - 0.5) { rise = 0.016; } else if (kind > 0.5) { rise = 0.01; }
  N = bumped(N, P, mk.x + blister * rise);
  vec3 V = normalize(u.camPos.xyz - P);
  vec3 L = u.keyDir.xyz;
  float key = u.keyDir.w;
  float NdV = max(dot(N, V), 1e-3);

  if (kind > 0.5) { oc = vec4(solidBody(kind, art, Q, P, N, V, heat, burn, mk), 1.0); return; }

  // jelly is sugar: where the flame has been it runs to amber, then to a dark caramel
  vec3 c = mix(art, art * vec3(0.98, 0.56, 0.2) + vec3(0.07, 0.025, 0.0), smoothstep(0.0, 0.7, burn) * 0.85);
  c = mix(c, vec3(0.2, 0.075, 0.02), smoothstep(0.55, 1.0, burn) * 0.75);

  // ── thickness along the view ray ──
  vec2 uv = gl_FragCoord.xy * u.screen.zw;
  ivec2 pix = ivec2(gl_FragCoord.xy);
  float fz = linearDepth(P);
  float bz = texelFetch(backTex, pix, 0).r;
  float sz = texelFetch(sceneTex, pix, 0).a;
  float cosv = max(dot(-V, u.camFwd.xyz), 0.35);
  float thick = clamp((min(bz, sz) - fz) / cosv, 0.0, 3.0);
  float thickBack = clamp((bz - fz) / cosv, 0.0, 3.0);

  // internal texture: a faint cloudy grain
  float grain = fbm(vec3(Q.x * 9.0, Q.y * 11.0, Q.z * 9.0));
  float grain2 = vnoise(Q * 46.0);
  float dens = 1.0 + (grain - 0.5) * 0.35 + (grain2 - 0.5) * 0.12;

  // ── absorption / scattering: the colour of the drawing is the colour of the jelly ──
  vec3 sigma = -log(clamp(c, vec3(0.003), vec3(0.985))) * u.jelly.x * dens + vec3(line * 24.0);
  // melted, it is clearer and wetter; a bullet's track through it is a milky thread
  float scatK = mix(mix(u.jelly.y * (1.0 - 0.45 * heat), 26.0, line), 60.0, mk.y);
  float rough = max(0.1 + 0.05 * line - 0.06 * burn, 0.035);

  // ── refraction: bend the view ray into the jelly, find where it leaves ──
  float ior = 1.42;
  vec3 Rr = refract(-V, N, 1.0 / ior);
  vec3 exitP = P + Rr * min(thickBack, 0.9) * 0.55;
  vec2 ruv = toUV(exitP);
  ruv = mix(uv, ruv, 0.85);
  // a little diffusion inside the candy blurs what lies behind
  float blurR = (0.001 + 0.007 * min(thick, 1.0)) * (0.6 + scatK * 0.02);
  // each tap is absorbed over its own path length (to a bubble, the blade or out through the back)
  vec3 transmitted = vec3(0.0);
  float pathL = 0.0;
  for (int k = 0; k < 7; k++) {
    float a = float(k) * 0.8976 + 0.3;
    vec2 o = k == 6 ? vec2(0.0) : vec2(cos(a), sin(a)) * blurR;
    vec4 s = textureLod(sceneTex, clamp(ruv + o, vec2(0.001), vec2(0.999)), 0.0);
    float pl = clamp(min(thickBack, max(s.a - fz, 0.0) / cosv + 0.03), 0.0, 3.0);
    transmitted += s.rgb * exp(-sigma * pl);
    pathL += pl;
  }
  transmitted /= 7.0; pathL /= 7.0;
  float scat = 1.0 - exp(-scatK * pathL * 0.5 - scatK * 0.02);

  // ── light arriving inside the body ──
  float NdL = dot(N, L);
  float wrap = clamp((NdL + 0.6) / 1.6, 0.0, 1.0);
  vec3 amb = u.bg.rgb * mix(0.3, 0.75, N.y * 0.5 + 0.5);
  vec3 lamp = lampAt(P, N);
  vec3 inner = mix(c, vec3(0.9), mk.y * 0.8) * u.jelly.z * (amb + vec3(1.0, 0.97, 0.92) * key * 0.45 * wrap + lamp);

  // thin edges glow when the key light is behind them
  float back = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0) * 1.4 + 0.25;
  vec3 thinK = exp(-(sigma + vec3(scatK * 0.35)) * (pathL * 0.6 + 0.05));
  vec3 glow = mix(c, vec3(1.0), 0.2) * thinK * back * key * 0.42 * (1.0 - line * 0.7) * clamp(1.0 - NdL * 0.6, 0.0, 1.0);

  // ── assemble body color ──
  vec3 body = transmitted * (1.0 - scat) + inner * scat + glow;

  // tiny sub-surface glints (sugar crystals)
  vec3 R = reflect(-V, N);
  vec3 cell = floor(Q * vec3(70.0, 70.0, 70.0));
  float spark = step(0.985, hash3(cell)) * pow(max(dot(R, L), 0.0), 40.0) * (1.0 - line);
  body += vec3(1.0, 0.95, 0.9) * spark * 0.2;

  // ── surface: Fresnel reflection of the studio + key highlight ──
  float F0 = 0.036;
  float F = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  vec3 env = studioEnv(R, rough, u.bg.rgb);
  vec3 spec = ggx(N, V, L, rough) * key * vec3(1.0, 0.97, 0.93);
  vec3 col = body * (1.0 - F) + (env + lampAt(P, R)) * F + spec * 0.9;

  oc = vec4(col, 1.0);
}
`;

// main: the mesh overlay
const GLSL_FS_LINE = GLSL_FS_HEAD + GLSL_COMMON + /* glsl */`
in float vD;
layout(location = 0) out vec4 oc;
void main() {
  float a = u.misc.y * mix(0.9, 0.35, clamp((vD - 5.0) * 0.5, 0.0, 1.0));
  oc = vec4(vec3(0.04, 0.05, 0.06) * a, a);
}
`;

// particles: a soft blob, a crisp disc or something between, or a streak along its travel
const GLSL_FS_FX = GLSL_FS_HEAD + /* glsl */`
in vec2 vUv; in vec4 vCol; in float vHard;
layout(location = 0) out vec4 oc;
void main() {
  float r = length(vUv);
  float soft = pow(clamp(1.0 - r, 0.0, 1.0), 1.4);
  float a = mix(soft, 1.0 - smoothstep(0.82, 1.0, r), vHard);
  oc = vCol * a;
}
`;

// post: exposure, Khronos PBR Neutral tone mapping, sRGB, dither
const GLSL_FS_POST = GLSL_FS_HEAD + GLSL_COMMON + /* glsl */`
uniform sampler2D hdr;
layout(location = 0) out vec4 oc;
vec3 neutral(vec3 c0) {
  float startC = 0.8 - 0.04;
  float desat = 0.15;
  float x = min(c0.r, min(c0.g, c0.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  vec3 c = c0 - off;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < startC) { return c; }
  float d = 1.0 - startC;
  float np = 1.0 - d * d / (peak + d - startC);
  c *= np / peak;
  float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 oetf(vec3 c) {
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec3 c = texelFetch(hdr, ivec2(fc), 0).rgb * u.misc.x;
  c = neutral(max(c, vec3(0.0)));
  vec3 s = oetf(clamp(c, vec3(0.0), vec3(1.0)));
  s += (hash3(vec3(fc, 1.0)) - 0.5) / 255.0;
  oc = vec4(s, 1.0);
}
`;
