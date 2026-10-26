// ─────────────────────────────────────────────────────────────
//  Pieces: the fox and everything cut from it.
//  Every piece is a simple polygon P in the fox's rest plane (u, w) — its
//  outline seen from above. All pieces share one rest frame, so the drawing
//  stays exactly where it was on every one of them.
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
// needs: geometry.js
'use strict';

const MIN_AREA = 0.02;        // a cut may not leave crumbs smaller than this…
const MIN_WIDTH = 0.05;       // …or slivers thinner than this (2 · area / perimeter)
const CUT_ROUND = 0.05;       // corner radius where a cut meets the outline
const OUTLINE_STEP = 0.022;   // vertex spacing of a piece outline

function initialPiece() {
  const P = [];
  for (let i = 0; i < FOX.outline.length; i += 2) P.push([FOX.outline[i], FOX.outline[i + 1]]);
  return { P, cache: null };
}

// Split a piece along the rest-plane line a·u + b·w = c (a, b normalised), where the stroke —
// t0 to t1 along the line — passes through it. The crossings, sorted along the line, pair up into
// chords through the interior; walking the outline and jumping across each chord gives the loops
// on either side. A chord that would shave off a crumb is left uncut.
// Returns null if the line misses the piece, [] if nothing can be cut there.
function splitPiece(P, a, b, c, t0 = -Infinity, t1 = Infinity) {
  const n = P.length, s = new Float64Array(n);
  for (let i = 0; i < n; i++) { const v = a * P[i][0] + b * P[i][1] - c; s[i] = Math.abs(v) < 1e-7 ? 1e-7 : v; }
  const ring = [], cross = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ring.push({ p: P[i], chord: -1 });
    if (s[i] * s[j] < 0) {
      const f = s[i] / (s[i] - s[j]);
      const p = [P[i][0] + (P[j][0] - P[i][0]) * f, P[i][1] + (P[j][1] - P[i][1]) * f];
      cross.push({ at: ring.length, t: a * p[1] - b * p[0] });
      ring.push({ p, chord: -1 });
    }
  }
  if (cross.length < 2) return null;
  cross.sort((x, y) => x.t - y.t);
  let chords = [];
  for (let k = 0; k + 1 < cross.length; k += 2) if (cross[k + 1].t > t0 && cross[k].t < t1) chords.push([cross[k].at, cross[k + 1].at]);
  while (chords.length) {
    for (const v of ring) v.chord = -1;
    chords.forEach(([x, y], k) => { ring[x].chord = k; ring[y].chord = k; });
    const seen = new Uint8Array(ring.length), loops = [];
    for (let e0 = 0; e0 < ring.length; e0++) {
      if (seen[e0]) continue;
      const V = [], corner = [], used = new Set();
      let i = e0;
      do {
        seen[i] = 1;
        V.push(ring[i].p); corner.push(ring[i].chord >= 0);
        let v = (i + 1) % ring.length;
        const k = ring[v].chord;
        // arriving at a crossing: take the chord and carry on along the outline from its far end
        if (k >= 0) { V.push(ring[v].p); corner.push(true); used.add(k); v = chords[k][0] === v ? chords[k][1] : chords[k][0]; }
        i = v;
      } while (i !== e0);
      loops.push({ V, corner, used });
    }
    const crumb = loops.find(l => {
      const A = polyArea(l.V);
      let per = 0;
      for (let i = 0; i < l.V.length; i++) { const p = l.V[i], q = l.V[(i + 1) % l.V.length]; per += Math.hypot(q[0] - p[0], q[1] - p[1]); }
      return A < MIN_AREA || 2 * A / per < MIN_WIDTH;
    });
    if (!crumb) return loops.map(l => roundCorners(l.V, l.corner, CUT_ROUND, OUTLINE_STEP));
    chords = chords.filter((_, k) => !crumb.used.has(k));
  }
  return [];
}

