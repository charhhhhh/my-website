// ─────────────────────────────────────────────────────────────
//  WebGL2 renderer — the fallback where WebGPU is missing or will not start
//  the same passes as renderer.js, behind the same interface, so main.js can drive either
// ─────────────────────────────────────────────────────────────
// plain script, not a module, so the page also works opened straight from disk (file://);
// top-level names are shared with the other files, which index.html loads in order.
// needs: shaders-gl.js, particles.js, renderer.js (MSAA, UBO_SIZE, packUniforms)
'use strict';

class GLRenderer {
  static async create(canvas, mesh, simEdges, nParticles, arts) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no-webgl2');
    // after a lost context the browser hands this canvas a fresh one; wait for it
    if (gl.isContextLost()) await new Promise((res, rej) => {
      canvas.addEventListener('webglcontextrestored', res, { once: true });
      setTimeout(() => rej(new Error('WebGL context lost')), 8000);
    });
    return new GLRenderer(canvas, gl, mesh, simEdges, nParticles, arts);
  }

  constructor(canvas, gl, mesh, simEdges, nParticles, arts) {
    this.canvas = canvas;
    this.gl = gl;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();   // ask for the context back
      this.lost = true; this.onLost && this.onLost({ reason: 'unknown', message: 'WebGL context lost.' });
    }, { once: true });

    // HDR targets: float if we can, half float if that is all there is
    const full = gl.getExtension('EXT_color_buffer_float');
    if (!full && !gl.getExtension('EXT_color_buffer_half_float')) throw new Error('no-float-target');
    this.backFormat = full ? gl.R32F : gl.R16F;
    const samplesOf = f => Math.max(0, ...gl.getInternalformatParameter(gl.RENDERBUFFER, f, gl.SAMPLES));
    this.samples = Math.min(MSAA, samplesOf(gl.RGBA16F), samplesOf(gl.DEPTH_COMPONENT24));

    this.buildPrograms();
    this.vao = gl.createVertexArray();
    this.setMesh(mesh, simEdges, nParticles);

    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, UBO_SIZE, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
    this.uboData = new Float32Array(UBO_SIZE / 4);

    // WebGPU keeps sampling state apart from textures; so do sampler objects
    const sampler = (filter, opts = {}) => {
      const s = gl.createSampler();
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, opts.min || filter);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, filter);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (opts.compare) {
        gl.samplerParameteri(s, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.samplerParameteri(s, gl.TEXTURE_COMPARE_FUNC, gl.LESS);
      }
      return s;
    };
    this.nearest = sampler(gl.NEAREST);
    this.cmpSampler = sampler(gl.LINEAR, { compare: true });
    this.linSampler = sampler(gl.LINEAR);
    this.artSampler = sampler(gl.LINEAR, { min: gl.LINEAR_MIPMAP_LINEAR });
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.samplerParameterf(this.artSampler, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    this.artTexs = arts.map(img => this.makeArt(img));
    this.artTex = this.artTexs[0];

    this.shadowSize = 1024; this.topSize = 512;
    this.shadowTex = this.texture(this.shadowSize, this.shadowSize, gl.DEPTH_COMPONENT32F);
    this.topTex = this.texture(this.topSize, this.topSize, gl.DEPTH_COMPONENT32F);
    this.fbShadow = this.framebuffer(null, this.shadowTex);
    this.fbTop = this.framebuffer(null, this.topTex);

    this.w = 0; this.h = 0;
    this.props = [];
    this.particleData = new Float32Array(MAX_PARTICLES * PARTICLE_FLOATS);
    this.particleInst = this.buffer(gl.ARRAY_BUFFER, this.particleData.byteLength);
    this.particleCount = 0;
  }

  program(vs, fs, units = {}) {
    const gl = this.gl;
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('GLSL compile error\n' + [gl.getShaderInfoLog(v), gl.getShaderInfoLog(f), gl.getProgramInfoLog(p)].filter(Boolean).join('\n'));
    }
    gl.useProgram(p);
    const block = gl.getUniformBlockIndex(p, 'U');
    if (block !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, block, 0);
    for (const [name, unit] of Object.entries(units)) gl.uniform1i(gl.getUniformLocation(p, name), unit);
    return p;
  }

  buildPrograms() {
    this.prog = {
      depth: this.program(GLSL_VS_DEPTH, GLSL_FS_DEPTH),
      background: this.program(GLSL_VS_FULL, GLSL_FS_BACKGROUND, { shadowMap: 0, shadowCmp: 1, heightMap: 2 }),
      props: this.program(GLSL_VS_MESH, GLSL_FS_PROPS),
      back: this.program(GLSL_VS_BACK, GLSL_FS_BACK),
      copy: this.program(GLSL_VS_FULL, GLSL_FS_COPY, { sceneTex: 0 }),
      jelly: this.program(GLSL_VS_MESH, GLSL_FS_JELLY, { sceneTex: 0, backTex: 1, artTex: 2 }),
      lines: this.program(GLSL_VS_LINE, GLSL_FS_LINE),
      particles: this.program(GLSL_VS_FX, GLSL_FS_FX),
      post: this.program(GLSL_VS_FULL, GLSL_FS_POST, { hdr: 0 }),
    };
    this.depthM = this.gl.getUniformLocation(this.prog.depth, 'm');
  }

  texture(w, h, format, levels = 1) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels, format, w, h);
    return t;
  }
  renderbuffer(w, h, format, samples) {
    const gl = this.gl, r = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, r);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, w, h);
    return r;
  }
  // color and depth are each a texture, a renderbuffer or null
  framebuffer(color, depth) {
    const gl = this.gl, fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const attach = (point, x) => {
      if (x instanceof WebGLTexture) gl.framebufferTexture2D(gl.FRAMEBUFFER, point, gl.TEXTURE_2D, x, 0);
      else if (x) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, point, gl.RENDERBUFFER, x);
    };
    attach(gl.COLOR_ATTACHMENT0, color);
    attach(gl.DEPTH_ATTACHMENT, depth);
    if (!color) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error('framebuffer incomplete: 0x' + status.toString(16));
    return fb;
  }
  // data: a typed array, or a byte size to leave for later writes
  buffer(target, data) {
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, typeof data === 'number' ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return b;
  }

  // a drawing as an sRGB texture with a full mip chain, each level drawn down from the one before
  makeArt(img) {
    const gl = this.gl, size = img.width;
    const levels = Math.floor(Math.log2(size)) + 1;
    const tex = this.texture(size, size, gl.SRGB8_ALPHA8, levels);
    let src = img;
    for (let l = 0, sz = size; l < levels; l++, sz = Math.max(1, sz >> 1)) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = sz;
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, sz, sz);
      gl.texSubImage2D(gl.TEXTURE_2D, l, 0, 0, sz, sz, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      src = cv;
    }
    return tex;
  }

  // switch to another look's drawing
  useArt(i) {
    this.artTex = this.artTexs[i];
  }

  // a tool is a small rigid mesh posed on the CPU each frame: the caller fills `dyn` (position and
  // normal per vertex) and says whether it is to be seen
  addProp(k) {
    const gl = this.gl;
    const nK = k.rest.length / 3;
    const dyn = new Float32Array(nK * 6);
    const st = new Float32Array(nK * 4);
    for (let i = 0; i < nK; i++) { st[4 * i] = k.rest[3 * i]; st[4 * i + 1] = k.rest[3 * i + 1]; st[4 * i + 2] = k.rest[3 * i + 2]; st[4 * i + 3] = k.mat[i]; }
    const prop = {
      dyn, dynBuf: this.buffer(gl.ARRAY_BUFFER, dyn.byteLength), staticBuf: this.buffer(gl.ARRAY_BUFFER, st),
      idxBuf: this.buffer(gl.ELEMENT_ARRAY_BUFFER, k.index), count: k.index.length, visible: false,
    };
    this.props.push(prop);
    return prop;
  }

  // (re)build every mesh-sized GPU buffer — at start and after each knife cut, never while dragging
  setMesh(mesh, simEdges, nParticles) {
    const gl = this.gl;
    gl.bindVertexArray(null);
    for (const b of ['dynBuf', 'staticBuf', 'fxBuf', 'indexBuf', 'lineIdx', 'particleBuf']) if (this[b]) gl.deleteBuffer(this[b]);
    this.mesh = mesh;
    this.nV = mesh.rest.length / 3;
    // dynamic: skinned position + normal (updated each frame, reallocated only when the mesh changes)
    this.dyn = new Float32Array(this.nV * 6);
    this.dynBuf = this.buffer(gl.ARRAY_BUFFER, this.dyn.byteLength);
    // static: the point of the drawing each vertex shows (u, w), its rest height, its material
    const st = new Float32Array(this.nV * 4);
    for (let i = 0; i < this.nV; i++) { st[4 * i] = mesh.tex[2 * i]; st[4 * i + 1] = mesh.rest[3 * i + 1]; st[4 * i + 2] = mesh.tex[2 * i + 1]; st[4 * i + 3] = mesh.mat[i]; }
    this.staticBuf = this.buffer(gl.ARRAY_BUFFER, st);
    // what the tools have done to each vertex: how hot it is, how burnt (updated only while that changes)
    this.fx = new Float32Array(this.nV * 2);
    this.fxBuf = this.buffer(gl.ARRAY_BUFFER, Math.max(8, this.fx.byteLength));
    this.fxDirty = false;
    this.indexBuf = this.buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    this.lineIdx = this.buffer(gl.ELEMENT_ARRAY_BUFFER, simEdges);
    this.lineCount = simEdges.length;
    this.particleBuf = this.buffer(gl.ARRAY_BUFFER, Math.max(4, nParticles * 12));
  }

  resize(w, h) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl, S = this.samples;
    for (const t of ['sceneTex', 'backTex', 'hdrTex']) this[t] && gl.deleteTexture(this[t]);
    for (const r of ['msScene', 'msDepth', 'backDepth', 'msHdr']) this[r] && gl.deleteRenderbuffer(this[r]);
    for (const f of ['fbScene', 'fbSceneOut', 'fbBack', 'fbHdr', 'fbHdrOut']) this[f] && gl.deleteFramebuffer(this[f]);
    this.msScene = this.renderbuffer(w, h, gl.RGBA16F, S);
    this.msDepth = this.renderbuffer(w, h, gl.DEPTH_COMPONENT24, S);
    this.sceneTex = this.texture(w, h, gl.RGBA16F);
    this.backTex = this.texture(w, h, this.backFormat);
    this.backDepth = this.renderbuffer(w, h, gl.DEPTH_COMPONENT32F, 0);
    this.msHdr = this.renderbuffer(w, h, gl.RGBA16F, S);
    this.hdrTex = this.texture(w, h, gl.RGBA16F);
    // the scene and the jelly share one depth buffer, as the two WebGPU passes do
    this.fbScene = this.framebuffer(this.msScene, this.msDepth);
    this.fbSceneOut = this.framebuffer(this.sceneTex, null);
    this.fbBack = this.framebuffer(this.backTex, this.backDepth);
    this.fbHdr = this.framebuffer(this.msHdr, this.msDepth);
    this.fbHdrOut = this.framebuffer(this.hdrTex, null);
  }

  // fill the uniform block; cam = { viewProj, view, invViewProj, pos, fwd }
  setUniforms(cam, light, params) {
    const gl = this.gl, u = this.uboData;
    packUniforms(u, cam, light, params, this.w, this.h);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, u);
    this.lightVP = light.lightVP; this.topVP = light.topVP;
  }

  // simParticles: the body's own (for the mesh overlay); fxParticles: what the tools throw off
  uploadGeometry(simParticles, showMesh, fxParticles) {
    const gl = this.gl, A = gl.ARRAY_BUFFER;
    const put = (buf, data, n) => { gl.bindBuffer(A, buf); gl.bufferSubData(A, 0, data, 0, n); };
    put(this.dynBuf, this.dyn);
    if (this.fxDirty) { put(this.fxBuf, this.fx); this.fxDirty = false; }
    for (const p of this.props) if (p.visible) put(p.dynBuf, p.dyn);
    if (showMesh) put(this.particleBuf, simParticles);
    this.particleCount = fxParticles ? fxParticles.count : 0;
    if (this.particleCount) put(this.particleInst, fxParticles.data, this.particleCount * PARTICLE_FLOATS);
  }

  capture() { return new Promise(r => { this.captureResolve = r; }); }

  // point the vertex inputs at buffers: [buffer, location, floats, stride, offset, per-instance?]
  attribs(list, index) {
    const gl = this.gl;
    for (let l = 0; l < 5; l++) gl.disableVertexAttribArray(l);
    for (const [buf, loc, n, stride, offset, inst] of list) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, inst ? 1 : 0);
    }
    if (index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  }
  bind(unit, tex, sampler) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindSampler(unit, sampler);
  }
  // multisampled → single-sampled
  resolve(from, to) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to);
    gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }

  draw(showMesh) {
    if (this.lost) return;
    const gl = this.gl, m = this.mesh, P = this.prog, T = gl.TRIANGLES, U32 = gl.UNSIGNED_INT;
    const posOnly = buf => [[buf, 0, 3, 24, 0]];
    const meshVB = (dyn, st) => [[dyn, 0, 3, 24, 0], [dyn, 1, 3, 24, 12], [st, 2, 3, 16, 0], [st, 3, 1, 16, 12]];
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    // shadow map from the key light, and a top-down height map for contact occlusion
    const props = this.props.filter(k => k.visible);
    gl.useProgram(P.depth);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 2);
    for (const [fb, size, vp] of [[this.fbShadow, this.shadowSize, this.lightVP], [this.fbTop, this.topSize, this.topVP]]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, size, size);
      gl.clearBufferfv(gl.DEPTH, 0, [1]);
      gl.uniformMatrix4fv(this.depthM, false, vp);
      this.attribs(posOnly(this.dynBuf), this.indexBuf);
      gl.drawElements(T, m.body.count, U32, 0);
      // the tools cast shadows but stay out of the contact-occlusion height map
      if (fb === this.fbShadow) for (const k of props) {
        this.attribs(posOnly(k.dynBuf), k.idxBuf);
        gl.drawElements(T, k.count, U32, 0);
      }
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.viewport(0, 0, this.w, this.h);

    // scene behind / inside the jelly
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbScene);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1000]); gl.clearBufferfv(gl.DEPTH, 0, [1]);
    gl.useProgram(P.background);
    this.bind(0, this.shadowTex, this.nearest); this.bind(1, this.shadowTex, this.cmpSampler); this.bind(2, this.topTex, this.nearest);
    gl.disable(gl.DEPTH_TEST);
    this.attribs([]);
    gl.drawArrays(T, 0, 3);
    gl.useProgram(P.props);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    this.attribs(meshVB(this.dynBuf, this.staticBuf), this.indexBuf);
    if (m.bubbles.count) gl.drawElements(T, m.bubbles.count, U32, m.bubbles.first * 4);
    // the tools live in the scene pass, so what is buried in the jelly is seen refracted through it
    for (const k of props) {
      this.attribs(meshVB(k.dynBuf, k.staticBuf), k.idxBuf);
      gl.drawElements(T, k.count, U32, 0);
    }
    this.resolve(this.fbScene, this.fbSceneOut);

    // farthest back face depth
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbBack);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.DEPTH, 0, [0]);
    gl.useProgram(P.back);
    gl.depthFunc(gl.GREATER); gl.cullFace(gl.FRONT);
    this.attribs(posOnly(this.dynBuf), this.indexBuf);
    gl.drawElements(T, m.body.count, U32, 0);

    // jelly, over the scene's depth
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbHdr);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]);
    gl.useProgram(P.copy);
    this.bind(0, this.sceneTex, this.linSampler); this.bind(1, this.backTex, this.nearest); this.bind(2, this.artTex, this.artSampler);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    this.attribs([]);
    gl.drawArrays(T, 0, 3);
    gl.useProgram(P.jelly);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    this.attribs([...meshVB(this.dynBuf, this.staticBuf), [this.fxBuf, 4, 2, 8, 0]], this.indexBuf);
    gl.drawElements(T, m.body.count, U32, 0);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (showMesh) {
      gl.useProgram(P.lines);
      gl.disable(gl.DEPTH_TEST);
      this.attribs([[this.particleBuf, 0, 3, 12, 0]], this.lineIdx);
      gl.drawElements(gl.LINES, this.lineCount, U32, 0);
    }
    // particles: one quad per instance, drawn over everything else; premultiplied, so the same
    // blend does glowing ones (no alpha: their light is added) and smoke (alpha: it covers)
    if (this.particleCount) {
      gl.useProgram(P.particles);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(false);
      const S = PARTICLE_FLOATS * 4;
      this.attribs([[this.particleInst, 0, 4, S, 0, true], [this.particleInst, 1, 4, S, 16, true], [this.particleInst, 2, 4, S, 32, true]]);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.particleCount);
      gl.depthMask(true);
    }
    gl.disable(gl.BLEND);
    this.resolve(this.fbHdr, this.fbHdrOut);

    // tone map to the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(P.post);
    this.bind(0, this.hdrTex, this.nearest);
    this.attribs([]);
    gl.drawArrays(T, 0, 3);

    // optional still capture (used for saving a frame / automated checks)
    if (this.captureResolve) {
      const w = this.w, h = this.h, row = w * 4, src = new Uint8Array(row * h);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, src);
      // GL reads rows bottom-up
      const px = new Uint8ClampedArray(row * h);
      for (let y = 0; y < h; y++) px.set(src.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      for (let i = 3; i < px.length; i += 4) px[i] = 255;
      this.captureResolve({ w, h, px });
      this.captureResolve = null;
    }
  }
}
