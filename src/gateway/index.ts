import {
  LocationEntry,
  WeatherSnapshot,
  RadarTileSnapshot,
  RadarAnimationFrame,
  HourlyForecastItem,
  DailyForecastItem,
} from '../domain';

const DEFAULT_RADAR_ZOOM = 7;
const MAX_MERCATOR_LATITUDE = 85.0511;

interface OpenMeteoForecastResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    relative_humidity_2m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    precipitation_probability?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

interface RainViewerFrameRaw {
  time?: number;
  path?: string;
}

interface RainViewerResponse {
  host?: string;
  radar?: {
    past?: RainViewerFrameRaw[];
    nowcast?: RainViewerFrameRaw[];
  };
}

interface OpenMeteoGeocodingResponse {
  results?: Array<{
    id?: number | string;
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }>;
}

/**
 * Computes Web Mercator slippy-tile coordinates (`zoom`, `tileX`, `tileY`)
 * and pixel marker offsets (`markerOffsetX`, `markerOffsetY` in `[0, 256)`)
 * for a given latitude, longitude, and zoom level (default 7).
 */
export function computeRadarTileCoordinates(
  latitude: number,
  longitude: number,
  zoom: number = DEFAULT_RADAR_ZOOM
): {
  zoom: number;
  tileX: number;
  tileY: number;
  markerOffsetX: number;
  markerOffsetY: number;
} {
  const n = Math.pow(2, zoom);

  // Clamp latitude to Web Mercator bounds [-85.0511, +85.0511]
  const clampedLat = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude)
  );

  // Normalize longitude into [-180, 180]
  const clampedLon = Math.max(-180, Math.min(180, longitude));

  let xFloat = ((clampedLon + 180) / 360) * n;
  if (xFloat >= n) {
    // At exactly +180 longitude, keep within the valid [0, n) tile range
    xFloat = n - 1e-9;
  } else if (xFloat < 0) {
    xFloat = 0;
  }

  const latRad = (clampedLat * Math.PI) / 180;
  let yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  if (yFloat >= n) {
    yFloat = n - 1e-9;
  } else if (yFloat < 0) {
    yFloat = 0;
  }

  const tileX = Math.floor(xFloat);
  const tileY = Math.floor(yFloat);

  const markerOffsetX = Math.min(
    255,
    Math.max(0, Math.floor((xFloat - tileX) * 256))
  );
  const markerOffsetY = Math.min(
    255,
    Math.max(0, Math.floor((yFloat - tileY) * 256))
  );

  return {
    zoom,
    tileX,
    tileY,
    markerOffsetX,
    markerOffsetY,
  };
}

