// ─────────────────────────────────────────────────────────────
//  XPBD tetrahedral soft body
//  · co-rotational tet constraints → elasticity (each tet pulled toward its
//                                    best-fit rotated rest shape; recovers inversions)
//  · tet volume constraints        → near-incompressibility
//  · soft grab attachment, ground contact with friction
//  · relative-velocity damping along edges (internal viscosity)
//  · what the tools do: blows, a hammer pressing in, and heat that burns and melts
//  Fixed step, fixed substeps, "small steps" XPBD (1 iteration / substep).
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

class SoftBody {
  constructor(mesh, opts = {}) {
    const { rest, tets, region } = mesh;
    this.comp = mesh.comp || new Uint16Array(rest.length / 3);
    this.subIndex = 0;
    this.nComp = mesh.nComp || 1;
    this.n = rest.length / 3;
    this.nT = tets.length / 4;
    this.tets = tets;
    this.rest = Float32Array.from(rest);
    this.x = new Float32Array(rest.length);
    this.prev = new Float32Array(rest.length);
    this.v = new Float32Array(rest.length);
    this.invMass = new Float32Array(this.n);
    this.mass = new Float32Array(this.n);
    this.restVol = new Float32Array(this.nT);
    this.region = region;
    this.density = 1.0;
    // each piece's particles are one run of indices; its outline and the slab's thickness, if given,
    // let rigid pieces collide as exact solids (see collideSolids)
    this.outlines = mesh.outlines || null;
    this.thickness = mesh.thickness || 0;
    this.compStart = new Int32Array(this.nComp + 1);
    for (let i = 0; i < this.n; i++) this.compStart[this.comp[i] + 1] = i + 1;
    for (let c = 1; c <= this.nComp; c++) this.compStart[c] = Math.max(this.compStart[c], this.compStart[c - 1]);
    this.rigid = false;

    // masses from rest volumes
    let vol = 0;
    for (let t = 0; t < this.nT; t++) {
      const v = this.tetVol(this.rest, t);
      this.restVol[t] = v; vol += v;
      for (let k = 0; k < 4; k++) this.mass[tets[4 * t + k]] += v * this.density / 4;
    }
    this.totalRestVolume = vol;
    this.totalMass = 0;
    for (let i = 0; i < this.n; i++) { this.invMass[i] = 1 / this.mass[i]; this.totalMass += this.mass[i]; }

    // unique edges
    const set = new Map();
    const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    for (let t = 0; t < this.nT; t++) for (const [a, b] of pairs) {
      let i = tets[4 * t + a], j = tets[4 * t + b];
      if (i > j) [i, j] = [j, i];
      set.set(i * 65536 + j, [i, j]);
    }
    this.nE = set.size;
    this.edges = new Uint32Array(this.nE * 2);
    this.restLen = new Float32Array(this.nE);
    let e = 0;
    for (const [i, j] of set.values()) {
      this.edges[2 * e] = i; this.edges[2 * e + 1] = j;
      this.restLen[e] = Math.hypot(rest[3 * i] - rest[3 * j], rest[3 * i + 1] - rest[3 * j + 1], rest[3 * i + 2] - rest[3 * j + 2]);
      e++;
    }
    // shuffle edge order a little (reduces Gauss–Seidel directional bias)
    for (let k = this.nE - 1; k > 0; k--) {
      const r = (k * 2654435761) % (k + 1);
      for (const arr of [this.edges]) { const a0 = arr[2 * k], a1 = arr[2 * k + 1]; arr[2 * k] = arr[2 * r]; arr[2 * k + 1] = arr[2 * r + 1]; arr[2 * r] = a0; arr[2 * r + 1] = a1; }
      const tmp = this.restLen[k]; this.restLen[k] = this.restLen[r]; this.restLen[r] = tmp;
    }

    // co-rotational tet elasticity: rest shape, inverse rest matrix, warm-started rotation
    this.tetQ = new Float32Array(this.nT * 12);     // rest positions relative to tet centroid
    this.tetDmInv = new Float32Array(this.nT * 9);
    this.tetRot = new Float32Array(this.nT * 4);    // quaternion (x, y, z, w)
    this.tetFirm = new Float32Array(this.nT);
    for (let t = 0; t < this.nT; t++) {
      const id = [tets[4 * t], tets[4 * t + 1], tets[4 * t + 2], tets[4 * t + 3]];
      let cx = 0, cy = 0, cz = 0, M = 0;
      for (const v of id) { const mv = this.mass[v]; M += mv; cx += rest[3 * v] * mv; cy += rest[3 * v + 1] * mv; cz += rest[3 * v + 2] * mv; }
      cx /= M; cy /= M; cz /= M;
      for (let k = 0; k < 4; k++) {
        this.tetQ[12 * t + 3 * k] = rest[3 * id[k]] - cx;
        this.tetQ[12 * t + 3 * k + 1] = rest[3 * id[k] + 1] - cy;
        this.tetQ[12 * t + 3 * k + 2] = rest[3 * id[k] + 2] - cz;
      }
      // Dm columns: X1-X0, X2-X0, X3-X0 → store inverse row-major
      const m = [];
      for (let r = 0; r < 3; r++) for (let c = 1; c < 4; c++) m.push(rest[3 * id[c] + r] - rest[3 * id[0] + r]);
      const inv = inv3(m);
      this.tetDmInv.set(inv, 9 * t);
      this.tetRot[4 * t + 3] = 1;
      let rg = 0; for (const v of id) rg += region[v];
      this.tetFirm[t] = rg >= 6 ? 0.3 : rg >= 3 ? 0.5 : rg >= 1 ? 0.75 : 1.0;
    }

    // parameters (tuned in sim units: metres-ish, seconds)
    this.gravity = -9.81;
    this.firmness = opts.firmness ?? 0.5;   // 0..1 UI value
    this.damping = opts.damping ?? 0.45;    // 0..1 UI value
    this.substeps = 10;
    this.stepDt = 1 / 60;
    this.friction = 0.55;
    this.bounce = 0;        // restitution against the floor
    this.airDrag = 0.08;    // 1/s
    this.floorY = 0;
    this.maxSpeed = 12;

    // whole-piece shape memory (see solveShape): rest centroid and mass per piece, a warm-started
    // rotation, how far a particle may stray before it is drawn back at all, and how strongly
    this.shapeHold = 0.03;
    this.shapeSlack = 0.08;
    this.shapePull = new Float32Array(this.n * 3);
    this.compMass = new Float64Array(this.nComp);
    this.compRest = new Float64Array(this.nComp * 3);
    for (let i = 0; i < this.n; i++) {
      const c = this.comp[i], m = this.mass[i];
      this.compMass[c] += m;
      for (let k = 0; k < 3; k++) this.compRest[3 * c + k] += m * rest[3 * i + k];
    }
    for (let c = 0; c < this.nComp; c++) for (let k = 0; k < 3; k++) this.compRest[3 * c + k] /= this.compMass[c];
    this.compRot = new Float64Array(this.nComp * 4);
    for (let c = 0; c < this.nComp; c++) this.compRot[4 * c + 3] = 1;
    this.compRotWarm = false;
    this.compAcc = new Float64Array(this.nComp * 12);

    this.blade = null;
    // what the tools leave behind (see "what the tools do to it"): how hot each particle is, how
    // burnt, and how soft that has made it; and the shape and stiffness each tetrahedron started with
    this.heat = new Float32Array(this.n);
    this.char = new Float32Array(this.n);
    this.soft = new Float32Array(this.n);
    this.hot = false;         // something is still warm
    this.marked = false;      // something has been heated since the last reset
    this.tetQ0 = Float32Array.from(this.tetQ);
    this.tetFirm0 = Float32Array.from(this.tetFirm);
    this.restVol0 = Float32Array.from(this.restVol);
    this.pushers = null;
    // grab state
    this.grabIdx = new Int32Array(this.n);
    this.grabW = new Float32Array(this.n);
    this.grabOff = new Float32Array(this.n * 3);
    this.grabN = 0;
    this.grabTarget = new Float32Array(3);
    this.grabPos = new Float32Array(3);     // where the hand is now: chases grabTarget
    this.grabSpeed = 9;
    this.grabRot = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.grabbing = false;

    this.time = 0;
    if (opts.material) this.setMaterial(opts.material);
    this.reset(0);
  }

  // what the body is made of (see materials.js); the sliders keep their own firmness and damping
  setMaterial(m) {
    const harden = !!m.rigid && !this.rigid && this.time > 0;
    this.material = m;
    this.rigid = !!m.rigid;
    if (harden) this.rigidify();
    this.shapeHold = m.hold; this.shapeSlack = m.slack;
    this.friction = m.friction; this.bounce = m.bounce; this.airDrag = m.air;
    this.remelt();
  }

  tetVol(p, t) {
    const T = this.tets;
    const a = T[4 * t], b = T[4 * t + 1], c = T[4 * t + 2], d = T[4 * t + 3];
    const ax = p[3 * a], ay = p[3 * a + 1], az = p[3 * a + 2];
    const b0 = p[3 * b] - ax, b1 = p[3 * b + 1] - ay, b2 = p[3 * b + 2] - az;
    const c0 = p[3 * c] - ax, c1 = p[3 * c + 1] - ay, c2 = p[3 * c + 2] - az;
    const d0 = p[3 * d] - ax, d1 = p[3 * d + 1] - ay, d2 = p[3 * d + 2] - az;
    return (b0 * (c1 * d2 - c2 * d1) - b1 * (c0 * d2 - c2 * d0) + b2 * (c0 * d1 - c1 * d0)) / 6;
  }

  reset(drop = 0.35) {
    for (let i = 0; i < this.n; i++) {
      this.x[3 * i] = this.rest[3 * i];
      this.x[3 * i + 1] = this.rest[3 * i + 1] + drop;
      this.x[3 * i + 2] = this.rest[3 * i + 2];
    }
    this.prev.set(this.x);
    this.v.fill(0);
    this.endGrab();
    // a fresh specimen: nothing burnt, nothing melted
    this.heat.fill(0); this.char.fill(0);
    this.remelt();
    this.hot = this.marked = false;
  }

