import { Store } from '../../utils';
import { StoreType } from '../../types';
import type { NewTabSettings } from './types';

export const DEFAULT_NEW_TAB_SETTINGS: NewTabSettings = {
  activeProvider: 'picsum',
  solidColor: { color: '#0d1117' },
  gradient: { from: '#0d1117', to: '#1e1c14', angle: 135 },
  picsum: { seed: '', blur: 0, grayscale: false, refreshInterval: 15 },
  gameOfLife: { cellSize: 8, speed: 100, opacity: 0.6, density: 0.1, resetInterval: 5 },
  widgets: [
    { id: 'clock', type: 'clock', size: 3, showTime: true, showDate: true, format: '12h' },
  ],
};

export const newTabSettingsStore = new Store<NewTabSettings>('new_tab_settings', StoreType.LOCAL);

export async function getNewTabSettings(): Promise<NewTabSettings> {
  const stored = await newTabSettingsStore.get();
  if (!stored) return DEFAULT_NEW_TAB_SETTINGS;
  return {
    ...DEFAULT_NEW_TAB_SETTINGS,
    ...stored,
    widgets: (stored.widgets ?? DEFAULT_NEW_TAB_SETTINGS.widgets).map((w: any) =>
      w.type === 'weather' ? { effectOverride: 'auto', ...w } : w
    ),
  };
}
