export type TemperatureUnit = 'celsius' | 'fahrenheit';

export type WindSpeedUnit = 'kmh' | 'mph';

export interface LocationEntry {
  id: string;
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  isCurrentLocation: boolean;
}

export interface CurrentWeather {
  temperatureC: number;
  apparentTemperatureC: number;
  wmoCode: number;
  windSpeedKmh: number;
  relativeHumidityPercent: number;
}

export interface HourlyForecastItem {
  isoTime: string;
  temperatureC: number;
  wmoCode: number;
  precipitationProbabilityPercent: number;
}

export interface DailyForecastItem {
  isoDate: string;
  tempMaxC: number;
  tempMinC: number;
  wmoCode: number;
  precipitationProbabilityMaxPercent: number;
}

export interface WeatherSnapshot {
  locationId: string;
  fetchedAt: string;
  current: CurrentWeather;
  hourly: HourlyForecastItem[]; // 24 items in WeatherSnapshot
  daily: DailyForecastItem[]; // 14 items in WeatherSnapshot
}

export interface RadarAnimationFrame {
  timestamp: number;
  overlayTileUrl: string;
  tileUrlTemplate: string;
  isForecast?: boolean;
}

export interface RadarTileSnapshot {
  zoom: number;
  tileX: number;
  tileY: number;
  markerOffsetX: number;
  markerOffsetY: number;
  radarTimestamp: number | null;
  baseTileUrl: string;
  overlayTileUrl: string | null;
  frames?: RadarAnimationFrame[];
}

export interface UserPreferences {
  temperatureUnit: TemperatureUnit;
  windSpeedUnit: WindSpeedUnit;
  lastSelectedLocationId: string | null;
}

export interface WmoConditionInfo {
  wmoCode: number;
  label: string;
  iconName: string;
}

const MPH_PER_KMH = 0.621371;

function normalizeZero(n: number): number {
  return Object.is(n, -0) || n === 0 ? 0 : n;
}

/**
 * Converts a canonical Celsius temperature into the target display unit (`celsius` or `fahrenheit`),
 * rounded to the nearest integer, normalizing `-0` to `0`.
 */
export function convertTemperature(
  celsius: number,
  unit: TemperatureUnit
): { value: number; formatted: string } {
  const raw = unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius;
  const rounded = normalizeZero(Math.round(raw));
  const suffix = unit === 'fahrenheit' ? '°F' : '°C';
  return {
    value: rounded,
    formatted: `${rounded}${suffix}`,
  };
}

/**
 * Converts a canonical km/h wind speed into the target display unit (`kmh` or `mph`),
 * rounded to the nearest integer, normalizing `-0` to `0`.
 */
export function convertWindSpeed(
  kmh: number,
  unit: WindSpeedUnit
): { value: number; formatted: string } {
  const raw = unit === 'mph' ? kmh * MPH_PER_KMH : kmh;
  const rounded = normalizeZero(Math.round(raw));
  const suffix = unit === 'mph' ? 'mph' : 'km/h';
  return {
    value: rounded,
    formatted: `${rounded} ${suffix}`,
  };
}

const WMO_LOOKUP: Record<number, { label: string; iconName: string }> = {
  0: { label: 'Clear sky', iconName: 'weather-sunny' },
  1: { label: 'Mainly clear', iconName: 'weather-partly-cloudy' },
  2: { label: 'Partly cloudy', iconName: 'weather-partly-cloudy' },
  3: { label: 'Overcast', iconName: 'weather-cloudy' },
  45: { label: 'Fog', iconName: 'weather-fog' },
  48: { label: 'Depositing rime fog', iconName: 'weather-fog' },
  51: { label: 'Light drizzle', iconName: 'weather-rainy' },
  53: { label: 'Moderate drizzle', iconName: 'weather-rainy' },
  55: { label: 'Dense drizzle', iconName: 'weather-rainy' },
  56: { label: 'Light freezing drizzle', iconName: 'weather-snowy-rainy' },
  57: { label: 'Dense freezing drizzle', iconName: 'weather-snowy-rainy' },
  61: { label: 'Slight rain', iconName: 'weather-rainy' },
  63: { label: 'Moderate rain', iconName: 'weather-pouring' },
  65: { label: 'Heavy rain', iconName: 'weather-pouring' },
  66: { label: 'Light freezing rain', iconName: 'weather-snowy-rainy' },
  67: { label: 'Heavy freezing rain', iconName: 'weather-snowy-rainy' },
  71: { label: 'Slight snow', iconName: 'weather-snowy' },
  73: { label: 'Moderate snow', iconName: 'weather-snowy' },
  75: { label: 'Heavy snow', iconName: 'weather-snowy-heavy' },
  77: { label: 'Snow grains', iconName: 'weather-snowy' },
  80: { label: 'Slight rain showers', iconName: 'weather-rainy' },
  81: { label: 'Moderate rain showers', iconName: 'weather-pouring' },
  82: { label: 'Violent rain showers', iconName: 'weather-pouring' },
  85: { label: 'Slight snow showers', iconName: 'weather-snowy' },
  86: { label: 'Heavy snow showers', iconName: 'weather-snowy-heavy' },
  95: { label: 'Thunderstorm', iconName: 'weather-lightning' },
  96: { label: 'Thunderstorm with slight hail', iconName: 'weather-lightning-rainy' },
  99: { label: 'Thunderstorm with heavy hail', iconName: 'weather-lightning-rainy' },
};

/**
 * Resolves a numeric WMO weather code into a human-readable condition label and MaterialCommunityIcons icon identifier.
 * Always returns a safe fallback for unrecognized or out-of-range codes.
 */
export function resolveWmoCondition(wmoCode: number): WmoConditionInfo {
  const safeCode = Number.isFinite(wmoCode) ? wmoCode : -1;
  const direct = WMO_LOOKUP[safeCode];
  if (direct) {
    return {
      wmoCode,
      label: direct.label,
      iconName: direct.iconName,
    };
  }

  if (safeCode >= 1 && safeCode <= 3) {
    return { wmoCode, label: 'Partly cloudy', iconName: 'weather-partly-cloudy' };
  }
  if (safeCode >= 45 && safeCode <= 48) {
    return { wmoCode, label: 'Fog', iconName: 'weather-fog' };
  }
  if (safeCode >= 51 && safeCode <= 57) {
    return { wmoCode, label: 'Drizzle', iconName: 'weather-rainy' };
  }
  if (safeCode >= 61 && safeCode <= 67) {
    return { wmoCode, label: 'Rain', iconName: 'weather-rainy' };
  }
  if (safeCode >= 71 && safeCode <= 77) {
    return { wmoCode, label: 'Snow', iconName: 'weather-snowy' };
  }
  if (safeCode >= 80 && safeCode <= 82) {
    return { wmoCode, label: 'Rain showers', iconName: 'weather-pouring' };
  }
  if (safeCode >= 85 && safeCode <= 86) {
    return { wmoCode, label: 'Snow showers', iconName: 'weather-snowy' };
  }
  if (safeCode >= 95 && safeCode <= 99) {
    return { wmoCode, label: 'Thunderstorm', iconName: 'weather-lightning' };
  }

  return {
    wmoCode,
    label: 'Unknown',
    iconName: 'weather-cloudy',
  };
}