// soften the corners a cut leaves behind — each becomes a short curve tangent to both sides —
// then resample the whole outline evenly
function roundCorners(V, corner, radius, step) {
  const n = V.length, acc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const p = V[i], q = V[(i + 1) % n]; acc[i + 1] = acc[i] + Math.hypot(q[0] - p[0], q[1] - p[1]); }
  const L = acc[n];
  const at = s => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] <= s) lo = m; else hi = m; }
    const p = V[lo], q = V[(lo + 1) % n], f = (s - acc[lo]) / (acc[lo + 1] - acc[lo] || 1);
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  };
  const gap = (i, j) => (acc[j] - acc[i] + L) % L || L;   // arc length from vertex i forward to vertex j
  const C = [];
  for (let i = 0; i < n; i++) if (corner[i]) C.push(i);
  const r = C.map((c, k) => Math.min(radius, 0.45 * gap(C[(k + C.length - 1) % C.length], c), 0.45 * gap(c, C[(k + 1) % C.length])));
  const out = [];
  C.forEach((c, k) => {
    const A = at(acc[c] - r[k]), B = at(acc[c] + r[k]), nk = (k + 1) % C.length;
    for (let j = 0; j <= 4; j++) {
      const f = j / 4, g = 1 - f;
      out.push([g * g * A[0] + 2 * g * f * V[c][0] + f * f * B[0], g * g * A[1] + 2 * g * f * V[c][1] + f * f * B[1]]);
    }
    for (let i = (c + 1) % n; i !== C[nk]; i = (i + 1) % n) if (gap(c, i) > r[k] && gap(i, C[nk]) > r[nk]) out.push(V[i]);
  });
  return resamplePoly(out, step);
}

// ── per-piece simulation mesh: Delaunay inside the outline, extruded into prisms → tets ──
// Small pieces get a finer mesh; null if the outline is too thin to fill at all.
function buildPieceSim(P, layers = 3) {
  const { T } = SHAPE, area = polyArea(P);
  let pts = null, tris = null;
  for (let h = 0.15, tries = 0; tries < 5; tries++, h *= 0.72) {
    // outline points, skipping any that crowd an earlier one (the two sides of a thin spike)
    pts = [];
    for (const p of resamplePoly(P, h)) {
      let dup = false;
      for (let j = 0; j < pts.length; j += 2) if (Math.hypot(pts[j] - p[0], pts[j + 1] - p[1]) < h * 0.45) { dup = true; break; }
      if (!dup) pts.push(p[0], p[1]);
    }
    latticeInto(pts, P, h, h * 0.55);
    const all = delaunay(pts), keep = [];
    for (let i = 0; i < all.length; i += 3) {
      const a = all[i], b = all[i + 1], c = all[i + 2];
      const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1], cx = pts[2 * c], cy = pts[2 * c + 1];
      const ar = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
      const l2 = Math.max((bx - ax) ** 2 + (by - ay) ** 2, (cx - bx) ** 2 + (cy - by) ** 2, (ax - cx) ** 2 + (ay - cy) ** 2);
      // inside the outline, and not a sliver of nearly collinear outline points
      if (ar / l2 > 0.08 && pointInPoly(P, (ax + bx + cx) / 3, (ay + by + cy) / 3)) keep.push(a, b, c);
    }
    tris = largestPatch(keep);
    let covered = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const a = tris[i], b = tris[i + 1], c = tris[i + 2];
      covered += Math.abs((pts[2 * b] - pts[2 * a]) * (pts[2 * c + 1] - pts[2 * a + 1]) - (pts[2 * b + 1] - pts[2 * a + 1]) * (pts[2 * c] - pts[2 * a])) / 2;
    }
    if (tris.length >= 36 && covered > 0.92 * area) break;
  }
  if (tris.length < 9) return null;
  // keep only vertices referenced
  const used = new Int32Array(pts.length / 2).fill(-1);
  const v2 = [];
  for (const v of tris) if (used[v] < 0) { used[v] = v2.length / 2; v2.push(pts[2 * v], pts[2 * v + 1]); }
  tris = tris.map(v => used[v]);
  const n2 = v2.length / 2, nL = layers + 1;
  const rest = new Float32Array(n2 * nL * 3);
  for (let l = 0; l < nL; l++) for (let i = 0; i < n2; i++) {
    const k = (l * n2 + i) * 3;
    rest[k] = v2[2 * i]; rest[k + 1] = T * l / layers; rest[k + 2] = v2[2 * i + 1];
  }
  const tets = [];
  for (let l = 0; l < layers; l++) for (let i = 0; i < tris.length; i += 3) {
    const s = [tris[i], tris[i + 1], tris[i + 2]].sort((x, y) => x - y);
    const a = l * n2 + s[0], b = l * n2 + s[1], c = l * n2 + s[2];
    tets.push(a, b, c, a + n2, b, c, a + n2, b + n2, c, a + n2, b + n2, c + n2);
  }
  for (let t = 0; t < tets.length; t += 4) if (tetVolume(rest, tets[t], tets[t + 1], tets[t + 2], tets[t + 3]) < 0) { const tmp = tets[t + 2]; tets[t + 2] = tets[t + 3]; tets[t + 3] = tmp; }
  // one material throughout
  return { rest, tets: new Uint32Array(tets), region: new Uint8Array(n2 * nL) };
}

