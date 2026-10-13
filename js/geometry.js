// ─────────────────────────────────────────────────────────────
//  Geometry shared by every piece: the fox outline traced from the
//  drawing, polygon helpers, Delaunay triangulation, and the barycentric
//  embedding that ties every render vertex to a tetrahedron.
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
// needs: fox-data.js (window.FOX_DATA)
'use strict';

// one entry per look — outline, texture and its placement — generated from the drawings by
// tools/build_fox_data.py. FOX is the look in use.
const LOOKS = window.FOX_DATA;
let FOX = LOOKS[0];
function setFox(i) { FOX = LOOKS[i]; }

const SHAPE = {
  T: 0.4,           // thickness
  bevel: 0.06,      // rounding of the top / bottom edges
  inkInset: 0.032,  // walls take their colour from this far inside the outline
};

// seeded PRNG so the specimen is identical on each load
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── polygons in the rest plane: arrays of [u, w], positive area ──
function polyArea(P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; }
  return s / 2;
}

function pointInPoly(P, u, w) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    if ((a[1] > w) !== (b[1] > w) && u < a[0] + (b[0] - a[0]) * (w - a[1]) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}

// signed distance to the outline (negative inside)
function polySD(P, u, w) {
  let d2 = Infinity, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    const ex = b[0] - a[0], ew = b[1] - a[1], px = u - a[0], pw = w - a[1];
    const t = Math.min(1, Math.max(0, (px * ex + pw * ew) / (ex * ex + ew * ew || 1)));
    const dx = px - ex * t, dw = pw - ew * t;
    d2 = Math.min(d2, dx * dx + dw * dw);
    if ((a[1] > w) !== (b[1] > w) && u < a[0] + ex * (w - a[1]) / ew) inside = !inside;
  }
  return inside ? -Math.sqrt(d2) : Math.sqrt(d2);
}

// the same signed distance, and the point of the outline nearest to (u, w), written into `near`
function polyNearest(P, u, w, near) {
  let d2 = Infinity, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    const ex = b[0] - a[0], ew = b[1] - a[1], px = u - a[0], pw = w - a[1];
    const t = Math.min(1, Math.max(0, (px * ex + pw * ew) / (ex * ex + ew * ew || 1)));
    const dx = px - ex * t, dw = pw - ew * t, d = dx * dx + dw * dw;
    if (d < d2) { d2 = d; near[0] = a[0] + ex * t; near[1] = a[1] + ew * t; }
    if ((a[1] > w) !== (b[1] > w) && u < a[0] + ex * (w - a[1]) / ew) inside = !inside;
  }
  return inside ? -Math.sqrt(d2) : Math.sqrt(d2);
}

// the same closed outline at even arc-length steps
function resamplePoly(P, spacing) {
  const n = P.length, acc = [0];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; acc.push(acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = acc[n], m = Math.max(3, Math.round(L / spacing)), out = [];
  for (let k = 0, i = 0; k < m; k++) {
    const s = L * k / m;
    while (acc[i + 1] < s) i++;
    const a = P[i], b = P[(i + 1) % n], t = (s - acc[i]) / (acc[i + 1] - acc[i] || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

// hex lattice points at least `margin` inside the outline, appended to a flat [u, w, …] list
function latticeInto(pts, P, spacing, margin) {
  const n = P.length;
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, maxEdge = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const p = P[i];
    u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); w0 = Math.min(w0, p[1]); w1 = Math.max(w1, p[1]);
    maxEdge = Math.max(maxEdge, Math.hypot(p[0] - P[j][0], p[1] - P[j][1]));
  }
  // edges binned by midpoint, in cells wide enough that anything within `margin` of a point
  // is in its own cell or one of the eight around it
  const cell = margin + maxEdge / 2 + 1e-6, cols = Math.floor((u1 - u0) / cell) + 3;
  const bin = (u, w) => (Math.floor((w - w0) / cell) + 1) * cols + Math.floor((u - u0) / cell) + 1;
  const bins = new Map();
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const k = bin((P[i][0] + P[j][0]) / 2, (P[i][1] + P[j][1]) / 2), l = bins.get(k);
    if (l) l.push(j, i); else bins.set(k, [j, i]);
  }
  const clear = (u, w) => {
    const k = bin(u, w);
    for (let dk = -cols; dk <= cols; dk += cols) for (let d = -1; d <= 1; d++) {
      const l = bins.get(k + dk + d);
      if (!l) continue;
      for (let e = 0; e < l.length; e += 2) {
        const a = P[l[e]], b = P[l[e + 1]];
        const ex = b[0] - a[0], ew = b[1] - a[1], px = u - a[0], pw = w - a[1];
        const t = Math.min(1, Math.max(0, (px * ex + pw * ew) / (ex * ex + ew * ew || 1)));
        if ((px - ex * t) ** 2 + (pw - ew * t) ** 2 < margin * margin) return false;
      }
    }
    return true;
  };
  const dy = spacing * Math.sqrt(3) / 2;
  for (let w = w0 + dy / 2, row = 0; w < w1; w += dy, row++) {
    // where this row crosses the outline: it is inside between each pair of crossings
    const xs = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = P[j], b = P[i];
      if ((a[1] > w) !== (b[1] > w)) xs.push(a[0] + (b[0] - a[0]) * (w - a[1]) / (b[1] - a[1]));
    }
    xs.sort((x, y) => x - y);
    const first = u0 + (row % 2) * spacing / 2;
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let u = first + Math.ceil((xs[k] + margin - first) / spacing) * spacing; u <= xs[k + 1] - margin; u += spacing) if (clear(u, w)) pts.push(u, w);
  }
}

