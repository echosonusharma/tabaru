import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { EffectId } from './types';

// ─── WebGL helpers ────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  return p;
}

const QUAD_VS = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const QUAD_VERTS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

interface Effect {
  render(t: number, w: number, h: number): void;
  onMouse?(x: number, y: number): void;
  destroy(): void;
}

// ─── Rain (adapted from Javier Gracia Carpio, CC-BY-SA) ──────────────────────

const RAIN_FS = `
#define PI 3.14159265
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

highp float random1d(float dt) {
  return fract(sin(mod(dt, 3.14)) * 43758.5453);
}

vec2 random_drop_pos(float val, vec2 screen_dim, vec2 velocity) {
  float max_x_move = velocity.x * abs(screen_dim.y / velocity.y);
  float x = -max_x_move * step(0.0, max_x_move)
           + (screen_dim.x + abs(max_x_move)) * random1d(val);
  float y = (1.0 + 0.05 * random1d(1.234 * val)) * screen_dim.y;
  return vec2(x, y);
}

float trail_alpha(vec2 pixel, vec2 pos, vec2 vel_dir, float width, float size) {
  vec2  pd   = pixel - pos;
  float proj = dot(pd, -vel_dir);
  float tang = dot(pd, pd) - proj * proj;
  float wsq  = width * width;
  float line = step(0.0, proj) * (1.0 - smoothstep(wsq * 0.5, wsq, tang));
  return line * (1.0 - smoothstep(size * 0.2, size, proj));
}

float wave_alpha(vec2 pixel, vec2 pos, float size, float t) {
  vec2  pd    = pixel - pos;
  float dist  = length(pd * vec2(1.0, 3.5));
  float inner = (0.05 + 0.8 * t) * size;
  float outer = inner + 0.25 * size;
  float ring  = smoothstep(inner, inner + 4.0, dist)
              * (1.0 - smoothstep(outer, outer + 4.0, dist));
  return ring * (1.0 - smoothstep(0.0, 0.7, t));
}

void main() {
  const float n_drops = 35.0;
  float trail_width   = 2.5;
  float trail_size    = 90.0;
  float wave_size     = 24.0;
  float fall_time     = 0.65;
  float life_time     = fall_time + 0.55;

  vec2 wind     = vec2((u_mouse.x - 0.5 * u_resolution.x) * 0.6, 0.0);
  vec2 velocity = wind + vec2(0.0, -0.95 * u_resolution.y / fall_time);
  vec2 vel_dir  = normalize(velocity);

  float alpha = 0.0;
  for (float i = 0.0; i < n_drops; i++) {
    float time    = u_time + life_time * (i + i / n_drops);
    float elapsed = mod(time, life_time);
    vec2  init    = random_drop_pos(
                      i + floor(time / life_time - i) * n_drops,
                      u_resolution, velocity);
    if (elapsed < fall_time) {
      alpha += trail_alpha(gl_FragCoord.xy, init + elapsed * velocity,
                           vel_dir, trail_width, trail_size);
    } else {
      alpha += wave_alpha(gl_FragCoord.xy, init + fall_time * velocity,
                          wave_size, elapsed - fall_time);
    }
  }

  alpha = clamp(alpha, 0.0, 0.88);
  gl_FragColor = vec4(0.78, 0.90, 1.0, alpha);
}`;

// ─── Stars (custom) ───────────────────────────────────────────────────────────

const STARS_FS = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

highp float rand2(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}

