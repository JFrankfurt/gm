import { createProgram } from './gl';

export type RectBatchItem = {
  // in screen pixels
  x: number;
  y: number;
  w: number;
  h: number;
  // RGBA 0..1
  r: number;
  g: number;
  b: number;
  a: number;
};

const VS = `#version 300 es
precision highp float;

layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;

uniform vec2 u_resolution;

out vec4 v_color;

void main() {
  vec2 zeroToOne = a_pos / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clip = zeroToTwo - 1.0;
  // flip Y (DOM top-left to GL bottom-left)
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}
`;

const FS = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

export class RectRenderer {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private uResolutionLoc: WebGLUniformLocation;

  // 2 floats pos + 4 floats color
  private readonly stride = (2 + 4) * 4;

  constructor(private gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, VS, FS);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Failed to create GL buffers');
    this.vao = vao;
    this.vbo = vbo;

    const u = gl.getUniformLocation(this.program, 'u_resolution');
    if (!u) throw new Error('missing u_resolution');
    this.uResolutionLoc = u;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    // position
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, this.stride, 0);

    // color
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, this.stride, 2 * 4);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  destroy() {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  draw(args: {
    items: RectBatchItem[];
    resolution: { width: number; height: number };
  }) {
    const { gl } = this;
    const { items, resolution } = args;
    if (items.length === 0) return;

    // 2 triangles per rect = 6 vertices
    const floatsPerVertex = 2 + 4;
    const vertsPerRect = 6;
    const data = new Float32Array(items.length * vertsPerRect * floatsPerVertex);

    let o = 0;
    for (const r of items) {
      const x0 = r.x;
      const y0 = r.y;
      const x1 = r.x + r.w;
      const y1 = r.y + r.h;

      // tri 1: (x0,y0) (x1,y0) (x0,y1)
      o = writeVertex(data, o, x0, y0, r);
      o = writeVertex(data, o, x1, y0, r);
      o = writeVertex(data, o, x0, y1, r);
      // tri 2: (x0,y1) (x1,y0) (x1,y1)
      o = writeVertex(data, o, x0, y1, r);
      o = writeVertex(data, o, x1, y0, r);
      o = writeVertex(data, o, x1, y1, r);
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.uResolutionLoc, resolution.width, resolution.height);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.drawArrays(gl.TRIANGLES, 0, items.length * 6);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
}

function writeVertex(out: Float32Array, offset: number, x: number, y: number, r: RectBatchItem): number {
  out[offset++] = x;
  out[offset++] = y;
  out[offset++] = r.r;
  out[offset++] = r.g;
  out[offset++] = r.b;
  out[offset++] = r.a;
  return offset;
}
