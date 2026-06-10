import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { ClockWidgetConfig } from '../types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(d: Date, fmt: ClockWidgetConfig['format']): string {
  if (fmt === '24h') {
    return `${d.getHours()}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  const h = d.getHours();
  const h12 = h % 12 || 12;
  return `${h12}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function ClockWidget({ config }: { config: ClockWidgetConfig }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!config.showTime && !config.showDate) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [config.showTime, config.showDate]);

  if (!config.showTime && !config.showDate) return null;

  return (
    <div class="nt-clock">
      {config.showTime && <div class="nt-time">{formatTime(now, config.format)}</div>}
      {config.showTime && config.showDate && <div class="nt-divider" />}
      {config.showDate && <div class="nt-date">{formatDate(now)}</div>}
    </div>
  );
}
