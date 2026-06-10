import { h } from 'preact';
import type { SolidColorSettings } from '../types';

export function SolidColorBackground({ settings }: { settings: SolidColorSettings }) {
  return <div class="nt-background" style={{ background: settings.color }} />;
}

export function SolidColorSettingsUI({ settings, onChange }: {
  settings: SolidColorSettings;
  onChange: (s: SolidColorSettings) => void;
}) {
  return (
    <div class="nt-field">
      <label class="tg-label">Color</label>
      <div class="nt-color-row">
        <input
          type="color"
          value={settings.color}
          class="nt-color-input"
          onInput={(e) => onChange({ color: (e.target as HTMLInputElement).value })}
        />
        <input
          type="text"
          value={settings.color}
          class="tg-input nt-color-text"
          placeholder="#000000"
          onInput={(e) => onChange({ color: (e.target as HTMLInputElement).value })}
        />
      </div>
    </div>
  );
}