function parseOpenMeteoForecast(
  locationId: string,
  payload: unknown
): WeatherSnapshot {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Open-Meteo forecast response is missing or malformed.');
  }

  const data = payload as OpenMeteoForecastResponse;
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;

  if (
    !current ||
    typeof current.temperature_2m !== 'number' ||
    typeof current.apparent_temperature !== 'number' ||
    typeof current.weather_code !== 'number' ||
    typeof current.wind_speed_10m !== 'number' ||
    typeof current.relative_humidity_2m !== 'number'
  ) {
    throw new Error(
      'Open-Meteo forecast response is missing required current weather fields.'
    );
  }

  if (
    !hourly ||
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.temperature_2m) ||
    !Array.isArray(hourly.weather_code) ||
    !Array.isArray(hourly.precipitation_probability) ||
    hourly.time.length === 0
  ) {
    throw new Error(
      'Open-Meteo forecast response is missing required hourly forecast arrays.'
    );
  }

  if (
    !daily ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.precipitation_probability_max) ||
    daily.time.length === 0
  ) {
    throw new Error(
      'Open-Meteo forecast response is missing required daily forecast arrays.'
    );
  }

  // Determine starting hourly index based on current.time if available and sufficient entries remain
  let startIndex = 0;
  if (typeof current.time === 'string') {
    const currentHourPrefix = current.time.slice(0, 13);
    const matchedIdx = hourly.time.findIndex(
      (t) => typeof t === 'string' && t.slice(0, 13) >= currentHourPrefix
    );
    if (matchedIdx >= 0 && hourly.time.length - matchedIdx >= 24) {
      startIndex = matchedIdx;
    }
  }

  const hourlySliceCount = Math.min(24, hourly.time.length - startIndex);
  const hourlyItems: HourlyForecastItem[] = [];
  for (let i = 0; i < hourlySliceCount; i++) {
    const idx = startIndex + i;
    const isoTime = hourly.time[idx];
    const temperatureC = hourly.temperature_2m[idx];
    const wmoCode = hourly.weather_code[idx];
    const precipitationProbabilityPercent =
      hourly.precipitation_probability[idx] ?? 0;

    if (
      typeof isoTime !== 'string' ||
      typeof temperatureC !== 'number' ||
      typeof wmoCode !== 'number'
    ) {
      throw new Error(
        'Open-Meteo forecast response contains malformed hourly entry.'
      );
    }

    hourlyItems.push({
      isoTime,
      temperatureC,
      wmoCode,
      precipitationProbabilityPercent:
        typeof precipitationProbabilityPercent === 'number'
          ? precipitationProbabilityPercent
          : 0,
    });
  }

  const dailySliceCount = Math.min(14, daily.time.length);
  const dailyItems: DailyForecastItem[] = [];
  for (let i = 0; i < dailySliceCount; i++) {
    const isoDate = daily.time[i];
    const tempMaxC = daily.temperature_2m_max[i];
    const tempMinC = daily.temperature_2m_min[i];
    const wmoCode = daily.weather_code[i];
    const precipitationProbabilityMaxPercent =
      daily.precipitation_probability_max[i] ?? 0;

    if (
      typeof isoDate !== 'string' ||
      typeof tempMaxC !== 'number' ||
      typeof tempMinC !== 'number' ||
      typeof wmoCode !== 'number'
    ) {
      throw new Error(
        'Open-Meteo forecast response contains malformed daily entry.'
      );
    }

    dailyItems.push({
      isoDate,
      tempMaxC,
      tempMinC,
      wmoCode,
      precipitationProbabilityMaxPercent:
        typeof precipitationProbabilityMaxPercent === 'number'
          ? precipitationProbabilityMaxPercent
          : 0,
    });
  }

  return {
    locationId,
    fetchedAt: new Date().toISOString(),
    current: {
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      wmoCode: current.weather_code,
      windSpeedKmh: current.wind_speed_10m,
      relativeHumidityPercent: current.relative_humidity_2m,
    },
    hourly: hourlyItems,
    daily: dailyItems,
  };
}

export interface RainViewerMetadataResult {
  host: string;
  path: string;
  timestamp: number;
  rawFrames: Array<{ time: number; path: string; isForecast: boolean }>;
}

/**
 * Fetches live RainViewer radar metadata (`host`, recent `radar.past` frames,
 * and future `radar.nowcast` / synthetic forecast frames up to +2h).
 * Returns `null` gracefully if the network call fails or no valid frames exist.
 */
