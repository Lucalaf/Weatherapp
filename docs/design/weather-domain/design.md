# weather-domain

Design specification for the `weather-domain` module (`src/domain/`) in `proj01`, an Android React Native + Expo TypeScript weather application.

## Functional Responsibilities

`weather-domain` defines the canonical domain contracts (`LocationEntry`, `WeatherSnapshot`, `RadarTileSnapshot`, `UserPreferences`), converts canonical Metric values into target display units, and maps WMO weather codes to human labels and icon identifiers.

## Encapsulated Knowledge

This module hides the exact unit conversion formulas, rounding precision, and WMO numeric code-to-description/icon lookup table.

## Classification

**Core Domain / Policy Hider (Information Hiding / Parnas):** Hides business rules, canonical baseline metric representations, and interpretation policies that must remain consistent across the system with zero dependency on React, Expo, networking, or storage.

## Integration Contracts

### Module Boundary Integrations

| Integration | Crosses Interface | Stays Hidden |
| --- | --- | --- |
| `remote-weather-gateway -> weather-domain` | Canonical domain types (`LocationEntry`, `WeatherSnapshot`, `RadarTileSnapshot`) and canonical baseline unit assumptions (Celsius, km/h). | Gateway hides HTTP URLs, raw JSON responses, and Web Mercator math; Domain hides display unit conversion and WMO icon mapping. |
| `location-and-preferences-store -> weather-domain` | Canonical `LocationEntry` and `UserPreferences` data structures. | Store hides `AsyncStorage` keys, JSON serialization, and `expo-location` native calls; Domain hides weather metrics and formatting. |
| `weather-dashboard-ui -> weather-domain` | Calls to pure formatter/selector functions (`convertTemperature(celsius, unit)`, `convertWindSpeed(kmh, unit)`, `resolveWmoCondition(wmoCode)`) using canonical `WeatherSnapshot` and current `UserPreferences`. | UI hides visual styling and layout; Domain hides conversion math, rounding, and WMO lookup tables. |

### Canonical Types

```ts
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

export interface RadarTileSnapshot {
  zoom: number;
  tileX: number;
  tileY: number;
  markerOffsetX: number;
  markerOffsetY: number;
  radarTimestamp: number | null;
  baseTileUrl: string;
  overlayTileUrl: string | null;
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
```

### Exported Functions

- `convertTemperature(celsius: number, unit: TemperatureUnit): { value: number; formatted: string }`
  - Converts Celsius to rounded target integer (`°C` or `°F`, where `F = C * 9 / 5 + 32`) and formats as e.g. `"22°C"` or `"72°F"`.
  - Handles negative zero (`-0` normalized to `0`).
- `convertWindSpeed(kmh: number, unit: WindSpeedUnit): { value: number; formatted: string }`
  - Converts km/h to rounded target integer (`km/h` or `mph`, where `mph = kmh * 0.621371`) and formats as e.g. `"15 km/h"` or `"9 mph"`.
- `resolveWmoCondition(wmoCode: number): WmoConditionInfo`
  - Maps standard WMO codes to human-readable labels and valid `MaterialCommunityIcons` icon names:
    - `0`: Clear sky
    - `1-3`: Mainly clear / Partly cloudy / Overcast
    - `45, 48`: Fog
    - `51-57`: Drizzle
    - `61-67`: Rain
    - `71-77`: Snow
    - `80-82`: Rain showers
    - `85-86`: Snow showers
    - `95-99`: Thunderstorm
  - Provides a safe fallback (`"Unknown"`, `"weather-cloudy"`) for unrecognized codes.

## Change Vectors

- Adjusting temperature or wind speed rounding precision.
- Adding derived weather calculations (e.g., dew point or heat index).
- Refining WMO condition wording or icon name mappings.