  // stiffness mapping: firmness 0..1 → edge compliance (log scale)
  shapeCompliance() { return Math.exp(Math.log(3.0) + (Math.log(0.05) - Math.log(3.0)) * this.firmness); }
  volCompliance() { return 1e-4 * (1 - 0.7 * this.firmness); }
  // damping 0..1 → rate (1/s) of relative-velocity decay along edges
  dampRate() { return 2 + 40 * this.damping * this.damping; }

  nudge(strength = 1) {
    // small hop with a twist — every particle gets v = v_lin + ω × (x − c)
    const c = this.centroid();
    const vy = 2.2 * strength, wx = 2.4 * strength, wz = -1.5 * strength, wy = 1.2 * strength;
    for (let i = 0; i < this.n; i++) {
      const rx = this.x[3 * i] - c[0], ry = this.x[3 * i + 1] - c[1], rz = this.x[3 * i + 2] - c[2];
      this.v[3 * i] += wy * rz - wz * ry;
      this.v[3 * i + 1] += vy + wz * rx - wx * rz;
      this.v[3 * i + 2] += wx * ry - wy * rx;
    }
  }

  centroid() {
    let x = 0, y = 0, z = 0, m = 0;
    for (let i = 0; i < this.n; i++) {
      const w = this.mass[i]; m += w;
      x += this.x[3 * i] * w; y += this.x[3 * i + 1] * w; z += this.x[3 * i + 2] * w;
    }
    return [x / m, y / m, z / m];
  }

