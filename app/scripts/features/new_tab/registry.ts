import type { WallpaperProviderDef, WallpaperProviderId } from './types';
import { SolidColorBackground, SolidColorSettingsUI } from './providers/solid_color';
import { GradientBackground, GradientSettingsUI } from './providers/gradient';
import { PicsumBackground, PicsumSettingsUI } from './providers/picsum';

export const WALLPAPER_PROVIDERS: WallpaperProviderDef<any>[] = [
  {
    id: 'picsum' as WallpaperProviderId,
    name: 'Lorem Picsum (random images)',
    BackgroundComponent: PicsumBackground,
    SettingsComponent: PicsumSettingsUI,
  },
  {
    id: 'gradient' as WallpaperProviderId,
    name: 'Gradient',
    BackgroundComponent: GradientBackground,
    SettingsComponent: GradientSettingsUI,
  },
  {
    id: 'solid_color' as WallpaperProviderId,
    name: 'Solid Color',
    BackgroundComponent: SolidColorBackground,
    SettingsComponent: SolidColorSettingsUI,
  },
];

export function getProvider(id: WallpaperProviderId): WallpaperProviderDef<any> | undefined {
  return WALLPAPER_PROVIDERS.find((p) => p.id === id);
}