// ── Bowyer–Watson Delaunay. Points go in left to right, so a triangle whose circumcircle
//    lies wholly behind the sweep is finished and never tested again. ──
function delaunay(pts) {
  const n = pts.length / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, pts[2 * i]); maxX = Math.max(maxX, pts[2 * i]);
    minY = Math.min(minY, pts[2 * i + 1]); maxY = Math.max(maxY, pts[2 * i + 1]);
  }
  const d = Math.max(maxX - minX, maxY - minY) * 20;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P = Array.from(pts);
  P.push(mx - d, my - d, mx + d, my - d, mx, my + d);
  const mk = (a, b, c) => {
    const ax = P[2 * a], ay = P[2 * a + 1], bx = P[2 * b], by = P[2 * b + 1], cx = P[2 * c], cy = P[2 * c + 1];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
    return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => P[2 * i] - P[2 * j]);
  let open = [mk(n, n + 1, n + 2)];
  const done = [];
  for (const i of order) {
    const px = P[2 * i], py = P[2 * i + 1];
    const bad = [], keep = [];
    for (const t of open) {
      const dx = px - t.x, r2 = t.r2 * (1 + 1e-9);
      if (dx > 0 && dx * dx > r2) done.push(t);
      else (dx * dx + (py - t.y) ** 2 < r2 ? bad : keep).push(t);
    }
    const edges = new Map();
    for (const t of bad) for (const [e0, e1] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      const k = e0 < e1 ? e0 * 100003 + e1 : e1 * 100003 + e0;
      const ex = edges.get(k);
      if (ex) ex.count++; else edges.set(k, { e0, e1, count: 1 });
    }
    open = keep;
    for (const e of edges.values()) if (e.count === 1) open.push(mk(e.e0, e.e1, i));
  }
  const res = [];
  for (const t of done.concat(open)) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    // CCW orientation
    const ax = P[2 * t.a], ay = P[2 * t.a + 1];
    const cr = (P[2 * t.b] - ax) * (P[2 * t.c + 1] - ay) - (P[2 * t.b + 1] - ay) * (P[2 * t.c] - ax);
    if (cr > 0) res.push(t.a, t.b, t.c); else res.push(t.a, t.c, t.b);
  }
  return res;
}

// the largest edge-connected patch of a triangle list
function largestPatch(tris) {
  const nT = tris.length / 3, parent = new Int32Array(nT);
  for (let t = 0; t < nT; t++) parent[t] = t;
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const owner = new Map();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const a = tris[3 * t + k], b = tris[3 * t + (k + 1) % 3], key = a < b ? a * 65536 + b : b * 65536 + a;
    const o = owner.get(key);
    if (o === undefined) owner.set(key, t); else parent[find(t)] = find(o);
  }
  const size = new Map();
  let best = -1;
  for (let t = 0; t < nT; t++) { const r = find(t); size.set(r, (size.get(r) || 0) + 1); if (best < 0 || size.get(r) > size.get(best)) best = r; }
  const out = [];
  for (let t = 0; t < nT; t++) if (find(t) === best) out.push(tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]);
  return out;
}

