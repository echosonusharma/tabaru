import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { PicsumSettings } from '../types';

function buildUrl(settings: PicsumSettings, navOffset: number, frozenBucket: number | null): string {
  const baseSeed = settings.seed.trim();
  let bucket: number;

  if (settings.refreshInterval > 0) {
    const timeBucket = frozenBucket ?? Math.floor(Date.now() / (settings.refreshInterval * 60 * 1000));
    bucket = timeBucket + navOffset;
  } else {
    bucket = navOffset;
  }

  const hasSeed = !!baseSeed || bucket !== 0;
  const seed = baseSeed
    ? `${baseSeed}${bucket !== 0 ? `-${bucket}` : ''}`
    : `r-${bucket}`;

  if (!hasSeed) {
    const url = `https://picsum.photos/1920/1080`;
    const params: string[] = [];
    if (settings.blur > 0) params.push(`blur=${settings.blur}`);
    if (settings.grayscale) params.push('grayscale');
    return params.length ? `${url}?${params.join('&')}` : url;
  }

  let url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1920/1080`;
  const params: string[] = [];
  if (settings.blur > 0) params.push(`blur=${settings.blur}`);
  if (settings.grayscale) params.push('grayscale');
  return params.length ? `${url}?${params.join('&')}` : url;
}

export function PicsumBackground({ settings, navOffset = 0, paused = false }: {
  settings: PicsumSettings;
  navOffset?: number;
  paused?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const frozenBucketRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused && frozenBucketRef.current === null && settings.refreshInterval > 0) {
      frozenBucketRef.current = Math.floor(Date.now() / (settings.refreshInterval * 60 * 1000));
    } else if (!paused) {
      frozenBucketRef.current = null;
    }

    const target = buildUrl(settings, navOffset, frozenBucketRef.current);
    let active = true;
    setLoaded(false);
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      setUrl(target);
      setLoaded(true);
    };
    img.src = target;
    return () => { active = false; };
  }, [settings.seed, settings.blur, settings.grayscale, settings.refreshInterval, navOffset, paused]);

  return (
    <div
      class={`nt-background nt-background-img${loaded ? ' nt-bg-loaded' : ''}`}
      style={url ? { backgroundImage: `url(${url})` } : {}}
    />
  );
}

export function PicsumSettingsUI({ settings, onChange }: {
  settings: PicsumSettings;
  onChange: (s: PicsumSettings) => void;
}) {
  return (
    <div class="nt-fields">
      <div class="nt-field">
        <label class="tg-label">Seed</label>
        <input
          type="text"
          value={settings.seed}
          class="tg-input"
          placeholder="random if empty"
          onInput={(e) => onChange({ ...settings, seed: (e.target as HTMLInputElement).value })}
        />
        <span class="settings-row-hint">Any word. Same seed always picks the same image series.</span>
      </div>
      <div class="nt-field">
        <label class="tg-label">Blur: {settings.blur}</label>
        <input
          type="range"
          min="0"
          max="10"
          value={settings.blur}
          class="nt-range"
          onInput={(e) => onChange({ ...settings, blur: Number((e.target as HTMLInputElement).value) })}
        />
      </div>
      <div class="settings-row">
        <div class="settings-row-text">
          <span class="settings-row-label">Grayscale</span>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.grayscale}
            onChange={(e) => onChange({ ...settings, grayscale: (e.target as HTMLInputElement).checked })}
          />
          <span class="toggle-slider" />
        </label>
      </div>
      <div class="nt-field">
        <label class="tg-label">Show a new photo</label>
        <select
          class="nt-provider-select"
          value={settings.refreshInterval}
          onChange={(e) => onChange({ ...settings, refreshInterval: Number((e.target as HTMLSelectElement).value) })}
        >
          <option value={0}>Every new tab</option>
          <option value={5}>Every 5 minutes</option>
          <option value={15}>Every 15 minutes</option>
          <option value={60}>Every hour</option>
          <option value={1440}>Every day</option>
          <option value={10080}>Every week</option>
        </select>
      </div>
    </div>
  );
}
