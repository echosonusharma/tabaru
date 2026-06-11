import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { EffectId } from './types';
import QUAD_VS from './shaders/quad.vert';
import RAIN_FS from './shaders/rain.frag';
import STARS_FS from './shaders/stars.frag';
import SNOW_FS from './shaders/snow.frag';
import FOG_FS from './shaders/fog.frag';
import STORM_FS from './shaders/storm.frag';

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

const QUAD_VERTS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

interface Effect {
  render(t: number, w: number, h: number): void;
  onMouse?(x: number, y: number): void;
  destroy(): void;
}

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
