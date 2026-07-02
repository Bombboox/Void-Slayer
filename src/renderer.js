// Minimal WebGL2 quad renderer.
//
// Everything is drawn as a batched, solid-colored quad in world space. A single
// dynamic vertex buffer is filled each frame (pos.xy + color.rgba per vertex)
// and flushed in one draw call. This is deliberately small so we can later swap
// in fancier fragment shaders / a post-process pass for "nice" graphics.

const VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aColor;
uniform vec2 uResolution; // world-space size of the view
uniform vec2 uCamera;     // top-left of the view in world space
out vec4 vColor;
void main() {
  vec2 p = aPos - uCamera;
  vec2 clip = (p / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0); // flip Y: world is Y-down
  vColor = aColor;
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(vColor.rgb * vColor.a, vColor.a); // premultiplied alpha
}`;

// Textured (sprite) program — same view transform, samples a texture atlas.
// aTint is an additive flash color (rgb) scaled by its alpha, applied within the
// sprite's silhouette (e.g. an enemy lighting up white when it takes a hit).
const TEX_VERT_SRC = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aTint;
uniform vec2 uResolution;
uniform vec2 uCamera;
out vec2 vUV;
out vec4 vTint;
void main() {
  vec2 p = aPos - uCamera;
  vec2 clip = (p / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUV = aUV;
  vTint = aTint;
}`;

