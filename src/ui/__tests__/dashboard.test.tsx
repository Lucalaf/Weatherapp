import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../../../App';
import {
  CurrentConditionsCard,
  HourlyForecastStrip,
  DailyForecastCard,
  StaticRadarCard,
} from '../index';
import * as store from '../../store';
import * as gateway from '../../gateway';
import {
  LocationEntry,
  WeatherSnapshot,
  RadarTileSnapshot,
  CurrentWeather,
  HourlyForecastItem,
  DailyForecastItem,
} from '../../domain';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
    Feather: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  };
});

jest.mock('../../store', () => ({
  DEFAULT_FALLBACK_LOCATION: {
    id: 'fallback-rome',
    name: 'Rome',
    region: 'Lazio',
    country: 'Italy',
    latitude: 41.8919,
    longitude: 12.5113,
    isCurrentLocation: false,
  },
  loadInitialState: jest.fn(),
  refreshGpsLocation: jest.fn(),
  selectLocation: jest.fn(),
  saveCity: jest.fn(),
  removeCity: jest.fn(),
  updatePreferences: jest.fn(),
  searchCities: jest.fn(),
}));

jest.mock('../../gateway', () => ({
  fetchWeatherAndRadar: jest.fn(),
  searchCities: jest.fn(),
}));

const sampleCityRome: LocationEntry = {
  id: 'city-rome',
  name: 'Rome',
  region: 'Lazio',
  country: 'Italy',
  latitude: 41.8919,
  longitude: 12.5113,
  isCurrentLocation: false,
};

const sampleCityTokyo: LocationEntry = {
  id: 'city-tokyo',
  name: 'Tokyo',
  region: 'Tokyo',
  country: 'Japan',
  latitude: 35.6895,
  longitude: 139.6917,
  isCurrentLocation: false,
};

const sampleCurrent: CurrentWeather = {
  temperatureC: 20,
  apparentTemperatureC: 19,
  wmoCode: 0,
  windSpeedKmh: 10,
  relativeHumidityPercent: 55,
};

const sampleHourly: HourlyForecastItem[] = Array.from({ length: 24 }, (_, i) => ({
  isoTime: `2026-11-06T${String(i).padStart(2, '0')}:00`,
  temperatureC: 15 + (i % 8),
  wmoCode: 1,
  precipitationProbabilityPercent: 10,
}));

const sampleDaily: DailyForecastItem[] = Array.from({ length: 14 }, (_, i) => ({
  isoDate: `2026-11-${String(6 + i).padStart(2, '0')}`,
  tempMaxC: 22 + i,
  tempMinC: 12 + i,
  wmoCode: 2,
  precipitationProbabilityMaxPercent: 20,
}));

const sampleWeather: WeatherSnapshot = {
  locationId: sampleCityRome.id,
  fetchedAt: '2026-11-06T12:00:00Z',
  current: sampleCurrent,
  hourly: sampleHourly,
  daily: sampleDaily,
};

const sampleRadar: RadarTileSnapshot = {
  zoom: 7,
  tileX: 68,
  tileY: 47,
  markerOffsetX: 120,
  markerOffsetY: 140,
  radarTimestamp: 1700000000,
  baseTileUrl: 'https://tile.openstreetmap.org/7/68/47.png',
  overlayTileUrl:
    'https://tilecache.rainviewer.com/v2/radar/1700000000/256/7/68/47/2/1_1.png',
};

