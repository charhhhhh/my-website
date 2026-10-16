// ─────────────────────────────────────────────────────────────
//  The other tools, as props: a blowtorch, a hammer, a baseball bat and a pistol.
//  Each is built in a local frame of its own (described with it) and posed by main.js.
//  materials: 6.0 polished steel · 6.2 dark steel · 6.4 brass · 7.0 ash · 7.2 walnut
//             8.0 black rubber · 8.2 red paint · 8.4 blue paint · 8.6 label
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

const HAMMER = {
  L: 1.9,         // from the end of the handle (where it turns in the hand) to the axis of the head
  face: 0.48,     // the striking face lies this far below the handle
  R: 0.34,        // radius of the face — a sledge, wide enough to press like a hydraulic ram
  head: 0.9,      // height of the head
};
const BAT = {
  L: 2.5,
  sweet: 2.02,    // where it likes to meet things, from the knob
  from: 1.4,      // the barrel — the part that hits — starts here
  R: 0.135,       // its radius
};
const TORCH = {
  reach: 0.6,     // how far the nozzle is held from what it is pointed at
  flame: 0.8,     // length of the flame
};
const GUN = {
  stand: 0.95,    // how far the muzzle is held from what it is aimed at
  travel: 0.13,   // how far the slide comes back with each shot
  eject: [-0.47, 0.09, 0.07],   // where the spent cases leave
};

// A small mesh kit: flat-sided blocks and turned shapes. Vertices are shared only where the surface
// should look smooth; `part` tags the vertices that follow, so main.js can move some of them apart
// from the rest (the pistol's slide).
function propBuilder() {
  const pos = [], mat = [], part = [], idx = [];
  let cur = 0;
  const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
  const add = (p, m) => { pos.push(p[0], p[1], p[2]); mat.push(m); part.push(cur); return pos.length / 3 - 1; };
  // add a triangle, flipping its winding if needed so it faces along `out`
  const tri = (a, b, c, out) => {
    const A = P(a), B = P(b), C = P(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const quad = (a, b, c, d, out) => { tri(a, b, c, out); tri(a, c, d, out); };
  const B = {
    part(k) { cur = k; },
    // a solid with eight corners — the four of one face in order, then the four across from them —
    // flat on every side
    hexa(c, m) {
      const mid = [0, 0, 0];
      for (const p of c) for (let k = 0; k < 3; k++) mid[k] += p[k] / 8;
      for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
        const out = [0, 0, 0];
        for (const i of f) for (let k = 0; k < 3; k++) out[k] += c[i][k] / 4 - mid[k] / 4;
        const v = f.map(i => add(c[i], m));
        quad(v[0], v[1], v[2], v[3], out);
      }
    },
    box(x0, x1, y0, y1, z0, z1, m) {
      B.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], m);
    },
    // A turned shape: the profile — points [s, r, material], s along the axis `ax` from `o`, r out
    // from it — swept round the axis. The surface faces left of the way the profile runs, so one
    // that doubles back draws the inside of a tube. A point given twice makes a crease; so does a
    // change of material (a point's material is that of the stretch after it). Open ends are capped.
    // `oval` flattens the section across its second axis.
    lathe(o, ax, profile, m0, seg = 18, oval = 1) {
      const ref = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      let e1 = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]];
      const l = Math.hypot(...e1); e1 = e1.map(v => v / l);
      const e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]];
      const dirs = [];
      for (let k = 0; k < seg; k++) {
        const a = 2 * Math.PI * k / seg, c = Math.cos(a), s = Math.sin(a) * oval;
        dirs.push([e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s]);
      }
      const at = (s, r, k) => [o[0] + ax[0] * s + dirs[k][0] * r, o[1] + ax[1] * s + dirs[k][1] * r, o[2] + ax[2] * s + dirs[k][2] * r];
      const ring = (p, m) => dirs.map((_, k) => add(at(p[0], p[1], k), m));
      const cap = (p, m, sign) => {
        const centre = add([o[0] + ax[0] * p[0], o[1] + ax[1] * p[0], o[2] + ax[2] * p[0]], m), rim = ring(p, m);
        for (let k = 0; k < seg; k++) tri(centre, rim[k], rim[(k + 1) % seg], [ax[0] * sign, ax[1] * sign, ax[2] * sign]);
      };
      let last = null, lastM = -1, m = m0;
      for (let i = 0; i + 1 < profile.length; i++) {
        const p = profile[i], q = profile[i + 1];
        if (p[2] !== undefined) m = p[2];
        if (i === 0 && p[1] > 1e-6) cap(p, m, -1);
        if (p[0] === q[0] && p[1] === q[1]) { last = null; continue; }
        const a = last && lastM === m ? last : ring(p, m), b = ring(q, m);
        for (let k = 0; k < seg; k++) {
          const k2 = (k + 1) % seg, d = dirs[k];
          const out = [d[0] * (q[0] - p[0]) - ax[0] * (q[1] - p[1]), d[1] * (q[0] - p[0]) - ax[1] * (q[1] - p[1]), d[2] * (q[0] - p[0]) - ax[2] * (q[1] - p[1])];
          quad(a[k], b[k], b[k2], a[k2], out);
        }
        last = b; lastM = m;
      }
      const end = profile[profile.length - 1];
      if (end[1] > 1e-6) cap(end, end[2] !== undefined ? end[2] : m, 1);
    },
    // smooth normals per vertex (creases come from the duplicated vertices)
    finish() {
      const nV = pos.length / 3, nrm = new Float32Array(nV * 3);
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        const A = P(a), Bp = P(b), C = P(c);
        const e1 = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        for (const v of [a, b, c]) { nrm[3 * v] += n[0]; nrm[3 * v + 1] += n[1]; nrm[3 * v + 2] += n[2]; }
      }
      for (let v = 0; v < nV; v++) {
        const l = Math.hypot(nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]) || 1;
        nrm[3 * v] /= l; nrm[3 * v + 1] /= l; nrm[3 * v + 2] /= l;
      }
      return { rest: new Float32Array(pos), nrm, mat: new Float32Array(mat), part: new Uint8Array(part), index: new Uint32Array(idx) };
    },
  };
  return B;
}