export async function fetchRainViewerMetadata(): Promise<RainViewerMetadataResult | null> {
  try {
    const response = await fetch(
      'https://api.rainviewer.com/public/weather-maps.json'
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as RainViewerResponse;
    const host =
      typeof data?.host === 'string' && data.host.length > 0
        ? data.host
        : 'https://tilecache.rainviewer.com';
    const pastFrames = data?.radar?.past;
    if (!Array.isArray(pastFrames) || pastFrames.length === 0) {
      return null;
    }

    const validPastFrames = pastFrames.filter(
      (f): f is { time: number; path: string } =>
        Boolean(
          f &&
            typeof f.path === 'string' &&
            f.path.length > 0 &&
            typeof f.time === 'number'
        )
    );

    if (validPastFrames.length === 0) {
      return null;
    }

    // Keep the most recent 10 past frames for smooth radar playback
    const recentPast = validPastFrames.slice(-10).map((f) => ({
      time: f.time,
      path: f.path,
      isForecast: false,
    }));
    const latestFrame = recentPast[recentPast.length - 1];

    // Parse RainViewer nowcast frames if present, or generate future prediction steps (+30m, +1h, +1.5h, +2h)
    const nowcastRaw = Array.isArray(data?.radar?.nowcast)
      ? data.radar.nowcast.filter(
          (f): f is { time: number; path: string } =>
            Boolean(
              f &&
                typeof f.path === 'string' &&
                f.path.length > 0 &&
                typeof f.time === 'number'
            )
        )
      : [];

    const futureFrames: Array<{
      time: number;
      path: string;
      isForecast: boolean;
    }> =
      nowcastRaw.length > 0
        ? nowcastRaw.map((f) => ({
            time: f.time,
            path: f.path,
            isForecast: true,
          }))
        : [1800, 3600, 5400, 7200].map((offsetSec) => ({
            time: latestFrame.time + offsetSec,
            path: latestFrame.path,
            isForecast: true,
          }));

    return {
      host,
      path: latestFrame.path,
      timestamp: latestFrame.time,
      rawFrames: [...recentPast, ...futureFrames],
    };
  } catch {
    return null;
  }
}

/**
 * Fetches canonical Metric forecast data from Open-Meteo and radar metadata from RainViewer in parallel,
 * returning a normalized `WeatherSnapshot` and `RadarTileSnapshot`.
 * If RainViewer fails or has no radar frames, resolves with `overlayTileUrl: null` and `radarTimestamp: null`.
 */
export async function fetchWeatherAndRadar(
  location: LocationEntry
): Promise<{ weather: WeatherSnapshot; radar: RadarTileSnapshot }> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(location.latitude))}` +
    `&longitude=${encodeURIComponent(String(location.longitude))}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&forecast_days=14` +
    `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`;

  const forecastPromise = (async () => {
    let response: Response;
    try {
      response = await fetch(forecastUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Open-Meteo forecast network error: ${msg}`);
    }

    if (!response.ok) {
      throw new Error(
        `Open-Meteo forecast request failed with HTTP ${response.status}`
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new Error('Open-Meteo forecast response contained invalid JSON.');
    }

    return parseOpenMeteoForecast(location.id, json);
  })();

  const radarMetaPromise = fetchRainViewerMetadata();

  const [weather, radarMeta] = await Promise.all([
    forecastPromise,
    radarMetaPromise,
  ]);

  const coords = computeRadarTileCoordinates(
    location.latitude,
    location.longitude,
    DEFAULT_RADAR_ZOOM
  );

  const baseTileUrl = `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${coords.zoom}/${coords.tileY}/${coords.tileX}`;
  const overlayTileUrl = radarMeta
    ? `${radarMeta.host}${radarMeta.path}/256/${coords.zoom}/${coords.tileX}/${coords.tileY}/2/1_1.png`
    : null;
  const radarTimestamp = radarMeta ? radarMeta.timestamp : null;
  const frames: RadarAnimationFrame[] = radarMeta
    ? radarMeta.rawFrames.map((f) => ({
        timestamp: f.time,
        overlayTileUrl: `${radarMeta.host}${f.path}/256/${coords.zoom}/${coords.tileX}/${coords.tileY}/2/1_1.png`,
        tileUrlTemplate: `${radarMeta.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
        isForecast: f.isForecast,
      }))
    : [];

  const radar: RadarTileSnapshot = {
    zoom: coords.zoom,
    tileX: coords.tileX,
    tileY: coords.tileY,
    markerOffsetX: coords.markerOffsetX,
    markerOffsetY: coords.markerOffsetY,
    radarTimestamp,
    baseTileUrl,
    overlayTileUrl,
    frames,
  };

  return { weather, radar };
}

/**
 * Searches candidate cities by name via the Open-Meteo Geocoding API.
 * Trims `query` and returns `[]` without network traffic if fewer than 2 characters.
 */
export async function searchCities(query: string): Promise<LocationEntry[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    trimmed
  )}&count=8&language=en&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Open-Meteo geocoding request failed with HTTP ${response.status}`
    );
  }

  const data = (await response.json()) as OpenMeteoGeocodingResponse;
  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  const entries: LocationEntry[] = [];
  for (const item of data.results) {
    if (
      item &&
      typeof item.name === 'string' &&
      typeof item.latitude === 'number' &&
      typeof item.longitude === 'number'
    ) {
      const id =
        item.id !== undefined && item.id !== null
          ? String(item.id)
          : `${item.name.toLowerCase()}-${item.latitude.toFixed(4)}-${item.longitude.toFixed(4)}`;

      entries.push({
        id,
        name: item.name,
        region: typeof item.admin1 === 'string' ? item.admin1 : undefined,
        country: typeof item.country === 'string' ? item.country : undefined,
        latitude: item.latitude,
        longitude: item.longitude,
        isCurrentLocation: false,
      });
    }
  }

  return entries;
}
