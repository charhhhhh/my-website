// ─────────────────────────────────────────────────────────────
//  Sound: every effect is made on the spot (Web Audio) from tones and
//  filtered noise — there are no samples to load.
//  A browser lets a page make sound only once it has been touched, so nothing
//  here starts before the first press; until then every call is silently dropped.
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

const SFX = (() => {
  let ctx = null, out = null, noise = null, muted = false, roar = null;
  const R = (a, b) => a + Math.random() * (b - a);

  function ready() {
    if (muted) return false;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC(); } catch (_) { return false; }
      // a compressor on the way out keeps three shots in a row from clipping
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 8; comp.attack.value = 0.002; comp.release.value = 0.2;
      out = ctx.createGain(); out.gain.value = 0.5;
      out.connect(comp); comp.connect(ctx.destination);
      // two seconds of white noise, shared by everything that hisses, cracks or bangs
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // gain that rises to `peak` within `attack` and then dies away — to a twentieth of that after
  // `decay`, and to nothing by the time RING · decay has passed and its source is stopped
  const RING = 2.5;
  function shaped(t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay / 3);
    g.connect(out);
    return g;
  }
  // a burst of noise through a filter (whose frequency may slide to f1)
  function burst(t, type, f0, q, peak, decay, attack = 0.002, f1 = f0) {
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter();
    src.buffer = noise; src.loop = true;
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    src.connect(flt); flt.connect(shaped(t, peak, attack, decay));
    src.start(t, Math.random() * 1.5); src.stop(t + attack + decay * RING);
  }
  // a tone whose pitch slides from f0 to f1 over `slide` seconds
  function tone(t, wave, f0, f1, slide, peak, decay, attack = 0.002) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + slide);
    osc.connect(shaped(t, peak, attack, decay));
    osc.start(t); osc.stop(t + attack + decay * RING);
    return osc;
  }

  // what each material sounds like when it is struck: s is how hard (0..1), f shifts the pitch
  const voice = {
    // a wet slap
    jelly(t, s, f) {
      tone(t, 'sine', 200 * f, 68 * f, 0.12, 0.55 * s, 0.17);
      burst(t, 'bandpass', 650 * f, 1.2, 1.1 * s, 0.07);
      burst(t + 0.035, 'bandpass', 1500 * f, 3, 0.5 * s, 0.05);
    },
    // a dull thump that springs back up
    rubber(t, s, f) {
      const o = tone(t, 'triangle', 105 * f, 185 * f, 0.07, 0.6 * s, 0.3);
      o.frequency.exponentialRampToValueAtTime(120 * f, t + 0.3);
      burst(t, 'lowpass', 420 * f, 0.7, 1.3 * s, 0.05);
    },
    // a hollow knock, and the squeak and crackle of beads giving way
    foam(t, s, f) {
      burst(t, 'bandpass', 360 * f, 2.5, 1.6 * s, 0.06);
      for (let k = 0; k < 5; k++) burst(t + R(0.004, 0.1), 'highpass', R(2400, 6000), 1, 0.3 * s, R(0.01, 0.035), 0.001);
    },
    // a clang: the partials of a struck bar, the high ones dying first
    metal(t, s, f) {
      const f0 = 610 * f * R(0.97, 1.03);
      for (const [m, g, d] of [[1, 0.5, 1.1], [2.76, 0.3, 0.7], [5.4, 0.2, 0.4], [8.93, 0.12, 0.22]]) tone(t, 'sine', f0 * m, f0 * m, 0, g * s * 0.55, d / Math.sqrt(f));
      burst(t, 'highpass', 3200, 0.7, 0.35 * s, 0.02, 0.001);
    },
  };

  return {
    get muted() { return muted; },
    set muted(v) { muted = !!v; if (muted) this.torch(false); },
    // call from a press or a key: starts the audio the first time
    unlock() { ready(); },

    // something has struck the body
    hit(material, strength = 1, pitch = 1) {
      if (!ready() || !voice[material]) return;
      voice[material](ctx.currentTime, Math.min(1, strength), pitch);
    },
    // …or the table
    thud(strength = 1) {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 'sine', 120, 52, 0.09, 0.6 * strength, 0.13);
      burst(t, 'lowpass', 500, 0.7, 1.2 * strength, 0.05);
    },
    // one shot: the crack, its body, the thump in the chest, and the tail rolling off
    shot() {
      if (!ready()) return;
      const t = ctx.currentTime, d = R(0.93, 1.07);
      burst(t, 'highpass', 1000, 0.5, 1.1, 0.07, 0.001);
      burst(t, 'lowpass', 1200 * d, 0.6, 3, 0.18, 0.001);
      tone(t, 'sine', 175 * d, 46, 0.09, 1.1, 0.14, 0.001);
      burst(t + 0.02, 'bandpass', 520 * d, 0.5, 0.7, 0.45, 0.01);
    },
    // a bullet sent on its way by something it could not get through
    ricochet() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.01, f = R(2600, 3600);
      tone(t, 'sine', f, f * R(0.28, 0.4), 0.32, 0.16, 0.3, 0.004);
      burst(t, 'bandpass', f, 9, 0.1, 0.22, 0.004, f * 0.4);
    },
    // BONK — a hollow knock on the head: two woody tones, a fifth apart, both dropping
    bonk() {
      if (!ready()) return;
      const t = ctx.currentTime;
      tone(t, 'sine', 640, 320, 0.07, 0.85, 0.17);
      tone(t, 'triangle', 960, 500, 0.05, 0.3, 0.09);
      burst(t, 'bandpass', 900, 1.5, 1.2, 0.03, 0.001);
    },
    // the air a swing moves
    swish(pitch = 1) {
      if (!ready()) return;
      burst(ctx.currentTime, 'bandpass', 420 * pitch, 1.4, 0.7, 0.12, 0.07, 1500 * pitch);
    },
    // the roar of the flame, for as long as it burns
    torch(on) {
      if (!on) {
        if (!roar) return;
        const t = ctx.currentTime, r = roar;
        roar = null;
        r.g.gain.cancelScheduledValues(t);
        r.g.gain.setTargetAtTime(0, t, 0.04);
        r.src.stop(t + 0.3); r.lfo.stop(t + 0.3);
        return;
      }
      if (roar || !ready()) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource(), low = ctx.createBiquadFilter(), high = ctx.createBiquadFilter();
      const hiss = ctx.createGain(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      src.buffer = noise; src.loop = true;
      low.type = 'bandpass'; low.frequency.value = 480; low.Q.value = 0.45;
      high.type = 'highpass'; high.frequency.value = 3200; hiss.gain.value = 0.22;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.1);
      // the flame flutters
      lfo.frequency.value = 21; depth.gain.value = 0.09;
      lfo.connect(depth); depth.connect(g.gain);
      src.connect(low); low.connect(g);
      src.connect(high); high.connect(hiss); hiss.connect(g);
      g.connect(out);
      src.start(t); lfo.start(t);
      roar = { src, lfo, g };
      burst(t, 'lowpass', 260, 0.7, 2, 0.14, 0.01);   // it catches
    },
    // one spit of what the flame is cooking: call it as often as it should crackle
    sizzle(material) {
      if (!ready()) return;
      const t = ctx.currentTime;
      if (material === 'jelly') burst(t, 'highpass', R(4500, 7500), 0.8, R(0.03, 0.09), R(0.02, 0.07), 0.003);
      else if (material === 'rubber') burst(t, 'bandpass', R(900, 2400), 2, R(0.05, 0.12), R(0.01, 0.03), 0.001);
      else if (material === 'foam') burst(t, 'highpass', R(3000, 5000), 1, R(0.06, 0.14), R(0.006, 0.02), 0.001);
    },
  };
})();