// ── hammer ──
// local frame: the origin is the end of the handle, +x runs along it to the head, and the head
// stands along y with its striking face down, at (L, −face, 0)
function buildHammerMesh() {
  const b = propBuilder(), { L, face, R, head } = HAMMER;
  // handle: ash, a slim oval that swells where it is held
  b.lathe([0, 0, 0], [1, 0, 0], [[0, 0.06], [0.03, 0.09], [0.16, 0.1], [0.55, 0.088], [1.1, 0.072], [L - 0.25, 0.076], [L + 0.08, 0.08]], 7.0, 18, 0.76);
  // head: a forged drum, waisted at the eye, with a polished face at either end
  b.lathe([L, -face, 0], [0, 1, 0], [
    [0, R - 0.05, 6.0], [0.05, R], [0.05, R],
    [0.05, R, 6.2], [0.25, R], [0.33, R * 0.84], [head - 0.33, R * 0.84], [head - 0.25, R], [head - 0.05, R], [head - 0.05, R],
    [head - 0.05, R, 6.0], [head, R - 0.05],
  ], 6.2, 26);
  return b.finish();
}

// ── baseball bat ──
// local frame: the origin is the knob, +x runs along the bat to the end of the barrel
function buildBatMesh() {
  const b = propBuilder(), { L, R } = BAT;
  b.lathe([0, 0, 0], [1, 0, 0], [
    [0, 0.055, 7.0], [0.012, 0.078], [0.045, 0.086], [0.08, 0.078], [0.105, 0.05], [0.105, 0.05],
    // the grip, wound with tape
    [0.105, 0.05, 8.0], [0.14, 0.047], [0.5, 0.045], [0.82, 0.047], [0.82, 0.047],
    [0.82, 0.044, 7.0], [1.05, 0.05], [1.3, 0.072], [1.55, 0.102], [1.8, 0.127], [1.98, R], [L - 0.15, R],
    [L - 0.07, R - 0.012], [L - 0.025, R - 0.045], [L - 0.004, R - 0.09], [L, 0],
  ], 7.0, 24);
  return b.finish();
}

// ── blowtorch ──
// local frame: the flame leaves the origin along +x; the gas canister hangs below and behind
function buildTorchMesh() {
  const b = propBuilder();
  // nozzle: a brass tube with a flared mouth, dark inside
  b.lathe([-0.38, 0, 0], [1, 0, 0], [
    [0, 0.028, 6.4], [0.25, 0.028], [0.28, 0.047], [0.38, 0.051], [0.38, 0.051],
    [0.38, 0.051], [0.38, 0.039], [0.38, 0.039],
    [0.38, 0.039, 8.0], [0.2, 0.034],
  ], 6.4, 18);
  // burner block, with the gas valve on its side and the igniter under it
  b.box(-0.55, -0.37, -0.075, 0.075, -0.062, 0.062, 6.2);
  b.lathe([-0.46, 0, 0.062], [0, 0, 1], [[0, 0.02, 6.0], [0.028, 0.02], [0.028, 0.02], [0.028, 0.046, 8.2], [0.075, 0.046]], 8.2, 14);
  b.box(-0.43, -0.385, -0.17, -0.075, -0.02, 0.02, 8.0);
  // canister: a steel neck, a painted body with a label round it, a rolled base
  const ax = [-0.27, -0.963, 0];
  b.lathe([-0.46, -0.07, 0], ax, [
    [0, 0.046, 6.2], [0.07, 0.046], [0.07, 0.046],
    [0.07, 0.062, 8.4], [0.1, 0.105], [0.15, 0.134], [0.2, 0.142], [0.36, 0.142], [0.36, 0.142],
    [0.36, 0.143, 8.6], [0.6, 0.143], [0.6, 0.143],
    [0.6, 0.142, 8.4], [0.84, 0.142], [0.84, 0.142],
    [0.84, 0.142, 6.2], [0.875, 0.134], [0.89, 0.11],
  ], 8.4, 24);
  return b.finish();
}