describe('weather-dashboard-ui', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (store.loadInitialState as jest.Mock).mockResolvedValue({
      activeLocation: sampleCityRome,
      currentGpsLocation: null,
      savedCities: [sampleCityRome],
      preferences: {
        temperatureUnit: 'celsius',
        windSpeedUnit: 'kmh',
        lastSelectedLocationId: sampleCityRome.id,
      },
      gpsStatus: 'granted',
    });

    (gateway.fetchWeatherAndRadar as jest.Mock).mockResolvedValue({
      weather: sampleWeather,
      radar: sampleRadar,
    });

    (store.updatePreferences as jest.Mock).mockImplementation(async (partial) => ({
      temperatureUnit: partial.temperatureUnit ?? 'celsius',
      windSpeedUnit: partial.windSpeedUnit ?? 'kmh',
      lastSelectedLocationId: sampleCityRome.id,
    }));

    (store.saveCity as jest.Mock).mockImplementation(async (city: LocationEntry) => [
      sampleCityRome,
      city,
    ]);

    (store.selectLocation as jest.Mock).mockImplementation(async (id: string) =>
      id === sampleCityTokyo.id ? sampleCityTokyo : sampleCityRome
    );

    (store.searchCities as jest.Mock).mockImplementation((q: string) =>
      gateway.searchCities(q)
    );
  });

  describe('Unit Tests', () => {
    test('renders current conditions with formatted values', () => {
      const { getByTestId, rerender } = render(
        <CurrentConditionsCard
          current={sampleCurrent}
          temperatureUnit="celsius"
          windSpeedUnit="kmh"
        />
      );

      expect(getByTestId('current-temperature').props.children).toBe('20°');
      expect(getByTestId('current-wind-speed').props.children).toBe('10 km/h');

      rerender(
        <CurrentConditionsCard
          current={sampleCurrent}
          temperatureUnit="fahrenheit"
          windSpeedUnit="mph"
        />
      );

      expect(getByTestId('current-temperature').props.children).toBe('68°');
      expect(getByTestId('current-wind-speed').props.children).toBe('6 mph');
    });

    test('renders 24h hourly forecast items', () => {
      const { getAllByTestId, getByTestId } = render(
        <HourlyForecastStrip hourly={sampleHourly} temperatureUnit="celsius" />
      );

      const items = getAllByTestId(/^hourly-item-\d+$/);
      expect(items).toHaveLength(24);
      expect(getByTestId('hourly-temp-0').props.children).toBe('15°');
    });

    test('renders 14d daily forecast items', () => {
      const { getAllByTestId, getByTestId, getByText } = render(
        <DailyForecastCard daily={sampleDaily} temperatureUnit="celsius" />
      );

      expect(getByText('14-Day Outlook')).toBeTruthy();
      const items = getAllByTestId(/^daily-item-\d+$/);
      expect(items).toHaveLength(14);
      expect(getByTestId('daily-day-0').props.children).toBe('Fri');
      expect(getByTestId('daily-date-0').props.children).toBe('Nov 6');
      expect(getByTestId('daily-max-0').props.children).toBe('22°');
      expect(getByTestId('daily-min-0').props.children).toBe('12°');
    });

    test('renders static radar card with base and overlay layers and positioned marker', () => {
      const { getByTestId } = render(<StaticRadarCard radar={sampleRadar} />);

      const baseImg = getByTestId('radar-base-image');
      const overlayImg = getByTestId('radar-overlay-image');
      const markerPin = getByTestId('radar-marker-pin');

      expect(baseImg.props.source).toEqual(
        expect.objectContaining({ uri: sampleRadar.baseTileUrl })
      );
      expect(overlayImg.props.source).toEqual(
        expect.objectContaining({
          uri: sampleRadar.overlayTileUrl,
        })
      );

      const flattenedStyle = Array.isArray(markerPin.props.style)
        ? Object.assign({}, ...markerPin.props.style)
        : markerPin.props.style;
      expect(flattenedStyle.left).toBe(sampleRadar.markerOffsetX);
      expect(flattenedStyle.top).toBe(sampleRadar.markerOffsetY);
    });

    test('renders static radar card gracefully when overlayTileUrl is null', () => {
      const nullOverlayRadar: RadarTileSnapshot = {
        ...sampleRadar,
        overlayTileUrl: null,
        radarTimestamp: null,
      };

      const { getByTestId, queryByTestId } = render(
        <StaticRadarCard radar={nullOverlayRadar} />
      );

      expect(getByTestId('radar-base-image')).toBeTruthy();
      expect(queryByTestId('radar-overlay-image')).toBeNull();
      expect(getByTestId('radar-marker-pin')).toBeTruthy();
    });

    test('renders interactive radar playback controls, scrubber frames, and intensity legend', () => {
      const multiFrameRadar: RadarTileSnapshot = {
        ...sampleRadar,
        frames: [
          {
            timestamp: 1699999400,
            overlayTileUrl:
              'https://tilecache.rainviewer.com/v2/radar/1699999400/256/7/68/47/2/1_1.png',
            tileUrlTemplate:
              'https://tilecache.rainviewer.com/v2/radar/1699999400/256/{z}/{x}/{y}/2/1_1.png',
          },
          {
            timestamp: 1700000000,
            overlayTileUrl:
              'https://tilecache.rainviewer.com/v2/radar/1700000000/256/7/68/47/2/1_1.png',
            tileUrlTemplate:
              'https://tilecache.rainviewer.com/v2/radar/1700000000/256/{z}/{x}/{y}/2/1_1.png',
          },
        ],
      };

      const { getByTestId } = render(
        <StaticRadarCard radar={multiFrameRadar} />
      );

      expect(getByTestId('radar-play-pause-button')).toBeTruthy();
      expect(getByTestId('radar-scrubber-track')).toBeTruthy();
      expect(getByTestId('radar-intensity-legend')).toBeTruthy();
      expect(getByTestId('radar-relative-time').props.children).toBe('Now');

      // Scrub to earlier frame (-10m)
      fireEvent.press(getByTestId('radar-scrubber-frame-0'));
      expect(getByTestId('radar-relative-time').props.children).toBe('-10m');
      expect(getByTestId('radar-overlay-image').props.source.uri).toContain(
        '1699999400'
      );

      // Scrub to future forecast frame (+2h to the right of Now)
      fireEvent.press(getByTestId('radar-scrubber-frame-5'));
      expect(getByTestId('radar-relative-time').props.children).toBe('+2h');

      // Tap radar map to open full-screen navigable & zoomable radar modal
      fireEvent.press(getByTestId('radar-tile-container'));
      expect(getByTestId('radar-expanded-modal')).toBeTruthy();
      expect(getByTestId('fullscreen-radar-canvas')).toBeTruthy();
      expect(getByTestId('radar-zoom-in-button')).toBeTruthy();
      expect(getByTestId('radar-zoom-out-button')).toBeTruthy();
      expect(getByTestId('radar-recenter-button')).toBeTruthy();
    });
  });

  describe('Integration Contract Tests', () => {
    test('initial load coordinates store and weather gateway', async () => {
      const { getByTestId, getAllByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('current-conditions-card')).toBeTruthy();
      });

      expect(store.loadInitialState).toHaveBeenCalledTimes(1);
      expect(gateway.fetchWeatherAndRadar).toHaveBeenCalledTimes(1);
      expect(gateway.fetchWeatherAndRadar).toHaveBeenCalledWith(sampleCityRome);
      expect(getAllByTestId(/^hourly-item-\d+$/)).toHaveLength(24);
      expect(getAllByTestId(/^daily-item-\d+$/)).toHaveLength(14);
      expect(getByTestId('static-radar-card')).toBeTruthy();
    });

    test('unit toggle persists preference and converts values without refetching', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('current-temperature').props.children).toBe('20°');
      });

      fireEvent.press(getByTestId('unit-toggle-button'));

      await waitFor(() => {
        expect(getByTestId('current-temperature').props.children).toBe('68°');
      });

      expect(getByTestId('current-wind-speed').props.children).toBe('6 mph');
      expect(store.updatePreferences).toHaveBeenCalledWith({
        temperatureUnit: 'fahrenheit',
        windSpeedUnit: 'mph',
      });
      expect(gateway.fetchWeatherAndRadar).toHaveBeenCalledTimes(1);
    });

    test('location modal search invokes searchCities', async () => {
      (gateway.searchCities as jest.Mock).mockResolvedValueOnce([
        sampleCityTokyo,
      ]);

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('open-location-modal-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      fireEvent.changeText(getByTestId('city-search-input'), 'Tokyo');

      await waitFor(() => {
        expect(gateway.searchCities).toHaveBeenCalledWith('Tokyo');
        expect(
          getByTestId(`search-result-${sampleCityTokyo.id}`)
        ).toBeTruthy();
      });
    });

    test('location modal save and select updates store and fetches new forecast', async () => {
      (gateway.searchCities as jest.Mock).mockResolvedValueOnce([
        sampleCityTokyo,
      ]);

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('open-location-modal-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      fireEvent.changeText(getByTestId('city-search-input'), 'Tokyo');

      await waitFor(() => {
        expect(
          getByTestId(`select-search-result-${sampleCityTokyo.id}`)
        ).toBeTruthy();
      });

      fireEvent.press(
        getByTestId(`select-search-result-${sampleCityTokyo.id}`)
      );

      await waitFor(() => {
        expect(store.saveCity).toHaveBeenCalledWith(sampleCityTokyo);
        expect(store.selectLocation).toHaveBeenCalledWith(sampleCityTokyo.id);
        expect(gateway.fetchWeatherAndRadar).toHaveBeenCalledWith(
          sampleCityTokyo
        );
      });
    });
  });

  describe('Boundary Tests', () => {
    test('radar card handles null overlayTileUrl boundary', () => {
      const boundaryRadar: RadarTileSnapshot = {
        zoom: 7,
        tileX: 0,
        tileY: 127,
        markerOffsetX: 0,
        markerOffsetY: 255,
        radarTimestamp: null,
        baseTileUrl: 'https://tile.openstreetmap.org/7/0/127.png',
        overlayTileUrl: null,
      };

      const { getByTestId, queryByTestId } = render(
        <StaticRadarCard radar={boundaryRadar} />
      );

      expect(getByTestId('radar-base-image')).toBeTruthy();
      expect(queryByTestId('radar-overlay-image')).toBeNull();
      expect(getByTestId('radar-marker-pin')).toBeTruthy();
    });

    test('gps-denied state preserves interactive controls', async () => {
      (store.loadInitialState as jest.Mock).mockResolvedValueOnce({
        activeLocation: sampleCityRome,
        currentGpsLocation: null,
        savedCities: [sampleCityRome],
        preferences: {
          temperatureUnit: 'celsius',
          windSpeedUnit: 'kmh',
          lastSelectedLocationId: null,
        },
        gpsStatus: 'denied',
      });

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('gps-denied-banner')).toBeTruthy();
      });

      fireEvent.press(getByTestId('unit-toggle-button'));
      await waitFor(() => {
        expect(store.updatePreferences).toHaveBeenCalled();
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      await waitFor(() => {
        expect(getByTestId('location-modal')).toBeTruthy();
      });
    });

    test('gateway error state preserves interactive controls', async () => {
      (gateway.fetchWeatherAndRadar as jest.Mock).mockRejectedValueOnce(
        new Error('Open-Meteo forecast HTTP 503')
      );

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('gateway-error-banner')).toBeTruthy();
      });

      fireEvent.press(getByTestId('unit-toggle-button'));
      await waitFor(() => {
        expect(store.updatePreferences).toHaveBeenCalled();
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      await waitFor(() => {
        expect(getByTestId('location-modal')).toBeTruthy();
      });
    });

    test('searchCities empty result set', async () => {
      (gateway.searchCities as jest.Mock).mockResolvedValueOnce([]);

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('open-location-modal-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      fireEvent.changeText(getByTestId('city-search-input'), 'zzzznotacity');

      await waitFor(() => {
        expect(getByTestId('search-empty-results')).toBeTruthy();
      });
    });
  });

  describe('Behavior Tests', () => {
    test('user sees full dashboard on startup', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('current-conditions-card')).toBeTruthy();
        expect(getByTestId('hourly-forecast-card')).toBeTruthy();
        expect(getByTestId('daily-forecast-card')).toBeTruthy();
        expect(getByTestId('static-radar-card')).toBeTruthy();
        expect(getByTestId('radar-marker-pin')).toBeTruthy();
      });
    });

    test('user toggles units between Celsius and Fahrenheit', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('current-temperature').props.children).toBe('20°');
      });

      fireEvent.press(getByTestId('unit-toggle-button'));

      await waitFor(() => {
        expect(getByTestId('current-temperature').props.children).toBe('68°');
        expect(getByTestId('hourly-temp-0').props.children).toBe('59°');
        expect(getByTestId('daily-max-0').props.children).toBe('72°');
        expect(getByTestId('daily-min-0').props.children).toBe('54°');
      });

      expect(gateway.fetchWeatherAndRadar).toHaveBeenCalledTimes(1);
    });

    test('user pulls to refresh weather data', async () => {
      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('current-conditions-card')).toBeTruthy();
      });

      const scrollView = getByTestId('dashboard-scroll-view');
      await act(async () => {
        await scrollView.props.refreshControl.props.onRefresh();
      });

      await waitFor(() => {
        expect(gateway.fetchWeatherAndRadar).toHaveBeenCalledTimes(2);
      });
    });

    test('user searches, saves, and switches to a new city', async () => {
      (gateway.searchCities as jest.Mock).mockResolvedValueOnce([
        sampleCityTokyo,
      ]);

      const { getByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('active-location-name').props.children).toBe('Rome');
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      fireEvent.changeText(getByTestId('city-search-input'), 'Tokyo');

      await waitFor(() => {
        expect(
          getByTestId(`select-search-result-${sampleCityTokyo.id}`)
        ).toBeTruthy();
      });

      fireEvent.press(
        getByTestId(`select-search-result-${sampleCityTokyo.id}`)
      );

      await waitFor(() => {
        expect(getByTestId('active-location-name').props.children).toBe(
          'Tokyo'
        );
        expect(gateway.fetchWeatherAndRadar).toHaveBeenLastCalledWith(
          sampleCityTokyo
        );
      });
    });

    test('user recovers from error or GPS denial by switching city', async () => {
      (store.loadInitialState as jest.Mock).mockResolvedValueOnce({
        activeLocation: sampleCityRome,
        currentGpsLocation: null,
        savedCities: [sampleCityRome, sampleCityTokyo],
        preferences: {
          temperatureUnit: 'celsius',
          windSpeedUnit: 'kmh',
          lastSelectedLocationId: sampleCityRome.id,
        },
        gpsStatus: 'denied',
      });

      (gateway.fetchWeatherAndRadar as jest.Mock)
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce({
          weather: { ...sampleWeather, locationId: sampleCityTokyo.id },
          radar: sampleRadar,
        });

      const { getByTestId, queryByTestId } = render(<App />);

      await waitFor(() => {
        expect(getByTestId('gateway-error-banner')).toBeTruthy();
      });

      fireEvent.press(getByTestId('unit-toggle-button'));
      await waitFor(() => {
        expect(store.updatePreferences).toHaveBeenCalled();
      });

      fireEvent.press(getByTestId('open-location-modal-button'));
      await waitFor(() => {
        expect(
          getByTestId(`select-saved-city-${sampleCityTokyo.id}`)
        ).toBeTruthy();
      });

      fireEvent.press(getByTestId(`select-saved-city-${sampleCityTokyo.id}`));

      await waitFor(() => {
        expect(getByTestId('current-conditions-card')).toBeTruthy();
        expect(getByTestId('active-location-name').props.children).toBe(
          'Tokyo'
        );
        expect(queryByTestId('gateway-error-banner')).toBeNull();
      });
    });
  });
});
