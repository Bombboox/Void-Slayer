// Offscreen lighting + bloom pipeline for an atmospheric look.
//
// Per frame:
//   1. The scene (blocks, sprites, player) is rendered into an offscreen color
//      buffer (fboScene) by the Renderer's normal batches.
//   2. A light map is built (fboLight): cleared to a dim ambient color, then
//      colored radial lights are additively blended in (player glow, projectiles…).
//   3. composite: lit = scene * lightMap  -> fboLit.
//   4. bloom: bright pixels of `lit` are extracted (half-res) and gaussian-blurred
//      with a separable ping-pong blur.
//   5. present: lit + bloom, with a gentle tonemap and vignette, to the screen.
//
// Everything is RGBA8 (no float extensions needed). Lights are drawn in WORLD
// space using the same view transform as the scene so they line up.

const FS_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
out vec2 vUV;
void main() { vUV = aUV; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const LIGHT_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;
uniform vec2 uResolution;
uniform vec2 uCamera;
out vec2 vUV;
out vec4 vColor;
void main() {
  vec2 p = aPos - uCamera;
  vec2 c = (p / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  vUV = aUV;
  vColor = aColor;
}`;

// Radial falloff; alpha carries intensity. Additive into the light map.
const LIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 frag;
void main() {
  float d = length(vUV - 0.5) * 2.0;
  float f = clamp(1.0 - d, 0.0, 1.0);
  f = f * f;                       // soft quadratic edge
  frag = vec4(vColor.rgb * vColor.a * f, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uScene;
uniform sampler2D uLight;
void main() {
  vec3 s = texture(uScene, vUV).rgb;
  vec3 l = texture(uLight, vUV).rgb;
  frag = vec4(s * l, 1.0);
}`;

const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uTex;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = max(l - uThreshold, 0.0);
  frag = vec4(c * (k / max(l, 1e-4)), 1.0);
}`;

// Separable gaussian (5 linear-sampled taps ≈ 9-tap). uDir = one texel step.
const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 s = texture(uTex, vUV).rgb * 0.2270270270;
  s += texture(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702702703;
  frag = vec4(s, 1.0);
}`;

const FINAL_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
void main() {
  vec3 c = texture(uScene, vUV).rgb + texture(uBloom, vUV).rgb * uBloomStrength;
  c = c / (c + vec3(0.7)) * 1.7;            // gentle tonemap to tame highlights
  vec2 q = vUV - 0.5;                        // vignette
  float vig = smoothstep(1.05, 0.35, length(q));
  c *= mix(0.55, 1.0, vig);
  frag = vec4(c, 1.0);
}`;

const MAX_LIGHTS = 192;
const LIGHT_FLOATS = 8; // pos.xy, uv.xy, color.rgba
const VERTS_PER_QUAD = 6;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error("PostFX shader error: " + gl.getShaderInfoLog(sh));
  return sh;
}

function program(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error("PostFX link error: " + gl.getProgramInfoLog(p));
  return p;
}

export class PostFX {
  constructor(gl) {
    this.gl = gl;

    // Tunables (mutable from the outside for art direction).
    this.ambient = [0.30, 0.32, 0.42];
    this.bloomThreshold = 0.55;
    this.bloomStrength = 0.95;

    // Programs.
    this.lightProg = program(gl, LIGHT_VERT, LIGHT_FRAG);
    this.lightU = {
      resolution: gl.getUniformLocation(this.lightProg, "uResolution"),
      camera: gl.getUniformLocation(this.lightProg, "uCamera"),
    };
    this.compProg = program(gl, FS_VERT, COMPOSITE_FRAG);
    this.compU = {
      scene: gl.getUniformLocation(this.compProg, "uScene"),
      light: gl.getUniformLocation(this.compProg, "uLight"),
    };
    this.brightProg = program(gl, FS_VERT, BRIGHT_FRAG);
    this.brightU = {
      tex: gl.getUniformLocation(this.brightProg, "uTex"),
      threshold: gl.getUniformLocation(this.brightProg, "uThreshold"),
    };
    this.blurProg = program(gl, FS_VERT, BLUR_FRAG);
    this.blurU = {
      tex: gl.getUniformLocation(this.blurProg, "uTex"),
      dir: gl.getUniformLocation(this.blurProg, "uDir"),
    };
    this.finalProg = program(gl, FS_VERT, FINAL_FRAG);
    this.finalU = {
      scene: gl.getUniformLocation(this.finalProg, "uScene"),
      bloom: gl.getUniformLocation(this.finalProg, "uBloom"),
      strength: gl.getUniformLocation(this.finalProg, "uBloomStrength"),
    };

    // Fullscreen quad (clip-space pos + uv).
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    // two triangles covering the screen
    const q = new Float32Array([
      -1, -1, 0, 0,   1, -1, 1, 0,   -1, 1, 0, 1,
       1, -1, 1, 0,   1,  1, 1, 1,   -1, 1, 0, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 4 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
    gl.bindVertexArray(null);

    // Light batch.
    this.lightData = new Float32Array(MAX_LIGHTS * VERTS_PER_QUAD * LIGHT_FLOATS);
    this.lightCount = 0; // vertices queued
    this.lightVao = gl.createVertexArray();
    gl.bindVertexArray(this.lightVao);
    this.lightVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.lightData.byteLength, gl.DYNAMIC_DRAW);
    const stride = LIGHT_FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * 4);
    gl.bindVertexArray(null);

    this.targets = null;
    this.w = 0;
    this.h = 0;
  }

  _makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, fbo, w, h };
  }

  resize(w, h) {
    const gl = this.gl;
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    if (this.w === w && this.h === h && this.targets) return;
    this.w = w; this.h = h;

    if (this.targets) {
      for (const t of Object.values(this.targets)) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
    }
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.targets = {
      scene: this._makeTarget(w, h),
      light: this._makeTarget(w, h),
      lit: this._makeTarget(w, h),
      bloomA: this._makeTarget(hw, hh),
      bloomB: this._makeTarget(hw, hh),
    };
  }

  // Bind the scene buffer and clear it; called by Renderer.begin().
  beginScene(clear) {
    const gl = this.gl;
    const t = this.targets.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.clearColor(clear[0], clear[1], clear[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.lightCount = 0;
  }

  // Queue a world-space radial light. color = [r,g,b], intensity scales it.
  addLight(x, y, radius, r, g, b, intensity) {
    if (this.lightCount + VERTS_PER_QUAD > MAX_LIGHTS * VERTS_PER_QUAD) return;
    const d = this.lightData;
    let o = this.lightCount * LIGHT_FLOATS;
    const x0 = x - radius, y0 = y - radius, x1 = x + radius, y1 = y + radius;
    const push = (px, py, u, v) => {
      d[o++] = px; d[o++] = py; d[o++] = u; d[o++] = v;
      d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = intensity;
    };
    push(x0, y0, 0, 0); push(x1, y0, 1, 0); push(x0, y1, 0, 1);
    push(x1, y0, 1, 0); push(x1, y1, 1, 1); push(x0, y1, 0, 1);
    this.lightCount += VERTS_PER_QUAD;
  }

  _drawQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, VERTS_PER_QUAD);
    gl.bindVertexArray(null);
  }

  _bind(target) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
    }
  }

  _sample(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  // Run lights -> composite -> bloom -> present. `view` is the world view rect.
  finish(view) {
    const gl = this.gl;
    const T = this.targets;

    // 1. Light map: ambient clear + additive lights.
    this._bind(T.light);
    const a = this.ambient;
    gl.clearColor(a[0], a[1], a[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.lightCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // additive
      gl.useProgram(this.lightProg);
      gl.uniform2f(this.lightU.resolution, view.w, view.h);
      gl.uniform2f(this.lightU.camera, view.x, view.y);
      gl.bindVertexArray(this.lightVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lightVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lightData.subarray(0, this.lightCount * LIGHT_FLOATS));
      gl.drawArrays(gl.TRIANGLES, 0, this.lightCount);
      gl.bindVertexArray(null);
    }

    // Remaining passes are opaque fullscreen blits.
    gl.disable(gl.BLEND);

    // 2. Composite: lit = scene * light.
    this._bind(T.lit);
    gl.useProgram(this.compProg);
    this._sample(0, T.scene.tex, this.compU.scene);
    this._sample(1, T.light.tex, this.compU.light);
    this._drawQuad();

    // 3. Bright pass (half-res).
    this._bind(T.bloomA);
    gl.useProgram(this.brightProg);
    gl.uniform1f(this.brightU.threshold, this.bloomThreshold);
    this._sample(0, T.lit.tex, this.brightU.tex);
    this._drawQuad();

    // 4. Separable blur, two ping-pong iterations.
    const hw = T.bloomA.w, hh = T.bloomA.h;
    const blur = (src, dst, dx, dy) => {
      this._bind(dst);
      gl.useProgram(this.blurProg);
      gl.uniform2f(this.blurU.dir, dx, dy);
      this._sample(0, src.tex, this.blurU.tex);
      this._drawQuad();
    };
    blur(T.bloomA, T.bloomB, 1 / hw, 0);
    blur(T.bloomB, T.bloomA, 0, 1 / hh);
    blur(T.bloomA, T.bloomB, 1 / hw, 0);
    blur(T.bloomB, T.bloomA, 0, 1 / hh); // result in bloomA

    // 5. Present to screen.
    this._bind(null);
    gl.useProgram(this.finalProg);
    gl.uniform1f(this.finalU.strength, this.bloomStrength);
    this._sample(0, T.lit.tex, this.finalU.scene);
    this._sample(1, T.bloomA.tex, this.finalU.bloom);
    this._drawQuad();
  }
}
