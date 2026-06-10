import type { ComponentType } from 'preact';

export type WallpaperProviderId = 'solid_color' | 'gradient' | 'picsum';
export type ClockFormat = '12h' | '24h';
export type WidgetType = 'greeting' | 'clock' | 'weather';

export interface GreetingWidgetConfig {
  id: string;
  type: 'greeting';
  size: number;
  name: string;
}

export interface ClockWidgetConfig {
  id: string;
  type: 'clock';
  size: number;
  showTime: boolean;
  showDate: boolean;
  format: ClockFormat;
}

export interface WeatherWidgetConfig {
  id: string;
  type: 'weather';
  size: number;
  provider: 'open-meteo' | 'wttr';
  city: string;
  unit: 'C' | 'F';
  showFeelsLike: boolean;
  showHumidity: boolean;
  enableEffects: boolean;
  effectOverride: EffectId | 'auto';
}

export type WidgetConfig = GreetingWidgetConfig | ClockWidgetConfig | WeatherWidgetConfig;

export interface SolidColorSettings { color: string; }

export interface GradientSettings { from: string; to: string; angle: number; }

export interface PicsumSettings {
  seed: string;
  blur: number;
  grayscale: boolean;
  refreshInterval: number;
}

export type EffectId = 'none' | 'rain' | 'storm' | 'snow' | 'fog' | 'stars';

export interface NewTabSettings {
  activeProvider: WallpaperProviderId;
  solidColor: SolidColorSettings;
  gradient: GradientSettings;
  picsum: PicsumSettings;
  widgets: WidgetConfig[];
}

export interface WallpaperProviderDef<S = unknown> {
  id: WallpaperProviderId;
  name: string;
  BackgroundComponent: ComponentType<{ settings: S }>;
  SettingsComponent: ComponentType<{ settings: S; onChange: (s: S) => void }>;
}
