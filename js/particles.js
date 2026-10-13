// ─────────────────────────────────────────────────────────────
//  Particles: flame, smoke, sparks, crumbs, drops — whatever the tools throw off.
//  Simulated here as points; drawn by the renderer as discs that face the camera, or as
//  streaks along their travel.
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

const MAX_PARTICLES = 1024;
// per particle on the GPU: position, radius · colour (premultiplied), opacity · streak (half its
// length, as a vector), hardness
const PARTICLE_FLOATS = 12;

class Particles {
  constructor(max = MAX_PARTICLES) {
    this.max = max;
    this.list = [];
    this.data = new Float32Array(max * PARTICLE_FLOATS);
    this.count = 0;
  }

  // One particle:
  //  · p, v         position, velocity
  //  · life         seconds
  //  · s0, s1       radius at birth and at death
  //  · c0, c1       colour at birth and at death (linear rgb; above 1 it glows)
  //  · glow         it gives light of its own, added to what is behind it — less `cover` (0..1) of
  //                 that, which it hides: a flame against a pale wall has to, or it is only a haze
  //  · a0, a1       not glowing, it covers what is behind it this far (at birth, at death)
  //  · grav, drag   share of gravity (negative: it rises), and how fast the air stops it (1/s)
  //  · streak       seconds of travel it is drawn stretched over (sparks, bullets)
  //  · hard         how crisp its edge is: 0 (or left out) a soft blob, 1 a clean disc
  //  · bounce       restitution against the table (leave out: it passes through)
  //  · swell        seconds it takes to fade in (smoke)
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    o.age = 0;
    this.list.push(o);
  }

  clear() { this.list.length = 0; this.count = 0; }

  update(dt) {
    if (dt <= 0) return;
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      o.age += dt;
      if (o.age >= o.life) continue;
      const p = o.p, v = o.v;
      if (o.grav) v[1] -= 9.81 * o.grav * dt;
      if (o.drag) { const k = Math.exp(-o.drag * dt); v[0] *= k; v[1] *= k; v[2] *= k; }
      p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
      if (o.bounce !== undefined && p[1] < o.s1 && v[1] < 0) {
        p[1] = o.s1; v[1] *= -o.bounce; v[0] *= 0.55; v[2] *= 0.55;
      }
      L[n++] = o;
    }
    L.length = n;
  }

  // fill the instance data for the renderer
  write() {
    const L = this.list, d = this.data;
    for (let i = 0, k = 0; i < L.length; i++, k += PARTICLE_FLOATS) {
      const o = L[i], t = o.age / o.life;
      // fades out over its last third (and in, if it swells)
      let f = Math.min(1, (1 - t) * 3);
      if (o.swell) f *= Math.min(1, o.age / o.swell);
      const a = o.glow ? (o.cover || 0) * f : (o.a0 + (o.a1 - o.a0) * t) * f, m = o.glow ? f : a;
      d[k] = o.p[0]; d[k + 1] = o.p[1]; d[k + 2] = o.p[2]; d[k + 3] = o.s0 + (o.s1 - o.s0) * t;
      d[k + 4] = (o.c0[0] + (o.c1[0] - o.c0[0]) * t) * m; d[k + 5] = (o.c0[1] + (o.c1[1] - o.c0[1]) * t) * m; d[k + 6] = (o.c0[2] + (o.c1[2] - o.c0[2]) * t) * m;
      d[k + 7] = a;
      const s = o.streak || 0;
      d[k + 8] = o.v[0] * s; d[k + 9] = o.v[1] * s; d[k + 10] = o.v[2] * s;
      d[k + 11] = +o.hard || 0;
    }
    this.count = L.length;
  }
}
