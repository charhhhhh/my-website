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
//  …and what it makes of the tools:
//  · blow               how much of a blow's speed a rigid piece takes up: heavy ones barely move, light ones fly
//  · squash             how far a hammer sinks into a soft body, as a share of its thickness
//  · carry              how much of a bat's blow goes to the whole of a soft piece at once (the rest
//                       only to where it lands — that part is what makes it wobble)
//  · rebound            how hard it throws back what hits it (0: the tool stays where it lands)
//  · pierce             a bullet goes in, and leaves a hole — or is turned away
//  · dent               radius of the dent a blow leaves in it (0: it springs back, or has no surface to keep one)
//  · debris             what flies off where it is struck (see main.js)
//  · heatUp, cool       how fast a flame heats it, and how fast it cools again (1/s)
//  · conduct            how readily the heat spreads through it
//  · ignite, scorch     the heat at which it starts to burn, and how fast the burn then sets in (1/s)
//  · melt, limp, soften the burnt parts (melt) and the hot ones (limp) go soft, 0..1 — `soften` times as
//                       yielding as before when wholly so (soft bodies)
//  · sag                how far a wholly melted part sinks, as a share of its thickness (soft bodies)
//  · shrink             how far a burnt surface draws back (rigid bodies: only drawn so, the solid stays)
//  · fume               what rises from it while it burns: colour and opacity, and how much
//  · flame              how readily it carries a flame of its own once lit
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
'use strict';

const MATERIALS = [
  {
    id: 'jelly', name: '果凍', kind: 0, gel: [2.2, 3.2, 0.86], shadow: 1,
    firmness: 0.4, damping: 0.45, rigid: false, hold: 0.03, slack: 0.08,
    friction: 0.55, bounce: 0, air: 0.08, press: 0.13, density: 1.3,
    // wobbles under a blow and swallows bullets; a flame melts it to a caramel puddle
    blow: 0.6, squash: 0.5, carry: 0.5, rebound: 0.1, pierce: true, dent: 0, debris: 'drops',
    heatUp: 3, cool: 1.1, conduct: 0.4, ignite: 0.3, scorch: 1.2, melt: 1, limp: 0.35, soften: 10, sag: 0.6, shrink: 0,
    fume: [0.94, 0.94, 0.96, 0.22], fumes: 2.2, flame: 0,
  },
  {
    id: 'rubber', name: '橡膠', kind: 1, gel: [0, 0, 0], shadow: 0,
    firmness: 0.82, damping: 0.18, rigid: false, hold: 0.06, slack: 0.06,
    friction: 0.95, bounce: 0.55, air: 0.08, press: 0.08, density: 1.1,
    // throws everything back — hammer, bat and bullet; a flame chars it, and it goes on burning
    blow: 1, squash: 0.3, carry: 0.75, rebound: 0.9, pierce: false, dent: 0, debris: 'dust',
    heatUp: 1.6, cool: 0.3, conduct: 0.08, ignite: 0.4, scorch: 0.6, melt: 0.15, limp: 0.55, soften: 4, sag: 0, shrink: 0,
    fume: [0.03, 0.03, 0.03, 0.55], fumes: 2.6, flame: 1,
  },
  {
    id: 'foam', name: '保麗龍', kind: 2, gel: [0, 0, 0], shadow: 0,
    firmness: 1, damping: 0.6, rigid: true, hold: 1, slack: 0,
    friction: 0.5, bounce: 0.3, air: 3, press: 0.03, density: 0.03,
    // weighs nothing: a blow sends it flying and crushes it, a bullet goes straight through, a flame eats it away
    blow: 1.5, squash: 0, carry: 1, rebound: 0.25, pierce: true, dent: 0.19, debris: 'crumbs',
    heatUp: 5, cool: 2.2, conduct: 0, ignite: 0.15, scorch: 2.4, melt: 0, limp: 0, soften: 0, sag: 0, shrink: 0.13,
    fume: [0.1, 0.095, 0.09, 0.4], fumes: 1.4, flame: 0.3,
  },
  {
    id: 'metal', name: '金屬', kind: 3, gel: [0, 0, 0], shadow: 0,
    firmness: 1, damping: 0.5, rigid: true, hold: 1, slack: 0,
    friction: 0.35, bounce: 0.15, air: 0.03, press: 0.005, density: 7.8,
    // rings, sparks and hardly moves; bullets glance off it; a flame only makes it glow, slowly, and for a long time
    blow: 0.16, squash: 0, carry: 1, rebound: 0.6, pierce: false, dent: 0.1, debris: 'sparks',
    heatUp: 1.8, cool: 0.15, conduct: 0.06, ignite: 0.3, scorch: 0.3, melt: 0, limp: 0, soften: 0, sag: 0, shrink: 0,
    fume: null, fumes: 0, flame: 0,
  },
];
