import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { PicsumSettings } from '../types';

// Unique per page-load - ensures "every new tab" mode gets a fresh random image
// instead of hitting the browser cache for the same bare URL.
const SESSION_SEED = `s${Date.now()}`;
const PREFETCH_KEY = 'picsum_prefetch_v1';
const QUOTA_KEY = 'picsum_quota_v1';
const DAILY_CAP = 100; // soft cap on unique image fetches per UTC day

interface PrefetchEntry { current: string; next: string; bucket: number; }
interface QuotaEntry { day: string; urls: string[]; }

function today(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function readQuota(): QuotaEntry {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QuotaEntry;
      if (parsed.day === today() && Array.isArray(parsed.urls)) {
        // Hard cap defense: trim if somehow oversized.
        if (parsed.urls.length > DAILY_CAP) parsed.urls = parsed.urls.slice(-DAILY_CAP);
        return parsed;
      }
    }
  } catch {}
  return { day: today(), urls: [] };
}

function quotaAllows(url: string): boolean {
  const q = readQuota();
  if (q.urls.includes(url)) return true; // already counted
  return q.urls.length < DAILY_CAP;
}

function recordQuota(url: string): void {
  const q = readQuota();
  if (q.urls.includes(url)) return;
  if (q.urls.length >= DAILY_CAP) return; // hard guard
  q.urls.push(url);
  try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch {}
}

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
    // Use session seed so each new tab gets a different image (no browser cache hit).
    const url = `https://picsum.photos/seed/${SESSION_SEED}/1920/1080`;
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

function buildNextUrl(settings: PicsumSettings, navOffset: number, frozenBucket: number | null): string {
  // Prefetch target: next time bucket if time-based, else next nav step.
  if (settings.refreshInterval > 0) {
    const timeBucket = frozenBucket ?? Math.floor(Date.now() / (settings.refreshInterval * 60 * 1000));
    return buildUrlForBucket(settings, timeBucket + navOffset + 1);
  }
  return buildUrlForBucket(settings, navOffset + 1);
}

function buildUrlForBucket(settings: PicsumSettings, bucket: number): string {
  const baseSeed = settings.seed.trim();
  const seed = baseSeed
    ? `${baseSeed}${bucket !== 0 ? `-${bucket}` : ''}`
    : `r-${bucket}`;
  let url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/1920/1080`;
  const params: string[] = [];
  if (settings.blur > 0) params.push(`blur=${settings.blur}`);
  if (settings.grayscale) params.push('grayscale');
  return params.length ? `${url}?${params.join('&')}` : url;
}

function readPrefetch(): PrefetchEntry | null {
  try {
    const raw = localStorage.getItem(PREFETCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writePrefetch(entry: PrefetchEntry): void {
  try { localStorage.setItem(PREFETCH_KEY, JSON.stringify(entry)); } catch {}
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
    const nextTarget = buildNextUrl(settings, navOffset, frozenBucketRef.current);
    let active = true;

    // Daily cap: if exceeded and target not already counted, keep last image.
    if (!quotaAllows(target)) {
      const cached = readPrefetch();
      if (cached) {
        setUrl(cached.current);
        setLoaded(true);
      }
      return () => { active = false; };
    }

    // Instant paint if prefetched URL matches target (browser HTTP cache should hold it).
    const cached = readPrefetch();
    if (cached && (cached.current === target || cached.next === target)) {
      setUrl(target);
      setLoaded(true);
    } else {
      setLoaded(false);
    }

    const img = new Image();
    img.onload = () => {
      if (!active) return;
      recordQuota(target);
      setUrl(target);
      setLoaded(true);
      // Prefetch next image only if quota allows.
      if (quotaAllows(nextTarget)) {
        const pre = new Image();
        pre.onload = () => {
          recordQuota(nextTarget);
          writePrefetch({ current: target, next: nextTarget, bucket: navOffset });
        };
        pre.src = nextTarget;
      } else {
        writePrefetch({ current: target, next: nextTarget, bucket: navOffset });
      }
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
