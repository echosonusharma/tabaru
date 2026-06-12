import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import browser from 'webextension-polyfill';
import type { WeatherWidgetConfig, EffectId } from '../types';

export function wmoToEffect(code: number): EffectId {
  if (code === 0) return 'stars';             // clear sky
  if (code <= 3)  return 'none';              // cloudy
  if (code <= 48) return 'fog';               // fog / rime fog
  if (code <= 67) return 'rain';              // drizzle + rain
  if (code <= 77) return 'snow';              // snow fall + grains
  if (code <= 82) return 'rain';              // rain showers
  if (code <= 86) return 'snow';              // snow showers
  return 'storm';                             // thunderstorm
}

interface WeatherData {
  city: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  weatherCode: number;
}

function wmoEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

async function fetchWeather(config: WeatherWidgetConfig): Promise<WeatherData> {
  const result = await browser.runtime.sendMessage({
    action: 'fetchWeather',
    data: { provider: config.provider, city: config.city, unit: config.unit },
  }) as any;
  if (!result) throw new Error('no result');
  if (result.error) throw new Error(result.error);
  return result as WeatherData;
}

export function WeatherWidget({ config, onEffectChange }: {
  config: WeatherWidgetConfig;
  onEffectChange?: (effect: EffectId) => void;
}) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!config.enableEffects) { onEffectChange?.('none'); return; }
    if (config.effectOverride !== 'auto') { onEffectChange?.(config.effectOverride); return; }
    // auto + enableEffects toggled on - apply last fetched code if available
    if (lastCodeRef.current !== null) onEffectChange?.(wmoToEffect(lastCodeRef.current));
  }, [config.enableEffects, config.effectOverride]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    fetchWeather(config)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          lastCodeRef.current = d.weatherCode;
          if (config.enableEffects && config.effectOverride === 'auto') {
            onEffectChange?.(wmoToEffect(d.weatherCode));
          }
        }
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'unknown error'); });

    return () => { cancelled = true; };
  }, [config.city, config.unit, config.provider]);

  if (error) return <div class="nt-weather nt-weather-error">Weather unavailable</div>;
  if (!data) return null;

  return (
    <div class="nt-weather">
      <div class="nt-weather-top">
        <span class="nt-weather-city">{data.city}</span>
        <span class="nt-weather-icon">{wmoEmoji(data.weatherCode)}</span>
        <span class="nt-weather-temp">{data.temp}°{config.unit}</span>
      </div>
      <div class="nt-weather-details">
        {config.showFeelsLike && (
          <div class="nt-weather-row">
            <span class="nt-weather-val">{data.feelsLike}°</span>
            <span class="nt-weather-label">Feels like</span>
          </div>
        )}
        {config.showHumidity && (
          <div class="nt-weather-row">
            <span class="nt-weather-val">{data.humidity}%</span>
            <span class="nt-weather-label">Humidity</span>
          </div>
        )}
      </div>
    </div>
  );
}
