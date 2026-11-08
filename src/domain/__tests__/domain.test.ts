import {
  LocationEntry,
  WeatherSnapshot,
  CurrentWeather,
  HourlyForecastItem,
  DailyForecastItem,
  RadarTileSnapshot,
  UserPreferences,
  TemperatureUnit,
  WindSpeedUnit,
  WmoConditionInfo,
  convertTemperature,
  convertWindSpeed,
  resolveWmoCondition,
} from '../index';

describe('weather-domain', () => {
  describe('Unit Tests', () => {
    test('convertTemperature rounds and formats positive Celsius values', () => {
      expect(convertTemperature(21.4, 'celsius')).toEqual({
        value: 21,
        formatted: '21°C',
      });
      expect(convertTemperature(21.6, 'celsius')).toEqual({
        value: 22,
        formatted: '22°C',
      });
    });

    test('convertTemperature rounds and formats negative Celsius values', () => {
      expect(convertTemperature(-4.6, 'celsius')).toEqual({
        value: -5,
        formatted: '-5°C',
      });
    });

    test('convertTemperature converts, rounds, and formats Celsius to Fahrenheit', () => {
      expect(convertTemperature(0, 'fahrenheit')).toEqual({
        value: 32,
        formatted: '32°F',
      });
      expect(convertTemperature(20, 'fahrenheit')).toEqual({
        value: 68,
        formatted: '68°F',
      });
    });

    test('convertWindSpeed rounds and formats km/h values', () => {
      expect(convertWindSpeed(15.2, 'kmh')).toEqual({
        value: 15,
        formatted: '15 km/h',
      });
      expect(convertWindSpeed(15.7, 'kmh')).toEqual({
        value: 16,
        formatted: '16 km/h',
      });
    });

    test('convertWindSpeed converts km/h to mph using 0.621371 factor, rounds, and formats', () => {
      expect(convertWindSpeed(10, 'mph')).toEqual({
        value: 6,
        formatted: '6 mph',
      });
      expect(convertWindSpeed(100, 'mph')).toEqual({
        value: 62,
        formatted: '62 mph',
      });
    });

    test('resolveWmoCondition returns WmoConditionInfo for known WMO codes in 0..99', () => {
      const knownCodes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 61, 63, 65, 71, 75, 80, 85, 95, 99];
      for (const code of knownCodes) {
        const info = resolveWmoCondition(code);
        expect(info.wmoCode).toBe(code);
        expect(typeof info.label).toBe('string');
        expect(info.label.length).toBeGreaterThan(0);
        expect(typeof info.iconName).toBe('string');
        expect(info.iconName.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration Contract Tests', () => {
    test('domain module exports all settled types and pure functions', () => {
      expect(typeof convertTemperature).toBe('function');
      expect(typeof convertWindSpeed).toBe('function');
      expect(typeof resolveWmoCondition).toBe('function');

      const sampleLoc: LocationEntry = {
        id: '1',
        name: 'Rome',
        region: 'Lazio',
        country: 'Italy',
        latitude: 41.89,
        longitude: 12.48,
        isCurrentLocation: false,
      };
      const sampleRadar: RadarTileSnapshot = {
        zoom: 7,
        tileX: 68,
        tileY: 47,
        markerOffsetX: 112,
        markerOffsetY: 140,
        radarTimestamp: 1700000000,
        baseTileUrl: 'https://tile.openstreetmap.org/7/68/47.png',
        overlayTileUrl: null,
      };
      expect(sampleLoc.name).toBe('Rome');
      expect(sampleRadar.zoom).toBe(7);
    });

    test('UserPreferences unit fields are directly compatible with conversion functions', () => {
      const preferences: UserPreferences = {
        temperatureUnit: 'fahrenheit' as TemperatureUnit,
        windSpeedUnit: 'mph' as WindSpeedUnit,
        lastSelectedLocationId: '1',
      };

      const tempResult = convertTemperature(25, preferences.temperatureUnit);
      const windResult = convertWindSpeed(20, preferences.windSpeedUnit);

      expect(tempResult).toEqual({ value: 77, formatted: '77°F' });
      expect(windResult).toEqual({ value: 12, formatted: '12 mph' });
    });

    test('WeatherSnapshot weather codes and measurements integrate with domain functions', () => {
      const current: CurrentWeather = {
        temperatureC: 18.2,
        apparentTemperatureC: 17.6,
        wmoCode: 2,
        windSpeedKmh: 14.4,
        relativeHumidityPercent: 65,
      };
      const hourlyItem: HourlyForecastItem = {
        isoTime: '2026-11-06T12:00',
        temperatureC: 19.1,
        wmoCode: 61,
        precipitationProbabilityPercent: 40,
      };
      const dailyItem: DailyForecastItem = {
        isoDate: '2026-11-06',
        tempMaxC: 21.8,
        tempMinC: 11.2,
        wmoCode: 0,
        precipitationProbabilityMaxPercent: 10,
      };
      const snapshot: WeatherSnapshot = {
        locationId: 'loc-1',
        fetchedAt: '2026-11-06T12:00:00Z',
        current,
        hourly: [hourlyItem],
        daily: [dailyItem],
      };

      expect(convertTemperature(snapshot.current.temperatureC, 'celsius')).toEqual({
        value: 18,
        formatted: '18°C',
      });
      expect(convertWindSpeed(snapshot.current.windSpeedKmh, 'kmh')).toEqual({
        value: 14,
        formatted: '14 km/h',
      });
      const cond: WmoConditionInfo = resolveWmoCondition(snapshot.current.wmoCode);
      expect(cond.wmoCode).toBe(2);
      expect(cond.label.length).toBeGreaterThan(0);
      expect(cond.iconName.length).toBeGreaterThan(0);

      expect(convertTemperature(snapshot.hourly[0].temperatureC, 'fahrenheit')).toEqual({
        value: 66,
        formatted: '66°F',
      });
      expect(convertTemperature(snapshot.daily[0].tempMaxC, 'celsius')).toEqual({
        value: 22,
        formatted: '22°C',
      });
      expect(convertTemperature(snapshot.daily[0].tempMinC, 'celsius')).toEqual({
        value: 11,
        formatted: '11°C',
      });
    });
  });

  describe('Boundary Tests', () => {
    test('convertTemperature normalizes -0 to 0 in Celsius', () => {
      const resNegZero = convertTemperature(-0, 'celsius');
      expect(resNegZero).toEqual({ value: 0, formatted: '0°C' });
      expect(Object.is(resNegZero.value, 0)).toBe(true);

      const resSmallNeg = convertTemperature(-0.2, 'celsius');
      expect(resSmallNeg).toEqual({ value: 0, formatted: '0°C' });
      expect(Object.is(resSmallNeg.value, 0)).toBe(true);
    });

    test('convertTemperature normalizes -0 to 0 in Fahrenheit', () => {
      const res = convertTemperature(-17.77, 'fahrenheit');
      expect(res).toEqual({ value: 0, formatted: '0°F' });
      expect(Object.is(res.value, 0)).toBe(true);
    });

    test('convertWindSpeed handles zero wind speed in kmh and mph', () => {
      expect(convertWindSpeed(0, 'kmh')).toEqual({
        value: 0,
        formatted: '0 km/h',
      });
      expect(convertWindSpeed(0, 'mph')).toEqual({
        value: 0,
        formatted: '0 mph',
      });
    });

    test('resolveWmoCondition handles lower and upper bounds of valid WMO range (0 and 99)', () => {
      const low = resolveWmoCondition(0);
      expect(low.wmoCode).toBe(0);
      expect(low.label).toBe('Clear sky');
      expect(low.iconName.length).toBeGreaterThan(0);

      const high = resolveWmoCondition(99);
      expect(high.wmoCode).toBe(99);
      expect(high.label.length).toBeGreaterThan(0);
      expect(high.iconName.length).toBeGreaterThan(0);
    });

    test('resolveWmoCondition returns safe fallback for out-of-range and unknown WMO codes', () => {
      for (const invalidCode of [-1, 100, 999, NaN]) {
        const res = resolveWmoCondition(invalidCode);
        expect(typeof res.label).toBe('string');
        expect(res.label.length).toBeGreaterThan(0);
        expect(typeof res.iconName).toBe('string');
        expect(res.iconName.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Behavior Tests', () => {
    test('convertTemperature is pure and deterministic across repeated invocations', () => {
      const first = convertTemperature(18.6, 'fahrenheit');
      const second = convertTemperature(18.6, 'fahrenheit');
      const third = convertTemperature(18.6, 'fahrenheit');

      expect(first).toEqual(second);
      expect(second).toEqual(third);
      expect(Number.isInteger(first.value)).toBe(true);
      expect(first.formatted).toBe(`${first.value}°F`);
    });

    test('convertWindSpeed is pure and deterministic across unit switches', () => {
      expect(convertWindSpeed(25, 'kmh')).toEqual({
        value: 25,
        formatted: '25 km/h',
      });
      expect(convertWindSpeed(25, 'mph')).toEqual({
        value: 16,
        formatted: '16 mph',
      });
      expect(convertWindSpeed(25, 'kmh')).toEqual({
        value: 25,
        formatted: '25 km/h',
      });
    });

    test('resolveWmoCondition always provides render-safe condition metadata for any numeric input', () => {
      const codesToTest = [
        ...Array.from({ length: 100 }, (_, i) => i),
        -50,
        42,
        150,
      ];
      for (const code of codesToTest) {
        const info = resolveWmoCondition(code);
        expect(typeof info.wmoCode).toBe('number');
        expect(typeof info.label).toBe('string');
        expect(info.label.length).toBeGreaterThan(0);
        expect(typeof info.iconName).toBe('string');
        expect(info.iconName.length).toBeGreaterThan(0);
      }
    });
  });
});
