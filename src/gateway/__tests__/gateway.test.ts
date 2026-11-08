import {
  computeRadarTileCoordinates,
  fetchWeatherAndRadar,
  searchCities,
} from '../index';
import { LocationEntry } from '../../domain';

const sampleLocation: LocationEntry = {
  id: 'city-rome',
  name: 'Rome',
  region: 'Lazio',
  country: 'Italy',
  latitude: 41.8919,
  longitude: 12.5113,
  isCurrentLocation: false,
};

function buildMockForecastPayload(hourlyCount = 30, dailyCount = 14) {
  return {
    current: {
      time: '2026-11-06T12:00',
      temperature_2m: 20.5,
      apparent_temperature: 19.8,
      weather_code: 1,
      wind_speed_10m: 12.4,
      relative_humidity_2m: 62,
    },
    hourly: {
      time: Array.from(
        { length: hourlyCount },
        (_, i) => `2026-11-06T${String(i % 24).padStart(2, '0')}:00`
      ),
      temperature_2m: Array.from({ length: hourlyCount }, (_, i) => 15 + (i % 10)),
      weather_code: Array.from({ length: hourlyCount }, () => 1),
      precipitation_probability: Array.from({ length: hourlyCount }, (_, i) => (i * 5) % 100),
    },
    daily: {
      time: Array.from(
        { length: dailyCount },
        (_, i) => `2026-11-${String(6 + i).padStart(2, '0')}`
      ),
      weather_code: Array.from({ length: dailyCount }, () => 2),
      temperature_2m_max: Array.from({ length: dailyCount }, (_, i) => 22 + i),
      temperature_2m_min: Array.from({ length: dailyCount }, (_, i) => 12 + i),
      precipitation_probability_max: Array.from({ length: dailyCount }, () => 25),
    },
  };
}

function buildMockRainViewerPayload() {
  return {
    host: 'https://tilecache.rainviewer.com',
    radar: {
      past: [
        { time: 1699999400, path: '/v2/radar/1699999400' },
        { time: 1700000000, path: '/v2/radar/1700000000' },
      ],
    },
  };
}

