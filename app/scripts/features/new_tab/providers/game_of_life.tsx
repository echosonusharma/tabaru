import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { GameOfLifeSettings } from '../types';

function readThemeColors(): { bg: string; cell: string } {
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--color-bg').trim() || '#0d1117';
  const cell = root.getPropertyValue('--color-accent').trim() || '#58a6ff';
  return { bg, cell };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function seedGrid(cols: number, rows: number, density: number): Uint8Array {
  const grid = new Uint8Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < density ? 1 : 0;
  return grid;
}

function step(curr: Uint8Array, next: Uint8Array, cols: number, rows: number): void {
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + cols) % cols;
          const ny = (y + dy + rows) % rows;
          n += curr[ny * cols + nx];
        }
      }
      const alive = curr[y * cols + x] === 1;
      next[y * cols + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
    }
  }
}

export function GameOfLifeBackground({ settings }: { settings: GameOfLifeSettings }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speedRef = useRef(Math.max(30, settings.speed));
  const opacityRef = useRef(Math.max(0, Math.min(1, settings.opacity)));
  const resetMsRef = useRef(settings.resetInterval > 0 ? settings.resetInterval * 60 * 1000 : 0);

  useEffect(() => { speedRef.current = Math.max(30, settings.speed); }, [settings.speed]);
  useEffect(() => { opacityRef.current = Math.max(0, Math.min(1, settings.opacity)); }, [settings.opacity]);
  useEffect(() => {
    resetMsRef.current = settings.resetInterval > 0 ? settings.resetInterval * 60 * 1000 : 0;
  }, [settings.resetInterval]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = Math.max(3, settings.cellSize);
    const density = Math.max(0.05, Math.min(0.6, settings.density));

    let cols = 0, rows = 0;
    let curr: Uint8Array = new Uint8Array(0);
    let next: Uint8Array = new Uint8Array(0);
    const now0 = performance.now();
    let lastStep = now0;
    let lastReset = now0;
    let raf = 0;
    let stagnantTicks = 0;
    let prevAlive = -1;
    let fullRepaint = true;
    let lastCellHex = '';
    let lastBgHex = '';
    let lastOpacity = -1;

    // Offscreen cell-resolution canvas — one pixel per cell. Scaled up via drawImage.
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d')!;
    let imgData: ImageData = offCtx.createImageData(1, 1);
    let pixels: Uint8ClampedArray = imgData.data;
    let cellRgb: [number, number, number] = [255, 255, 255];
    let cellAlpha = 255;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      cols = Math.max(1, Math.floor(w / cellSize));
      rows = Math.max(1, Math.floor(h / cellSize));
      curr = seedGrid(cols, rows, density);
      next = new Uint8Array(cols * rows);
      off.width = cols;
      off.height = rows;
      imgData = offCtx.createImageData(cols, rows);
      pixels = imgData.data;
      stagnantTicks = 0;
      prevAlive = -1;
      fullRepaint = true;
    };

    const draw = () => {
      const { bg, cell } = readThemeColors();
      const opacity = opacityRef.current;
      if (cell !== lastCellHex) {
        cellRgb = hexToRgb(cell);
        lastCellHex = cell;
        fullRepaint = true;
      }
      if (bg !== lastBgHex) {
        lastBgHex = bg;
        fullRepaint = true;
      }
      if (opacity !== lastOpacity) {
        cellAlpha = Math.round(opacity * 255);
        lastOpacity = opacity;
        fullRepaint = true;
      }
      const [r, g, b] = cellRgb;

      if (fullRepaint) {
        for (let i = 0; i < curr.length; i++) {
          const o = i * 4;
          if (curr[i]) { pixels[o] = r; pixels[o + 1] = g; pixels[o + 2] = b; pixels[o + 3] = cellAlpha; }
          else { pixels[o + 3] = 0; }
        }
        fullRepaint = false;
      } else {
        // Delta: only cells that changed between prev (next) and curr.
        for (let i = 0; i < curr.length; i++) {
          if (curr[i] !== next[i]) {
            const o = i * 4;
            if (curr[i]) { pixels[o] = r; pixels[o + 1] = g; pixels[o + 2] = b; pixels[o + 3] = cellAlpha; }
            else { pixels[o + 3] = 0; }
          }
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.drawImage(off, 0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    const tick = (t: number) => {
      const speed = speedRef.current;
      const resetMs = resetMsRef.current;
      if (t - lastStep >= speed) {
        step(curr, next, cols, rows);
        const tmp = curr; curr = next; next = tmp;
        lastStep = t;

        let alive = 0;
        for (let i = 0; i < curr.length; i++) alive += curr[i];
        if (alive === prevAlive) stagnantTicks++; else stagnantTicks = 0;
        prevAlive = alive;

        const stagnant = stagnantTicks > 50;
        const timeReset = resetMs > 0 && (t - lastReset) >= resetMs;
        if (stagnant || timeReset || alive === 0) {
          curr = seedGrid(cols, rows, density);
          stagnantTicks = 0;
          prevAlive = -1;
          lastReset = t;
          fullRepaint = true;
        }
        draw();
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    draw();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [settings.cellSize, settings.density]);

  return <canvas ref={canvasRef} class="nt-background nt-background-gol" />;
}

export function GameOfLifeSettingsUI({ settings, onChange }: {
  settings: GameOfLifeSettings;
  onChange: (s: GameOfLifeSettings) => void;
}) {
  return (
    <div class="nt-fields">
      <div class="nt-field">
        <label class="tg-label">Cell size: {settings.cellSize}px</label>
        <input
          type="range"
          min="3"
          max="30"
          value={settings.cellSize}
          class="nt-range"
          onInput={(e) => onChange({ ...settings, cellSize: Number((e.target as HTMLInputElement).value) })}
        />
      </div>
      <div class="nt-field">
        <label class="tg-label">Speed: {settings.speed}ms / gen</label>
        <input
          type="range"
          min="30"
          max="1000"
          step="10"
          value={settings.speed}
          class="nt-range"
          onInput={(e) => onChange({ ...settings, speed: Number((e.target as HTMLInputElement).value) })}
        />
      </div>
      <div class="nt-field">
        <label class="tg-label">Opacity: {Math.round(settings.opacity * 100)}%</label>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={settings.opacity}
          class="nt-range"
          onInput={(e) => onChange({ ...settings, opacity: Number((e.target as HTMLInputElement).value) })}
        />
      </div>
      <div class="nt-field">
        <label class="tg-label">Initial density: {Math.round(settings.density * 100)}%</label>
        <input
          type="range"
          min="0.05"
          max="0.6"
          step="0.05"
          value={settings.density}
          class="nt-range"
          onInput={(e) => onChange({ ...settings, density: Number((e.target as HTMLInputElement).value) })}
        />
      </div>
      <div class="nt-field">
        <label class="tg-label">Auto-reset</label>
        <select
          class="nt-provider-select"
          value={settings.resetInterval}
          onChange={(e) => onChange({ ...settings, resetInterval: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value={0}>Never (only on stagnation)</option>
          <option value={1}>Every 1 minute</option>
          <option value={5}>Every 5 minutes</option>
          <option value={15}>Every 15 minutes</option>
          <option value={60}>Every hour</option>
        </select>
      </div>
    </div>
  );
}
