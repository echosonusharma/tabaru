import { h } from 'preact';
import type { GradientSettings } from '../types';

export function GradientBackground({ settings }: { settings: GradientSettings }) {
  return (
    <div
      class="nt-background"
      style={{ background: `linear-gradient(${settings.angle}deg, ${settings.from}, ${settings.to})` }}
    />
  );
}

export function GradientSettingsUI({ settings, onChange }: {
  settings: GradientSettings;
  onChange: (s: GradientSettings) => void;
}) {
  return (
    <div class="nt-fields">
      <div class="nt-field">
        <label class="tg-label">From color</label>
        <div class="nt-color-row">
          <input
            type="color"
            value={settings.from}
            class="nt-color-input"
            onInput={(e) => onChange({ ...settings, from: (e.target as HTMLInputElement).value })}
          />
          <input
            type="text"
            value={settings.from}
            class="tg-input nt-color-text"
            placeholder="#000000"
            onInput={(e) => onChange({ ...settings, from: (e.target as HTMLInputElement).value })}
          />
        </div>
      </div>
      <div class="nt-field">
        <label class="tg-label">To color</label>
        <div class="nt-color-row">
          <input
            type="color"
            value={settings.to}
            class="nt-color-input"
            onInput={(e) => onChange({ ...settings, to: (e.target as HTMLInputElement).value })}
          />
          <input
            type="text"
            value={settings.to}
            class="tg-input nt-color-text"
            placeholder="#ffffff"
            onInput={(e) => onChange({ ...settings, to: (e.target as HTMLInputElement).value })}
          />
        </div>
      </div>
      <div class="nt-field">
        <label class="tg-label">Angle: {settings.angle}°</label>
        <input
          type="range"
          min="0"
          max="360"
          value={settings.angle}
          class="nt-range"
          onInput={(e) => onChange({ ...settings, angle: Number((e.target as HTMLInputElement).value) })}
        />
      </div>
    </div>
  );
}
