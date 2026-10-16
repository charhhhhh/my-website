// ─────────────────────────────────────────────────────────────
//  App: sim ↔ render glue, camera, picking, UI
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
// needs: every other file
'use strict';

const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = rgb => '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, linToSrgb(c))) * 255).toString(16).padStart(2, '0')).join('');

// per look: where its drawing sits in the rest plane (origin (u, w), 1 / size), and the tint its
// shadow takes from the drawing's average colour
for (const l of LOOKS) {
  l.rect = [l.art.u0, l.art.w0, 1 / l.art.size, 1 / l.art.size];
  const c = l.tint.map(v => srgbToLin(v / 255)), m = Math.max(...c, 1e-3);
  l.shadowTint = c.map(v => 0.45 + 0.17 * v / m);
}
const OPAQUE_SHADOW = [0.36, 0.36, 0.38];

const BG_SRGB = [0.886, 0.875, 0.855]; // #E2DFDA — the studio sweep
const BG_LIN = BG_SRGB.map(srgbToLin);
// tone mapper subtracts a small toe offset; lift the backdrop so it lands on the page colour
const BG_RENDER = BG_LIN.map(c => c + 0.04);

const SCALE_CM = 3.5;      // illustrative: 1 simulation unit ≈ 3.5 cm

const $ = s => document.querySelector(s);

// steps the visitor can actually follow in the browser they are using; internal URLs can't be linked, so they are spelled out to paste
function adapterHelp() {
  const ua = navigator.userAgent;
  const linux = /Linux/.test(ua) && !/Android/.test(ua);
  const intro = '這個瀏覽器有 WebGPU，但拿不到顯示卡。按照以下步驟解決，網址請貼到網址列：\n\n';
  if (/Firefox\//.test(ua)) return intro + [
    '1. 開啟 about:preferences，在「一般 → 效能」取消「使用推薦的效能設定」，勾選「可用時使用硬體加速」。',
    '2. 開啟 about:config，把 dom.webgpu.enabled 設為 true，然後重新啟動 Firefox。',
    '3. 開啟 about:support，在「圖形」區段確認 WebGPU 有列出顯示卡。',
    linux ? '4. Linux 版 Firefox 的 WebGPU 仍不穩定，還是不行的話請改用 Chrome。' : '4. 還是不行的話，請更新顯示卡驅動程式。',
  ].join('\n');
  if (/Safari\//.test(ua) && !/Chrom(e|ium)\//.test(ua)) return intro + [
    '1. 把系統更新到 macOS 26 / iOS 26 以上，Safari 26 起預設開啟 WebGPU。',
    '2. 舊版 Mac：Safari → 設定 → 進階，勾選「顯示網頁開發者功能」，再到「功能旗標」勾選 WebGPU。',
    '3. 舊版 iPhone / iPad：設定 → App → Safari → 進階 → 功能旗標，打開 WebGPU。',
    '4. 重新開啟 Safari 後再載入這一頁。',
  ].join('\n');
  const scheme = /Edg\//.test(ua) ? 'edge' : 'chrome';
  return intro + [
    // `1. 開啟 ${scheme}://settings/system，打開圖硬體加速。（Use graphics acceleration when available）`,
    `打開 ${scheme}://flags/ \n 搜尋 enable-unsafe-webgpu 設為 Enabled` + (linux ? `\n enable-vulkan 也設為 Enabled` : ''),
  ].join('\n');
}
function showFallback(title, detail) {
  const f = $('#fallback');
  f.hidden = false;
  $('#fallbackTitle').textContent = title;
  $('#fallbackDetail').textContent = detail;
  document.body.classList.add('no-gpu');
  for (const el of document.querySelectorAll('.panel button, .panel input')) el.disabled = true;
}