const TEX_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vTint;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUV);
  c.rgb = clamp(c.rgb + vTint.rgb * vTint.a, 0.0, 1.0); // additive flash
  fragColor = vec4(c.rgb * c.a, c.a); // premultiply to match the blend func
}`;

import { PostFX } from "./postfx.js";

const FLOATS_PER_VERT = 6; // x, y, r, g, b, a
const VERTS_PER_QUAD = 6;
const MAX_QUADS = 4096;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile error: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: true,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");

    this.canvas = canvas;
    this.gl = gl;

    // program
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.uResolution = gl.getUniformLocation(prog, "uResolution");
    this.uCamera = gl.getUniformLocation(prog, "uCamera");

    // buffer
    this.data = new Float32Array(MAX_QUADS * VERTS_PER_QUAD * FLOATS_PER_VERT);
    this.count = 0; // number of vertices queued

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.bindVertexArray(null);

    // textured program + a small one-quad buffer (pos.xy + uv.xy)
    const texProg = gl.createProgram();
    gl.attachShader(texProg, compile(gl, gl.VERTEX_SHADER, TEX_VERT_SRC));
    gl.attachShader(texProg, compile(gl, gl.FRAGMENT_SHADER, TEX_FRAG_SRC));
    gl.linkProgram(texProg);
    if (!gl.getProgramParameter(texProg, gl.LINK_STATUS)) {
      throw new Error("Tex program link error: " + gl.getProgramInfoLog(texProg));
    }
    this.texProg = texProg;
    this.texU = {
      resolution: gl.getUniformLocation(texProg, "uResolution"),
      camera: gl.getUniformLocation(texProg, "uCamera"),
      tex: gl.getUniformLocation(texProg, "uTex"),
    };
    // Batched textured quads: (x,y, u,v, tintRGBA) = 8 floats per vertex. All
    // quads sharing one texture flush together; switching texture (or mode)
    // flushes first.
    this.texData = new Float32Array(MAX_QUADS * VERTS_PER_QUAD * 8);
    this.texCount = 0;       // textured vertices queued
    this.texBatchTex = null; // texture the queued quads belong to
    this.texVao = gl.createVertexArray();
    gl.bindVertexArray(this.texVao);
    this.texVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.texData.byteLength, gl.DYNAMIC_DRAW);
    const texStride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, texStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, texStride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, texStride, 4 * 4);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha

    // Lighting + bloom post-processing (owns the offscreen render targets).
    this.postfx = new PostFX(gl);

    this.viewW = 0;
    this.viewH = 0;
    this.resize();
  }

  // Upload an image (or canvas) as a GL texture. NEAREST keeps pixel art crisp.
  // `repeat` uses GL_REPEAT wrapping for tiling/looping textures (UVs > 1 tile).
  createTexture(img, repeat = false) {
    const gl = this.gl;
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  // Match drawing-buffer size to the displayed CSS size * devicePixelRatio.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.viewW = this.canvas.clientWidth;
    this.viewH = this.canvas.clientHeight;
    this.gl.viewport(0, 0, w, h);
    if (this.postfx) this.postfx.resize(w, h);
  }

  // view = { x, y, w, h }: the rectangle of WORLD space that maps to the canvas.
  // (x,y) is its top-left; (w,h) its size in world units. Larger w/h => zoomed
  // out. This lets us fit a whole room to the screen with letterboxing.
  begin(clear, view) {
    const gl = this.gl;
    this._view = view;
    this.count = 0;
    this.texCount = 0;
    this.texBatchTex = null;
    // Scene renders into the offscreen buffer; post-processing presents it.
    this.postfx.beginScene(clear);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha
  }

  // Queue a world-space radial light for this frame. color = [r, g, b].
  addLight(x, y, radius, color, intensity = 1.0) {
    this.postfx.addLight(x, y, radius, color[0], color[1], color[2], intensity);
  }

  drawRect(x, y, w, h, color) {
    if (this.texCount > 0) this.flushTex(); // preserve order vs. queued sprites
    if (this.count + VERTS_PER_QUAD > MAX_QUADS * VERTS_PER_QUAD) this.flush();
    const [r, g, b, a = 1] = color;
    const d = this.data;
    let o = this.count * FLOATS_PER_VERT;
    const x1 = x + w, y1 = y + h;
    // two triangles
    const push = (px, py) => {
      d[o++] = px; d[o++] = py; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
    };
    push(x, y);  push(x1, y);  push(x, y1);
    push(x1, y); push(x1, y1); push(x, y1);
    this.count += VERTS_PER_QUAD;
  }

  // Queue a sub-rectangle of a texture as a world-space quad. UVs are 0..1.
  // Quads are batched per-texture; switching texture or drawing solids first
  // flushes the pending batch, so draw order is preserved. flipX mirrors it.
  // tint = [r,g,b,a] additive flash within the sprite (null/omitted = none).
  drawSprite(tex, dx, dy, dw, dh, u0, v0, u1, v1, flipX = false, tint = null) {
    if (this.count > 0) this.flush();                 // order vs. solid quads
    if (this.texBatchTex !== tex) this.flushTex();     // order vs. other textures
    if (this.texCount + VERTS_PER_QUAD > MAX_QUADS * VERTS_PER_QUAD) this.flushTex();
    this.texBatchTex = tex;

    if (flipX) { const t = u0; u0 = u1; u1 = t; }
    const tr = tint ? tint[0] : 0, tg = tint ? tint[1] : 0;
    const tb = tint ? tint[2] : 0, ta = tint ? tint[3] : 0;
    const d = this.texData;
    let o = this.texCount * 8;
    const x1 = dx + dw, y1 = dy + dh;
    const push = (px, py, u, v) => {
      d[o++] = px; d[o++] = py; d[o++] = u; d[o++] = v;
      d[o++] = tr; d[o++] = tg; d[o++] = tb; d[o++] = ta;
    };
    push(dx, dy, u0, v0);  push(x1, dy, u1, v0);  push(dx, y1, u0, v1);
    push(x1, dy, u1, v0);  push(x1, y1, u1, v1);  push(dx, y1, u0, v1);
    this.texCount += VERTS_PER_QUAD;
  }

  flushTex() {
    const gl = this.gl;
    if (this.texCount === 0) return;
    gl.useProgram(this.texProg);
    gl.uniform2f(this.texU.resolution, this._view.w, this._view.h);
    gl.uniform2f(this.texU.camera, this._view.x, this._view.y);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texBatchTex);
    gl.uniform1i(this.texU.tex, 0);
    gl.bindVertexArray(this.texVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.texData.subarray(0, this.texCount * 8));
    gl.drawArrays(gl.TRIANGLES, 0, this.texCount);
    gl.bindVertexArray(null);
    this.texCount = 0;
  }

  flush() {
    const gl = this.gl;
    if (this.count === 0) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.uResolution, this._view.w, this._view.h);
    gl.uniform2f(this.uCamera, this._view.x, this._view.y);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(
      gl.ARRAY_BUFFER, 0,
      this.data.subarray(0, this.count * FLOATS_PER_VERT)
    );
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
    this.count = 0;
  }

  end() {
    this.flush();
    this.flushTex();
    this.postfx.finish(this._view);
  }
}