// ── air bubbles, scattered once per look in the shared rest frame ──
function globalBubbles() {
  if (FOX.bubbles) return FOX.bubbles;
  const { T } = SHAPE, R = rng(10), P = initialPiece().P, list = [];
  let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
  for (const p of P) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); w0 = Math.min(w0, p[1]); w1 = Math.max(w1, p[1]); }
  const bs = 8, bp = 12;
  for (let tries = 0; list.length < 14 && tries < 400; tries++) {
    const x = u0 + R() * (u1 - u0), z = w0 + R() * (w1 - w0);
    const r = 0.009 + R() * R() * 0.02, y = R() < 0.6 ? T - 0.04 - R() * 0.14 : 0.05 + R() * 0.12;
    if (polySD(P, x, z) > -0.14) continue;
    const pos = [], nrm = [], idx = [];
    for (let i = 0; i <= bs; i++) {
      const t = Math.PI * i / bs;
      for (let j = 0; j < bp; j++) {
        const ph = 2 * Math.PI * j / bp;
        const nx = Math.sin(t) * Math.cos(ph), ny = Math.cos(t), nz = Math.sin(t) * Math.sin(ph);
        pos.push(x + nx * r, y + ny * r, z + nz * r); nrm.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < bs; i++) for (let j = 0; j < bp; j++) {
      const a = i * bp + j, bb = i * bp + (j + 1) % bp, c = a + bp, d = bb + bp;
      idx.push(a, bb, c, bb, d, c);
    }
    list.push({ cx: x, cz: z, rad: r, pos, nrm, idx });
  }
  FOX.bubbles = list;
  return list;
}

// outline samples for the render mesh: position p, outward normal n, and b — how far the bevel
// reaches inward there. b is the full SHAPE.bevel wherever a disc of that radius fits behind the
// outline, and narrows in ear tips and tufts of fur so the inset outline never folds over itself.
function pieceSamples(P, spacing) {
  const V = resamplePoly(P, spacing), N = V.length, S = [];
  for (let i = 0; i < N; i++) {
    const p = V[i], q0 = V[(i + N - 1) % N], q1 = V[(i + 1) % N];
    const tx = q1[0] - q0[0], tw = q1[1] - q0[1], l = Math.hypot(tx, tw) || 1;
    const n = [tw / l, -tx / l];
    let b = SHAPE.bevel;
    while (b > SHAPE.bevel * 0.15 && polySD(V, p[0] - n[0] * b, p[1] - n[1] * b) > -0.9 * b) b *= 0.78;
    S.push({ p, n, b });
  }
  // ease the changes in b along the outline
  for (let pass = 0; pass < 3; pass++) {
    const prev = S.map(s => s.b);
    for (let i = 0; i < N; i++) S[i].b = Math.min(prev[i], (prev[(i + N - 1) % N] + prev[i] + prev[(i + 1) % N]) / 3);
  }
  return S;
}

// Delaunay of a closed ring of points plus a hex lattice inside it, keeping the triangles that
// lie inside the ring. `missing` lists the ring edges the triangulation did not follow.
function triangulateRing(R, spacing) {
  const N = R.length, pts = [];
  for (const p of R) pts.push(p[0], p[1]);
  latticeInto(pts, R, spacing, spacing * 0.6);
  const all = delaunay(pts), tris = [], edges = new Set();
  const key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
  for (let i = 0; i < all.length; i += 3) {
    const a = all[i], b = all[i + 1], c = all[i + 2];
    edges.add(key(a, b)); edges.add(key(b, c)); edges.add(key(c, a));
    if (pointInPoly(R, (pts[2 * a] + pts[2 * b] + pts[2 * c]) / 3, (pts[2 * a + 1] + pts[2 * b + 1] + pts[2 * c + 1]) / 3)) tris.push(a, b, c);
  }
  const missing = [];
  for (let i = 0; i < N; i++) if (!edges.has(key(i, (i + 1) % N))) missing.push(i);
  return { pts, tris, missing };
}