float star(vec2 uv, float density, float layer) {
  vec2 grid = floor(uv * density);
  vec2 jitter = vec2(rand2(grid + layer), rand2(grid + layer + 7.3)) - 0.5;
  vec2 offset = fract(uv * density) - 0.5 - jitter * 0.7;
  float r = rand2(grid + layer);
  float size = 0.015 + 0.025 * rand2(grid + layer + 2.1);
  float twinkle = 0.55 + 0.45 * sin(u_time * (1.2 + 2.8 * r) + r * 6.2832);
  return smoothstep(size, 0.0, length(offset)) * twinkle;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Three layers: large bright, medium, small dim
  float s = star(uv, 12.0, 0.0)
          + star(uv, 28.0, 13.0) * 0.65
          + star(uv, 55.0, 31.0) * 0.35;

  s = clamp(s, 0.0, 1.0);
  gl_FragColor = vec4(1.0, 1.0, 1.0, s);
}`;

// ─── Snow (grid-cell layers) ──────────────────────────────────────────────────

const SNOW_FS = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

highp float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float snowLayer(vec2 uv, float density, float speed, float size, float layer) {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 grid    = vec2(uv.x * aspect, uv.y) * density;
  vec2 cell    = floor(grid);
  vec2 pos     = fract(grid);

  float t    = mod(u_time * speed + hash(vec3(cell, layer)), 1.0);
  float sway = sin(u_time * (0.3 + 0.4 * hash(vec3(cell, layer + 1.0)))
             + hash(vec3(cell, layer + 2.0)) * 6.28318) * 0.2;

  vec2 flake = pos - vec2(0.5 + sway, 1.0 - t);
  float b    = hash(vec3(cell, layer + 3.0));
  return smoothstep(size, 0.0, length(flake)) * (0.5 + 0.5 * b);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  float s = snowLayer(uv,  6.0, 0.08,  0.06,  0.0)
          + snowLayer(uv, 13.0, 0.14,  0.04, 10.0) * 0.75
          + snowLayer(uv, 22.0, 0.22,  0.025, 20.0) * 0.5;

  s = clamp(s, 0.0, 1.0);
  gl_FragColor = vec4(0.93, 0.97, 1.0, s * 0.88);
}`;

// ─── Fog (value noise fbm) ─────────────────────────────────────────────────────

const FOG_FS = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

highp float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                 hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p  = p * 2.1 + vec2(1.3, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2  uv = gl_FragCoord.xy / u_resolution;
  float t  = u_time * 0.04;

  float f = fbm(uv * 2.2 + vec2(t,        t * 0.55));
  f      += 0.55 * fbm(uv * 4.5 - vec2(t * 1.1, t * 0.35));
  f       = smoothstep(0.25, 0.80, f);

  gl_FragColor = vec4(0.80, 0.84, 0.90, f * 0.62);
}`;

// ─── Storm (heavy rain + lightning, same base as RAIN_FS) ─────────────────────

const STORM_FS = `
#define PI 3.14159265
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

highp float random1d(float dt) {
  return fract(sin(mod(dt, 3.14)) * 43758.5453);
}

vec2 random_drop_pos(float val, vec2 screen_dim, vec2 velocity) {
  float max_x_move = velocity.x * abs(screen_dim.y / velocity.y);
  float x = -max_x_move * step(0.0, max_x_move)
           + (screen_dim.x + abs(max_x_move)) * random1d(val);
  float y = (1.0 + 0.05 * random1d(1.234 * val)) * screen_dim.y;
  return vec2(x, y);
}

float trail_alpha(vec2 pixel, vec2 pos, vec2 vel_dir, float width, float size) {
  vec2  pd   = pixel - pos;
  float proj = dot(pd, -vel_dir);
  float tang = dot(pd, pd) - proj * proj;
  float wsq  = width * width;
  float line = step(0.0, proj) * (1.0 - smoothstep(wsq * 0.5, wsq, tang));
  return line * (1.0 - smoothstep(size * 0.2, size, proj));
}

float wave_alpha(vec2 pixel, vec2 pos, float size, float t) {
  vec2  pd    = pixel - pos;
  float dist  = length(pd * vec2(1.0, 3.5));
  float inner = (0.05 + 0.8 * t) * size;
  float outer = inner + 0.25 * size;
  float ring  = smoothstep(inner, inner + 4.0, dist)
              * (1.0 - smoothstep(outer, outer + 4.0, dist));
  return ring * (1.0 - smoothstep(0.0, 0.7, t));
}

