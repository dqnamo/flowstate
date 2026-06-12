"use client";

import { useEffect, useRef, useState } from "react";

export interface DitheredWavesProps {
  colors?: readonly string[];
  height?: number | string;
}

const DEFAULT_COLORS = ["#0870e8", "#539cf2", "#8bc0fc", "#ffffff"] as const;
const MAX_COLORS = 9;

const VERTEX_SHADER = `#version 300 es
const vec2 verts[3] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
void main() {
  gl_Position = vec4(verts[gl_VertexID], 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float u_time;
uniform int uColorCount;
uniform vec3 uColors[9];

out vec4 fragColor;

vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}

const int OCTAVES = 8;

float fbm(vec2 p) {
  float value = -0.2;
  float amplitude = 1.0;
  float frequency = 2.5;
  for (int i = 0; i < OCTAVES; i++) {
    value += amplitude * abs(cnoise(p));
    p *= frequency;
    amplitude *= 0.35;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - u_time * 0.05;
  vec2 p3 = p + cos(u_time * 0.1);
  return fbm(p - fbm(p + fbm(p2)));
}

float bayer8x8(vec2 fragCoord) {
  const float m[64] = float[64](
     0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
    48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
    12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
    60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
     3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
    51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
    15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
    63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
  );
  int x = int(fragCoord.x) % 8;
  int y = int(fragCoord.y) % 8;
  return m[y * 8 + x];
}

vec3 palette(float t) {
  int colorCount = max(uColorCount, 1);
  if (colorCount == 1) return uColors[0];

  float s = clamp(t, 0.0, 1.0) * float(colorCount - 1);
  int i = min(int(floor(s)), colorCount - 2);
  return mix(uColors[i], uColors[i + 1], s - float(i));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  uv -= 0.5;
  uv.x *= uResolution.x / uResolution.y;

  float f = pattern(uv);
  float lum = clamp(f, 0.0, 1.0);

  float threshold = bayer8x8(gl_FragCoord.xy) - 0.75;
  float v = clamp(lum + threshold, 0.0, 1.0);
  float steps = max(float(uColorCount - 1), 1.0);
  v = floor(v * steps + 0.5) / steps;

  fragColor = vec4(palette(v), 1.0);
}`;

const hexToRgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

export default function DitheredWaves({
  colors = DEFAULT_COLORS,
  height = "100%",
}: DitheredWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef(colors);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);

      if (!shader) {
        throw new Error("Failed to create shader");
      }

      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const vert = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const frag = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();

    if (!program) {
      throw new Error("Failed to create program");
    }

    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    // biome-ignore lint/correctness/useHookAtTopLevel: This is a WebGL API call, not a React hook.
    gl.useProgram(program);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uColorCount = gl.getUniformLocation(program, "uColorCount");
    const uColorLocs = Array.from({ length: MAX_COLORS }, (_, i) =>
      gl.getUniformLocation(program, `uColors[${i}]`),
    );

    let w = 0;
    let h = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.floor(rect.width * dpr));
      h = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let raf = 0;
    let hasDrawnFirstFrame = false;
    const render = () => {
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uResolution, w, h);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      const activeColors = colorsRef.current.length
        ? colorsRef.current
        : DEFAULT_COLORS;
      const colorCount = Math.min(activeColors.length, MAX_COLORS);
      gl.uniform1i(uColorCount, colorCount);

      for (let i = 0; i < MAX_COLORS; i++) {
        const hex =
          activeColors[i] ??
          activeColors[colorCount - 1] ??
          DEFAULT_COLORS[DEFAULT_COLORS.length - 1];
        const [r, g, b] = hexToRgb(hex);
        gl.uniform3f(uColorLocs[i], r, g, b);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!hasDrawnFirstFrame) {
        hasDrawnFirstFrame = true;
        setIsReady(true);
      }

      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteVertexArray(vao);
    };
  }, []);

  return (
    <div className="h-full w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        className={`block h-full w-full transition-opacity duration-700 ${
          isReady ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