// ── per-piece render mesh: beveled walls, two caps, and the bubbles that lie inside it ──
// material ids: 0 body, 2 bubble. Each vertex also carries the point of the drawing it shows.
function buildPieceRender(P) {
  const { T, bevel: bv } = SHAPE;
  const pos = [], tex = [], nrm = [], mat = [], body = [], bubbles = [];
  const add = (x, y, z, tu, tw, m, nx, ny, nz) => { pos.push(x, y, z); tex.push(tu, tw); nrm.push(nx, ny, nz); mat.push(m); return pos.length / 3 - 1; };
  // outline samples, with extra ones wherever the cap triangulation cut across the inset outline
  let S = pieceSamples(P, 0.03), cap;
  for (let pass = 0; ; pass++) {
    cap = triangulateRing(S.map(s => [s.p[0] - s.n[0] * s.b, s.p[1] - s.n[1] * s.b]), 0.048);
    if (!cap.missing.length || pass === 3) break;
    const miss = new Set(cap.missing), next = [];
    S.forEach((s, i) => {
      next.push(s);
      if (!miss.has(i)) return;
      const q = S[(i + 1) % S.length], nx = s.n[0] + q.n[0], nw = s.n[1] + q.n[1], l = Math.hypot(nx, nw) || 1;
      next.push({ p: [(s.p[0] + q.p[0]) / 2, (s.p[1] + q.p[1]) / 2], n: [nx / l, nw / l], b: (s.b + q.b) / 2 });
    });
    S = next;
  }
  const N = S.length;
  // wall rings from the floor up: bottom bevel quarter, straight band, top bevel quarter.
  // k is the fraction of the bevel reach b that the ring is inset by.
  const qb = 8, qs = 3, rings = [];
  for (let j = 0; j <= qb; j++) { const ps = -Math.PI / 2 + (Math.PI / 2) * j / qb; rings.push({ k: 1 - Math.cos(ps), y: bv + bv * Math.sin(ps), ny: Math.sin(ps), nr: Math.cos(ps) }); }
  for (let j = 1; j < qs; j++) rings.push({ k: 0, y: bv + (T - 2 * bv) * j / qs, ny: 0, nr: 1 });
  for (let j = 0; j <= qb; j++) { const ps = (Math.PI / 2) * j / qb; rings.push({ k: 1 - Math.cos(ps), y: T - bv + bv * Math.sin(ps), ny: Math.sin(ps), nr: Math.cos(ps) }); }
  const ringStart = [];
  for (const r of rings) {
    ringStart.push(pos.length / 3);
    for (const s of S) {
      // the wall shows the colours just inside the outline, not the drawn contour itself
      const d = s.b * r.k, dc = Math.max(d, Math.min(SHAPE.inkInset, s.b));
      add(s.p[0] - s.n[0] * d, r.y, s.p[1] - s.n[1] * d, s.p[0] - s.n[0] * dc, s.p[1] - s.n[1] * dc, 0, s.n[0] * r.nr, r.ny, s.n[1] * r.nr);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < N; k++) {
    const a = ringStart[j] + k, bb = ringStart[j] + (k + 1) % N, c = ringStart[j + 1] + k, d = ringStart[j + 1] + (k + 1) % N;
    body.push(a, c, bb, bb, c, d);
  }
  // caps: the first N cap points are the innermost wall rings, the rest are new
  const topRing = ringStart[rings.length - 1], botRing = ringStart[0], topMap = [], botMap = [];
  for (let i = 0; i < cap.pts.length / 2; i++) {
    if (i < N) { topMap.push(topRing + i); botMap.push(botRing + i); continue; }
    const x = cap.pts[2 * i], z = cap.pts[2 * i + 1];
    topMap.push(add(x, T, z, x, z, 0, 0, 1, 0)); botMap.push(add(x, 0, z, x, z, 0, 0, -1, 0));
  }
  for (let i = 0; i < cap.tris.length; i += 3) {
    const a = cap.tris[i], c1 = cap.tris[i + 1], c2 = cap.tris[i + 2];
    body.push(topMap[a], topMap[c2], topMap[c1]);
    body.push(botMap[a], botMap[c1], botMap[c2]);
  }
  // bubbles that sit wholly inside this piece
  for (const bu of globalBubbles()) {
    if (polySD(P, bu.cx, bu.cz) + bu.rad > -0.03) continue;
    const base = pos.length / 3;
    for (let k = 0; k < bu.pos.length; k += 3) add(bu.pos[k], bu.pos[k + 1], bu.pos[k + 2], bu.cx, bu.cz, 2, bu.nrm[k], bu.nrm[k + 1], bu.nrm[k + 2]);
    for (const v of bu.idx) bubbles.push(base + v);
  }
  // windings agree with analytic outward normals (CCW = front)
  for (const idx of [body, bubbles]) for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b1 = idx[i + 1], c = idx[i + 2];
    const e1x = pos[3 * b1] - pos[3 * a], e1y = pos[3 * b1 + 1] - pos[3 * a + 1], e1z = pos[3 * b1 + 2] - pos[3 * a + 2];
    const e2x = pos[3 * c] - pos[3 * a], e2y = pos[3 * c + 1] - pos[3 * a + 1], e2z = pos[3 * c + 2] - pos[3 * a + 2];
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    let d = 0;
    for (const v of [a, b1, c]) d += fx * nrm[3 * v] + fy * nrm[3 * v + 1] + fz * nrm[3 * v + 2];
    if (d < 0) { idx[i + 1] = c; idx[i + 2] = b1; }
  }
  return { rest: new Float32Array(pos), tex: new Float32Array(tex), mat: new Float32Array(mat), body, bubbles };
}

