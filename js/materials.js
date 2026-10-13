// ─────────────────────────────────────────────────────────────
//  Materials: what the fox is made of. Each one is a feel (how the
//  solver treats it) and a look (which branch of the body shader draws it).
//  · firmness, damping  where the two sliders start (0..1)
//  · rigid              the piece keeps its shape outright: the sliders do nothing, a hand holds the
//                       whole piece at once, and pieces collide as the solids they are
//  · hold, slack        whole-piece shape memory (see SoftBody.solveShape)
//  · friction, bounce   against the table
//  · air                drag (1/s): light things lose their speed to the air
//  · press              how far the knife edge sinks in before the cut gives
//  · density            g/cm³, for the mass readout only
//  · kind               shader branch — keep in step with the K_* constants in shaders.js
//  · gel                the translucent body: absorption strength, milkiness, albedo gain
//  · shadow             how much light the shadow lets through, tinted by the drawing:
//                       0 = a plain opaque shadow, 1 = the jelly's
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

const MATERIALS = [
  {
    id: 'jelly', name: '果凍', kind: 0, gel: [2.2, 3.2, 0.86], shadow: 1,
    firmness: 0.4, damping: 0.45, rigid: false, hold: 0.03, slack: 0.08,
    friction: 0.55, bounce: 0, air: 0.08, press: 0.13, density: 1.3,
  },
  {
    id: 'rubber', name: '橡膠', kind: 1, gel: [0, 0, 0], shadow: 0,
    firmness: 0.82, damping: 0.18, rigid: false, hold: 0.06, slack: 0.06,
    friction: 0.95, bounce: 0.55, air: 0.08, press: 0.08, density: 1.1,
  },
  {
    id: 'foam', name: '保麗龍', kind: 2, gel: [0, 0, 0], shadow: 0,
    firmness: 1, damping: 0.6, rigid: true, hold: 1, slack: 0,
    friction: 0.5, bounce: 0.3, air: 3, press: 0.03, density: 0.03,
  },
  {
    id: 'metal', name: '金屬', kind: 3, gel: [0, 0, 0], shadow: 0,
    firmness: 1, damping: 0.5, rigid: true, hold: 1, slack: 0,
    friction: 0.35, bounce: 0.15, air: 0.03, press: 0.005, density: 7.8,
  },
];