async function main() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = $('#gl');

  // ── build everything once ──
  // the world is a list of pieces; at the start there is one — the whole fox, in its first look
  let pieces = [LOOKS[0].whole = initialPiece()];
  let world = buildWorld(pieces);
  let material = MATERIALS[0];
  // reduced motion: nothing is left to wobble for long
  const dampingFor = m => Math.max(m.damping, reduced.matches ? 0.65 : 0);
  let sim = new SoftBody(world.sim, { firmness: material.firmness, damping: dampingFor(material), material });
  let renderMesh = world.render;
  let nV = renderMesh.rest.length / 3;
  let skinIdx = world.skinIdx, skinW = world.skinW;
  let index = renderMesh.index;
  let bodyTriEnd = renderMesh.body.count;
  let vComp = renderMesh.vComp;

  let look = 0;
  const swatches = $('#swatches');
  LOOKS.forEach((l, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', '造型 ' + l.name);
    b.innerHTML = `<img class="chip" src="${l.thumb}" alt=""><span class="swname">${l.name}</span>`;
    b.addEventListener('click', () => setLook(i));
    swatches.appendChild(b);
  });
  const markLook = () => [...swatches.children].forEach((b, i) => b.setAttribute('aria-checked', String(i === look)));
  markLook();
  const matBox = $('#materials');
  MATERIALS.forEach((m, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mat'; b.textContent = m.name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === 0));
    b.addEventListener('click', () => setMaterial(i));
    matBox.appendChild(b);
  });

  const arts = await Promise.all(LOOKS.map(async l => { const img = new Image(); img.src = l.texture; await img.decode(); return img; }));

  let renderer;
  try {
    if (!navigator.gpu) throw new Error('no-webgpu');
    renderer = await Renderer.create(canvas, renderMesh, sim.edges, sim.n, arts);
  } catch (err) {
    console.warn(err);
    const msg = String(err && err.message || err);
    if (msg === 'no-webgpu') showFallback('這個標本需要 WebGPU。', '你的瀏覽器沒有提供 navigator.gpu，所以沒有東西可以拿來渲染。請改用最新版的 Chrome、Edge 或 Safari（或 Windows 上的 Firefox），並開啟硬體加速。');
    else if (msg === 'no-adapter') showFallback('找不到 WebGPU ', adapterHelp());
    else showFallback('渲染器無法啟動。', msg.slice(0, 400));
    return;
  }
  // a lost device (driver reset, GPU switch) gets two attempts at a clean rebuild before giving up
  let recoveries = 0;
  const wire = r => {
    r.onError = e => console.error('[webgpu]', e.message);
    r.onLost = async info => {
      if (info.reason === 'destroyed') return;
      if (recoveries++ < 2) {
        try {
          const fresh = await Renderer.create(canvas, renderMesh, sim.edges, sim.n, arts);
          fresh.useArt(look); fresh.dyn = dyn; mountProps(fresh); renderer = fresh; wire(fresh); resize();
          requestAnimationFrame(frame);
          return;
        } catch (e) { console.warn(e); }
      }
      showFallback('GPU 裝置已中斷。', (info.message || '') + ' 請重新載入頁面，重新開始。');
    };
  };
  wire(renderer);
  let dyn = renderer.dyn;

  // ── state ──
  const HOME_AZ = 0.1, HOME_EL = 1.0;   // the fox faces the camera, seen from a little above
  const state = {
    paused: false, slow: false, showMesh: false, tool: 'hand',
    az: HOME_AZ, el: HOME_EL, zoom: 1,
    time: 0,
  };


  // ── skinning: every render vertex (body, bubbles) follows its tetrahedron ──
  // …and so does what a flame has done to it: how hot it is there, and how burnt
  let fxLive = false;
  function skin() {
    const x = sim.x, live = sim.marked, heat = sim.heat, char = sim.char, fx = renderer.fx;
    for (let v = 0; v < nV; v++) {
      const i4 = 4 * v, o = 6 * v;
      const ia = skinIdx[i4], ib = skinIdx[i4 + 1], ic = skinIdx[i4 + 2], id = skinIdx[i4 + 3];
      const a = 3 * ia, b = 3 * ib, c = 3 * ic, d = 3 * id;
      const w0 = skinW[i4], w1 = skinW[i4 + 1], w2 = skinW[i4 + 2], w3 = skinW[i4 + 3];
      dyn[o] = x[a] * w0 + x[b] * w1 + x[c] * w2 + x[d] * w3;
      dyn[o + 1] = x[a + 1] * w0 + x[b + 1] * w1 + x[c + 1] * w2 + x[d + 1] * w3;
      dyn[o + 2] = x[a + 2] * w0 + x[b + 2] * w1 + x[c + 2] * w2 + x[d + 2] * w3;
      if (live) {
        fx[2 * v] = heat[ia] * w0 + heat[ib] * w1 + heat[ic] * w2 + heat[id] * w3;
        fx[2 * v + 1] = char[ia] * w0 + char[ib] * w1 + char[ic] * w2 + char[id] * w3;
      }
    }
    if (live) renderer.fxDirty = true;
    else if (fxLive) { fx.fill(0); renderer.fxDirty = true; }
    fxLive = live;
    skinNormals();
    // A rigid body cannot give, so where a flame eats it away that is only drawn: the burnt surface
    // is set back along its normal — less on the walls, which would meet in the thin places.
    const shrink = live && sim.rigid ? material.shrink : 0;
    if (shrink > 0) {
      for (let v = 0, o = 0; v < nV; v++, o += 6) {
        const burn = fx[2 * v + 1];
        if (burn <= 0.004) continue;
        const s = shrink * Math.min(1, burn) * (0.3 + 0.7 * Math.abs(dyn[o + 4]));
        dyn[o] -= dyn[o + 3] * s; dyn[o + 1] -= dyn[o + 4] * s; dyn[o + 2] -= dyn[o + 5] * s;
      }
      skinNormals();
    }
  }
  function skinNormals() {
    for (let o = 3; o < dyn.length; o += 6) { dyn[o] = 0; dyn[o + 1] = 0; dyn[o + 2] = 0; }
    for (let t = 0; t < index.length; t += 3) {
      const a = 6 * index[t], b = 6 * index[t + 1], c = 6 * index[t + 2];
      const e1x = dyn[b] - dyn[a], e1y = dyn[b + 1] - dyn[a + 1], e1z = dyn[b + 2] - dyn[a + 2];
      const e2x = dyn[c] - dyn[a], e2y = dyn[c + 1] - dyn[a + 1], e2z = dyn[c + 2] - dyn[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      dyn[a + 3] += nx; dyn[a + 4] += ny; dyn[a + 5] += nz;
      dyn[b + 3] += nx; dyn[b + 4] += ny; dyn[b + 5] += nz;
      dyn[c + 3] += nx; dyn[c + 4] += ny; dyn[c + 5] += nz;
    }
    for (let o = 0; o < dyn.length; o += 6) {
      const l = Math.hypot(dyn[o + 3], dyn[o + 4], dyn[o + 5]) || 1;
      dyn[o + 3] /= l; dyn[o + 4] /= l; dyn[o + 5] /= l;
    }
  }

  // ── camera & framing (keeps the fox clear of the text and panel) ──
  const cam = { viewProj: null, view: null, invViewProj: null, pos: [0, 0, 0], fwd: [0, 0, -1] };
  const target = [0, 0.16, 1.0];
  const FOV = 27 * Math.PI / 180;
  function safeRect(W, H) {
    const cr = canvas.getBoundingClientRect();
    if (document.body.classList.contains('stacked')) return { x: 0, y: 0, w: cr.width, h: cr.height };
    const panel = $('.panel').getBoundingClientRect();
    const head = $('.masthead').getBoundingClientRect();
    const read = $('.readouts').getBoundingClientRect();
    const left = Math.min(head.right - cr.left, cr.width * 0.24) * 0.55;
    const right = panel.left - cr.left - 12;
    const top = Math.min(head.bottom - cr.top, cr.height * 0.34) * 0.5;
    const bottom = read.top - cr.top + 24;
    return { x: left, y: top, w: Math.max(200, right - left), h: Math.max(200, bottom - top) };
  }
  // the camera eases after the jelly if it is thrown or dragged far from home (never while holding it)
  const home = target.slice();
  function followJelly(dt) {
    if (drag.mode === 'grab') return;
    const c = sim.centroid();
    const k = 1 - Math.exp(-dt * 1.4);
    const gx = home[0] + (c[0] - 0.0) * 0.7, gz = home[2] + (c[2] - 1.0) * 0.7;
    target[0] += (gx - target[0]) * k; target[2] += (gz - target[2]) * k;
  }
  function updateCamera() {
    const W = renderer.w, H = renderer.h;
    const cr = canvas.getBoundingClientRect();
    const r = safeRect(W, H);
    const aspect = W / H;
    const hf = r.h / cr.height, wf = r.w / cr.width;
    // fit the fox's footprint as it looks from this angle
    const Rh = 1.3, Rv = 1.0;
    const t2 = Math.tan(FOV / 2);
    const dist = Math.max(Rv / (t2 * 0.9 * hf), Rh / (t2 * 0.92 * aspect * wf)) * state.zoom;
    const ce = Math.cos(state.el);
    const eye = [target[0] + dist * Math.sin(state.az) * ce, target[1] + dist * Math.sin(state.el), target[2] + dist * Math.cos(state.az) * ce];
    const view = M4.lookAt(eye, target, [0, 1, 0]);
    const proj = M4.perspective(FOV, aspect, 0.1, 60);
    // lens shift so the target lands at the centre of the safe rect
    const cx = (r.x + r.w / 2) / cr.width, cy = (r.y + r.h / 2) / cr.height;
    proj[8] -= (cx * 2 - 1); proj[9] -= -(cy * 2 - 1);
    cam.view = view; cam.viewProj = M4.mul(proj, view); cam.invViewProj = M4.invert(cam.viewProj);
    cam.pos = eye;
    const f = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const fl = Math.hypot(...f); cam.fwd = f.map(v => v / fl);
  }

  // light rig: key from behind-left and above (so thin edges glow toward the camera)
  const keyDir = (() => { const d = [-0.45, 0.86, -0.36]; const l = Math.hypot(...d); return d.map(v => v / l); })();
  const light = { dir: keyDir, intensity: 2.3, lightVP: null, topVP: null };
  function updateLight() {
    // shadow and height maps are centred on the jelly itself so they never lose it
    const c = sim.centroid();
    const at = [c[0], 0.3, c[2]];
    light.lightVP = M4.mul(M4.ortho(-2.4, 2.4, -2.4, 2.4, 0.1, 14), M4.lookAt([at[0] + keyDir[0] * 7, at[1] + keyDir[1] * 7, at[2] + keyDir[2] * 7], at, [0, 0, 1]));
    // top-down height map: camera under the floor looking up so the lowest surface wins; depth = (y + 1) / 5
    light.topVP = M4.mul(M4.ortho(-2.6, 2.6, -2.6, 2.6, 0, 5), M4.lookAt([at[0], -1, at[2]], [at[0], 1, at[2]], [0, 0, -1]));
  }

  // ── resize ──
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(r.width * dpr, r.height * dpr);
  }
  const stacked = matchMedia('(max-width: 860px), (max-height: 560px) and (max-width: 1000px)');
  const applyLayout = () => { document.body.classList.toggle('stacked', stacked.matches); resize(); };
  stacked.addEventListener('change', applyLayout);
  applyLayout();
  new ResizeObserver(resize).observe(canvas);

  // ── picking ──
  function rayFrom(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((clientY - r.top) / r.height) * 2;
    const m = cam.invViewProj;
    const un = (x, y, z) => {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
    };
    const a = un(nx, ny, 0), b = un(nx, ny, 1);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...d);
    return { o: a, d: d.map(v => v / l) };
  }
  let lastPickTri = -1, lastPickU = 0, lastPickV = 0;
  function pick(ray) {
    let best = Infinity;
    const { o, d } = ray;
    for (let t = 0; t < bodyTriEnd; t += 3) {
      const a = 6 * index[t], b = 6 * index[t + 1], c = 6 * index[t + 2];
      const e1x = dyn[b] - dyn[a], e1y = dyn[b + 1] - dyn[a + 1], e1z = dyn[b + 2] - dyn[a + 2];
      const e2x = dyn[c] - dyn[a], e2y = dyn[c + 1] - dyn[a + 1], e2z = dyn[c + 2] - dyn[a + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = o[0] - dyn[a], ty = o[1] - dyn[a + 1], tz = o[2] - dyn[a + 2];
      const uu = (tx * px + ty * py + tz * pz) * inv; if (uu < 0 || uu > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const vv = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (vv < 0 || uu + vv > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt > 1e-4 && tt < best) { best = tt; lastPickTri = t; lastPickU = uu; lastPickV = vv; }
    }
    return best < Infinity ? [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best] : null;
  }

  // forgiving fallback for grabs that land just outside the rounded silhouette
  function pickNear(clientX, clientY, maxPx) {
    const r = canvas.getBoundingClientRect(), M = cam.viewProj, x = sim.x;
    let best = -1, bd = maxPx * maxPx;
    for (let i = 0; i < sim.n; i++) {
      const X = x[3 * i], Y = x[3 * i + 1], Z = x[3 * i + 2];
      const w = M[3] * X + M[7] * Y + M[11] * Z + M[15];
      const sx = r.left + ((M[0] * X + M[4] * Y + M[8] * Z + M[12]) / w * 0.5 + 0.5) * r.width;
      const sy = r.top + (0.5 - (M[1] * X + M[5] * Y + M[9] * Z + M[13]) / w * 0.5) * r.height;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2 - w * 1e-3; // prefer nearer particles on ties
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : [x[3 * best], x[3 * best + 1], x[3 * best + 2]];
  }

  // ── knife ──
  const knife = { ax: 0, ay: 0, bx: 0, by: 0 };
  const strokeSvg = $('#stroke'), strokeLine = $('#strokeLine');
  let strokeFade = 0;
  function drawStroke(on) {
    const r = canvas.getBoundingClientRect();
    strokeLine.setAttribute('x1', knife.ax - r.left); strokeLine.setAttribute('y1', knife.ay - r.top);
    strokeLine.setAttribute('x2', knife.bx - r.left); strokeLine.setAttribute('y2', knife.by - r.top);
    clearTimeout(strokeFade);
    strokeSvg.classList.toggle('on', on);
    if (!on) strokeSvg.classList.add('fading'), strokeFade = setTimeout(() => strokeSvg.classList.remove('fading'), 420);
    else strokeSvg.classList.remove('fading');
  }
  const toastEl = $('#toast');
  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2200);
  }
  const MAX_PIECES = 14;

  // Cut: the stroke, seen on the top of the jelly, defines a vertical blade plane; every piece the
  // stroke passes over is split along it. The plane is carried into each piece's rest frame
  // (best-fit rotation of the deformed piece), where it becomes a straight line across the fox.
  // Planning happens on release (so the heavy rebuild is done before the knife moves); the new
  // world is swapped in mid-stroke, at the moment the edge breaks through.
  const rayPlaneY = (ray, y) => {
    if (ray.d[1] > -1e-4) return null;
    const t = (y - ray.o[1]) / ray.d[1];
    return t > 0 ? [ray.o[0] + ray.d[0] * t, y, ray.o[2] + ray.d[2] * t] : null;
  };
  const camRightYaw = () => -state.az;          // blade direction that shows its face to the camera
  const canonicalYaw = (dx, dz) => {
    let yaw = Math.atan2(dz, dx);
    if (Math.cos(yaw - camRightYaw()) < 0) yaw += Math.PI;   // keep the handle on the left, tip on the right
    return yaw;
  };
  function planCut(ax, ay, bx, by) {
    if (Math.hypot(bx - ax, by - ay) < 24) return { miss: '' };
    const hit = new Set(); let yTop = 0, t0 = -1, t1 = -1;
    for (let k = 0; k <= 48; k++) {
      const t = k / 48;
      const p = pick(rayFrom(ax + (bx - ax) * t, ay + (by - ay) * t));
      if (p && lastPickTri >= 0) { hit.add(vComp[index[lastPickTri]]); yTop = Math.max(yTop, p[1]); if (t0 < 0) t0 = t; t1 = t; }
    }
    if (!hit.size) return { miss: '沒切到，請把刀劃過胡言。' };
    if (pieces.length + hit.size > MAX_PIECES) return { miss: '已經夠多塊了。按「重置」換一隻新的胡言。' };
    // the stroke as seen on the surface it was drawn over
    const at = t => rayPlaneY(rayFrom(ax + (bx - ax) * t, ay + (by - ay) * t), yTop);
    const A = at(0) || at(t0), B = at(1) || at(t1);
    const A2 = at(t0), B2 = at(t1);
    if (!A || !B || !A2 || !B2) return { miss: '沒切到，請把刀劃過胡言。' };
    let dx = B[0] - A[0], dz = B[2] - A[2];
    const dl = Math.hypot(dx, dz); if (dl < 0.05) return { miss: '' };
    dx /= dl; dz /= dl;
    const n = [-dz, 0, dx];
    const o = [(A2[0] + B2[0]) / 2, yTop, (A2[2] + B2[2]) / 2];
    const next = [], sep = [];
    let thin = 0, cut = 0;
    pieces.forEach((pc, c) => {
      if (!hit.has(c)) { next.push(pc); return; }
      const F = sim.pieceFrame(c), R = F.R;
      // world plane n·x = n·o  →  rest plane nr·X = nr·pr
      const nr = [R[0] * n[0] + R[3] * n[1] + R[6] * n[2], R[1] * n[0] + R[4] * n[1] + R[7] * n[2], R[2] * n[0] + R[5] * n[1] + R[8] * n[2]];
      const toRest = X => {
        const d = [X[0] - F.cw[0], X[1] - F.cw[1], X[2] - F.cw[2]];
        return [R[0] * d[0] + R[3] * d[1] + R[6] * d[2] + F.cr[0], R[1] * d[0] + R[4] * d[1] + R[7] * d[2] + F.cr[1], R[2] * d[0] + R[5] * d[1] + R[8] * d[2] + F.cr[2]];
      };
      const pr = toRest(o);
      const L = Math.hypot(nr[0], nr[2]);
      if (L < 0.3) { next.push(pc); thin++; return; }   // piece lying on its side: the blade runs along its faces
      const cc = (nr[0] * pr[0] + nr[1] * pr[1] + nr[2] * pr[2] - nr[1] * SHAPE.T / 2) / L;
      const a = nr[0] / L, b = nr[2] / L;
      // only the parts the stroke itself passes through are cut, not everything along the line
      const along = X => { const q = toRest(X); return a * q[2] - b * q[0]; };
      const tA = along(A), tB = along(B);
      const parts = splitPiece(pc.P, a, b, cc, Math.min(tA, tB) - 0.1, Math.max(tA, tB) + 0.1);
      if (!parts) { next.push(pc); return; }
      const made = parts.map(P => ({ P, cache: null }));
      if (!made.length || made.some(m => !ensureCache(m))) { next.push(pc); thin++; return; }
      cut++;
      made.forEach((m, side) => {
        // which way does this part lie in the world? it is nudged away from the blade on that side
        let su = 0, sw = 0; for (const p of m.P) { su += p[0]; sw += p[1]; } su /= m.P.length; sw /= m.P.length;
        const X = [su - F.cr[0], SHAPE.T / 2 - F.cr[1], sw - F.cr[2]];
        const W = [R[0] * X[0] + R[1] * X[1] + R[2] * X[2] + F.cw[0], R[3] * X[0] + R[4] * X[1] + R[5] * X[2] + F.cw[1], R[6] * X[0] + R[7] * X[1] + R[8] * X[2] + F.cw[2]];
        const sg = Math.sign(n[0] * (W[0] - o[0]) + n[2] * (W[2] - o[2])) || (side ? 1 : -1);
        sep.push({ piece: next.length, dir: [n[0] * sg, 0, n[2] * sg] });
        next.push(m);
      });
    });
    if (next.length > MAX_PIECES) return { miss: '已經夠多塊了。按「重置」換一隻新的胡言。' };
    if (!cut) return { miss: thin ? '那裡太薄，切不下去。' : '沒切到，請把刀劃過胡言。' };
    // do the expensive part now, while the knife is still in the air
    const w = buildWorld(next);
    const ns = new SoftBody(w.sim, { firmness: sim.firmness, damping: sim.damping, material });
    return { next, sep, world: w, sim: ns, M: o, yTop, yaw: canonicalYaw(dx, dz) };
  }
  // instant cut without the knife animation (kept for automated checks)
  function performCut(ax, ay, bx, by) {
    const plan = planCut(ax, ay, bx, by);
    if (plan.miss !== undefined) { if (plan.miss) toast(plan.miss); return false; }
    installWorld(plan.next, plan.sep, plan, 0.75, 0.35);
    return true;
  }

  // Rebuild the simulation and the GPU buffers for a new set of pieces, carrying the current
  // positions and velocities across by interpolation in the shared rest frame — unless the new
  // pieces are a different look, which has nothing to carry over.
  function installWorld(nextPieces, sep = [], pre = null, sepSpeed = 0.75, hop = 0.35, carry = true) {
    if (drag.mode === 'grab') { sim.endGrab(); drag.mode = null; }
    const old = sim;
    const w = pre ? pre.world : buildWorld(nextPieces);
    const ns = pre ? pre.sim : new SoftBody(w.sim, { firmness: old.firmness, damping: old.damping, material });
    ns.firmness = old.firmness; ns.damping = old.damping; ns.setMaterial(material);
    if (carry) {
      const e = embed(old.rest, old.tets, ns.rest);
      // rigid pieces are carried over whole, soft ones particle by particle
      if (ns.rigid) ns.carrySolids(old, e.tetOf);
      else for (let i = 0; i < ns.n; i++) {
        const t = e.tetOf[i];
        for (let k = 0; k < 3; k++) {
          let xs = 0, vs = 0;
          for (let j = 0; j < 4; j++) { const q = old.tets[4 * t + j]; xs += old.x[3 * q + k] * e.w[4 * i + j]; vs += old.v[3 * q + k] * e.w[4 * i + j]; }
          ns.x[3 * i + k] = xs; ns.v[3 * i + k] = vs;
        }
        if (ns.x[3 * i + 1] < 0) ns.x[3 * i + 1] = 0;
      }
      // the heat and the burns stay with the matter they are in
      if (old.marked) {
        for (let i = 0; i < ns.n; i++) {
          const t = e.tetOf[i];
          let h = 0, c = 0;
          for (let j = 0; j < 4; j++) { const q = old.tets[4 * t + j]; h += old.heat[q] * e.w[4 * i + j]; c += old.char[q] * e.w[4 * i + j]; }
          ns.heat[i] = Math.min(1, Math.max(0, h)); ns.char[i] = Math.min(1, Math.max(0, c));
        }
        ns.hot = old.hot; ns.marked = true;
        ns.remelt();
      }
      for (const sp of sep) for (let i = 0; i < ns.n; i++) if (ns.comp[i] === sp.piece) {
        ns.v[3 * i] += sp.dir[0] * sepSpeed; ns.v[3 * i + 1] += Math.abs(sp.dir[1]) * 0.2 * hop + hop; ns.v[3 * i + 2] += sp.dir[2] * sepSpeed;
      }
      ns.prev.set(ns.x);
    }
    pieces = nextPieces; world = w; sim = ns;
    sim.blade = blade; sim.pushers = pushers;
    blade.side = new Int8Array(sim.nComp);
    for (const sp of sep) blade.side[sp.piece] = Math.sign(sp.dir[0] * blade.n[0] + sp.dir[2] * blade.n[2]) || 0;
    renderMesh = w.render; nV = renderMesh.rest.length / 3;
    skinIdx = w.skinIdx; skinW = w.skinW; index = renderMesh.index; bodyTriEnd = renderMesh.body.count; vComp = renderMesh.vComp;
    renderer.setMesh(renderMesh, sim.edges, sim.n);
    dyn = renderer.dyn;
    window.__jelly.sim = sim;
    $('#piecesOut').textContent = String(pieces.length);
    hoverDirty = true;
  }

  // ── the visible knife: hovers under the pointer, lines up over the stroke, then cuts ──
  const knifeMesh = buildKnifeMesh();
  const toolMesh = { torch: buildTorchMesh(), hammer: buildHammerMesh(), bat: buildBatMesh(), gun: buildGunMesh() };
  // every tool is a prop of the renderer's, posed here each frame; a rebuilt renderer needs them again
  const props = {};
  const mountProps = r => { props.knife = r.addProp(knifeMesh); for (const k in toolMesh) props[k] = r.addProp(toolMesh[k]); };
  mountProps(renderer);
  const HOVER_H = 0.42;                           // edge height above the top of the jelly while hovering
  const kp = { P: [0, SHAPE.T + HOVER_H + 1.4, 0.9], yaw: -0.62, roll: 0.16, pitch: 0.05 };
  const blade = { holdY: 0, mode: null, p: [0, 0, 0], d: [1, 0, 0], n: [0, 0, 1], a0: -KNIFE.xr, a1: KNIFE.Lb - KNIFE.xr, top: KNIFE.H * 0.95, halfGap: 0.03, side: null };
  sim.blade = blade;
  let knifeAnim = null, hoverSeen = false;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const lerp = (a, b, s) => a + (b - a) * s;
  const lerp3 = (a, b, s) => [lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s)];
  const ease = s => { s = Math.min(1, Math.max(0, s)); return s * s * (3 - 2 * s); };
  function knifeBasis(yaw, roll, pitch) {
    const d = [Math.cos(yaw), 0, Math.sin(yaw)], z = [-d[2], 0, d[0]];
    // roll about the blade (tips the face up toward the viewer), then pitch (tip down)
    const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const Y1 = [-sr * z[0], cr, -sr * z[2]], Z = [cr * z[0], sr, cr * z[2]];
    const X = [cp * d[0] - sp * Y1[0], cp * d[1] - sp * Y1[1], cp * d[2] - sp * Y1[2]];
    const Y = [sp * d[0] + cp * Y1[0], sp * d[1] + cp * Y1[1], sp * d[2] + cp * Y1[2]];
    return [X, Y, Z];
  }
  function poseKnife() {
    const [X, Y, Z] = knifeBasis(kp.yaw, kp.roll, kp.pitch);
    const out = props.knife.dyn, r = knifeMesh.rest, nr = knifeMesh.nrm, P = kp.P, xr = KNIFE.xr;
    for (let v = 0, o = 0; v < r.length; v += 3, o += 6) {
      const lx = r[v] - xr, ly = r[v + 1], lz = r[v + 2];
      out[o] = P[0] + X[0] * lx + Y[0] * ly + Z[0] * lz;
      out[o + 1] = P[1] + X[1] * lx + Y[1] * ly + Z[1] * lz;
      out[o + 2] = P[2] + X[2] * lx + Y[2] * ly + Z[2] * lz;
      const nx = nr[v], ny = nr[v + 1], nz = nr[v + 2];
      out[o + 3] = X[0] * nx + Y[0] * ny + Z[0] * nz;
      out[o + 4] = X[1] * nx + Y[1] * ny + Z[1] * nz;
      out[o + 5] = X[2] * nx + Y[2] * ny + Z[2] * nz;
    }
  }
  // where the knife wants to be when it is not cutting
  function hoverPose() {
    let q = hoverSeen ? rayPlaneY(rayFrom(hoverX, hoverY), SHAPE.T + HOVER_H) : null;
    if (q) { const dx = q[0] - target[0], dz = q[2] - target[2], dl = Math.hypot(dx, dz); if (dl > 3) { q[0] = target[0] + dx / dl * 3; q[2] = target[2] + dz / dl * 3; } }
    if (!q) { const c = sim.centroid(); q = [c[0] + 0.1, SHAPE.T + HOVER_H, c[2] + 0.25]; }
    return { P: q, yaw: camRightYaw(), roll: 0.16, pitch: 0.05 };
  }
  // while the stroke is being drawn: lined up over it, edge just above the jelly
  function strokePose() {
    const h = SHAPE.T + 0.1;
    const A = rayPlaneY(rayFrom(knife.ax, knife.ay), h), B = rayPlaneY(rayFrom(knife.bx, knife.by), h);
    if (!A || !B) return hoverPose();
    const dl = Math.hypot(B[0] - A[0], B[2] - A[2]);
    const yaw = dl > 0.08 ? canonicalYaw(B[0] - A[0], B[2] - A[2]) : kp.yaw;
    return { P: [(A[0] + B[0]) / 2, h, (A[2] + B[2]) / 2], yaw, roll: 0.08, pitch: 0 };
  }
  function easeToward(pose, k) {
    kp.P = lerp3(kp.P, pose.P, k);
    kp.yaw += wrapA(pose.yaw - kp.yaw) * k;
    kp.roll = lerp(kp.roll, pose.roll, k); kp.pitch = lerp(kp.pitch, pose.pitch, k);
  }
  // the cut, as a little piece of choreography (seconds)
  const KT = { align: 0.16, press: 0.42, through: 0.6, hold: 0.7, lift: 1.08 };
  function startCut(plan) {
    knifeAnim = { t: 0, plan, from: { P: kp.P.slice(), yaw: kp.yaw, roll: kp.roll, pitch: kp.pitch }, committed: false };
  }
  function runKnifeAnim(dt) {
    const a = knifeAnim, pl = a.plan;
    a.t += dt;
    const t = a.t, d = [Math.cos(pl.yaw), 0, Math.sin(pl.yaw)], M = pl.M;
    const at = (s, y) => [M[0] + d[0] * s, y, M[2] + d[2] * s];
    const P1 = at(-0.12, pl.yTop + 0.1), P2 = at(0.0, pl.yTop - material.press), P3 = at(0.2, 0.004);
    if (t < KT.align) {
      const s = ease(t / KT.align);
      kp.P = lerp3(a.from.P, P1, s);
      kp.yaw = a.from.yaw + wrapA(pl.yaw - a.from.yaw) * s;
      kp.roll = lerp(a.from.roll, 0, s); kp.pitch = lerp(a.from.pitch, 0, s);
      blade.mode = null;
    } else if (t < KT.press) {
      // the edge meets the body and pushes it down — as far as the material yields — before it gives
      const s = (t - KT.align) / (KT.press - KT.align);
      kp.P = lerp3(P1, P2, s * s); kp.yaw = pl.yaw; kp.roll = 0; kp.pitch = 0;
      blade.mode = 'press';
    } else if (t < KT.hold) {
      if (!a.committed) {
        a.committed = true;
        blade.n = [-d[2], 0, d[0]];
        blade.holdY = kp.P[1];
        const tc = performance.now();
        installWorld(pl.next, pl.sep, pl, 0.22, 0);
        window.__jelly.lastCommitMs = performance.now() - tc;
      }
      const s = 1 - Math.pow(1 - Math.min(1, (t - KT.press) / (KT.through - KT.press)), 2);
      kp.P = lerp3(P2, P3, s);
      blade.halfGap = 0.012 + 0.02 * s;
      blade.mode = 'split';
    } else if (t < KT.lift) {
      blade.mode = null;
      const s = ease((t - KT.hold) / (KT.lift - KT.hold));
      const h = state.tool === 'knife' ? hoverPose() : { P: [P3[0], P3[1] + 2.5, P3[2]], yaw: pl.yaw, roll: 0.3, pitch: 0.05 };
      kp.P = lerp3(P3, h.P, s);
      kp.yaw = pl.yaw + wrapA(h.yaw - pl.yaw) * s;
      kp.roll = lerp(0, h.roll, s); kp.pitch = lerp(0, h.pitch, s);
    } else {
      knifeAnim = null; blade.mode = null;
    }
  }
  function updateKnife(dt, animDt) {
    if (state.tool !== 'knife' && !knifeAnim) { props.knife.visible = false; blade.mode = null; return; }
    if (knifeAnim) runKnifeAnim(animDt);
    else easeToward(drag.mode === 'knife' ? strokePose() : hoverPose(), 1 - Math.exp(-dt * 16));
    blade.p = kp.P; blade.d = [Math.cos(kp.yaw), 0, Math.sin(kp.yaw)];
    if (!knifeAnim || !knifeAnim.committed) blade.n = [-blade.d[2], 0, blade.d[0]];
    poseKnife();
    props.knife.visible = true;
  }
  // ── the other tools: blowtorch, hammer, bat, pistol ──
  // Each is a prop that follows the spot the pointer is on, and a short piece of choreography when
  // it is used. What comes of it — how far the body gives, what flies off, what is left behind and
  // what it sounds like — is up to the material (see materials.js).
  const particles = new Particles();
  const pushers = [];
  sim.pushers = pushers;
  const up3 = [0, 1, 0];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const near3 = (p, r) => [p[0] + rnd(-r, r), p[1] + rnd(-r, r), p[2] + rnd(-r, r)];
  const camRight = () => [Math.cos(state.az), 0, -Math.sin(state.az)];
  const camNear = () => [Math.sin(state.az), 0, Math.cos(state.az)];   // level, toward the viewer
  // a frame whose x axis runs along d, with y as near to straight up as that allows
  const frameAlong = d => { const Z = norm3(cross3(d, up3)); return [d, cross3(Z, d), Z]; };
  function poseProp(name, P, X, Y, Z, slide = 0) {
    const m = toolMesh[name], out = props[name].dyn, r = m.rest, nr = m.nrm, part = m.part;
    for (let v = 0, o = 0, i = 0; v < r.length; v += 3, o += 6, i++) {
      const lx = r[v] + (part[i] ? slide : 0), ly = r[v + 1], lz = r[v + 2];
      out[o] = P[0] + X[0] * lx + Y[0] * ly + Z[0] * lz;
      out[o + 1] = P[1] + X[1] * lx + Y[1] * ly + Z[1] * lz;
      out[o + 2] = P[2] + X[2] * lx + Y[2] * ly + Z[2] * lz;
      const nx = nr[v], ny = nr[v + 1], nz = nr[v + 2];
      out[o + 3] = X[0] * nx + Y[0] * ny + Z[0] * nz;
      out[o + 4] = X[1] * nx + Y[1] * ny + Z[1] * nz;
      out[o + 5] = X[2] * nx + Y[2] * ny + Z[2] * nz;
    }
    props[name].visible = true;
  }

  // what blows and bullets leave on the body, in the rest plane — so they stay where they are on
  // the drawing, whatever is cut from it (the newest replace the oldest).
  // kinds: keep in step with marks() in shaders.js
  const MARK = { hole: 1, dent: 2, scuff: 3 };
  const marks = new Float32Array(MAX_MARKS * 4);
  let markN = 0, markAt = 0;
  function addMark(uw, radius, kind) {
    marks.set([uw[0], uw[1], radius, kind], 4 * markAt);
    markAt = (markAt + 1) % MAX_MARKS; markN = Math.min(markN + 1, MAX_MARKS);
  }
  // the point of the drawing under the last pick…
  function pickedRest() {
    const tex = renderMesh.tex, a = 2 * index[lastPickTri], b = 2 * index[lastPickTri + 1], c = 2 * index[lastPickTri + 2], w = 1 - lastPickU - lastPickV;
    return [tex[a] * w + tex[b] * lastPickU + tex[c] * lastPickV, tex[a + 1] * w + tex[b + 1] * lastPickU + tex[c + 1] * lastPickV];
  }
  // …and the point of it that the world point p shows, on piece c — as near as the piece's own frame can tell
  function restOf(p, c) {
    const F = sim.pieceFrame(c), R = F.R, d = sub3(p, F.cw);
    return [R[0] * d[0] + R[3] * d[1] + R[6] * d[2] + F.cr[0], R[2] * d[0] + R[5] * d[1] + R[8] * d[2] + F.cr[2]];
  }
  // one moving light, for whatever is brightest just now: the flame, a muzzle flash, a shower of sparks
  const lamp = { p: [0, 1, 0], col: [0, 0, 0], fall: 2 };
  function flash(p, col, fall) { lamp.p = p; lamp.col = col; lamp.fall = fall; }
  function clearTraces() { markN = markAt = 0; particles.clear(); lamp.col = [0, 0, 0]; }

  // where a tool points: the spot under the pointer — on the body if it is there, else on the table.
  // p follows it smoothly (k: how much of the way it goes this frame); raw is the spot itself.
  const aim = { p: [0, SHAPE.T, 1], raw: [0, SHAPE.T, 1], on: false, comp: -1, lift: 0 };
  function takeAim(k) {
    let p = null, on = false;
    if (hoverSeen) {
      const ray = rayFrom(hoverX, hoverY);
      p = pick(ray); on = !!p;
      if (!p) {
        p = rayPlaneY(ray, 0);
        if (p) { const dx = p[0] - target[0], dz = p[2] - target[2], dl = Math.hypot(dx, dz); if (dl > 3.4) { p[0] = target[0] + dx / dl * 3.4; p[2] = target[2] + dz / dl * 3.4; } }
      }
    }
    if (!p) { const c = sim.centroid(); p = [c[0], c[1] + SHAPE.T / 2, c[2]]; }
    aim.raw = p; aim.on = on; aim.comp = on ? vComp[index[lastPickTri]] : -1;
    aim.p = lerp3(aim.p, p, k);
  }

  // what flies off the body where it is struck: n of them from p, mostly along d
  const spray = (d, wide, speed) => { const v = norm3([d[0] + rnd(-wide, wide), d[1] + rnd(-wide, wide), d[2] + rnd(-wide, wide)]), s = speed * rnd(0.35, 1); return [v[0] * s, v[1] * s, v[2] * s]; };
  const debris = {
    // jelly: drops of itself
    drops(p, d, n, speed) {
      const c = FOX.tint.map(v => srgbToLin(v / 255) * 0.9);
      for (let k = 0; k < n; k++) { const s = rnd(0.016, 0.036); particles.emit({ p: near3(p, 0.05), v: spray(d, 0.8, speed), life: rnd(0.5, 0.9), s0: s, s1: s * 0.7, c0: c, c1: c, a0: 0.8, a1: 0.6, grav: 1, drag: 0.4, hard: true, bounce: 0.05 }); }
    },
    // rubber, and the table: a puff of dust
    dust(p, d, n, speed) {
      for (let k = 0; k < n; k++) particles.emit({ p: near3(p, 0.04), v: spray(d, 0.9, speed * 0.5), life: rnd(0.35, 0.6), s0: 0.04, s1: rnd(0.11, 0.17), c0: [0.5, 0.48, 0.45], c1: [0.6, 0.58, 0.55], a0: 0.26, a1: 0, drag: 6 });
    },
    // styrofoam: loose beads, all but weightless
    crumbs(p, d, n, speed) {
      const c = [0.92, 0.92, 0.9];
      for (let k = 0; k < n; k++) { const s = rnd(0.011, 0.022); particles.emit({ p: near3(p, 0.06), v: spray(d, 0.9, speed), life: rnd(1.2, 2.4), s0: s, s1: s, c0: c, c1: c, a0: 1, a1: 1, grav: 0.3, drag: 2.6, hard: true, bounce: 0.35 }); }
    },
    // metal: sparks
    sparks(p, d, n, speed) {
      for (let k = 0; k < n; k++) particles.emit({ p: near3(p, 0.02), v: spray(d, 0.9, speed * 1.6), life: rnd(0.18, 0.5), s0: 0.011, s1: 0.004, c0: [7, 3.6, 1.1], c1: [3, 0.6, 0.05], glow: true, grav: 0.7, drag: 1.2, streak: 0.03, bounce: 0.45 });
      flash(add3(p, up3, 0.1), [1.5, 0.95, 0.4], 3);
    },
  };
  // the body has been struck at p by something coming along dir: what flies off (n, at up to
  // `speed`), and how it sounds (how loud, how high)
  function struck(p, dir, n, speed, loud, pitch) {
    debris[material.debris](p, norm3([-dir[0] * 0.5, Math.abs(dir[1]) * 0.5 + 0.6, -dir[2] * 0.5]), n, speed);
    SFX.hit(material.id, loud, pitch);
  }
  // a thin bright line from a along d: the path of a bullet, gone almost before it is seen
  function tracer(a, d, len) {
    particles.emit({ p: add3(a, d, len / 2), v: d, life: 0.07, s0: 0.009, s1: 0.004, c0: [4.5, 3.6, 2], c1: [2, 1.2, 0.4], glow: true, streak: len / 2 });
  }

  // What is hot enough to burn goes on smoking after the flame has left it — and, if the material
  // holds a flame, burning. A few particles of the body are looked at each frame.
  function smoulder(adt) {
    const m = material;
    if (!sim.hot || adt <= 0 || !m.fume) return;
    const tries = 24, per = sim.n / tries * adt, x = sim.x, c = m.fume;
    for (let k = 0; k < tries; k++) {
      const i = (Math.random() * sim.n) | 0, h = sim.heat[i];
      if (h <= m.ignite) continue;
      const p = [x[3 * i], x[3 * i + 1] + 0.04, x[3 * i + 2]];
      if (Math.random() < h * m.fumes * per) particles.emit({ p: near3(p, 0.05), v: [rnd(-0.12, 0.12), rnd(0.5, 1), rnd(-0.12, 0.12)], life: rnd(0.7, 1.4), s0: 0.04, s1: rnd(0.14, 0.24), c0: c, c1: c, a0: c[3], a1: 0, grav: -0.04, drag: 0.7, swell: 0.12 });
      if (h > 0.55 && Math.random() < h * m.flame * 3 * per) particles.emit({ p: near3(p, 0.04), v: [rnd(-0.1, 0.1), rnd(0.5, 1.1), rnd(-0.1, 0.1)], life: rnd(0.18, 0.34), s0: rnd(0.04, 0.065), s1: 0.012, c0: [1.6, 0.8, 0.1], c1: [1, 0.16, 0.01], glow: true, cover: 0.9, hard: 0.4, grav: -0.25 });
    }
  }

  // ── blowtorch: held down, it plays a flame on the spot the pointer is on ──
  const torch = { on: false, due: 0, lick: 0 };
  function lightTorch(on) {
    on = !!on && state.tool === 'torch' && !state.paused;
    if (on === torch.on) return;
    torch.on = on;
    SFX.torch(on);
  }
  function updateTorch(adt) {
    const r = camRight(), c = camNear();
    const off = norm3([r[0] * 0.5 + c[0] * 0.3, 0.7, r[2] * 0.5 + c[2] * 0.3]);
    const N = add3(aim.p, off, TORCH.reach), X = [-off[0], -off[1], -off[2]];
    N[1] += aim.lift;
    poseProp('torch', N, ...frameAlong(X));
    if (!torch.on || adt <= 0) return;
    // The flame is a jet of glowing blobs, each living just long enough to reach whatever is in its
    // way: blue ones where it leaves the nozzle, a pale core, and an orange mantle round that.
    const hit = pick({ o: N, d: X });
    const reach = hit ? Math.hypot(...sub3(hit, N)) : Infinity;
    const len = Math.min(TORCH.flame, reach, -N[1] / X[1]), end = add3(N, X, len);
    for (torch.due += adt * 280; torch.due >= 1; torch.due--) {
      const sp = rnd(4.4, 6.2), v = norm3([X[0] + rnd(-0.06, 0.06), X[1] + rnd(-0.06, 0.06), X[2] + rnd(-0.06, 0.06)]).map(q => q * sp);
      const kind = Math.random();
      if (kind < 0.2) particles.emit({ p: add3(N, X, rnd(0, 0.03)), v, life: 0.4 * len / sp, s0: 0.022, s1: 0.03, c0: [0.15, 0.5, 2.2], c1: [0.2, 0.4, 1.3], glow: true, cover: 0.9, hard: 0.5, streak: 0.012 });
      else if (kind < 0.5) particles.emit({ p: add3(N, X, rnd(0.03, 0.1)), v, life: 0.75 * len / sp, s0: 0.016, s1: 0.034, c0: [1.9, 1.6, 0.75], c1: [1.7, 0.9, 0.12], glow: true, cover: 0.9, hard: 0.5, streak: 0.014 });
      else particles.emit({ p: add3(N, X, rnd(0.02, 0.1)), v, life: (len + 0.04) / sp, s0: 0.022, s1: rnd(0.05, 0.075), c0: [1.5, 0.62, 0.06], c1: [0.95, 0.16, 0.01], glow: true, cover: 0.9, hard: 0.4, streak: 0.012 });
    }
    // where it meets something, it spreads out over it
    if (len < TORCH.flame - 0.01) for (torch.lick += adt * 90; torch.lick >= 1; torch.lick--) {
      const a = rnd(0, 2 * Math.PI), s = rnd(0.8, 2.2);
      particles.emit({ p: add3(end, up3, 0.02), v: [Math.cos(a) * s, rnd(0.15, 0.9), Math.sin(a) * s], life: rnd(0.1, 0.22), s0: 0.03, s1: 0.075, c0: [1.6, 0.75, 0.08], c1: [0.95, 0.15, 0.01], glow: true, cover: 0.85, hard: 0.4, drag: 3 });
    }
    const flicker = rnd(0.85, 1.15);
    flash(add3(end, up3, 0.15), [1.0 * flicker, 0.5 * flicker, 0.16 * flicker], 2.2);
    if (hit && reach <= TORCH.flame) {
      sim.heatAt(hit, 0.3, material.heatUp * adt);
      if (Math.random() < adt * 26) SFX.sizzle(material.id);
    }
  }

  // ── hammer: comes down on the spot the pointer is on ──
  // A soft body is pressed in under the face (see SoftBody.solvePushers) and springs back; a rigid
  // one takes the blow as it is.
  const hammer = { t: -1, hit: false, th: 0, th0: 0, p: null, soft: false, depth: 0, bounce: 0 };
  const HAMMER_REST = 0.62, HAMMER_BACK = 1.25;   // how far the head is raised while it waits, and at the top of the swing (rad)
  const HAMMER_HOLD = 0.1;   // how long it stays pressed down at the bottom, like a hydraulic press (s)
  const HAMMER_BLOW = 20;   // how hard it strikes a rigid piece (times the material's `blow`)
  const HAMMER_DENT = 2.6;   // how deep it dents a rigid piece, as a share of its thickness (times the material's `dent`)
  // the hammer turned up by th about the hand, which is placed so that at th = 0 the face lies flat
  // on p (or `sink` below it): the hand, the frame, and where the face is
  function hammerPose(p, th, sink) {
    const r = camRight(), c = camNear(), hd = norm3([r[0] * 0.82 + c[0] * 0.57, 0, r[2] * 0.82 + c[2] * 0.57]);   // from the head back to the hand
    const { L, face } = HAMMER, ct = Math.cos(th), st = Math.sin(th);
    const G = [p[0] + hd[0] * L, p[1] + face - sink, p[2] + hd[2] * L];
    const X = [-hd[0] * ct, st, -hd[2] * ct], Y = [hd[0] * st, ct, hd[2] * st];
    return { G, X, Y, Z: cross3(X, Y), f: [G[0] + X[0] * L - Y[0] * face, G[1] + X[1] * L - Y[1] * face, G[2] + X[2] * L - Y[2] * face] };
  }
  // seconds since it landed, with the time it is held down at the bottom taken out
  const hammerClock = t => t < 0.07 ? t : Math.max(0.07, t - HAMMER_HOLD);
  // how deep the face is in a soft body, t (hammerClock) seconds after it landed: in, a moment's rest, out again
  const hammerSink = t => hammer.depth * (t < 0.07 ? 1 - (1 - t / 0.07) ** 2 : t < 0.13 ? 1 : 1 - ease((t - 0.13) / 0.16));
  function landHammer(f, c) {
    const m = material, h = hammer;
    h.soft = c >= 0 && !sim.rigid;
    h.depth = h.soft ? Math.min(0.92, m.squash * 2.4) * SHAPE.T : 0;   // crushed nearly flat
    h.bounce = c < 0 ? 0.12 : m.rebound * 0.45;
    if (c < 0) { SFX.thud(1.6); debris.dust(f, up3, 16, 2.4); return; }   // the table
    if (!h.soft) {
      // a rigid piece takes it whole: down — and so, off-centre, up at its far end — and keeps the dent
      sim.punch(c, f, [0, -1, 0], HAMMER_BLOW * m.blow);
      const q = restOf(f, c);
      if (m.dent) sim.dent(c, q, HAMMER.R * 1.35, Math.min(0.6, m.dent * HAMMER_DENT) * SHAPE.T);
      addMark(q, m.dent * 2.2, MARK.dent);
    }
    struck(f, [0, -1, 0], 40, 4.5, 1.6, 0.7);
  }
  function updateHammer(adt) {
    const h = hammer;
    let p = aim.p, th = HAMMER_REST, sink = -aim.lift;
    if (h.t >= 0) {
      h.t += adt;
      p = h.p; sink = 0;
      if (!h.hit) {
        // back, then down, faster and faster, until the face meets something
        const s = h.t / 0.09;
        th = s < 1 ? lerp(HAMMER_REST, HAMMER_BACK, ease(s)) : HAMMER_BACK * (1 - ((h.t - 0.09) / 0.1) ** 2);
        const f = hammerPose(p, th, 0).f;
        let top = sim.topUnder(f[0], f[2], HAMMER.R);
        const c = top > 0 ? sim.topComp : -1;
        if (c < 0) top = 0;
        if (s >= 1 && f[1] <= top) {
          // it has landed somewhere on the way from last frame's angle to this one's: find where
          let lo = th, hi = h.th;
          for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (hammerPose(p, mid, 0).f[1] > top) hi = mid; else lo = mid; }
          th = hi;
          landHammer(hammerPose(p, th, 0).f, c);
          h.hit = true; h.t = 0; h.th0 = th;
        }
        h.th = th;
      }
      if (h.hit) {
        // it rests where it landed — sunk in, if the body gave — then is thrown back as hard as
        // the material does that, and returns to the pointer
        const t = hammerClock(h.t), u = Math.min(1, t / 0.55);
        sink = hammerSink(t);
        th = h.th0 + (HAMMER_REST - h.th0) * ease((t - 0.1) / 0.45) + h.bounce * Math.sin(Math.PI * Math.pow(u, 0.6)) * (1 - u);
        p = lerp3(h.p, aim.p, ease((t - 0.2) / 0.35));
        if (h.soft && t < 0.3) {
          const f = hammerPose(p, th, sink).f;
          pushers.push({ c: f, r: HAMMER.R, h: HAMMER.head, vy: -(hammerSink(hammerClock(h.t + sim.stepDt)) - sink) / sim.stepDt, touched: 0 });
        }
        if (t >= 0.58) h.t = -1;
      }
    }
    const q = hammerPose(p, th, sink);
    poseProp('hammer', q.G, q.X, q.Y, q.Z);
  }

  // ── baseball bat: swings level through the spot the pointer is on ──
  // The blow goes from the pointer's side of the piece toward its middle, so where it is hit
  // chooses which way it flies. The bat is given by where its knob is (O) and which way it points,
  // seen from above (psi); it always dips a little toward the barrel.
  const bat = { t: -1, O: [0, 1, 1], psi: 0, d: [1, 0, 0], F: null, from: null, phi: 0, hit: false, w: 0, at: 0 };
  const BAT_REST = -0.5, BAT_BACK = -1.9, BAT_END = 1.2, BAT_DIP = 0.16, BAT_PULL = 67;   // angles of the swing (rad; 0 is where it meets the spot), and how hard it is pulled round (rad/s²)
  const bonkEl = $('#bonk');
  function bonk(p) {
    const r = canvas.getBoundingClientRect(), M = cam.viewProj;
    const w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    bonkEl.style.left = `${((M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12]) / w * 0.5 + 0.5) * r.width}px`;
    bonkEl.style.top = `${(0.5 - (M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13]) / w * 0.5) * r.height}px`;
    bonkEl.style.setProperty('--tilt', `${rnd(-16, 16)}deg`);
    bonkEl.classList.remove('on'); void bonkEl.offsetWidth;   // a second one restarts the animation
    bonkEl.classList.add('on');
  }
  // which way a blow at the spot aimed at would go
  function batDir() {
    if (!aim.on) return camRight();
    const c = sim.pieceCentre(aim.comp), dx = c[0] - aim.raw[0], dz = c[2] - aim.raw[2], dl = Math.hypot(dx, dz);
    return dl > 0.2 ? [dx / dl, 0, dz / dl] : bat.d;   // (dead centre: as before)
  }
  // The swing that sends the spot p along d. The bat lies across d as it passes p — handle toward
  // the viewer — and turns about its knob: O is where that is, psi0 the way it points at that
  // moment, and sgn the sense it turns in.
  function batSwing(p, d) {
    let a = [-d[2], 0, d[0]], sgn = 1;
    const n = camNear(), r = camRight();
    if (a[0] * (n[0] + 0.35 * r[0]) + a[2] * (n[2] + 0.35 * r[2]) > 0) { a = [d[2], 0, -d[0]]; sgn = -1; }
    const reach = BAT.sweet * Math.cos(BAT_DIP);
    // the barrel meets the middle of the slab, and clears the table
    const y = Math.max(BAT.R + 0.04, p[1] - SHAPE.T / 2) + BAT.sweet * Math.sin(BAT_DIP);
    return { O: [p[0] - a[0] * reach, y, p[2] - a[2] * reach], psi0: Math.atan2(a[2], a[0]), sgn };
  }
  function batPose(O, psi) {
    const ct = Math.cos(BAT_DIP), st = Math.sin(BAT_DIP), cx = Math.cos(psi), cz = Math.sin(psi);
    const X = [cx * ct, -st, cz * ct], Y = [cx * st, ct, cz * st];
    return { O, X, Y, Z: cross3(X, Y) };
  }
  function landBat(hits, q, sgn) {
    const m = material;
    // the barrel is travelling level, across the bat; what it hits goes that way, and up a little
    const dir = norm3([sgn * q.X[2], 0.28, -sgn * q.X[0]]);
    let first = null;
    for (const [c, h] of hits) {
      const p = [h[1], h[2], h[3]];
      if (sim.rigid) sim.punch(c, p, dir, 8 * m.blow); else sim.whack(p, dir, 9, 0.75, m.carry, c);
      if (m.dent) addMark(restOf(p, c), m.dent * 0.9, MARK.dent);
      struck(p, dir, 12, 4, 1, 0.85);
      first = first || p;
    }
    SFX.bonk(); bonk(first);
    // what the blow leaves the bat: a slow follow-through, or — off something springy — a jump back
    bat.w = 2.2 * (1 - 2.4 * m.rebound);
  }
  function updateBat(dt, adt) {
    const b = bat, k = 1 - Math.exp(-dt * 12);
    // where it waits: drawn back a little, ready to go through the spot aimed at
    const want = batDir(), ang = Math.atan2(b.d[2], b.d[0]) + wrapA(Math.atan2(want[2], want[0]) - Math.atan2(b.d[2], b.d[0])) * k;
    b.d = [Math.cos(ang), 0, Math.sin(ang)];
    const W = batSwing(aim.p, b.d), restO = [W.O[0], W.O[1] + 0.12 + aim.lift, W.O[2]], restPsi = W.psi0 - W.sgn * BAT_REST;
    if (b.t < 0) {
      b.O = lerp3(b.O, restO, k); b.psi += wrapA(restPsi - b.psi) * k;
    } else {
      b.t += adt;
      const F = b.F, t = b.t;
      if (t < 0.1) {
        // back
        const s = ease(t / 0.1);
        b.O = lerp3(b.from.O, F.O, s); b.psi = b.from.psi + wrapA(F.psi0 - F.sgn * BAT_BACK - b.from.psi) * s;
        b.phi = BAT_BACK;
      } else if (!b.hit && b.phi < BAT_END) {
        // round, faster and faster, until the barrel runs into something — looked for at every
        // few centimetres of its way, since it covers a good deal of ground between two frames
        const to = Math.min(BAT_END, BAT_BACK + 0.5 * BAT_PULL * (t - 0.1) ** 2), steps = Math.max(1, Math.ceil((to - b.phi) / 0.05));
        for (let i = 1; i <= steps && !b.hit; i++) {
          const phi = b.phi + (to - b.phi) * i / steps, q = batPose(F.O, F.psi0 - F.sgn * phi);
          const hits = phi > -1 ? sim.rodHits(add3(q.O, q.X, BAT.from), add3(q.O, q.X, BAT.L - 0.06), BAT.R + 0.02) : null;
          if (hits && hits.size) { landBat(hits, q, F.sgn); b.hit = true; b.at = t; b.phi = phi; }
        }
        if (!b.hit) b.phi = to;
        if (!b.hit && b.phi >= BAT_END) { b.at = t; b.w = 0; }
        b.O = F.O; b.psi = F.psi0 - F.sgn * b.phi;
      } else {
        // after the blow (or the miss): what is left of the swing runs out, and the bat comes back
        const s = t - b.at, back = ease((s - 0.22) / 0.4);
        const phi = b.phi + b.w / 6 * (1 - Math.exp(-6 * s));
        b.O = lerp3(F.O, restO, back); b.psi = F.psi0 - F.sgn * phi + wrapA(restPsi - (F.psi0 - F.sgn * phi)) * back;
        if (s >= 0.62) b.t = -1;
      }
    }
    const q = batPose(b.O, b.psi);
    poseProp('bat', q.O, q.X, q.Y, q.Z);
  }

  // ── pistol: three shots at the spot the pointer is on, each a little off the last ──
  const gun = { t: -1, shots: 0, kick: 0, slide: 0 };
  function fire(M, X, Y, Z) {
    const m = material, a = rnd(0, 2 * Math.PI), s = rnd(0, 0.075);
    const d = norm3(sub3(add3(add3(aim.p, Y, Math.cos(a) * s), Z, Math.sin(a) * s), M));
    const hit = pick({ o: M, d });
    const c = hit ? vComp[index[lastPickTri]] : -1, uw = hit ? pickedRest() : null;
    const end = hit || add3(M, d, d[1] < -1e-3 ? -M[1] / d[1] : 6);
    gun.kick = 1; gun.slide = 1;
    SFX.shot();
    // at the muzzle: the flash, a wisp of smoke, and the spent case thrown clear
    flash(add3(M, d, 0.1), [2.4, 1.8, 0.95], 2.5);
    particles.emit({ p: add3(M, d, 0.08), v: [0, 0, 0], life: 0.07, s0: 0.3, s1: 0.2, c0: [1.2, 0.8, 0.35], c1: [0.6, 0.25, 0.05], glow: true });
    for (let k = 0; k < 6; k++) particles.emit({ p: add3(M, d, 0.02 + 0.042 * k), v: [d[0] * k, d[1] * k, d[2] * k], life: 0.06, s0: 0.1 - 0.013 * k, s1: 0.05 - 0.006 * k, c0: [3, 2.5, 1.5], c1: [1.8, 0.8, 0.1], glow: true, cover: 0.9, hard: 0.45 });
    for (let k = 0; k < 3; k++) particles.emit({ p: add3(M, d, 0.08), v: near3([d[0], d[1] + 0.4, d[2]], 0.5), life: rnd(0.4, 0.7), s0: 0.04, s1: 0.13, c0: [0.6, 0.6, 0.6], c1: [0.6, 0.6, 0.6], a0: 0.2, a1: 0, drag: 3, swell: 0.04 });
    const e = GUN.eject, out = rnd(1.4, 2.2), upw = rnd(1.6, 2.4), backw = rnd(-0.6, -0.1);
    particles.emit({
      p: [M[0] + X[0] * e[0] + Y[0] * e[1] + Z[0] * e[2], M[1] + X[1] * e[0] + Y[1] * e[1] + Z[1] * e[2], M[2] + X[2] * e[0] + Y[2] * e[1] + Z[2] * e[2]],
      v: [Z[0] * out + Y[0] * upw + X[0] * backw, Z[1] * out + Y[1] * upw + X[1] * backw, Z[2] * out + Y[2] * upw + X[2] * backw],
      life: 1.6, s0: 0.016, s1: 0.016, c0: [0.75, 0.52, 0.2], c1: [0.75, 0.52, 0.2], a0: 1, a1: 1, grav: 1, hard: true, bounce: 0.4, streak: 0.012,
    });
    tracer(M, d, Math.hypot(...sub3(end, M)));
    if (c < 0) { SFX.thud(0.35); debris.dust(end, up3, 4, 1.2); return; }   // into the table
    // a soft body takes it where it lands — deep, if it is turned away; a rigid piece takes it whole
    if (sim.rigid) sim.punch(c, hit, d, 2.4 * m.blow); else sim.whack(hit, d, m.pierce ? 3.2 : 7.5, m.pierce ? 0.22 : 0.26);
    addMark(uw, m.pierce ? 0.045 : 0.05, m.pierce ? MARK.hole : m.dent ? MARK.dent : MARK.scuff);
    struck(hit, d, m.pierce ? 7 : 9, 2.6, 0.6, 1.9);
    if (!m.pierce) {
      // turned away, the bullet goes off somewhere else
      tracer(hit, norm3([d[0] + rnd(-0.4, 0.4), Math.abs(d[1]) + rnd(0.1, 0.6), d[2] + rnd(-0.4, 0.4)]), 1.6);
      SFX.ricochet();
    }
  }
  function updateGun(adt) {
    const g = gun, r = camRight(), c = camNear();
    const off = norm3([r[0] * 0.72 + c[0] * 0.5, 0.5, r[2] * 0.72 + c[2] * 0.5]);
    const M = add3(aim.p, off, GUN.stand), [X, Y, Z] = frameAlong([-off[0], -off[1], -off[2]]);
    M[1] += aim.lift;
    g.kick *= Math.exp(-adt * 12); g.slide *= Math.exp(-adt * 30);
    if (g.t >= 0) {
      g.t += adt;
      while (g.shots < 3 && g.t >= g.shots * 0.13) { fire(M, X, Y, Z); g.shots++; }
      if (g.t > 0.6) g.t = -1;
    }
    // recoil: the gun turns up about the wrist and comes back a little, and the slide is thrown back
    const k = g.kick * 0.24, ck = Math.cos(k), sk = Math.sin(k), wx = -0.75, wy = -0.42;
    const Xk = [X[0] * ck + Y[0] * sk, X[1] * ck + Y[1] * sk, X[2] * ck + Y[2] * sk], Yk = [Y[0] * ck - X[0] * sk, Y[1] * ck - X[1] * sk, Y[2] * ck - X[2] * sk];
    const P = [0, 1, 2].map(i => M[i] + (X[i] - Xk[i]) * wx + (Y[i] - Yk[i]) * wy - X[i] * g.kick * 0.08);
    poseProp('gun', P, Xk, Yk, Z, -g.slide * GUN.travel);
  }

  // a press with one of them (the torch is held instead: see lightTorch)
  function useTool() {
    const t = state.tool;
    if (t === 'hammer' && hammer.t < 0) { hammer.t = 0; hammer.hit = false; hammer.th = HAMMER_REST; hammer.p = aim.raw.slice(); SFX.swish(0.8); }
    if (t === 'bat' && bat.t < 0) { bat.t = 0; bat.hit = false; bat.d = batDir(); bat.F = batSwing(aim.raw, bat.d); bat.from = { O: bat.O, psi: bat.psi }; SFX.swish(1); }
    if (t === 'gun' && gun.t < 0) { gun.t = 0; gun.shots = 0; }
  }
  function stopTools() {
    lightTorch(false);
    hammer.t = bat.t = gun.t = -1; gun.kick = gun.slide = 0;
    pushers.length = 0;
  }
  function updateTools(dt, adt) {
    for (const k in toolMesh) props[k].visible = false;
    pushers.length = 0;
    lamp.col = lamp.col.map(v => v * Math.exp(-dt * 22));
    smoulder(adt);
    const t = state.tool;
    if (!toolMesh[t]) return;
    takeAim(1 - Math.exp(-dt * 20));
    aim.lift *= Math.exp(-dt * 9);
    if (t === 'torch') updateTorch(adt); else if (t === 'hammer') updateHammer(adt); else if (t === 'bat') updateBat(dt, adt); else updateGun(adt);
  }

  // ── pointer interaction ──
  const drag = { mode: null, id: -1, plane: null, twist: 0, twist0: 0, second: null, lastX: 0, lastY: 0 };
  function rotMat(axis, ang) {
    const [x, y, z] = axis, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  function dragTarget(clientX, clientY) {
    const ray = rayFrom(clientX, clientY);
    const { p, n } = drag.plane;
    const den = ray.d[0] * n[0] + ray.d[1] * n[1] + ray.d[2] * n[2];
    if (Math.abs(den) < 1e-5) return null;
    const t = ((p[0] - ray.o[0]) * n[0] + (p[1] - ray.o[1]) * n[1] + (p[2] - ray.o[2]) * n[2]) / den;
    const q = [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t];
    // keep the grab within a generous but finite reach, and above the floor
    const dx = q[0] - target[0], dz = q[2] - target[2], lim = 3.4, dl = Math.hypot(dx, dz);
    if (dl > lim) { q[0] = target[0] + dx / dl * lim; q[2] = target[2] + dz / dl * lim; }
    q[1] = Math.min(Math.max(q[1], 0.02), 3.2);
    return q;
  }
  function applyGrab(x, y) {
    const q = dragTarget(x, y);
    if (q) sim.moveGrab(q, rotMat(cam.fwd, drag.twist));
  }
  canvas.addEventListener('pointerdown', e => {
    if (drag.mode === 'grab' && e.pointerId !== drag.id && e.pointerType === 'touch') {
      // second finger twists the grabbed patch
      drag.second = { id: e.pointerId, x: e.clientX, y: e.clientY };
      drag.twist0 = drag.twist - Math.atan2(e.clientY - drag.lastY, e.clientX - drag.lastX);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      return;
    }
    if (drag.mode) return;
    if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse') return;
    if (toolMesh[state.tool]) {
      // the other tools act where the pointer is: the torch for as long as it is held down, the rest once per press
      e.preventDefault();
      if (state.paused) return;
      SFX.unlock();
      hoverX = e.clientX; hoverY = e.clientY; hoverSeen = true;
      takeAim(1);   // (a finger arrives out of nowhere: no easing over from where the last one left)
      if (state.tool === 'torch') {
        drag.mode = 'torch'; drag.id = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
        lightTorch(true);
      } else useTool();
      return;
    }
    if (state.tool === 'knife') {
      if (state.paused || knifeAnim) { e.preventDefault(); return; }
      drag.mode = 'knife'; drag.id = e.pointerId;
      if (e.pointerType !== 'mouse') { hoverX = e.clientX; hoverY = e.clientY; hoverSeen = true; }
      knife.ax = knife.bx = e.clientX; knife.ay = knife.by = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      drawStroke(true);
      e.preventDefault();
      return;
    }
    const hit = !state.paused ? (pick(rayFrom(e.clientX, e.clientY)) || pickNear(e.clientX, e.clientY, e.pointerType === 'touch' ? 34 : 18)) : null;
    drag.id = e.pointerId; drag.lastX = e.clientX; drag.lastY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    if (hit) {
      drag.mode = 'grab'; drag.twist = 0;
      drag.plane = { p: hit, n: cam.fwd.slice() };
      sim.beginGrab(hit, 0.4);
      canvas.dataset.cursor = 'grabbing';
    } else {
      drag.mode = 'orbit';
      canvas.dataset.cursor = 'orbit';
    }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (drag.second && e.pointerId === drag.second.id) {
      drag.second.x = e.clientX; drag.second.y = e.clientY;
      drag.twist = drag.twist0 + Math.atan2(drag.second.y - drag.lastY, drag.second.x - drag.lastX);
      drag.twist = Math.max(-1.3, Math.min(1.3, drag.twist));
      applyGrab(drag.lastX, drag.lastY);
      return;
    }
    if (e.pointerId !== drag.id || !drag.mode) { hoverX = e.clientX; hoverY = e.clientY; hoverDirty = true; hoverSeen = true; return; }
    if (drag.mode === 'knife') { knife.bx = e.clientX; knife.by = e.clientY; drawStroke(true); return; }
    if (drag.mode === 'torch') { hoverX = e.clientX; hoverY = e.clientY; return; }
    const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    if (drag.mode === 'grab') applyGrab(e.clientX, e.clientY);
    else {
      state.az = Math.max(-1.1, Math.min(1.1, state.az - dx * 0.006));
      state.el = Math.max(0.12, Math.min(1.35, state.el + dy * 0.005));
    }
  });
  const endPointer = e => {
    if (drag.second && e.pointerId === drag.second.id) { drag.second = null; return; }
    if (e.pointerId !== drag.id) return;
    if (drag.mode === 'knife') {
      if (e.type === 'pointerup') {
        knife.bx = e.clientX; knife.by = e.clientY; drawStroke(true);
        const plan = planCut(knife.ax, knife.ay, knife.bx, knife.by);
        if (plan.miss !== undefined) { if (plan.miss) toast(plan.miss); }
        else startCut(plan);
        hoverX = e.clientX; hoverY = e.clientY;
      }
      drawStroke(false);
    }
    if (drag.mode === 'grab') sim.endGrab();
    if (drag.mode === 'torch') lightTorch(false);
    drag.mode = null; drag.id = -1; drag.second = null;
    canvas.dataset.cursor = state.tool === 'hand' ? '' : 'aim';
    hoverDirty = true;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  // wheel: twists the held patch (wherever the pointer is), otherwise zooms when over the stage
  window.addEventListener('wheel', e => {
    if (drag.mode === 'grab') {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      drag.twist = Math.max(-1.3, Math.min(1.3, drag.twist + d * 0.004));
      applyGrab(drag.lastX, drag.lastY);
    } else if (e.target === canvas) {
      e.preventDefault();
      state.zoom = Math.max(0.65, Math.min(1.6, state.zoom * Math.exp(e.deltaY * 0.001)));
    }
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { state.az = HOME_AZ; state.el = HOME_EL; state.zoom = 1; });
  let hoverX = 0, hoverY = 0, hoverDirty = false;

  // ── UI ──
  const firm = $('#firmness'), damp = $('#damping');
  const firmOut = $('#firmnessOut'), dampOut = $('#dampingOut');
  const syncSliders = () => {
    sim.firmness = firm.value / 100; sim.damping = damp.value / 100;
    firmOut.textContent = (firm.value / 100).toFixed(2);
    dampOut.textContent = (damp.value / 100).toFixed(2);
  };
  firm.value = Math.round(sim.firmness * 100); damp.value = Math.round(sim.damping * 100);
  firm.addEventListener('input', syncSliders); damp.addEventListener('input', syncSliders);
  syncSliders();


  // flashbang: the grenade slides in from a random spot off-screen, tumbling to a random angle, then the page
  // goes white and fades back (timeline in the CSS) — the bang itself gives the jelly a hop
  const flashEl = $('#flash'), flashImg = flashEl.querySelector('img');
  $('#flashbang').addEventListener('click', () => {
    flashEl.classList.remove('on'); void flashEl.offsetWidth;   // a second throw restarts the animation
    // start on a circle around the centre that is wide enough to hide the whole image, whatever its angle
    const from = Math.random() * 2 * Math.PI;
    const far = (Math.hypot(innerWidth, innerHeight) + Math.hypot(flashImg.offsetWidth, flashImg.offsetHeight)) / 2;
    const rest = Math.random() * 360;
    const spin = reduced.matches ? 0 : (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 360);
    flashEl.style.setProperty('--fx', `${Math.cos(from) * far}px`);
    flashEl.style.setProperty('--fy', `${Math.sin(from) * far}px`);
    flashEl.style.setProperty('--r0', `${rest - spin}deg`);
    flashEl.style.setProperty('--r1', `${rest}deg`);
    flashEl.classList.add('on');
  });
  flashEl.addEventListener('animationstart', e => {
    if (e.animationName === 'flash-white' && !state.paused) sim.nudge(reduced.matches ? 0.45 : 1);
  });
  flashEl.addEventListener('animationend', e => { if (e.animationName === 'flash-white') flashEl.classList.remove('on'); });
  // each look's whole piece keeps its built meshes, so Reset and switching back are instant
  $('#reset').addEventListener('click', () => {
    knifeAnim = null; blade.mode = null;
    if (pieces.length > 1) installWorld([FOX.whole]);
    sim.reset(reduced.matches ? 0 : 0.35); acc = 0;
    clearTraces();
  });
  // looks: each drawing is a body of its own, built the first time it is chosen
  function setLook(i) {
    if (i === look) return;
    look = i; setFox(i);
    markLook();
    knifeAnim = null; blade.mode = null;
    renderer.useArt(i);
    installWorld([FOX.whole || (FOX.whole = initialPiece())], [], null, 0, 0, false);
    sim.reset(reduced.matches ? 0 : 0.35); acc = 0;
    clearTraces();
    setMaterial(MATERIALS.indexOf(material));   // the shadow takes its tint from the new drawing
  }
  // materials: the same pieces, made of something else — the sliders move to where it starts,
  // and stop doing anything for a material that does not give at all
  function setMaterial(i) {
    material = MATERIALS[i];
    [...matBox.children].forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
    sim.setMaterial(material);
    firm.value = Math.round(material.firmness * 100); damp.value = Math.round(dampingFor(material) * 100);
    firm.disabled = damp.disabled = material.rigid;
    syncSliders();
    shadowTint = OPAQUE_SHADOW.map((o, k) => o + (FOX.shadowTint[k] - o) * material.shadow);
  }
  let shadowTint;
  setMaterial(0);
  // tools: hand (grab and pull), knife (draw across the jelly to cut it), and the four that are
  // pointed at it — blowtorch (hold), hammer, bat and pistol (press)
  function setTool(t) {
    if (t === 'knife' && state.tool !== 'knife' && !knifeAnim) {
      // the knife drops in from above
      const h = hoverPose(); kp.P = [h.P[0], h.P[1] + 1.6, h.P[2]]; kp.yaw = h.yaw; kp.roll = h.roll; kp.pitch = h.pitch;
    }
    // …and so do the others
    if (toolMesh[t] && state.tool !== t) { takeAim(1); aim.lift = 1.6; }
    stopTools();
    state.tool = t;
    for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    document.body.dataset.tool = t;
    canvas.dataset.cursor = t === 'hand' ? '' : 'aim';
  }
  const toolButtons = [...document.querySelectorAll('.tool')];
  for (const b of toolButtons) b.addEventListener('click', () => setTool(b.dataset.tool));
  setTool('hand');
  const sound = $('#sound');
  sound.addEventListener('change', () => { SFX.muted = !sound.checked; });
  SFX.muted = !sound.checked;
  $('#slow').addEventListener('change', e => { state.slow = e.target.checked; });
  $('#mesh').addEventListener('change', e => { state.showMesh = e.target.checked; });
  const pauseBtn = $('#pause');
  pauseBtn.addEventListener('click', () => {
    state.paused = !state.paused;
    if (state.paused && drag.mode === 'grab') { sim.endGrab(); drag.mode = null; }
    if (state.paused) lightTorch(false);
    pauseBtn.textContent = state.paused ? '繼續' : '暫停';
    pauseBtn.setAttribute('aria-pressed', String(state.paused));
  });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, button, summary')) return;
    if (e.key === ' ') { e.preventDefault(); pauseBtn.click(); }
    if (e.key === 'f' || e.key === 'F') $('#flashbang').click();
    if (e.key === 'r' || e.key === 'R') $('#reset').click();
    if (e.key === 'k' || e.key === 'K') setTool(state.tool === 'knife' ? 'hand' : 'knife');
    if (e.key === 'h' || e.key === 'H') setTool('hand');
    if (e.key.length === 1 && e.key >= '1' && e.key <= String(toolButtons.length)) setTool(toolButtons[e.key - 1].dataset.tool);   // the tools, in the order of their buttons
    if (e.key === 'm' || e.key === 'M') setMaterial((MATERIALS.indexOf(material) + 1) % MATERIALS.length);
  });

  const massOut = $('#massOut'), volOut = $('#volOut'), keOut = $('#keOut');
  let massG = 0;
  function updateReadouts() {
    massG = sim.totalRestVolume * SCALE_CM ** 3 * material.density;
    massOut.textContent = massG.toFixed(massG < 10 ? 1 : 0);
    volOut.textContent = (sim.volumeRatio() * 100).toFixed(1);
    // KE with the illustrative length scale: v[m/s] = v_sim × 0.035, m[kg] = share of the candy's mass
    const ke = sim.kineticEnergy() / sim.totalMass * (massG / 1000) * (SCALE_CM / 100) ** 2; // J
    const uj = ke * 1e6;
    keOut.textContent = uj < 0.05 ? '0.00' : uj < 100 ? uj.toFixed(2) : uj.toFixed(0);
  }

  // expose a small hook for automated checks
  window.__jelly = {
    sim, state, cam, pick, rayFrom, renderer, setMaterial, performCut, planCut, startCut, kp, blade, get knifeAnim() { return knifeAnim; }, setHover(x, y) { hoverX = x; hoverY = y; hoverSeen = true; },
    setTool, useTool, lightTorch, aim, particles, marks, get markN() { return markN; }, get material() { return material; },
    advance(sec) { for (let t = 0; t < sec - 1e-6; t += 1 / 60) { updateKnife(1 / 60, 1 / 60); updateTools(1 / 60, 1 / 60); skin(); sim.step(); particles.update(1 / 60); } },
    compStats() { const c = sim.nComp, out = []; for (let k = 0; k < c; k++) { let n = 0, x = 0, y = 0, z = 0, v = 0; for (let i = 0; i < sim.n; i++) if (sim.comp[i] === k) { n++; x += sim.x[3 * i]; y += sim.x[3 * i + 1]; z += sim.x[3 * i + 2]; v = Math.max(v, Math.hypot(sim.v[3 * i], sim.v[3 * i + 1], sim.v[3 * i + 2])); } out.push([x / n, y / n, z / n, v].map(q => +q.toFixed(3))); } return out; }, get pieces() { return pieces.length; }, get fps() { return fps; }
  };

  // ── loop ──
  sim.reset(reduced.matches ? 0 : 0.35);
  let last = performance.now(), fpsStart = last, acc = 0, readoutT = 0, fps = 60, frames = 0, fpsT = 0, first = true;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!state.paused) {
      acc += dt * (state.slow ? 0.25 : 1);
      let steps = 0;
      while (acc >= sim.stepDt && steps < 3) { sim.step(); acc -= sim.stepDt; steps++; }
      if (steps === 3) acc = Math.min(acc, sim.stepDt);
      state.time += dt;
    }
    // the knife may swap in a new world mid-cut, so it goes before skinning
    const adt = state.paused ? 0 : dt * (state.slow ? 0.25 : 1);
    updateKnife(dt, adt);
    updateTools(dt, adt);
    particles.update(adt); particles.write();
    skin();
    followJelly(dt);
    updateCamera();
    updateLight();
    if (hoverDirty && !drag.mode) {
      hoverDirty = false;
      canvas.dataset.cursor = state.tool !== 'hand' ? 'aim' : !state.paused && (pick(rayFrom(hoverX, hoverY)) || pickNear(hoverX, hoverY, 18)) ? 'grab' : '';
    }
    renderer.setUniforms(cam, light, {
      time: state.time, art: FOX.rect, gel: material.gel, kind: material.kind, shadowTint,
      exposure: 1.0, meshAlpha: state.showMesh ? 0.32 : 0, bg: BG_RENDER, lamp, marks, markN,
    });
    renderer.uploadGeometry(sim.x, state.showMesh, particles);
    renderer.draw(state.showMesh);
    if (first) { first = false; document.body.classList.add('ready'); }
    readoutT += dt; frames++; fpsT += dt;
    if (fpsT > 0.5) { fps = frames / ((now - fpsStart) / 1000); frames = 0; fpsT = 0; fpsStart = now; }
    if (readoutT > 0.12) { readoutT = 0; updateReadouts(); }
    if (!renderer.lost) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(err => { console.error(err); showFallback('啟動時發生錯誤。', String(err && err.message || err)); });