// meshes for one piece, built once; null if the piece is too thin to simulate
function ensureCache(piece) {
  if (piece.cache) return piece.cache;
  const sim = buildPieceSim(piece.P);
  if (!sim) return null;
  const ren = buildPieceRender(piece.P);
  const emb = embed(sim.rest, sim.tets, ren.rest);
  piece.cache = { sim, ren, emb };
  return piece.cache;
}

// ── the world: every piece concatenated into one simulation and one render mesh ──
function buildWorld(pieces) {
  let nP = 0, nT = 0, nV = 0, nB = 0, nU = 0;
  for (const p of pieces) {
    const c = ensureCache(p);
    nP += c.sim.rest.length / 3; nT += c.sim.tets.length / 4; nV += c.ren.rest.length / 3;
    nB += c.ren.body.length; nU += c.ren.bubbles.length;
  }
  const rest = new Float32Array(nP * 3), tets = new Uint32Array(nT * 4), region = new Uint8Array(nP), comp = new Uint16Array(nP);
  const rRest = new Float32Array(nV * 3), rTex = new Float32Array(nV * 2), rMat = new Float32Array(nV), vComp = new Uint16Array(nV);
  const index = new Uint32Array(nB + nU);
  const skinIdx = new Uint32Array(nV * 4), skinW = new Float32Array(nV * 4);
  let po = 0, to = 0, vo = 0, bo = 0, uo = nB;
  pieces.forEach((p, k) => {
    const { sim, ren, emb } = p.cache;
    const np = sim.rest.length / 3, nt = sim.tets.length / 4, nv = ren.rest.length / 3;
    rest.set(sim.rest, po * 3); region.set(sim.region, po); comp.fill(k, po, po + np);
    for (let i = 0; i < nt * 4; i++) tets[to * 4 + i] = sim.tets[i] + po;
    rRest.set(ren.rest, vo * 3); rTex.set(ren.tex, vo * 2); rMat.set(ren.mat, vo); vComp.fill(k, vo, vo + nv);
    for (let v = 0; v < nv; v++) for (let j = 0; j < 4; j++) {
      skinIdx[(vo + v) * 4 + j] = sim.tets[4 * emb.tetOf[v] + j] + po;
      skinW[(vo + v) * 4 + j] = emb.w[4 * v + j];
    }
    for (const i of ren.body) index[bo++] = i + vo;
    for (const i of ren.bubbles) index[uo++] = i + vo;
    po += np; to += nt; vo += nv;
  });
  return {
    // outlines and thickness: the exact solid each piece is, for the collisions of rigid materials
    sim: { rest, tets, region, comp, nComp: pieces.length, outlines: pieces.map(p => p.P), thickness: SHAPE.T },
    render: {
      rest: rRest, tex: rTex, mat: rMat, index, vComp,
      body: { first: 0, count: nB }, bubbles: { first: nB, count: nU },
    },
    skinIdx, skinW,
  };
}