// ── pistol ──
// local frame: the muzzle is the origin and the barrel runs back from it along −x, y is up, and the
// grip slopes down and back. Part 1 is the slide, which main.js throws back with each shot.
function buildGunMesh() {
  const b = propBuilder();
  const Z = 0.052;
  // barrel, bright where it shows at the muzzle, dark down the bore
  b.lathe([-0.16, 0, 0], [1, 0, 0], [
    [0, 0.03, 6.0], [0.165, 0.03], [0.165, 0.03],
    [0.165, 0.03], [0.165, 0.017], [0.165, 0.017],
    [0.165, 0.017, 8.0], [0.06, 0.017],
  ], 6.0, 14);
  // frame: the rail under the barrel, running back to the grip
  b.hexa([[-0.8, -0.13, -Z * 0.92], [-0.06, -0.13, -Z * 0.92], [-0.03, -0.07, -Z * 0.92], [-0.8, -0.07, -Z * 0.92],
  [-0.8, -0.13, Z * 0.92], [-0.06, -0.13, Z * 0.92], [-0.03, -0.07, Z * 0.92], [-0.8, -0.07, Z * 0.92]], 8.0);
  // grip: raked back, with a walnut panel on either side and the magazine's floor plate under it
  const grip = (x0, x1, x2, x3, y0, y1, z, m) => b.hexa([[x0, y0, -z], [x1, y0, -z], [x2, y1, -z], [x3, y1, -z], [x0, y0, z], [x1, y0, z], [x2, y1, z], [x3, y1, z]], m);
  grip(-0.95, -0.71, -0.55, -0.82, -0.63, -0.13, Z * 0.9, 8.0);
  for (const s of [-1, 1]) b.hexa([[-0.905, -0.57, s * Z * 0.9], [-0.725, -0.57, s * Z * 0.9], [-0.61, -0.2, s * Z * 0.9], [-0.79, -0.2, s * Z * 0.9],
  [-0.9, -0.56, s * (Z + 0.006)], [-0.735, -0.56, s * (Z + 0.006)], [-0.62, -0.21, s * (Z + 0.006)], [-0.78, -0.21, s * (Z + 0.006)]], 7.2);
  grip(-0.975, -0.7, -0.692, -0.966, -0.665, -0.63, Z * 0.98, 6.2);
  b.box(-0.87, -0.8, -0.115, -0.065, -Z * 0.8, Z * 0.8, 8.0);   // the tang over the hand
  // trigger guard and trigger
  b.box(-0.6, -0.31, -0.305, -0.28, -0.022, 0.022, 8.0);
  b.hexa([[-0.335, -0.305, -0.022], [-0.305, -0.305, -0.022], [-0.26, -0.13, -0.022], [-0.3, -0.13, -0.022],
  [-0.335, -0.305, 0.022], [-0.305, -0.305, 0.022], [-0.26, -0.13, 0.022], [-0.3, -0.13, 0.022]], 8.0);
  b.hexa([[-0.47, -0.24, -0.012], [-0.445, -0.245, -0.012], [-0.425, -0.13, -0.012], [-0.46, -0.13, -0.012],
  [-0.47, -0.24, 0.012], [-0.445, -0.245, 0.012], [-0.425, -0.13, 0.012], [-0.46, -0.13, 0.012]], 6.0);
  // slide: a long block with its top corners planed off, sights on it and the ejection port in its side
  b.part(1);
  const top = 0.068, sh = 0.04;
  b.hexa([[-0.82, -0.07, -Z], [-0.012, -0.07, -Z], [-0.012, sh, -Z], [-0.82, sh, -Z], [-0.82, -0.07, Z], [-0.012, -0.07, Z], [-0.012, sh, Z], [-0.82, sh, Z]], 6.2);
  b.hexa([[-0.82, sh, -Z], [-0.012, sh, -Z], [-0.012, top, -Z * 0.66], [-0.82, top, -Z * 0.66], [-0.82, sh, Z], [-0.012, sh, Z], [-0.012, top, Z * 0.66], [-0.82, top, Z * 0.66]], 6.2);
  b.box(-0.085, -0.045, top, top + 0.024, -0.011, 0.011, 8.0);
  b.box(-0.8, -0.745, top, top + 0.028, -0.03, 0.03, 8.0);
  b.box(-0.55, -0.37, -0.02, sh - 0.004, Z - 0.002, Z + 0.003, 8.0);
  for (let k = 0; k < 5; k++) b.box(-0.79 + k * 0.03, -0.775 + k * 0.03, -0.055, sh - 0.006, -Z - 0.003, Z + 0.003, 8.0);   // the grooves the hand racks it by
  b.part(0);
  return b.finish();
}