function tetVolume(p, a, b, c, d) {
  const ax = p[3 * a], ay = p[3 * a + 1], az = p[3 * a + 2];
  const b0 = p[3 * b] - ax, b1 = p[3 * b + 1] - ay, b2 = p[3 * b + 2] - az;
  const c0 = p[3 * c] - ax, c1 = p[3 * c + 1] - ay, c2 = p[3 * c + 2] - az;
  const d0 = p[3 * d] - ax, d1 = p[3 * d + 1] - ay, d2 = p[3 * d + 2] - az;
  return (b0 * (c1 * d2 - c2 * d1) - b1 * (c0 * d2 - c2 * d0) + b2 * (c0 * d1 - c1 * d0)) / 6;
}

// ── Barycentric embedding of render vertices into sim tets ──
function embed(simRest, tets, verts) {
  const nT = tets.length / 4, nV = verts.length / 3;
  const cell = 0.1;
  const grid = new Map();
  const key = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  const inv = new Float64Array(nT * 9);
  for (let t = 0; t < nT; t++) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const id = [tets[4 * t], tets[4 * t + 1], tets[4 * t + 2], tets[4 * t + 3]];
    for (const v of id) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], simRest[3 * v + c]); mx[c] = Math.max(mx[c], simRest[3 * v + c]); }
    for (let i = Math.floor(mn[0] / cell); i <= Math.floor(mx[0] / cell); i++)
      for (let j = Math.floor(mn[1] / cell); j <= Math.floor(mx[1] / cell); j++)
        for (let k = Math.floor(mn[2] / cell); k <= Math.floor(mx[2] / cell); k++) {
          const K = key(i, j, k); let l = grid.get(K); if (!l) grid.set(K, l = []); l.push(t);
        }
    // inverse of [b-a, c-a, d-a]
    const a = id[0];
    const m = [];
    for (let c = 1; c < 4; c++) for (let r = 0; r < 3; r++) m.push(simRest[3 * id[c] + r] - simRest[3 * a + r]);
    // m as columns: col0 = m[0..2], col1 = m[3..5], col2 = m[6..8]; build row-major M
    const M = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
    const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
    const id2 = 1 / det;
    inv[9 * t + 0] = (M[4] * M[8] - M[5] * M[7]) * id2; inv[9 * t + 1] = (M[2] * M[7] - M[1] * M[8]) * id2; inv[9 * t + 2] = (M[1] * M[5] - M[2] * M[4]) * id2;
    inv[9 * t + 3] = (M[5] * M[6] - M[3] * M[8]) * id2; inv[9 * t + 4] = (M[0] * M[8] - M[2] * M[6]) * id2; inv[9 * t + 5] = (M[2] * M[3] - M[0] * M[5]) * id2;
    inv[9 * t + 6] = (M[3] * M[7] - M[4] * M[6]) * id2; inv[9 * t + 7] = (M[1] * M[6] - M[0] * M[7]) * id2; inv[9 * t + 8] = (M[0] * M[4] - M[1] * M[3]) * id2;
  }
  const bary = (t, x, y, z) => {
    const a = tets[4 * t];
    const dx = x - simRest[3 * a], dy = y - simRest[3 * a + 1], dz = z - simRest[3 * a + 2];
    const I = 9 * t;
    const b1 = inv[I] * dx + inv[I + 1] * dy + inv[I + 2] * dz;
    const b2 = inv[I + 3] * dx + inv[I + 4] * dy + inv[I + 5] * dz;
    const b3 = inv[I + 6] * dx + inv[I + 7] * dy + inv[I + 8] * dz;
    return [1 - b1 - b2 - b3, b1, b2, b3];
  };
  const tetOf = new Uint32Array(nV);
  const w = new Float32Array(nV * 4);
  for (let v = 0; v < nV; v++) {
    const x = verts[3 * v], y = verts[3 * v + 1], z = verts[3 * v + 2];
    let best = -1, bestScore = -Infinity, bestB = null;
    const tryT = t => {
      const bb = bary(t, x, y, z);
      const s = Math.min(bb[0], bb[1], bb[2], bb[3]);
      if (s > bestScore) { bestScore = s; best = t; bestB = bb; }
    };
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
    // widen the search ring by ring: stop once inside a tet, or — past the nearest cells — once
    // a tet is close enough to extrapolate from
    for (let r = 0; r <= 4 && bestScore < (r < 2 ? -1e-4 : -0.3); r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue;
        const l = grid.get(key(i, j, k)); if (l) for (const t of l) tryT(t);
      }
    }
    if (best < 0) for (let t = 0; t < nT; t++) tryT(t);
    tetOf[v] = best; w.set(bestB, 4 * v);
  }
  return { tetOf, w };
}