  // ── grabbing ──
  beginGrab(hit, radius = 0.4) {
    this.grabN = 0;
    let nearest = -1, nd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot(this.x[3 * i] - hit[0], this.x[3 * i + 1] - hit[1], this.x[3 * i + 2] - hit[2]);
      if (d < nd) { nd = d; nearest = i; }
    }
    const cg = nearest >= 0 ? this.comp[nearest] : 0;   // only the piece that was touched
    this.grabComp = cg;
    // a rigid piece is held whole — every particle goes where the hand goes, so nothing is left to
    // swing or shake; a soft one is held by the patch under the hand and the rest hangs from it
    const whole = this.grabWhole = this.rigid;
    for (let i = 0; i < this.n; i++) {
      if (this.comp[i] !== cg) continue;
      const dx = this.x[3 * i] - hit[0], dy = this.x[3 * i + 1] - hit[1], dz = this.x[3 * i + 2] - hit[2];
      const d = Math.hypot(dx, dy, dz);
      if (whole || d < radius) {
        const f = whole ? 1 : 1 - d / radius;
        const k = this.grabN++;
        this.grabIdx[k] = i; this.grabW[k] = f * f * (3 - 2 * f);
        this.grabOff[3 * k] = dx; this.grabOff[3 * k + 1] = dy; this.grabOff[3 * k + 2] = dz;
      }
    }
    if (this.grabN === 0 && nearest >= 0) {
      this.grabIdx[0] = nearest; this.grabW[0] = 1;
      this.grabOff[0] = this.x[3 * nearest] - hit[0]; this.grabOff[1] = this.x[3 * nearest + 1] - hit[1]; this.grabOff[2] = this.x[3 * nearest + 2] - hit[2];
      this.grabN = 1;
    }
    this.grabTarget.set(hit);
    this.grabPos.set(hit);
    this.grabStart = Float32Array.from(hit);
    this.grabRot.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.grabbing = true;
  }
  moveGrab(target, rot) {
    this.grabTarget.set(target);
    // bounded reach: a strong stretch, never an unbounded one
    const dx = target[0] - this.grabStart[0], dy = target[1] - this.grabStart[1], dz = target[2] - this.grabStart[2];
    const d = Math.hypot(dx, dy, dz), maxReach = 2.2;
    if (d > maxReach) { const k = maxReach / d; this.grabTarget[0] = this.grabStart[0] + dx * k; this.grabTarget[1] = this.grabStart[1] + dy * k; this.grabTarget[2] = this.grabStart[2] + dz * k; }
    if (rot) this.grabRot.set(rot);
    // never drive the held patch into the floor: lift the whole patch instead of crushing it
    const R = this.grabRot;
    let lowest = Infinity;
    for (let k = 0; k < this.grabN; k++) lowest = Math.min(lowest, R[3] * this.grabOff[3 * k] + R[4] * this.grabOff[3 * k + 1] + R[5] * this.grabOff[3 * k + 2]);
    if (Number.isFinite(lowest)) this.grabTarget[1] = Math.max(this.grabTarget[1], this.floorY + 0.004 - lowest);
  }
  endGrab() { this.grabbing = false; this.grabN = 0; this.grabComp = -1; this.grabWhole = false; }

  // ── simulation ──
  step() {
    const sub = this.substeps;
    const dt = this.stepDt / sub;
    for (let s = 0; s < sub; s++) this.substep(dt);
    this.time += this.stepDt;
    if (this.hot) this.thermal(this.stepDt);
    // settling: once the jelly is nearly still, bleed off the last residual jitter
    if (!this.grabbing) {
      const ke = this.kineticEnergy() / this.totalMass; // ≈ ½ v²
      // (a rigid piece has no jitter to speak of, and one that is slowly tipping over an edge must
      // not be held back, so for those "nearly still" is a far lower bar)
      const still = this.rigid ? 1e-4 : 2e-3;
      if (ke < still) {
        const f = Math.max(0.86, 1 - 0.14 * (1 - ke / still));
        for (let i = 0; i < this.v.length; i++) this.v[i] *= f;
      }
    }
    // safety: any non-finite value → reset gently
    for (let i = 0; i < this.x.length; i += 97) if (!Number.isFinite(this.x[i])) { this.reset(0.2); break; }
  }

  substep(dt) {
    const { x, prev, v, invMass, n } = this;
    const g = this.gravity * dt;
    // light air drag; while held, the hand steadies the jelly a little more
    const air = Math.exp(-Math.max(this.grabbing ? 2.5 : 0, this.airDrag) * dt);
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      v[k + 1] += g;
      v[k] *= air; v[k + 1] *= air; v[k + 2] *= air;
      prev[k] = x[k]; prev[k + 1] = x[k + 1]; prev[k + 2] = x[k + 2];
      x[k] += v[k] * dt; x[k + 1] += v[k + 1] * dt; x[k + 2] += v[k + 2] * dt;
    }
    if (this.grabbing) this.solveGrab(dt);
    // a rigid piece is put back into its rest shape whole by solveShape, so its tetrahedra have
    // nothing to add — and their own lagging rotations would only hold its spin back
    if (!this.rigid) { this.solveTets(dt); this.solveVolumes(dt); }
    this.solveShape();
    if (this.nComp > 1) {
      // rigid pieces every substep (resting one on another, half the time is a visible sag and buzz);
      // soft ones every other, which is all they need
      if (this.rigid && this.outlines) this.collideSolids();
      else if ((this.subIndex++ & 1) === 0) this.collidePieces();
    }
    if (this.blade && this.blade.mode) this.solveBlade();
    if (this.pushers && this.pushers.length && !this.rigid) this.solvePushers(dt);
    this.solveFloor();
    const inv = 1 / dt, vmax = this.maxSpeed, bounce = this.bounce, fy = this.floorY + 1e-6;
    for (let i = 0; i < 3 * n; i += 3) {
      let vx = (x[i] - prev[i]) * inv, vy = (x[i + 1] - prev[i + 1]) * inv, vz = (x[i + 2] - prev[i + 2]) * inv;
      // a particle that came down hard on the floor leaves it with part of that speed (v still holds
      // the speed it arrived with)
      if (bounce > 0 && x[i + 1] <= fy && v[i + 1] < -0.6) vy = Math.max(vy, -bounce * v[i + 1]);
      const sp = Math.hypot(vx, vy, vz);
      if (sp > vmax) { const f = vmax / sp; vx *= f; vy *= f; vz *= f; }
      v[i] = vx; v[i + 1] = vy; v[i + 2] = vz;
    }
    this.dampEdges(dt);
  }

  // The visible knife. Before the cut it presses a rounded groove under its edge (the jelly
  // squashes before it gives); after the cut it wedges the two new faces apart as it sinks.
  solveBlade() {
    const b = this.blade, x = this.x, comp = this.comp, n = this.n;
    const px = b.p[0], py = b.p[1], pz = b.p[2];
    const dx = b.d[0], dz = b.d[2], nx = b.n[0], nz = b.n[2];
    const press = b.mode === 'press';
    if (this.rigid) { if (!press) this.wedgeSolids(); return; }
    const W = press ? 0.12 : b.halfGap, WP = 0.12;
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      const rx = x[k] - px, rz = x[k + 2] - pz;
      const along = rx * dx + rz * dz;
      if (along < b.a0 || along > b.a1) continue;
      const h = x[k + 1] - py;
      if (h > b.top) continue;
      const z = rx * nx + rz * nz, az = Math.abs(z);
      if (!press && az < WP) {
        // the cut lips stay held down at the depth of the break-through while the blade passes
        const hmax = b.holdY + 0.1 * (az / WP) * (az / WP);
        if (x[k + 1] > hmax) x[k + 1] = hmax;
      }
      if (az >= W) continue;
      if (press) {
        const hmax = 0.1 * (az / W) * (az / W);
        if (h > hmax) x[k + 1] = py + hmax;
      } else if (h > -0.03) {
        let s = b.side ? b.side[comp[i]] : 0;
        if (!s) s = z >= 0 ? 1 : -1;
        // eased: a few millimetres per substep, so the faces are wedged apart rather than kicked
        const push = Math.max(-0.003, Math.min(0.003, s * W - z));
        x[k] += nx * push; x[k + 2] += nz * push;
      }
    }
  }

  // The same wedge for rigid pieces. Nothing rigid can be dented or have its lip held down — asked
  // to, a piece is levered against the floor and thrown — so there is no groove before the cut,
  // and after it each of the two new pieces is moved aside whole, as far as it still stands in the
  // blade's way, a few millimetres per substep. Moved, not pushed: it gains no speed from it, and
  // stops when the blade does.
  wedgeSolids() {
    const b = this.blade, { x, prev, compStart: S } = this;
    if (!b.side) return;
    const px = b.p[0], py = b.p[1], pz = b.p[2], dx = b.d[0], dz = b.d[2], nx = b.n[0], nz = b.n[2], W = b.halfGap;
    for (let c = 0; c < this.nComp; c++) {
      const s = b.side[c];
      if (!s) continue;
      let need = 0;
      for (let i = S[c]; i < S[c + 1]; i++) {
        const k = 3 * i, rx = x[k] - px, rz = x[k + 2] - pz, along = rx * dx + rz * dz, h = x[k + 1] - py;
        if (along < b.a0 || along > b.a1 || h > b.top || h < -0.03) continue;
        need = Math.max(need, W - s * (rx * nx + rz * nz));
      }
      if (need <= 0) continue;
      const mx = s * nx * Math.min(need, 0.003), mz = s * nz * Math.min(need, 0.003);
      for (let i = S[c]; i < S[c + 1]; i++) { const k = 3 * i; x[k] += mx; x[k + 2] += mz; prev[k] += mx; prev[k + 2] += mz; }
    }
  }

  solveGrab(dt) {
    const { x, invMass } = this;
    const a = 2e-6 / (dt * dt);
    const R = this.grabRot, T = this.grabPos;
    // the hand cannot outrun the jelly: it follows the pointer at a bounded speed, so a flick of
    // the wrist pulls the piece along instead of whipping it into a knot
    {
      const G = this.grabTarget, gx = G[0] - T[0], gy = G[1] - T[1], gz = G[2] - T[2];
      const gl = Math.hypot(gx, gy, gz), f = Math.min(1, this.grabSpeed * dt / (gl || 1));
      T[0] += gx * f; T[1] += gy * f; T[2] += gz * f;
    }
    for (let k = 0; k < this.grabN; k++) {
      const i = this.grabIdx[k], w = invMass[i];
      const ox = this.grabOff[3 * k], oy = this.grabOff[3 * k + 1], oz = this.grabOff[3 * k + 2];
      const tx = T[0] + R[0] * ox + R[1] * oy + R[2] * oz;
      const ty = Math.max(T[1] + R[3] * ox + R[4] * oy + R[5] * oz, this.floorY + 0.005);
      const tz = T[2] + R[6] * ox + R[7] * oy + R[8] * oz;
      let f = this.grabW[k] * w / (w + a);
      // pressing down near the table: yield instead of crushing the jelly underneath
      if (!this.grabWhole && ty < x[3 * i + 1] && ty < 0.45) f *= Math.max(0.12, ty / 0.45);
      x[3 * i] += (tx - x[3 * i]) * f;
      x[3 * i + 1] += (ty - x[3 * i + 1]) * f;
      x[3 * i + 2] += (tz - x[3 * i + 2]) * f;
    }
  }

  // Per-tet co-rotational shape matching: find the rotation that best maps the rest tet onto the
  // current one (Müller et al. 2016, warm-started quaternion), then pull the four corners toward the
  // rotated rest shape with XPBD compliance. Inverted tets are always pushed back to a proper shape.
  solveTets(dt) {
    const { x, tets, tetQ, tetRot: Q, tetFirm, mass } = this;
    const base = this.shapeCompliance() / (dt * dt);
    for (let t = 0; t < this.nT; t++) {
      const a = 3 * tets[4 * t], b = 3 * tets[4 * t + 1], c = 3 * tets[4 * t + 2], d = 3 * tets[4 * t + 3];
      const ma = mass[a / 3], mb = mass[b / 3], mc = mass[c / 3], md = mass[d / 3];
      const M = ma + mb + mc + md;
      const cx = (x[a] * ma + x[b] * mb + x[c] * mc + x[d] * md) / M;
      const cy = (x[a + 1] * ma + x[b + 1] * mb + x[c + 1] * mc + x[d + 1] * md) / M;
      const cz = (x[a + 2] * ma + x[b + 2] * mb + x[c + 2] * mc + x[d + 2] * md) / M;
      const T = 12 * t;
      // A = Σ m p qᵀ (mass-weighted covariance of current vs rest, both about their centroids)
      let f00 = 0, f01 = 0, f02 = 0, f10 = 0, f11 = 0, f12 = 0, f20 = 0, f21 = 0, f22 = 0;
      {
        let px = (x[a] - cx) * ma, py = (x[a + 1] - cy) * ma, pz = (x[a + 2] - cz) * ma;
        let q0 = tetQ[T], q1 = tetQ[T + 1], q2 = tetQ[T + 2];
        f00 += px * q0; f01 += px * q1; f02 += px * q2; f10 += py * q0; f11 += py * q1; f12 += py * q2; f20 += pz * q0; f21 += pz * q1; f22 += pz * q2;
        px = (x[b] - cx) * mb; py = (x[b + 1] - cy) * mb; pz = (x[b + 2] - cz) * mb; q0 = tetQ[T + 3]; q1 = tetQ[T + 4]; q2 = tetQ[T + 5];
        f00 += px * q0; f01 += px * q1; f02 += px * q2; f10 += py * q0; f11 += py * q1; f12 += py * q2; f20 += pz * q0; f21 += pz * q1; f22 += pz * q2;
        px = (x[c] - cx) * mc; py = (x[c + 1] - cy) * mc; pz = (x[c + 2] - cz) * mc; q0 = tetQ[T + 6]; q1 = tetQ[T + 7]; q2 = tetQ[T + 8];
        f00 += px * q0; f01 += px * q1; f02 += px * q2; f10 += py * q0; f11 += py * q1; f12 += py * q2; f20 += pz * q0; f21 += pz * q1; f22 += pz * q2;
        px = (x[d] - cx) * md; py = (x[d + 1] - cy) * md; pz = (x[d + 2] - cz) * md; q0 = tetQ[T + 9]; q1 = tetQ[T + 10]; q2 = tetQ[T + 11];
        f00 += px * q0; f01 += px * q1; f02 += px * q2; f10 += py * q0; f11 += py * q1; f12 += py * q2; f20 += pz * q0; f21 += pz * q1; f22 += pz * q2;
      }
      let qx = Q[4 * t], qy = Q[4 * t + 1], qz = Q[4 * t + 2], qw = Q[4 * t + 3];
      let r00, r01, r02, r10, r11, r12, r20, r21, r22;
      for (let it = 0; it < 2; it++) {
        r00 = 1 - 2 * (qy * qy + qz * qz); r01 = 2 * (qx * qy - qw * qz); r02 = 2 * (qx * qz + qw * qy);
        r10 = 2 * (qx * qy + qw * qz); r11 = 1 - 2 * (qx * qx + qz * qz); r12 = 2 * (qy * qz - qw * qx);
        r20 = 2 * (qx * qz - qw * qy); r21 = 2 * (qy * qz + qw * qx); r22 = 1 - 2 * (qx * qx + qy * qy);
        const ox = (r10 * f20 - r20 * f10) + (r11 * f21 - r21 * f11) + (r12 * f22 - r22 * f12);
        const oy = (r20 * f00 - r00 * f20) + (r21 * f01 - r01 * f21) + (r22 * f02 - r02 * f22);
        const oz = (r00 * f10 - r10 * f00) + (r01 * f11 - r11 * f01) + (r02 * f12 - r12 * f02);
        const den = Math.abs(r00 * f00 + r10 * f10 + r20 * f20 + r01 * f01 + r11 * f11 + r21 * f21 + r02 * f02 + r12 * f12 + r22 * f22) + 1e-12;
        const wx = ox / den, wy = oy / den, wz = oz / den;
        const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
        if (w < 1e-6) break;
        // small-angle quaternion step (renormalised below); large jumps are clamped
        const sc = w > 1 ? 0.5 / w : 0.5;
        const ax = wx * sc, ay = wy * sc, az = wz * sc, cs = 1;
        const nx = cs * qx + ax * qw + ay * qz - az * qy;
        const ny = cs * qy - ax * qz + ay * qw + az * qx;
        const nz = cs * qz + ax * qy - ay * qx + az * qw;
        const nw = cs * qw - ax * qx - ay * qy - az * qz;
        const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
        qx = nx * nl; qy = ny * nl; qz = nz * nl; qw = nw * nl;
      }
      r00 = 1 - 2 * (qy * qy + qz * qz); r01 = 2 * (qx * qy - qw * qz); r02 = 2 * (qx * qz + qw * qy);
      r10 = 2 * (qx * qy + qw * qz); r11 = 1 - 2 * (qx * qx + qz * qz); r12 = 2 * (qy * qz - qw * qx);
      r20 = 2 * (qx * qz - qw * qy); r21 = 2 * (qy * qz + qw * qx); r22 = 1 - 2 * (qx * qx + qy * qy);
      Q[4 * t] = qx; Q[4 * t + 1] = qy; Q[4 * t + 2] = qz; Q[4 * t + 3] = qw;
      // the same fraction for all four corners keeps linear and angular momentum intact
      const f = 1 / (1 + base * tetFirm[t] * M * 0.25);
      let q0 = tetQ[T], q1 = tetQ[T + 1], q2 = tetQ[T + 2];
      x[a] += (cx + r00 * q0 + r01 * q1 + r02 * q2 - x[a]) * f; x[a + 1] += (cy + r10 * q0 + r11 * q1 + r12 * q2 - x[a + 1]) * f; x[a + 2] += (cz + r20 * q0 + r21 * q1 + r22 * q2 - x[a + 2]) * f;
      q0 = tetQ[T + 3]; q1 = tetQ[T + 4]; q2 = tetQ[T + 5];
      x[b] += (cx + r00 * q0 + r01 * q1 + r02 * q2 - x[b]) * f; x[b + 1] += (cy + r10 * q0 + r11 * q1 + r12 * q2 - x[b + 1]) * f; x[b + 2] += (cz + r20 * q0 + r21 * q1 + r22 * q2 - x[b + 2]) * f;
      q0 = tetQ[T + 6]; q1 = tetQ[T + 7]; q2 = tetQ[T + 8];
      x[c] += (cx + r00 * q0 + r01 * q1 + r02 * q2 - x[c]) * f; x[c + 1] += (cy + r10 * q0 + r11 * q1 + r12 * q2 - x[c + 1]) * f; x[c + 2] += (cz + r20 * q0 + r21 * q1 + r22 * q2 - x[c + 2]) * f;
      q0 = tetQ[T + 9]; q1 = tetQ[T + 10]; q2 = tetQ[T + 11];
      x[d] += (cx + r00 * q0 + r01 * q1 + r02 * q2 - x[d]) * f; x[d + 1] += (cy + r10 * q0 + r11 * q1 + r12 * q2 - x[d + 1]) * f; x[d + 2] += (cz + r20 * q0 + r21 * q1 + r22 * q2 - x[d + 2]) * f;
    }
  }

  solveVolumes(dt) {
    const { x, invMass, tets, restVol } = this;
    const alpha0 = this.volCompliance() / (dt * dt);
    for (let t = 0; t < this.nT; t++) {
      const a = tets[4 * t], b = tets[4 * t + 1], c = tets[4 * t + 2], d = tets[4 * t + 3];
      const A = 3 * a, B = 3 * b, Cc = 3 * c, D = 3 * d;
      // gradients (Müller): g_a = (d-b)×(c-b), g_b = (c-a)×(d-a), g_c = (d-a)×(b-a), g_d = (b-a)×(c-a)
      const bax = x[B] - x[A], bay = x[B + 1] - x[A + 1], baz = x[B + 2] - x[A + 2];
      const cax = x[Cc] - x[A], cay = x[Cc + 1] - x[A + 1], caz = x[Cc + 2] - x[A + 2];
      const dax = x[D] - x[A], day = x[D + 1] - x[A + 1], daz = x[D + 2] - x[A + 2];
      const dbx = x[D] - x[B], dby = x[D + 1] - x[B + 1], dbz = x[D + 2] - x[B + 2];
      const cbx = x[Cc] - x[B], cby = x[Cc + 1] - x[B + 1], cbz = x[Cc + 2] - x[B + 2];
      const gax = dby * cbz - dbz * cby, gay = dbz * cbx - dbx * cbz, gaz = dbx * cby - dby * cbx;
      const gbx = cay * daz - caz * day, gby = caz * dax - cax * daz, gbz = cax * day - cay * dax;
      const gcx = day * baz - daz * bay, gcy = daz * bax - dax * baz, gcz = dax * bay - day * bax;
      const gdx = bay * caz - baz * cay, gdy = baz * cax - bax * caz, gdz = bax * cay - bay * cax;
      const V = (dax * gdx + day * gdy + daz * gdz) / 6;
      const wa = invMass[a], wb = invMass[b], wc = invMass[c], wd = invMass[d];
      const wsum = wa * (gax * gax + gay * gay + gaz * gaz) + wb * (gbx * gbx + gby * gby + gbz * gbz)
        + wc * (gcx * gcx + gcy * gcy + gcz * gcz) + wd * (gdx * gdx + gdy * gdy + gdz * gdz);
      if (wsum < 1e-12) continue;
      const r0 = restVol[t];
      // anti-inversion: elements far below rest volume get a rigid (compliance-free) correction
      const alpha = V < 0.25 * r0 ? 0 : alpha0;
      const C = 6 * (V - r0);
      let s = -C / (wsum + alpha);
      x[A] += gax * s * wa; x[A + 1] += gay * s * wa; x[A + 2] += gaz * s * wa;
      x[B] += gbx * s * wb; x[B + 1] += gby * s * wb; x[B + 2] += gbz * s * wb;
      x[Cc] += gcx * s * wc; x[Cc + 1] += gcy * s * wc; x[Cc + 2] += gcz * s * wc;
      x[D] += gdx * s * wd; x[D + 1] += gdy * s * wd; x[D + 2] += gdz * s * wd;
    }
  }

  // Whole-piece shape memory: particles that have strayed far from where the piece's rest shape
  // would put them — laid over its own centroid and best-fit rotation — are drawn back toward it.
  // Within the slack nothing happens, so the wobble is untouched; but a thin piece that is
  // whipped about can no longer fold over on itself and crumple, which nothing else would stop
  // (there is no self-collision).
  solveShape() {
    const { x, rest, mass, comp, n, nComp, compMass, compRest, compRot: Q, compAcc: A } = this;
    const hold = this.shapeHold;
    if (hold <= 0) return;
    // per piece: centroid (0..2), then the covariance of current vs rest positions (3..11)
    A.fill(0);
    for (let i = 0; i < n; i++) {
      const o = 12 * comp[i], m = mass[i];
      A[o] += m * x[3 * i]; A[o + 1] += m * x[3 * i + 1]; A[o + 2] += m * x[3 * i + 2];
    }
    for (let c = 0; c < nComp; c++) { A[12 * c] /= compMass[c]; A[12 * c + 1] /= compMass[c]; A[12 * c + 2] /= compMass[c]; }
    for (let i = 0; i < n; i++) {
      const c = comp[i], o = 12 * c, m = mass[i];
      const px = (x[3 * i] - A[o]) * m, py = (x[3 * i + 1] - A[o + 1]) * m, pz = (x[3 * i + 2] - A[o + 2]) * m;
      const qx = rest[3 * i] - compRest[3 * c], qy = rest[3 * i + 1] - compRest[3 * c + 1], qz = rest[3 * i + 2] - compRest[3 * c + 2];
      A[o + 3] += px * qx; A[o + 4] += px * qy; A[o + 5] += px * qz;
      A[o + 6] += py * qx; A[o + 7] += py * qy; A[o + 8] += py * qz;
      A[o + 9] += pz * qx; A[o + 10] += pz * qy; A[o + 11] += pz * qz;
    }
    // best rotation per piece (Müller et al.), carried over from the last substep
    // A soft piece only leans on this now and then, and two steps a substep keep up well enough.
    // A rigid one is put exactly where it says, every substep: any lag in the rotation is spin
    // taken away (a flat piece loses half of what is left per step about an axis in its plane),
    // so there it is run to convergence — it is a 3×3 problem per piece, not per particle.
    const iters = this.compRotWarm && !this.rigid ? 2 : 40;
    this.compRotWarm = true;
    if (!this.compR || this.compR.length !== nComp * 9) { this.compR = new Float64Array(nComp * 9); this.compC = new Float64Array(nComp * 3); }
    const R = this.compR;
    for (let c = 0; c < nComp; c++) {
      const o = 12 * c + 3, r = 9 * c;
      this.compC[3 * c] = A[12 * c]; this.compC[3 * c + 1] = A[12 * c + 1]; this.compC[3 * c + 2] = A[12 * c + 2];
      let qx = Q[4 * c], qy = Q[4 * c + 1], qz = Q[4 * c + 2], qw = Q[4 * c + 3];
      for (let it = 0; ; it++) {
        R[r] = 1 - 2 * (qy * qy + qz * qz); R[r + 1] = 2 * (qx * qy - qw * qz); R[r + 2] = 2 * (qx * qz + qw * qy);
        R[r + 3] = 2 * (qx * qy + qw * qz); R[r + 4] = 1 - 2 * (qx * qx + qz * qz); R[r + 5] = 2 * (qy * qz - qw * qx);
        R[r + 6] = 2 * (qx * qz - qw * qy); R[r + 7] = 2 * (qy * qz + qw * qx); R[r + 8] = 1 - 2 * (qx * qx + qy * qy);
        if (it === iters) break;
        let ox = 0, oy = 0, oz = 0, den = 0;
        for (let col = 0; col < 3; col++) {
          const rx = R[r + col], ry = R[r + 3 + col], rz = R[r + 6 + col], ax = A[o + col], ay = A[o + 3 + col], az = A[o + 6 + col];
          ox += ry * az - rz * ay; oy += rz * ax - rx * az; oz += rx * ay - ry * ax; den += rx * ax + ry * ay + rz * az;
        }
        const sc = 1 / (Math.abs(den) + 1e-12);
        const wx = ox * sc, wy = oy * sc, wz = oz * sc, w = Math.hypot(wx, wy, wz);
        if (w < 1e-9) continue;
        const h = Math.min(w, 2) / 2, sn = Math.sin(h) / w, cs = Math.cos(h);
        const ax = wx * sn, ay = wy * sn, az = wz * sn;
        const nx = cs * qx + ax * qw + ay * qz - az * qy, ny = cs * qy - ax * qz + ay * qw + az * qx;
        const nz = cs * qz + ax * qy - ay * qx + az * qw, nw = cs * qw - ax * qx - ay * qy - az * qz;
        const l = Math.hypot(nx, ny, nz, nw); qx = nx / l; qy = ny / l; qz = nz / l; qw = nw / l;
      }
      Q[4 * c] = qx; Q[4 * c + 1] = qy; Q[4 * c + 2] = qz; Q[4 * c + 3] = qw;
    }
    // pull per particle, growing from nothing at the slack distance to the full hold well past it
    const pull = this.shapePull, slack = this.shapeSlack;
    A.fill(0);
    for (let i = 0; i < n; i++) {
      const c = comp[i], o = 12 * c, r = 9 * c, m = mass[i];
      const qx = rest[3 * i] - compRest[3 * c], qy = rest[3 * i + 1] - compRest[3 * c + 1], qz = rest[3 * i + 2] - compRest[3 * c + 2];
      const dx = this.compC[3 * c] + R[r] * qx + R[r + 1] * qy + R[r + 2] * qz - x[3 * i];
      const dy = this.compC[3 * c + 1] + R[r + 3] * qx + R[r + 4] * qy + R[r + 5] * qz - x[3 * i + 1];
      const dz = this.compC[3 * c + 2] + R[r + 6] * qx + R[r + 7] * qy + R[r + 8] * qz - x[3 * i + 2];
      // (no slack at all: a rigid piece, every particle put straight back)
      // (nor does a melted part remember its shape)
      const f = slack > 0 ? hold * Math.min(1, Math.max(0, (Math.hypot(dx, dy, dz) - slack) / (3 * slack))) * (1 - this.soft[i]) : hold;
      pull[3 * i] = dx * f; pull[3 * i + 1] = dy * f; pull[3 * i + 2] = dz * f;
      A[o] += m * dx * f; A[o + 1] += m * dy * f; A[o + 2] += m * dz * f;
    }
    // less the piece's average pull, so the piece as a whole is not pushed anywhere
    for (let i = 0; i < n; i++) {
      const c = comp[i], o = 12 * c, M = compMass[c];
      x[3 * i] += pull[3 * i] - A[o] / M; x[3 * i + 1] += pull[3 * i + 1] - A[o + 1] / M; x[3 * i + 2] += pull[3 * i + 2] - A[o + 2] / M;
    }
  }

  // pieces push each other apart: particle spheres of different pieces may not overlap.
  // Only pairs of pieces whose bounding boxes touch are examined, and only the particles
  // inside the shared region — so pieces lying apart cost almost nothing.
  collidePieces() {
    const { x, prev, invMass, comp, n, nComp } = this;
    const D = 0.13;
    if (!this.cBox || this.cBox.length !== nComp * 6) { this.cBox = new Float32Array(nComp * 6); this.cListA = new Int32Array(n); this.cListB = new Int32Array(n); this.cPush = new Float32Array(n * 3); this.cStill = new Float32Array(n * 3); this.cHits = new Uint16Array(n); }
    const box = this.cBox;
    for (let c = 0; c < nComp; c++) { box[6 * c] = box[6 * c + 1] = box[6 * c + 2] = Infinity; box[6 * c + 3] = box[6 * c + 4] = box[6 * c + 5] = -Infinity; }
    for (let p = 0; p < n; p++) {
      const o = 6 * comp[p];
      for (let k = 0; k < 3; k++) { const v = x[3 * p + k]; if (v < box[o + k]) box[o + k] = v; if (v > box[o + 3 + k]) box[o + 3 + k] = v; }
    }
    const LA = this.cListA, LB = this.cListB, acc = this.cPush, still = this.cStill, hits = this.cHits;
    for (let A = 0; A < nComp; A++) for (let B = A + 1; B < nComp; B++) {
      const lo = [0, 0, 0], hi = [0, 0, 0];
      let overlap = true;
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.max(box[6 * A + k], box[6 * B + k]) - D; hi[k] = Math.min(box[6 * A + 3 + k], box[6 * B + 3 + k]) + D;
        if (lo[k] > hi[k]) { overlap = false; break; }
      }
      if (!overlap) continue;
      let na = 0, nb = 0;
      for (let p = 0; p < n; p++) {
        const c = comp[p];
        if (c !== A && c !== B) continue;
        const px = x[3 * p], py = x[3 * p + 1], pz = x[3 * p + 2];
        if (px < lo[0] || px > hi[0] || py < lo[1] || py > hi[1] || pz < lo[2] || pz > hi[2]) continue;
        if (c === A) LA[na++] = p; else LB[nb++] = p;
      }
      for (let i = 0; i < na; i++) {
        const p = LA[i];
        for (let j = 0; j < nb; j++) {
          const q = LB[j];
          const dx = x[3 * q] - x[3 * p], dy = x[3 * q + 1] - x[3 * p + 1], dz = x[3 * q + 2] - x[3 * p + 2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= D * D || d2 < 1e-12) continue;
          const d = Math.sqrt(d2), wp = invMass[p], wq = invMass[q];
          // how far the pair closed in during this substep, along the line between them
          const closing = Math.max(0, -((x[3 * q] - prev[3 * q] - x[3 * p] + prev[3 * p]) * dx + (x[3 * q + 1] - prev[3 * q + 1] - x[3 * p + 1] + prev[3 * p + 1]) * dy
            + (x[3 * q + 2] - prev[3 * q + 2] - x[3 * p + 2] + prev[3 * p + 2]) * dz) / d);
          // A fast approach is stopped outright (this pass covers two substeps of it), so a piece
          // swung into another shoves it instead of sinking in. Beyond that the push is gentle, a
          // few millimetres per pass, so freshly cut faces ease apart instead of popping.
          const gap = Math.min(D - d, 0.006 + 2 * closing), push = gap / (d * (wp + wq));
          // The push may stop the pair closing in, but must not send them apart: whatever part of it
          // is not spent on the approach is taken out of the velocity again (s → 1).
          const s = 1 - Math.min(1, closing / gap);
          const mp = -push * wp, mq = push * wq;
          acc[3 * p] += dx * mp; acc[3 * p + 1] += dy * mp; acc[3 * p + 2] += dz * mp; hits[p]++;
          acc[3 * q] += dx * mq; acc[3 * q + 1] += dy * mq; acc[3 * q + 2] += dz * mq; hits[q]++;
          still[3 * p] += dx * mp * s; still[3 * p + 1] += dy * mp * s; still[3 * p + 2] += dz * mp * s;
          still[3 * q] += dx * mq * s; still[3 * q + 1] += dy * mq * s; still[3 * q + 2] += dz * mq * s;
        }
      }
      // a particle touching several neighbours moves by their average push, not the sum — otherwise
      // a finely meshed sliver is flung away by the crowd of particles facing it
      for (let i = 0; i < na + nb; i++) {
        const p = i < na ? LA[i] : LB[i - na], h = hits[p];
        if (!h) continue;
        for (let k = 0; k < 3; k++) {
          x[3 * p + k] += acc[3 * p + k] / h; prev[3 * p + k] += still[3 * p + k] / h;
          acc[3 * p + k] = 0; still[3 * p + k] = 0;
        }
        hits[p] = 0;
      }
    }
  }

  // Rigid pieces meet as the solids they are: each is its outline extruded to the thickness of the
  // slab, carried by its best-fit frame (from solveShape). A particle of one piece found inside
  // another is a contact, to be pushed out through the nearest face — and the pushes go to the two
  // pieces as rigid bodies, a shift and a turn about the centre of mass, solved together over all
  // their contacts. (Pushed one particle at a time, shape matching spreads each push over the whole
  // piece and all but loses it: stacked pieces sink into each other and lock.) Where they touch
  // they also rub, with the same friction as against the floor, so a piece laid on another stays.
  collideSolids() {
    const { x, prev, mass, nComp, outlines, compStart: S, compRest, compR: R, compC: C, thickness: T } = this;
    if (!R) return;
    if (!this.sBox || this.sBox.length !== nComp * 6) {
      this.sBox = new Float32Array(nComp * 6); this.sMove = new Float64Array(nComp * 3);
      this.sFrame = [new Float64Array(13), new Float64Array(13)];
      this.sD = [new Float64Array(18), new Float64Array(18)];
      this.sHits = [];
    }
    const box = this.sBox, move = this.sMove, near = [0, 0], hits = this.sHits, H = SoftBody.HIT;
    // per piece: bounding box, and how far its centre of mass travelled this substep
    for (let c = 0; c < nComp; c++) {
      const o = 6 * c;
      box[o] = box[o + 1] = box[o + 2] = Infinity; box[o + 3] = box[o + 4] = box[o + 5] = -Infinity;
      let mx = 0, my = 0, mz = 0;
      for (let p = S[c]; p < S[c + 1]; p++) {
        const m = mass[p];
        mx += m * (x[3 * p] - prev[3 * p]); my += m * (x[3 * p + 1] - prev[3 * p + 1]); mz += m * (x[3 * p + 2] - prev[3 * p + 2]);
        for (let k = 0; k < 3; k++) { const v = x[3 * p + k]; if (v < box[o + k]) box[o + k] = v; if (v > box[o + 3 + k]) box[o + 3 + k] = v; }
      }
      const M = this.compMass[c];
      move[3 * c] = mx / M; move[3 * c + 1] = my / M; move[3 * c + 2] = mz / M;
    }
    for (let A = 0; A < nComp; A++) for (let B = A + 1; B < nComp; B++) {
      let apart = false;
      for (let k = 0; k < 3; k++) if (Math.max(box[6 * A + k], box[6 * B + k]) > Math.min(box[6 * A + 3 + k], box[6 * B + 3 + k])) { apart = true; break; }
      if (apart) continue;
      // contacts: particles of one piece (`out`: 0 = A, 1 = B) inside the solid of the other
      hits.length = 0;
      for (let out = 0; out < 2; out++) {
        const a = out ? B : A, b = out ? A : B, r = 9 * b, P = outlines[b];
        // is a lying on top of b, or under it? (the height of its centre in b's frame)
        const hc = R[r + 1] * (C[3 * a] - C[3 * b]) + R[r + 4] * (C[3 * a + 1] - C[3 * b + 1]) + R[r + 7] * (C[3 * a + 2] - C[3 * b + 2]) + compRest[3 * b + 1];
        for (let p = S[a]; p < S[a + 1]; p++) {
          const X = x[3 * p], Y = x[3 * p + 1], Z = x[3 * p + 2];
          if (X < box[6 * b] || X > box[6 * b + 3] || Y < box[6 * b + 1] || Y > box[6 * b + 4] || Z < box[6 * b + 2] || Z > box[6 * b + 5]) continue;
          // into b's rest frame
          const dx = X - C[3 * b], dy = Y - C[3 * b + 1], dz = Z - C[3 * b + 2];
          const h = R[r + 1] * dx + R[r + 4] * dy + R[r + 7] * dz + compRest[3 * b + 1];
          if (h <= 0 || h >= T) continue;
          const u = R[r] * dx + R[r + 3] * dy + R[r + 6] * dz + compRest[3 * b];
          const w = R[r + 2] * dx + R[r + 5] * dy + R[r + 8] * dz + compRest[3 * b + 2];
          const sd = polyNearest(P, u, w, near);
          if (sd >= 0) continue;
          // Which way out is decided for the piece, not the particle. A piece lying on this one
          // leaves through the face it lies on — even where it overhangs the edge and the wall
          // happens to be nearer (that would squeeze it sideways, off the pile). Anything else — a
          // piece beside this one, or one gone too deep to be lying on it — leaves through the side
          // wall. (Left to choose the nearest way out for itself, each layer of an overlapping
          // piece picks a different one, and the two pieces are told to be above each other.)
          let depth = T - h, lu = 0, lh = 1, lw = 0;
          if (h < depth) { depth = h; lh = -1; }
          if (!(depth < T / 2 && (lh > 0 ? hc > T : hc < 0))) { depth = -sd; lh = 0; lu = (near[0] - u) / depth; lw = (near[1] - w) / depth; }
          if (depth < 1e-7) continue;
          const nx = R[r] * lu + R[r + 1] * lh + R[r + 2] * lw, ny = R[r + 3] * lu + R[r + 4] * lh + R[r + 5] * lw, nz = R[r + 6] * lu + R[r + 7] * lh + R[r + 8] * lw;
          // the particle's travel relative to b during this substep: toward it (closing) and across it (slide)
          const mx = X - prev[3 * p] - move[3 * b], my = Y - prev[3 * p + 1] - move[3 * b + 1], mz = Z - prev[3 * p + 2] - move[3 * b + 2];
          const along = mx * nx + my * ny + mz * nz, closing = Math.max(0, -along);
          // as between soft pieces: an approach is stopped outright, however fast; beyond that the
          // push is a few millimetres per pass, so pieces that overlap deeply ease apart, not pop
          const k = hits.length; hits.length += H;
          hits[k] = out; hits[k + 1] = X; hits[k + 2] = Y; hits[k + 3] = Z; hits[k + 4] = nx; hits[k + 5] = ny; hits[k + 6] = nz;
          hits[k + 7] = Math.min(depth, 0.003 + closing); hits[k + 8] = closing;
          hits[k + 9] = mx - along * nx; hits[k + 10] = my - along * ny; hits[k + 11] = mz - along * nz;
        }
      }
      if (!hits.length) continue;
      const F = this.sFrame, D = this.sD;
      this.solidFrame(A, F[0]); this.solidFrame(B, F[1]);
      // a piece standing on the floor cannot be pushed down into it: it takes none of a push that
      // points that way, so whatever lies on it is held up outright instead of bouncing on it
      const onFloor = [box[6 * A + 1] < this.floorY + 2e-3, box[6 * B + 1] < this.floorY + 2e-3];
      for (let k = 0; k < hits.length; k += H) {
        const o = hits[k], ny = hits[k + 5];
        const wo = ny < -0.5 && onFloor[o] ? 0 : SoftBody.pushResponse(F[o], hits, k + 1, hits[k + 4], ny, hits[k + 6], hits, k + 14);
        const wi = ny > 0.5 && onFloor[1 - o] ? 0 : SoftBody.pushResponse(F[1 - o], hits, k + 1, hits[k + 4], ny, hits[k + 6], hits, k + 17);
        hits[k + 12] = wo; hits[k + 13] = wi;
      }
      // Each piece's motion is a shift and a turn, three times over: what resolves the overlap
      // (0..5), what stops the approach (6..11) — only that much of the push becomes velocity, the
      // rest is taken out again, so nothing is thrown apart — and what friction undoes (12..17).
      D[0].fill(0); D[1].fill(0);
      for (let pass = 0; pass < 2; pass++) {
        const at = 6 * pass, want = pass ? 8 : 7, lam = pass ? 21 : 20;
        for (let k = 0; k < hits.length; k += H) hits[k + lam] = 0;
        // projected Gauss–Seidel: each contact takes up what the others have left undone, and only ever pushes
        for (let it = 0; it < 8; it++) for (let k = 0; k < hits.length; k += H) {
          const wo = hits[k + 12], wi = hits[k + 13];
          if (wo + wi < 1e-12) continue;
          const o = hits[k], nx = hits[k + 4], ny = hits[k + 5], nz = hits[k + 6];
          const done = SoftBody.pointMove(D[o], at, F[o], hits, k + 1, nx, ny, nz) - SoftBody.pointMove(D[1 - o], at, F[1 - o], hits, k + 1, nx, ny, nz);
          const l = Math.max(0, hits[k + lam] + (hits[k + want] - done) / (wo + wi)), dl = l - hits[k + lam];
          hits[k + lam] = l;
          if (wo) SoftBody.addPush(D[o], at, F[o], dl, nx, ny, nz, hits, k + 14);
          if (wi) SoftBody.addPush(D[1 - o], at, F[1 - o], -dl, nx, ny, nz, hits, k + 17);
        }
      }
      // however tangled the contacts, the pieces part at a walk
      for (let o = 0; o < 2; o++) {
        const d = D[o], k = Math.min(1, 0.01 / (Math.hypot(d[0], d[1], d[2]) + 1e-12), 0.03 / (Math.hypot(d[3], d[4], d[5]) + 1e-12));
        if (k < 1) for (let j = 0; j < 6; j++) d[j] *= k;
      }
      // friction: the slide across the other piece is undone — all of it where it is small beside
      // the push (the pieces stick), otherwise as much as the push allows
      const mu = this.friction, turnO = [0, 0, 0], turnI = [0, 0, 0];
      for (let it = 0; it < 2; it++) for (let k = 0; k < hits.length; k += H) {
        const o = hits[k], Do = D[o], Di = D[1 - o], Fo = F[o], Fi = F[1 - o];
        let tx = hits[k + 9], ty = hits[k + 10], tz = hits[k + 11];
        // less what friction at the other contacts has undone already
        tx += SoftBody.pointMove(Do, 12, Fo, hits, k + 1, 1, 0, 0) - SoftBody.pointMove(Di, 12, Fi, hits, k + 1, 1, 0, 0);
        ty += SoftBody.pointMove(Do, 12, Fo, hits, k + 1, 0, 1, 0) - SoftBody.pointMove(Di, 12, Fi, hits, k + 1, 0, 1, 0);
        tz += SoftBody.pointMove(Do, 12, Fo, hits, k + 1, 0, 0, 1) - SoftBody.pointMove(Di, 12, Fi, hits, k + 1, 0, 0, 1);
        const nx = hits[k + 4], ny = hits[k + 5], nz = hits[k + 6], tn = tx * nx + ty * ny + tz * nz;
        tx -= tn * nx; ty -= tn * ny; tz -= tn * nz;
        const tl = Math.hypot(tx, ty, tz);
        if (tl < 1e-10) continue;
        const ux = -tx / tl, uy = -ty / tl, uz = -tz / tl;
        const vo = SoftBody.pushResponse(Fo, hits, k + 1, ux, uy, uz, turnO, 0), vi = SoftBody.pushResponse(Fi, hits, k + 1, ux, uy, uz, turnI, 0);
        if (vo + vi < 1e-12) continue;
        const pushed = hits[k + 20] * (hits[k + 12] + hits[k + 13]);
        const fr = Math.min(tl, mu * pushed) / (vo + vi);
        SoftBody.addPush(Do, 12, Fo, fr, ux, uy, uz, turnO, 0);
        SoftBody.addPush(Di, 12, Fi, -fr, ux, uy, uz, turnI, 0);
      }
      for (let o = 0; o < 2; o++) {
        const f = F[o], d = D[o], c = o ? B : A;
        if (!f[3]) continue;
        // position: overlap resolved, friction applied; velocity: approach stopped, friction applied
        const sx = d[0] + d[12], sz = d[2] + d[14], ax = d[3] + d[15], ay = d[4] + d[16], az = d[5] + d[17];
        const px = d[0] - d[6], pz = d[2] - d[8], bx = d[3] - d[9], by = d[4] - d[10], bz = d[5] - d[11];
        let sy = d[1] + d[13], py = d[1] - d[7];
        // Would this drive part of the piece into the floor? Then the whole piece rides up by that
        // much, and that is no velocity either. (Left to solveFloor, the way back up would count
        // as speed, and pieces being eased out of an overlap would be launched instead.)
        let sink = 0;
        for (let p = S[c]; p < S[c + 1]; p++) {
          const down = sy + az * (x[3 * p] - f[0]) - ax * (x[3 * p + 2] - f[2]);
          if (down < 0) sink = Math.max(sink, Math.min(-down, this.floorY - x[3 * p + 1] - down));
        }
        sy += sink; py += sink;
        for (let p = S[c]; p < S[c + 1]; p++) {
          const rx = x[3 * p] - f[0], ry = x[3 * p + 1] - f[1], rz = x[3 * p + 2] - f[2];
          x[3 * p] += sx + ay * rz - az * ry; x[3 * p + 1] += sy + az * rx - ax * rz; x[3 * p + 2] += sz + ax * ry - ay * rx;
          prev[3 * p] += px + by * rz - bz * ry; prev[3 * p + 1] += py + bz * rx - bx * rz; prev[3 * p + 2] += pz + bx * ry - by * rx;
        }
      }
    }
  }

  // A rigid material takes every piece to be exactly its rest shape, moving as one body, from the
  // first substep on. Whatever is not — a soft body that has just been turned to metal, squashed
  // as it lay — is put into that state here, where it is: left to solveShape, the snap into shape
  // would be read as speed and throw the piece.
  rigidify() {
    for (let c = 0; c < this.nComp; c++) this.poseSolid(c, this.pieceFrame(c), this.solidMotion(c));
    this.prev.set(this.x);
  }

  // The same for a body rebuilt out of another (after a cut): each new piece takes the pose and the
  // motion of the old piece it was part of — the one most of its particles were found in (tetOf,
  // from embedding the new rest positions in the old mesh). Carried over particle by particle, the
  // few that sit on an old cut and are matched to the piece across it would arrive somewhere else.
  carrySolids(old, tetOf) {
    const S = this.compStart, votes = new Map(), state = new Map();
    for (let c = 0; c < this.nComp; c++) {
      votes.clear();
      let from = 0, most = 0;
      for (let i = S[c]; i < S[c + 1]; i++) {
        const oc = old.comp[old.tets[4 * tetOf[i]]], v = (votes.get(oc) || 0) + 1;
        votes.set(oc, v);
        if (v > most) { most = v; from = oc; }
      }
      if (!state.has(from)) state.set(from, [old.pieceFrame(from), old.solidMotion(from)]);
      this.poseSolid(c, ...state.get(from));
    }
    this.prev.set(this.x);
  }

  // piece c, laid into the frame F (see pieceFrame) and given the rigid motion m (see solidMotion);
  // if that would leave part of it under the floor, it is raised to stand on it
  poseSolid(c, F, m) {
    const { x, v, rest, compStart: S } = this, R = F.R;
    let low = Infinity;
    for (let i = S[c]; i < S[c + 1]; i++) {
      const k = 3 * i, qx = rest[k] - F.cr[0], qy = rest[k + 1] - F.cr[1], qz = rest[k + 2] - F.cr[2];
      x[k] = F.cw[0] + R[0] * qx + R[1] * qy + R[2] * qz; x[k + 1] = F.cw[1] + R[3] * qx + R[4] * qy + R[5] * qz; x[k + 2] = F.cw[2] + R[6] * qx + R[7] * qy + R[8] * qz;
      const rx = x[k] - m.c[0], ry = x[k + 1] - m.c[1], rz = x[k + 2] - m.c[2];
      v[k] = m.v[0] + m.w[1] * rz - m.w[2] * ry; v[k + 1] = m.v[1] + m.w[2] * rx - m.w[0] * rz; v[k + 2] = m.v[2] + m.w[0] * ry - m.w[1] * rx;
      low = Math.min(low, x[k + 1]);
    }
    if (low < this.floorY) for (let i = S[c]; i < S[c + 1]; i++) x[3 * i + 1] += this.floorY - low;
  }

  // how piece c is moving, taken as one rigid body: centre of mass c, its velocity v, angular velocity w
  solidMotion(c) {
    const { x, v, mass, compStart: S } = this, f = this.solidFrame(c, new Float64Array(13));
    const vc = [0, 0, 0], L = [0, 0, 0];
    let M = 0;
    for (let i = S[c]; i < S[c + 1]; i++) { const m = mass[i]; M += m; for (let k = 0; k < 3; k++) vc[k] += m * v[3 * i + k]; }
    for (let k = 0; k < 3; k++) vc[k] /= M;
    for (let i = S[c]; i < S[c + 1]; i++) {
      const m = mass[i], rx = x[3 * i] - f[0], ry = x[3 * i + 1] - f[1], rz = x[3 * i + 2] - f[2];
      const ux = v[3 * i] - vc[0], uy = v[3 * i + 1] - vc[1], uz = v[3 * i + 2] - vc[2];
      L[0] += m * (ry * uz - rz * uy); L[1] += m * (rz * ux - rx * uz); L[2] += m * (rx * uy - ry * ux);
    }
    return { c: [f[0], f[1], f[2]], v: vc, w: [f[4] * L[0] + f[5] * L[1] + f[6] * L[2], f[7] * L[0] + f[8] * L[1] + f[9] * L[2], f[10] * L[0] + f[11] * L[1] + f[12] * L[2]] };
  }

  // one piece as a rigid body, into f: centre of mass (0..2), 1 / mass (3), inverse inertia tensor (4..12).
  // A piece held in the hand goes where the hand puts it and cannot be pushed: no mass at all.
  solidFrame(c, f) {
    const { x, mass, compStart: S } = this;
    f.fill(0);
    let M = 0;
    for (let p = S[c]; p < S[c + 1]; p++) { const m = mass[p]; M += m; f[0] += m * x[3 * p]; f[1] += m * x[3 * p + 1]; f[2] += m * x[3 * p + 2]; }
    f[0] /= M; f[1] /= M; f[2] /= M;
    if (this.grabbing && this.grabWhole && this.grabComp === c) return f;
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (let p = S[c]; p < S[c + 1]; p++) {
      const m = mass[p], rx = x[3 * p] - f[0], ry = x[3 * p + 1] - f[1], rz = x[3 * p + 2] - f[2];
      xx += m * (ry * ry + rz * rz); yy += m * (rx * rx + rz * rz); zz += m * (rx * rx + ry * ry);
      xy -= m * rx * ry; xz -= m * rx * rz; yz -= m * ry * rz;
    }
    f[3] = 1 / M;
    f.set(inv3([xx, xy, xz, xy, yy, yz, xz, yz, zz]), 4);
    return f;
  }

  // A push along n at the point q[qi..] of the rigid body f: returns how readily the point gives
  // way (the generalised inverse mass) and writes the turn a unit push causes into turn[ti..].
  static pushResponse(f, q, qi, nx, ny, nz, turn, ti) {
    const rx = q[qi] - f[0], ry = q[qi + 1] - f[1], rz = q[qi + 2] - f[2];
    const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
    const t0 = f[4] * cx + f[5] * cy + f[6] * cz, t1 = f[7] * cx + f[8] * cy + f[9] * cz, t2 = f[10] * cx + f[11] * cy + f[12] * cz;
    turn[ti] = t0; turn[ti + 1] = t1; turn[ti + 2] = t2;
    return f[3] + cx * t0 + cy * t1 + cz * t2;
  }
  // add a push of size l along n to the motion d[at..] (shift, then turn) of the body f
  static addPush(d, at, f, l, nx, ny, nz, turn, ti) {
    const s = l * f[3];
    d[at] += s * nx; d[at + 1] += s * ny; d[at + 2] += s * nz;
    d[at + 3] += l * turn[ti]; d[at + 4] += l * turn[ti + 1]; d[at + 5] += l * turn[ti + 2];
  }
  // how far the motion d[at..] of the body f carries the point q[qi..] along n
  static pointMove(d, at, f, q, qi, nx, ny, nz) {
    const rx = q[qi] - f[0], ry = q[qi + 1] - f[1], rz = q[qi + 2] - f[2];
    return (d[at] + d[at + 4] * rz - d[at + 5] * ry) * nx + (d[at + 1] + d[at + 5] * rx - d[at + 3] * rz) * ny + (d[at + 2] + d[at + 3] * ry - d[at + 4] * rx) * nz;
  }

  // best-fit rigid frame (rest → world) of one piece: centroids and a rotation matrix (row-major)
  pieceFrame(c) {
    const { x, rest, mass, comp, n } = this;
    let M = 0; const cw = [0, 0, 0], cr = [0, 0, 0];
    for (let i = 0; i < n; i++) if (comp[i] === c) { const m = mass[i]; M += m; for (let k = 0; k < 3; k++) { cw[k] += x[3 * i + k] * m; cr[k] += rest[3 * i + k] * m; } }
    for (let k = 0; k < 3; k++) { cw[k] /= M; cr[k] /= M; }
    const A = new Float64Array(9);
    for (let i = 0; i < n; i++) if (comp[i] === c) {
      const m = mass[i];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) A[3 * r + k] += m * (x[3 * i + r] - cw[r]) * (rest[3 * i + k] - cr[k]);
    }
    // Müller et al. rotation extraction, iterated from identity
    let qx = 0, qy = 0, qz = 0, qw = 1;
    const R = new Float64Array(9);
    for (let it = 0; it < 40; it++) {
      R[0] = 1 - 2 * (qy * qy + qz * qz); R[1] = 2 * (qx * qy - qw * qz); R[2] = 2 * (qx * qz + qw * qy);
      R[3] = 2 * (qx * qy + qw * qz); R[4] = 1 - 2 * (qx * qx + qz * qz); R[5] = 2 * (qy * qz - qw * qx);
      R[6] = 2 * (qx * qz - qw * qy); R[7] = 2 * (qy * qz + qw * qx); R[8] = 1 - 2 * (qx * qx + qy * qy);
      let ox = 0, oy = 0, oz = 0, den = 0;
      for (let col = 0; col < 3; col++) {
        const rx = R[col], ry = R[3 + col], rz = R[6 + col], ax = A[col], ay = A[3 + col], az = A[6 + col];
        ox += ry * az - rz * ay; oy += rz * ax - rx * az; oz += rx * ay - ry * ax; den += rx * ax + ry * ay + rz * az;
      }
      const s = 1 / (Math.abs(den) + 1e-12);
      const wx = ox * s, wy = oy * s, wz = oz * s, w = Math.hypot(wx, wy, wz);
      if (w < 1e-9) break;
      const h = Math.min(w, 2) / 2, sn = Math.sin(h) / w, cs = Math.cos(h);
      const ax = wx * sn, ay = wy * sn, az = wz * sn;
      const nx = cs * qx + ax * qw + ay * qz - az * qy, ny = cs * qy - ax * qz + ay * qw + az * qx;
      const nz = cs * qz + ax * qy - ay * qx + az * qw, nw = cs * qw - ax * qx - ay * qy - az * qz;
      const l = Math.hypot(nx, ny, nz, nw); qx = nx / l; qy = ny / l; qz = nz / l; qw = nw / l;
    }
    return { cw, cr, R };
  }

  solveFloor() {
    const { x, prev, n } = this;
    const fy = this.floorY, mu = this.friction;
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      const pen = fy - x[k + 1];
      if (pen <= 0) continue;
      x[k + 1] = fy;
      // Coulomb-style positional friction
      const dx = x[k] - prev[k], dz = x[k + 2] - prev[k + 2];
      const dl = Math.hypot(dx, dz);
      if (dl < 1e-12) continue;
      // static friction for micro-slip, kinetic friction otherwise (never locks in large strain)
      const f = dl < mu * pen ? 1 : mu * pen / dl;
      x[k] -= dx * f; x[k + 2] -= dz * f;
    }
  }

  dampEdges(dt) {
    const { x, v, invMass, edges } = this;
    const k = 1 - Math.exp(-this.dampRate() * dt);
    for (let e = 0; e < this.nE; e++) {
      const i = edges[2 * e], j = edges[2 * e + 1];
      const I = 3 * i, J = 3 * j;
      let nx = x[J] - x[I], ny = x[J + 1] - x[I + 1], nz = x[J + 2] - x[I + 2];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-9) continue;
      nx /= l; ny /= l; nz /= l;
      const rv = (v[J] - v[I]) * nx + (v[J + 1] - v[I + 1]) * ny + (v[J + 2] - v[I + 2]) * nz;
      const wi = invMass[i], wj = invMass[j], ws = wi + wj;
      const imp = rv * k / ws;
      v[I] += nx * imp * wi; v[I + 1] += ny * imp * wi; v[I + 2] += nz * imp * wi;
      v[J] -= nx * imp * wj; v[J + 1] -= ny * imp * wj; v[J + 2] -= nz * imp * wj;
    }
  }

  // ── what the tools do to it ──

  // A blow to a soft body: the particles around p take up `speed` along dir, less of it the
  // farther off they are, none at `radius`. `carry` of it goes to the whole of piece c at once, so
  // that the piece travels and does not only wobble (c < 0: every piece within reach, no carry).
  whack(p, dir, speed, radius, carry = 0, c = -1) {
    const { x, v, comp, n } = this;
    for (let i = 0; i < n; i++) {
      if (c >= 0 && comp[i] !== c) continue;
      const k = 3 * i, d = Math.hypot(x[k] - p[0], x[k + 1] - p[1], x[k + 2] - p[2]);
      let f = d < radius ? 1 - d / radius : 0;
      f = (carry + (1 - carry) * f * f * (3 - 2 * f)) * speed;
      if (f <= 0) continue;
      v[k] += dir[0] * f; v[k + 1] += dir[1] * f; v[k + 2] += dir[2] * f;
    }
  }

  // The same for a rigid piece, which takes it whole: an impulse at p that gives a piece struck
  // square on `speed` along dir — and one struck off-centre less of that, and a spin.
  punch(c, p, dir, speed) {
    const { x, v, compStart: S } = this, f = this.solidFrame(c, new Float64Array(13));
    if (!f[3]) return;   // held in the hand
    const rx = p[0] - f[0], ry = p[1] - f[1], rz = p[2] - f[2];
    // the impulse is that of a square hit; how much of it becomes travel is up to where it lands
    const J = speed / f[3];
    const tx = (ry * dir[2] - rz * dir[1]) * J, ty = (rz * dir[0] - rx * dir[2]) * J, tz = (rx * dir[1] - ry * dir[0]) * J;
    let wx = f[4] * tx + f[5] * ty + f[6] * tz, wy = f[7] * tx + f[8] * ty + f[9] * tz, wz = f[10] * tx + f[11] * ty + f[12] * tz;
    const wl = Math.hypot(wx, wy, wz), wmax = 14;
    if (wl > wmax) { wx *= wmax / wl; wy *= wmax / wl; wz *= wmax / wl; }
    for (let i = S[c]; i < S[c + 1]; i++) {
      const k = 3 * i, qx = x[k] - f[0], qy = x[k + 1] - f[1], qz = x[k + 2] - f[2];
      v[k] += dir[0] * speed + wy * qz - wz * qy; v[k + 1] += dir[1] * speed + wz * qx - wx * qz; v[k + 2] += dir[2] * speed + wx * qy - wy * qx;
    }
  }

  // Kinematic tools pressing on a soft body. Each is a disc facing down — the face of the hammer:
  // centre c, radius r, with h of head above it, sinking at vy — and whatever of the body is
  // inside the head is pushed down under the face, flat below it and rounding up around its rim.
  // The disc moves on with every substep (main.js sets it again each frame), so the body is
  // pressed at the speed of the tool rather than struck by its jumps from frame to frame.
  solvePushers(dt) {
    const { x, n } = this, rim = 0.08, low = this.floorY + 0.012;
    for (const p of this.pushers) {
      p.c[1] += p.vy * dt;
      const cx = p.c[0], cy = p.c[1], cz = p.c[2], R = p.r;
      for (let i = 0; i < n; i++) {
        const k = 3 * i, y = x[k + 1];
        if (y <= cy || y > cy + p.h) continue;
        const d = Math.hypot(x[k] - cx, x[k + 2] - cz);
        if (d >= R + rim) continue;
        const e = d <= R ? 0 : (d - R) / rim, lim = Math.max(cy + 0.14 * e * e, low);
        if (y > lim) { x[k + 1] = lim; p.touched++; }
      }
    }
  }

  // the top of the body within r of the vertical through (px, pz): how high it stands there
  // (-Infinity where there is none of it), and — in topComp — which piece that is
  topUnder(px, pz, r) {
    const { x, comp, n } = this;
    let top = -Infinity;
    this.topComp = -1;
    for (let i = 0; i < n; i++) {
      const k = 3 * i;
      if (x[k + 1] > top && Math.hypot(x[k] - px, x[k + 2] - pz) < r) { top = x[k + 1]; this.topComp = comp[i]; }
    }
    return top;
  }

  // what a rod from a to b of radius r has run into: for every piece it touches, how many of its
  // particles are inside the rod and where they lie on average — Map piece → [count, x, y, z]
  rodHits(a, b, r) {
    const { x, comp, n } = this, hits = new Map();
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], el = ex * ex + ey * ey + ez * ez;
    for (let i = 0; i < n; i++) {
      const k = 3 * i, px = x[k] - a[0], py = x[k + 1] - a[1], pz = x[k + 2] - a[2];
      const t = Math.min(1, Math.max(0, (px * ex + py * ey + pz * ez) / el));
      if (Math.hypot(px - ex * t, py - ey * t, pz - ez * t) > r) continue;
      let h = hits.get(comp[i]);
      if (!h) hits.set(comp[i], h = [0, 0, 0, 0]);
      h[0]++; h[1] += x[k]; h[2] += x[k + 1]; h[3] += x[k + 2];
    }
    for (const h of hits.values()) { h[1] /= h[0]; h[2] /= h[0]; h[3] /= h[0]; }
    return hits;
  }

  // where piece c is: its centre of mass
  pieceCentre(c) {
    const { x, mass, compStart: S } = this;
    let M = 0, cx = 0, cy = 0, cz = 0;
    for (let i = S[c]; i < S[c + 1]; i++) { const m = mass[i]; M += m; cx += m * x[3 * i]; cy += m * x[3 * i + 1]; cz += m * x[3 * i + 2]; }
    return [cx / M, cy / M, cz / M];
  }

  // a flame playing on the point p: `amount` of heat there, less around it, none at `radius` —
  // reaching rather deeper into the body than it spreads over it
  heatAt(p, radius, amount) {
    const { x, heat, n } = this;
    for (let i = 0; i < n; i++) {
      const k = 3 * i, d = Math.hypot(x[k] - p[0], (x[k + 1] - p[1]) * 0.6, x[k + 2] - p[2]);
      if (d >= radius) continue;
      const f = 1 - d / radius;
      heat[i] = Math.min(1, heat[i] + amount * f * f * (3 - 2 * f));
    }
    this.hot = this.marked = true;
  }

  // One step of the heat: it spreads along the edges, leaks away — and where it is above what the
  // material can stand, it burns that in for good.
  thermal(dt) {
    const m = this.material, { heat, char, edges, n } = this;
    if (m.conduct > 0) {
      const k = Math.min(0.4, m.conduct * dt);
      for (let e = 0; e < this.nE; e++) {
        const i = edges[2 * e], j = edges[2 * e + 1], q = (heat[j] - heat[i]) * k;
        heat[i] += q; heat[j] -= q;
      }
    }
    const keep = Math.exp(-m.cool * dt), span = 1 - m.ignite;
    let any = false;
    for (let i = 0; i < n; i++) {
      const h = heat[i] * keep;
      if (h > m.ignite) char[i] = Math.min(1, char[i] + (h - m.ignite) / span * m.scorch * dt);
      heat[i] = h > 0.004 ? h : 0;
      if (h > 0.004) any = true;
    }
    this.hot = any;
    this.remelt();
  }

  // What the heat has done to the feel of the body. A burnt part (as far as the material melts)
  // and a hot one (as far as it goes limp) is softer — its tetrahedra give more, and the piece's
  // memory of its shape lets go of it. And a melted part sinks: the rest shape of its tetrahedra
  // is lower, a little wider, and there is less of it.
  remelt() {
    if (!this.marked) return;
    const m = this.material, { heat, char, soft, tets, tetQ, tetQ0, n } = this;
    for (let i = 0; i < n; i++) soft[i] = Math.min(1, m.melt * char[i] + m.limp * heat[i]);
    const sag = this.rigid ? 0 : m.sag * m.melt;
    for (let t = 0; t < this.nT; t++) {
      const a = tets[4 * t], b = tets[4 * t + 1], c = tets[4 * t + 2], d = tets[4 * t + 3];
      this.tetFirm[t] = this.tetFirm0[t] * (1 + m.soften * (soft[a] + soft[b] + soft[c] + soft[d]) / 4);
      const s = sag * (char[a] + char[b] + char[c] + char[d]) / 4, ky = 1 - s, kx = 1 + 0.3 * s;
      for (let o = 12 * t, e = o + 12; o < e; o += 3) { tetQ[o] = tetQ0[o] * kx; tetQ[o + 1] = tetQ0[o + 1] * ky; tetQ[o + 2] = tetQ0[o + 2] * kx; }
      this.restVol[t] = this.restVol0[t] * kx * ky * kx;
    }
  }

  // ── diagnostics ──
  volumeRatio() {
    let s = 0;
    for (let t = 0; t < this.nT; t++) s += this.tetVol(this.x, t);
    return s / this.totalRestVolume;
  }
  minVolumeRatio() {
    let m = Infinity;
    for (let t = 0; t < this.nT; t++) m = Math.min(m, this.tetVol(this.x, t) / this.restVol[t]);
    return m;
  }
  kineticEnergy() {
    let e = 0;
    for (let i = 0; i < this.n; i++) {
      const k = 3 * i;
      e += 0.5 * this.mass[i] * (this.v[k] ** 2 + this.v[k + 1] ** 2 + this.v[k + 2] ** 2);
    }
    return e;
  }
  // mean deviation from rest shape after best rigid alignment is expensive; use edge strain instead
  meanStrain() {
    let s = 0;
    const { x, edges, restLen } = this;
    for (let e = 0; e < this.nE; e++) {
      const i = 3 * edges[2 * e], j = 3 * edges[2 * e + 1];
      s += Math.abs(Math.hypot(x[i] - x[j], x[i + 1] - x[j + 1], x[i + 2] - x[j + 2]) / restLen[e] - 1);
    }
    return s / this.nE;
  }
  minY() { let m = Infinity; for (let i = 1; i < this.x.length; i += 3) m = Math.min(m, this.x[i]); return m; }
}

// one contact of collideSolids: which piece is pushed out (0), the point (1..3), the normal (4..6),
// the push wanted (7), the approach to stop (8), the slide (9..11), how readily each piece gives
// way (12, 13) and turns (14..16, 17..19), and the pushes found (20, 21)
SoftBody.HIT = 22;

function inv3(m) { // row-major 3x3
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C, k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}