describe('remote-weather-gateway', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('Unit Tests', () => {
    test('computeRadarTileCoordinates uses default zoom 7 when zoom is omitted', () => {
      const result = computeRadarTileCoordinates(0, 0);
      expect(result).toEqual({
        zoom: 7,
        tileX: 64,
        tileY: 64,
        markerOffsetX: 0,
        markerOffsetY: 0,
      });
      expect(Number.isInteger(result.tileX)).toBe(true);
      expect(Number.isInteger(result.tileY)).toBe(true);
      expect(result.markerOffsetX).toBeGreaterThanOrEqual(0);
      expect(result.markerOffsetX).toBeLessThan(256);
      expect(result.markerOffsetY).toBeGreaterThanOrEqual(0);
      expect(result.markerOffsetY).toBeLessThan(256);
    });

    test('computeRadarTileCoordinates projects known mid-latitude coordinates at zoom 7', () => {
      const result = computeRadarTileCoordinates(45.4642, 9.19, 7);
      expect(result.zoom).toBe(7);
      expect(result.tileX).toBe(67);
      expect(result.tileY).toBe(45);
      expect(result.markerOffsetX).toBe(68);
      expect(result.markerOffsetY).toBe(207);
    });

    test('computeRadarTileCoordinates supports arbitrary zoom levels', () => {
      const z5 = computeRadarTileCoordinates(37.7749, -122.4194, 5);
      expect(z5.zoom).toBe(5);
      expect(z5.tileX).toBeGreaterThanOrEqual(0);
      expect(z5.tileX).toBeLessThan(32);
      expect(z5.tileY).toBeGreaterThanOrEqual(0);
      expect(z5.tileY).toBeLessThan(32);
      expect(z5.markerOffsetX).toBeGreaterThanOrEqual(0);
      expect(z5.markerOffsetX).toBeLessThan(256);
      expect(z5.markerOffsetY).toBeGreaterThanOrEqual(0);
      expect(z5.markerOffsetY).toBeLessThan(256);

      const z10 = computeRadarTileCoordinates(37.7749, -122.4194, 10);
      expect(z10.zoom).toBe(10);
      expect(z10.tileX).toBeGreaterThanOrEqual(0);
      expect(z10.tileX).toBeLessThan(1024);
      expect(z10.tileY).toBeGreaterThanOrEqual(0);
      expect(z10.tileY).toBeLessThan(1024);
      expect(z10.markerOffsetX).toBeGreaterThanOrEqual(0);
      expect(z10.markerOffsetX).toBeLessThan(256);
      expect(z10.markerOffsetY).toBeGreaterThanOrEqual(0);
      expect(z10.markerOffsetY).toBeLessThan(256);
    });

    test('computeRadarTileCoordinates produces integer tile indices and in-range pixel offsets', () => {
      const coordsList: Array<[number, number]> = [
        [40.7, -74.0],
        [-33.8, 151.2],
        [35.6, 139.6],
        [-34.6, -58.3],
      ];
      for (const [lat, lon] of coordsList) {
        const res = computeRadarTileCoordinates(lat, lon, 7);
        expect(Number.isInteger(res.tileX)).toBe(true);
        expect(Number.isInteger(res.tileY)).toBe(true);
        expect(res.tileX).toBeGreaterThanOrEqual(0);
        expect(res.tileX).toBeLessThan(128);
        expect(res.tileY).toBeGreaterThanOrEqual(0);
        expect(res.tileY).toBeLessThan(128);
        expect(res.markerOffsetX).toBeGreaterThanOrEqual(0);
        expect(res.markerOffsetX).toBeLessThan(256);
        expect(res.markerOffsetY).toBeGreaterThanOrEqual(0);
        expect(res.markerOffsetY).toBeLessThan(256);
      }
    });
  });

  describe('Integration Contract Tests', () => {
    test('fetchWeatherAndRadar normalizes Open-Meteo Forecast JSON into canonical WeatherSnapshot', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(30, 14),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => buildMockRainViewerPayload(),
        });
      });

      const { weather } = await fetchWeatherAndRadar(sampleLocation);
      expect(weather.locationId).toBe(sampleLocation.id);
      expect(typeof weather.fetchedAt).toBe('string');
      expect(weather.current).toEqual({
        temperatureC: 20.5,
        apparentTemperatureC: 19.8,
        wmoCode: 1,
        windSpeedKmh: 12.4,
        relativeHumidityPercent: 62,
      });
      expect(weather.hourly).toHaveLength(24);
      expect(weather.daily).toHaveLength(14);
    });

    test('fetchWeatherAndRadar constructs RadarTileSnapshot with OpenStreetMap baseTileUrl and RainViewer overlayTileUrl', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(24, 14),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => buildMockRainViewerPayload(),
        });
      });

      const { radar } = await fetchWeatherAndRadar(sampleLocation);
      const expectedCoords = computeRadarTileCoordinates(
        sampleLocation.latitude,
        sampleLocation.longitude,
        7
      );

      expect(radar.zoom).toBe(7);
      expect(radar.tileX).toBe(expectedCoords.tileX);
      expect(radar.tileY).toBe(expectedCoords.tileY);
      expect(radar.markerOffsetX).toBe(expectedCoords.markerOffsetX);
      expect(radar.markerOffsetY).toBe(expectedCoords.markerOffsetY);
      expect(radar.baseTileUrl).toBe(
        `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/7/${expectedCoords.tileY}/${expectedCoords.tileX}`
      );
      expect(radar.overlayTileUrl).toBe(
        `https://tilecache.rainviewer.com/v2/radar/1700000000/256/7/${expectedCoords.tileX}/${expectedCoords.tileY}/2/1_1.png`
      );
      expect(radar.radarTimestamp).toBe(1700000000);
    });

    test('searchCities maps Open-Meteo Geocoding results to normalized LocationEntry array', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 3169070,
              name: 'Rome',
              admin1: 'Lazio',
              country: 'Italy',
              latitude: 41.89193,
              longitude: 12.51133,
            },
            {
              id: 4219762,
              name: 'Rome',
              admin1: 'Georgia',
              country: 'United States',
              latitude: 34.25704,
              longitude: -85.16467,
            },
          ],
        }),
      });

      const results = await searchCities('Rome');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        {
          id: '3169070',
          name: 'Rome',
          region: 'Lazio',
          country: 'Italy',
          latitude: 41.89193,
          longitude: 12.51133,
          isCurrentLocation: false,
        },
        {
          id: '4219762',
          name: 'Rome',
          region: 'Georgia',
          country: 'United States',
          latitude: 34.25704,
          longitude: -85.16467,
          isCurrentLocation: false,
        },
      ]);
    });

    test('searchCities returns empty array when Open-Meteo Geocoding response omits results', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ generationtime_ms: 0.5 }),
      });

      const results = await searchCities('zzzznotacity');
      expect(results).toEqual([]);
    });
  });

  describe('Boundary Tests', () => {
    test('computeRadarTileCoordinates clamps latitude above +85.0511', () => {
      const at90 = computeRadarTileCoordinates(90, 0, 7);
      const atMax = computeRadarTileCoordinates(85.0511, 0, 7);

      expect(at90).toEqual(atMax);
      expect(at90.tileY).toBe(0);
      expect(at90.markerOffsetY).toBeGreaterThanOrEqual(0);
      expect(at90.markerOffsetY).toBeLessThan(256);
    });

    test('computeRadarTileCoordinates clamps latitude below -85.0511', () => {
      const atNeg90 = computeRadarTileCoordinates(-90, 0, 7);
      const atMin = computeRadarTileCoordinates(-85.0511, 0, 7);

      expect(atNeg90).toEqual(atMin);
      expect(atNeg90.tileY).toBe(127);
      expect(atNeg90.markerOffsetY).toBeGreaterThanOrEqual(0);
      expect(atNeg90.markerOffsetY).toBeLessThan(256);
    });

    test('computeRadarTileCoordinates handles antimeridian longitudes (-180 and +180)', () => {
      const west = computeRadarTileCoordinates(0, -180, 7);
      const east = computeRadarTileCoordinates(0, 180, 7);

      expect(west.tileX).toBe(0);
      expect(west.markerOffsetX).toBeGreaterThanOrEqual(0);
      expect(west.markerOffsetX).toBeLessThan(256);

      expect(east.tileX).toBeGreaterThanOrEqual(0);
      expect(east.tileX).toBeLessThan(128);
      expect(east.markerOffsetX).toBeGreaterThanOrEqual(0);
      expect(east.markerOffsetX).toBeLessThan(256);
    });

    test('searchCities short-circuits on empty string without calling fetch', async () => {
      const res = await searchCities('');
      expect(res).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('searchCities short-circuits on whitespace-only string without calling fetch', async () => {
      const res = await searchCities('   ');
      expect(res).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('searchCities short-circuits on single-character query (< 2 characters) without calling fetch', async () => {
      const res1 = await searchCities('a');
      const res2 = await searchCities(' a ');
      expect(res1).toEqual([]);
      expect(res2).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    test('searchCities executes fetch when trimmed query has exactly 2 characters', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 1,
              name: 'Rome',
              latitude: 41.89,
              longitude: 12.51,
            },
          ],
        }),
      });

      const res = await searchCities('Ro');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(res).toHaveLength(1);
      expect(res[0].name).toBe('Rome');
    });

    test('fetchWeatherAndRadar slices or limits hourly to 24 items and daily to 14 items', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(168, 16),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => buildMockRainViewerPayload(),
        });
      });

      const { weather } = await fetchWeatherAndRadar(sampleLocation);
      expect(weather.hourly).toHaveLength(24);
      expect(weather.daily).toHaveLength(14);
    });
  });

  describe('Behavior Tests', () => {
    test('fetchWeatherAndRadar degrades gracefully when RainViewer returns HTTP 500', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(24, 14),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({}),
        });
      });

      const { weather, radar } = await fetchWeatherAndRadar(sampleLocation);
      expect(weather.current.temperatureC).toBe(20.5);
      expect(radar.baseTileUrl).toContain('services.arcgisonline.com');
      expect(radar.overlayTileUrl).toBeNull();
      expect(radar.radarTimestamp).toBeNull();
    });

    test('fetchWeatherAndRadar degrades gracefully when RainViewer request rejects with network error', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(24, 14),
          });
        }
        return Promise.reject(new TypeError('Network request failed'));
      });

      const { weather, radar } = await fetchWeatherAndRadar(sampleLocation);
      expect(weather.hourly).toHaveLength(24);
      expect(radar.overlayTileUrl).toBeNull();
      expect(radar.radarTimestamp).toBeNull();
    });

    test('fetchWeatherAndRadar degrades gracefully when RainViewer returns empty radar.past frames', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(24, 14),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            host: 'https://tilecache.rainviewer.com',
            radar: { past: [] },
          }),
        });
      });

      const { weather, radar } = await fetchWeatherAndRadar(sampleLocation);
      expect(weather.daily).toHaveLength(14);
      expect(radar.overlayTileUrl).toBeNull();
      expect(radar.radarTimestamp).toBeNull();
    });

    test('fetchWeatherAndRadar rejects with descriptive Error when Open-Meteo Forecast returns non-2xx', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => buildMockRainViewerPayload(),
        });
      });

      await expect(fetchWeatherAndRadar(sampleLocation)).rejects.toThrow(
        /Open-Meteo forecast/i
      );
    });

    test('fetchWeatherAndRadar rejects with descriptive Error when Open-Meteo Forecast returns malformed payload', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ current: {} }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => buildMockRainViewerPayload(),
        });
      });

      await expect(fetchWeatherAndRadar(sampleLocation)).rejects.toThrow(
        /Open-Meteo forecast/i
      );
    });

    test('fetchWeatherAndRadar uses latest frame when RainViewer radar.past has multiple frames', async () => {
      (globalThis.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => buildMockForecastPayload(24, 7),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            host: 'https://tilecache.rainviewer.com',
            radar: {
              past: [
                { time: 1700000100, path: '/v2/radar/1700000100' },
                { time: 1700000200, path: '/v2/radar/1700000200' },
                { time: 1700000300, path: '/v2/radar/1700000300' },
              ],
            },
          }),
        });
      });

      const { radar } = await fetchWeatherAndRadar(sampleLocation);
      expect(radar.radarTimestamp).toBe(1700000300);
      expect(radar.overlayTileUrl).toContain('/v2/radar/1700000300/');
    });
  });
});