void main() {
  const float n_drops = 55.0;
  float trail_width   = 2.8;
  float trail_size    = 100.0;
  float wave_size     = 22.0;
  float fall_time     = 0.5;
  float life_time     = fall_time + 0.45;

  vec2 wind     = vec2((u_mouse.x - 0.5 * u_resolution.x) * 0.8, 0.0);
  vec2 velocity = wind + vec2(0.0, -1.1 * u_resolution.y / fall_time);
  vec2 vel_dir  = normalize(velocity);

  float alpha = 0.0;
  for (float i = 0.0; i < n_drops; i++) {
    float time    = u_time + life_time * (i + i / n_drops);
    float elapsed = mod(time, life_time);
    vec2  init    = random_drop_pos(
                      i + floor(time / life_time - i) * n_drops,
                      u_resolution, velocity);
    if (elapsed < fall_time) {
      alpha += trail_alpha(gl_FragCoord.xy, init + elapsed * velocity,
                           vel_dir, trail_width, trail_size);
    } else {
      alpha += wave_alpha(gl_FragCoord.xy, init + fall_time * velocity,
                          wave_size, elapsed - fall_time);
    }
  }

  // Lightning flash
  float lt    = floor(u_time * 0.55);
  float lr    = fract(sin(lt * 127.1) * 43758.5);
  float lf    = mod(u_time * 0.55, 1.0);
  float flash = step(lr, 0.38) * smoothstep(0.0, 0.025, lf) * smoothstep(0.20, 0.05, lf);

  alpha = clamp(alpha, 0.0, 0.92);
  vec3 color = mix(vec3(0.72, 0.86, 1.0), vec3(0.95, 0.97, 1.0), flash * 0.7);
  gl_FragColor = vec4(color, clamp(alpha + flash * 0.18, 0.0, 0.95));
}`;

// ─── Effect factory ───────────────────────────────────────────────────────────

function makeQuadEffect(gl: WebGLRenderingContext, fs: string): Effect & { uMouse: WebGLUniformLocation | null } {
  const prog = createProgram(gl, QUAD_VS, fs);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);

  const aPos   = gl.getAttribLocation(prog, 'a_pos');
  const uRes   = gl.getUniformLocation(prog, 'u_resolution');
  const uTime  = gl.getUniformLocation(prog, 'u_time');
  const uMouse = gl.getUniformLocation(prog, 'u_mouse');

  let mx = 0, my = 0;

  return {
    uMouse,
    render(t, w, h) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, t);
      if (uMouse) gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    onMouse(x, y) { mx = x; my = y; },
    destroy() { gl.deleteProgram(prog); gl.deleteBuffer(buf); },
  };
}

// ─── EffectsCanvas ────────────────────────────────────────────────────────────

export function EffectsCanvas({ effect }: { effect: EffectId }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (effect === 'none' || !ref.current) return;
    const canvas = ref.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const fsMap: Record<string, string> = {
      rain: RAIN_FS, storm: STORM_FS, snow: SNOW_FS, fog: FOG_FS, stars: STARS_FS,
    };
    const fs = fsMap[effect] ?? STARS_FS;
    const fx = makeQuadEffect(gl, fs);

    const ctrl = new AbortController();
    const { signal } = ctrl;
    let raf = 0;
    let start = -1;

    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = (now - start) / 1000;
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      fx.render(t, w, h);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }, { signal });

    window.addEventListener('mousemove', (e: MouseEvent) => fx.onMouse?.(e.clientX, e.clientY), { signal });

    raf = requestAnimationFrame(tick);

    return () => {
      ctrl.abort();
      cancelAnimationFrame(raf);
      fx.destroy();
    };
  }, [effect]);

  if (effect === 'none') return null;
  return <canvas ref={ref} class="nt-effects-canvas" />;
}
