import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import { newTabSettingsStore, DEFAULT_NEW_TAB_SETTINGS, getNewTabSettings } from './stores';
import { WALLPAPER_PROVIDERS, getProvider } from './registry';
import { ClockWidget } from './widgets/clock';
import { GreetingWidget } from './widgets/greeting';
import { WeatherWidget } from './widgets/weather';
import { PicsumBackground } from './providers/picsum';
import type {
  NewTabSettings, WallpaperProviderId,
  WidgetConfig, WidgetType,
  GreetingWidgetConfig, ClockWidgetConfig, WeatherWidgetConfig,
} from './types';

const SCALES = [0.65, 0.8, 1.0, 1.2, 1.5];

const WIDGET_LABELS: Record<WidgetType, string> = {
  greeting: 'Greeting',
  clock: 'Clock',
  weather: 'Weather',
};

const WIDGET_DESCRIPTIONS: Record<WidgetType, string> = {
  greeting: 'Time-based personal greeting.',
  clock: 'Current time and date.',
  weather: 'Current weather conditions.',
};

const ALL_WIDGET_TYPES: WidgetType[] = ['greeting', 'clock', 'weather'];

function defaultWidget(type: WidgetType): WidgetConfig {
  if (type === 'greeting') return { id: 'greeting', type: 'greeting', size: 3, name: '' };
  if (type === 'clock') return { id: 'clock', type: 'clock', size: 3, showTime: true, showDate: true, format: '24h' };
  return { id: 'weather', type: 'weather', size: 3, provider: 'open-meteo', city: '', unit: 'C', showFeelsLike: true, showHumidity: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProviderSettings(settings: NewTabSettings): unknown {
  switch (settings.activeProvider) {
    case 'solid_color': return settings.solidColor;
    case 'gradient': return settings.gradient;
    case 'picsum': return settings.picsum;
  }
}

function mergeProviderSettings(settings: NewTabSettings, providerSettings: unknown): NewTabSettings {
  switch (settings.activeProvider) {
    case 'solid_color': return { ...settings, solidColor: providerSettings as any };
    case 'gradient': return { ...settings, gradient: providerSettings as any };
    case 'picsum': return { ...settings, picsum: providerSettings as any };
  }
  return settings;
}

// ─── NewTabPage ───────────────────────────────────────────────────────────────


export function NewTabPage() {
  const [settings, setSettings] = useState<NewTabSettings | null>(null);
  const [navOffset, setNavOffset] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    getNewTabSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const handler = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !changes['new_tab_settings']) return;
      const val = changes['new_tab_settings'].newValue as NewTabSettings | undefined;
      setSettings({ ...DEFAULT_NEW_TAB_SETTINGS, ...(val ?? {}), widgets: val?.widgets ?? DEFAULT_NEW_TAB_SETTINGS.widgets });
    };
    browser.storage.onChanged.addListener(handler);
    return () => browser.storage.onChanged.removeListener(handler);
  }, []);

  if (!settings) return null;

  const provider = getProvider(settings.activeProvider);
  const providerSettings = getProviderSettings(settings);
  const showNavControls = settings.activeProvider === 'picsum';

  return (
    <div class="nt-page">
      {settings.activeProvider === 'picsum'
        ? <PicsumBackground settings={settings.picsum} navOffset={navOffset} paused={paused} />
        : provider && <provider.BackgroundComponent settings={providerSettings} />
      }
      <div class="nt-overlay" />
      <div class="nt-content">
        {settings.widgets.map((widget) => (
          <div
            key={widget.id}
            class="nt-widget-wrap"
            style={{ transform: `scale(${SCALES[widget.size - 1] ?? 1})` }}
          >
            {widget.type === 'greeting' && <GreetingWidget config={widget} />}
            {widget.type === 'clock' && <ClockWidget config={widget} />}
            {widget.type === 'weather' && <WeatherWidget config={widget} />}
          </div>
        ))}
      </div>
      {showNavControls && (
        <div class="nt-nav-controls">
          <button class="nt-nav-btn" onClick={() => setNavOffset(o => o - 1)} title="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button class="nt-nav-btn" onClick={() => setPaused(p => !p)} title={paused ? 'Resume' : 'Pause'}>
            {paused
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            }
          </button>
          <button class="nt-nav-btn" onClick={() => setNavOffset(o => o + 1)} title="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Widget settings panels ───────────────────────────────────────────────────

function GreetingWidgetSettings({ config, onChange }: { config: GreetingWidgetConfig; onChange: (c: WidgetConfig) => void }) {
  return (
    <div class="nt-field">
      <label class="tg-label">Name</label>
      <input
        type="text"
        class="tg-input"
        value={config.name}
        placeholder="leave empty to omit name"
        onInput={(e) => onChange({ ...config, name: (e.target as HTMLInputElement).value })}
      />
    </div>
  );
}

function ClockWidgetSettings({ config, onChange }: { config: ClockWidgetConfig; onChange: (c: WidgetConfig) => void }) {
  return (
    <Fragment>
      <div class="settings-row">
        <div class="settings-row-text"><span class="settings-row-label">Show time</span></div>
        <label class="toggle">
          <input type="checkbox" checked={config.showTime}
            onChange={(e) => onChange({ ...config, showTime: (e.target as HTMLInputElement).checked })} />
          <span class="toggle-slider" />
        </label>
      </div>
      <div class="settings-row">
        <div class="settings-row-text"><span class="settings-row-label">Show date</span></div>
        <label class="toggle">
          <input type="checkbox" checked={config.showDate}
            onChange={(e) => onChange({ ...config, showDate: (e.target as HTMLInputElement).checked })} />
          <span class="toggle-slider" />
        </label>
      </div>
      <div class="settings-row">
        <div class="settings-row-text"><span class="settings-row-label">Format</span></div>
        <div class="nt-format-toggle">
          <button class={`nt-format-btn${config.format === '24h' ? ' active' : ''}`} onClick={() => onChange({ ...config, format: '24h' })}>24h</button>
          <button class={`nt-format-btn${config.format === '12h' ? ' active' : ''}`} onClick={() => onChange({ ...config, format: '12h' })}>12h</button>
        </div>
      </div>
    </Fragment>
  );
}

function WeatherWidgetSettings({ config, onChange }: { config: WeatherWidgetConfig; onChange: (c: WidgetConfig) => void }) {
  return (
    <Fragment>
      <div class="nt-field">
        <label class="tg-label">Provider</label>
        <select class="nt-provider-select" value={config.provider}
          onChange={(e) => onChange({ ...config, provider: (e.target as HTMLSelectElement).value as 'open-meteo' | 'wttr' })}>
          <option value="open-meteo">Open-Meteo (recommended)</option>
          <option value="wttr">wttr.in</option>
        </select>
      </div>
      <div class="nt-field">
        <label class="tg-label">City</label>
        <input type="text" class="tg-input" value={config.city} placeholder="auto-detect by IP"
          onInput={(e) => onChange({ ...config, city: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="settings-row">
        <div class="settings-row-text"><span class="settings-row-label">Temperature unit</span></div>
        <div class="nt-format-toggle">
          <button class={`nt-format-btn${config.unit === 'C' ? ' active' : ''}`} onClick={() => onChange({ ...config, unit: 'C' })}>°C</button>
          <button class={`nt-format-btn${config.unit === 'F' ? ' active' : ''}`} onClick={() => onChange({ ...config, unit: 'F' })}>°F</button>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-text"><span class="settings-row-label">Show feels like</span></div>
        <label class="toggle">
          <input type="checkbox" checked={config.showFeelsLike}
            onChange={(e) => onChange({ ...config, showFeelsLike: (e.target as HTMLInputElement).checked })} />
          <span class="toggle-slider" />
        </label>
      </div>
      <div class="settings-row">
        <div class="settings-row-text"><span class="settings-row-label">Show humidity</span></div>
        <label class="toggle">
          <input type="checkbox" checked={config.showHumidity}
            onChange={(e) => onChange({ ...config, showHumidity: (e.target as HTMLInputElement).checked })} />
          <span class="toggle-slider" />
        </label>
      </div>
    </Fragment>
  );
}

// ─── Icon buttons ─────────────────────────────────────────────────────────────

const IconUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const IconDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconGear = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

// ─── NewTabIcon & NewTabSection ───────────────────────────────────────────────

export const NewTabIcon = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export function NewTabSection() {
  const [settings, setSettings] = useState<NewTabSettings>(DEFAULT_NEW_TAB_SETTINGS);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getNewTabSettings().then(setSettings);
  }, []);

  const save = async (next: NewTabSettings) => {
    setSettings(next);
    await newTabSettingsStore.set(next);
  };

  const activeProvider = getProvider(settings.activeProvider);

  const addWidget = (type: WidgetType) => {
    save({ ...settings, widgets: [...settings.widgets, defaultWidget(type)] });
  };

  const removeWidget = (id: string) => {
    if (expandedId === id) setExpandedId(null);
    save({ ...settings, widgets: settings.widgets.filter(w => w.id !== id) });
  };

  const moveWidget = (id: string, dir: -1 | 1) => {
    const idx = settings.widgets.findIndex(w => w.id === id);
    if (idx < 0) return;
    const next = [...settings.widgets];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    save({ ...settings, widgets: next });
  };

  const updateWidget = (updated: WidgetConfig) => {
    save({ ...settings, widgets: settings.widgets.map(w => w.id === updated.id ? updated : w) });
  };

  const availableToAdd = ALL_WIDGET_TYPES.filter(t => !settings.widgets.some(w => w.type === t));

  return (
    <Fragment>
      <div class="settings-section-header">
        <h1 class="settings-section-title">New Tab</h1>
        <p class="settings-section-subtitle">Replace the browser new tab page with a custom background and clock.</p>
      </div>

      <div class="settings-group nt-bg-panel">
        <div class="nt-bg-header">
          <span class="tg-browser-title">Background</span>
          <select
            class="nt-provider-select"
            value={settings.activeProvider}
            onChange={(e) => save({ ...settings, activeProvider: (e.target as HTMLSelectElement).value as WallpaperProviderId })}
          >
            {WALLPAPER_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {activeProvider && (
          <div class="nt-provider-body">
            <span class="nt-provider-label">{activeProvider.name}</span>
            <activeProvider.SettingsComponent
              settings={getProviderSettings(settings)}
              onChange={(s: unknown) => save(mergeProviderSettings(settings, s))}
            />
          </div>
        )}
      </div>

      <div class="nt-widgets-section">
        <div class="nt-widgets-header">
          <span class="tg-browser-title">Widgets</span>
          {availableToAdd.length > 0 && (
            <select
              class="nt-provider-select"
              value=""
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value as WidgetType;
                if (val) addWidget(val);
              }}
            >
              <option value="">Add widget...</option>
              {availableToAdd.map(t => <option key={t} value={t}>{WIDGET_LABELS[t]}</option>)}
            </select>
          )}
        </div>

        <div class="nt-widget-list">
          {settings.widgets.map((widget, idx) => {
            const expanded = expandedId === widget.id;
            return (
              <div key={widget.id} class="nt-widget-card">
                <div class="nt-widget-card-header">
                  <div class="nt-widget-card-info">
                    <div class="nt-widget-card-title">{WIDGET_LABELS[widget.type]}</div>
                    <div class="nt-widget-card-desc">{WIDGET_DESCRIPTIONS[widget.type]}</div>
                  </div>
                  <div class="nt-widget-card-actions">
                    <button
                      class="nt-widget-action-btn"
                      disabled={idx === 0}
                      onClick={() => moveWidget(widget.id, -1)}
                      title="Move up"
                    ><IconUp /></button>
                    <button
                      class="nt-widget-action-btn"
                      disabled={idx === settings.widgets.length - 1}
                      onClick={() => moveWidget(widget.id, 1)}
                      title="Move down"
                    ><IconDown /></button>
                    <button
                      class={`nt-widget-action-btn${expanded ? ' active' : ''}`}
                      onClick={() => setExpandedId(expanded ? null : widget.id)}
                      title="Settings"
                    ><IconGear /></button>
                    <button
                      class="nt-widget-action-btn nt-widget-action-btn-danger"
                      onClick={() => removeWidget(widget.id)}
                      title="Remove"
                    ><IconTrash /></button>
                  </div>
                </div>
                {expanded && (
                  <div class="nt-widget-settings">
                    <div class="nt-field">
                      <label class="tg-label">Size: {widget.size}</label>
                      <input
                        type="range" min="1" max="5" step="1" value={widget.size}
                        class="nt-range"
                        onInput={(e) => updateWidget({ ...widget, size: Number((e.target as HTMLInputElement).value) })}
                      />
                    </div>
                    {widget.type === 'greeting' && <GreetingWidgetSettings config={widget} onChange={updateWidget} />}
                    {widget.type === 'clock' && <ClockWidgetSettings config={widget} onChange={updateWidget} />}
                    {widget.type === 'weather' && <WeatherWidgetSettings config={widget} onChange={updateWidget} />}
                  </div>
                )}
              </div>
            );
          })}
          {settings.widgets.length === 0 && (
            <div class="nt-widget-empty">No widgets added. Use "Add widget" above.</div>
          )}
        </div>
      </div>
    </Fragment>
  );
}
