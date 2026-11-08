import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as gateway from '../../gateway';
import {
  loadInitialState,
  saveCity,
  removeCity,
  selectLocation,
  updatePreferences,
  searchCities,
  DEFAULT_FALLBACK_LOCATION,
} from '../index';
import { LocationEntry } from '../../domain';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
    },
  };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

jest.mock('../../gateway', () => ({
  searchCities: jest.fn(),
}));

const cityMilan: LocationEntry = {
  id: 'city-1',
  name: 'Milan',
  region: 'Lombardy',
  country: 'Italy',
  latitude: 45.4642,
  longitude: 9.19,
  isCurrentLocation: false,
};

const cityParis: LocationEntry = {
  id: 'city-2',
  name: 'Paris',
  region: 'Ile-de-France',
  country: 'France',
  latitude: 48.8566,
  longitude: 2.3522,
  isCurrentLocation: false,
};

describe('location-and-preferences-store', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();

    // Default mock: GPS denied unless overridden
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
  });

  describe('Unit Tests', () => {
    test('loadInitialState returns default metric preferences when AsyncStorage is empty', async () => {
      const state = await loadInitialState();
      expect(state.preferences).toEqual({
        temperatureUnit: 'celsius',
        windSpeedUnit: 'kmh',
        lastSelectedLocationId: null,
      });
      expect(state.savedCities).toEqual([]);
    });

    test('saveCity appends a new city and persists to AsyncStorage', async () => {
      await loadInitialState();
      const updated = await saveCity(cityMilan);
      expect(updated).toEqual([cityMilan]);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@proj01/saved_cities',
        JSON.stringify([cityMilan])
      );
    });

    test('saveCity deduplicates city with identical ID', async () => {
      await loadInitialState();
      await saveCity(cityMilan);
      const afterSecondSave = await saveCity({
        ...cityMilan,
        latitude: 46.0,
        longitude: 10.0,
      });
      expect(afterSecondSave).toHaveLength(1);
      expect(afterSecondSave[0].id).toBe(cityMilan.id);
    });

    test('removeCity deletes a non-active saved city without changing activeLocation', async () => {
      await loadInitialState();
      await saveCity(cityMilan);
      await saveCity(cityParis);
      await selectLocation(cityMilan.id);

      const { savedCities, activeLocation } = await removeCity(cityParis.id);
      expect(savedCities).toEqual([cityMilan]);
      expect(activeLocation).toEqual(cityMilan);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@proj01/saved_cities',
        JSON.stringify([cityMilan])
      );
    });

    test('selectLocation selects a saved city ID and persists lastSelectedLocationId', async () => {
      await loadInitialState();
      await saveCity(cityMilan);

      const chosen = await selectLocation(cityMilan.id);
      expect(chosen).toEqual(cityMilan);

      const storedPrefsRaw = await AsyncStorage.getItem('@proj01/user_preferences');
      expect(JSON.parse(storedPrefsRaw!)).toEqual({
        temperatureUnit: 'celsius',
        windSpeedUnit: 'kmh',
        lastSelectedLocationId: cityMilan.id,
      });
    });

    test('selectLocation selects current-gps and persists lastSelectedLocationId', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 37.7749, longitude: -122.4194 },
      });
      (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([
        { city: 'San Francisco', region: 'California', country: 'USA' },
      ]);

      await loadInitialState();
      await saveCity(cityMilan);
      await selectLocation(cityMilan.id);

      const chosenGps = await selectLocation('current-gps');
      expect(chosenGps.id).toBe('current-gps');
      expect(chosenGps.isCurrentLocation).toBe(true);

      const storedPrefsRaw = await AsyncStorage.getItem('@proj01/user_preferences');
      expect(JSON.parse(storedPrefsRaw!).lastSelectedLocationId).toBe('current-gps');
    });

    test('updatePreferences toggles units from metric to imperial and persists immediately', async () => {
      await loadInitialState();
      const updated = await updatePreferences({
        temperatureUnit: 'fahrenheit',
        windSpeedUnit: 'mph',
      });

      expect(updated.temperatureUnit).toBe('fahrenheit');
      expect(updated.windSpeedUnit).toBe('mph');

      const storedRaw = await AsyncStorage.getItem('@proj01/user_preferences');
      expect(JSON.parse(storedRaw!)).toEqual(updated);
    });

    test('updatePreferences toggles units from imperial to metric and persists immediately', async () => {
      await loadInitialState();
      await updatePreferences({
        temperatureUnit: 'fahrenheit',
        windSpeedUnit: 'mph',
      });
      const updated = await updatePreferences({
        temperatureUnit: 'celsius',
        windSpeedUnit: 'kmh',
      });

      expect(updated.temperatureUnit).toBe('celsius');
      expect(updated.windSpeedUnit).toBe('kmh');

      const storedRaw = await AsyncStorage.getItem('@proj01/user_preferences');
      expect(JSON.parse(storedRaw!)).toEqual(updated);
    });
  });

  describe('Integration Contract Tests', () => {
    test('loadInitialState resolves current-gps via expo-location and reverse-geocodes label when permission is granted', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 40.7128, longitude: -74.006 },
      });
      (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValue([
        { city: 'New York', region: 'NY', country: 'United States' },
      ]);

      const state = await loadInitialState();
      expect(state.gpsStatus).toBe('granted');
      expect(state.currentGpsLocation).toEqual({
        id: 'current-gps',
        name: 'New York',
        region: 'NY',
        country: 'United States',
        latitude: 40.7128,
        longitude: -74.006,
        isCurrentLocation: true,
      });
      expect(state.activeLocation).toEqual(state.currentGpsLocation);
    });

    test('loadInitialState falls back to saved city when GPS permission is denied', async () => {
      await AsyncStorage.setItem(
        '@proj01/saved_cities',
        JSON.stringify([cityMilan])
      );
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const state = await loadInitialState();
      expect(state.gpsStatus).toBe('denied');
      expect(state.currentGpsLocation).toBeNull();
      expect(state.activeLocation).toEqual(cityMilan);
    });

    test('loadInitialState falls back to built-in default fallback city when GPS permission is denied and no saved cities exist', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const state = await loadInitialState();
      expect(state.gpsStatus).toBe('denied');
      expect(state.currentGpsLocation).toBeNull();
      expect(state.activeLocation).toEqual(DEFAULT_FALLBACK_LOCATION);
    });

    test('loadInitialState falls back gracefully when getCurrentPositionAsync throws', async () => {
      await AsyncStorage.setItem(
        '@proj01/saved_cities',
        JSON.stringify([cityParis])
      );
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
        new Error('Location provider is unavailable')
      );

      const state = await loadInitialState();
      expect(state.gpsStatus).toBe('unavailable');
      expect(state.currentGpsLocation).toBeNull();
      expect(state.activeLocation).toEqual(cityParis);
    });

    test('searchCities delegates query to remote-weather-gateway and returns normalized LocationEntry list', async () => {
      (gateway.searchCities as jest.Mock).mockResolvedValueOnce([cityMilan]);

      const results = await searchCities('Milan');
      expect(gateway.searchCities).toHaveBeenCalledTimes(1);
      expect(gateway.searchCities).toHaveBeenCalledWith('Milan');
      expect(results).toEqual([cityMilan]);
    });
  });

  describe('Boundary Tests', () => {
    test('saveCity deduplicates city with coordinates within 0.01 degrees', async () => {
      await loadInitialState();
      await saveCity(cityMilan);

      const nearbyDuplicate: LocationEntry = {
        id: 'different-id',
        name: 'Milan Center',
        latitude: cityMilan.latitude + 0.005,
        longitude: cityMilan.longitude - 0.008,
        isCurrentLocation: false,
      };

      const list = await saveCity(nearbyDuplicate);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(cityMilan.id);
    });

    test('saveCity retains city when coordinate difference exceeds 0.01 degrees', async () => {
      await loadInitialState();
      await saveCity(cityMilan);

      const distinctCity: LocationEntry = {
        id: 'city-monza',
        name: 'Monza',
        latitude: cityMilan.latitude + 0.12,
        longitude: cityMilan.longitude + 0.08,
        isCurrentLocation: false,
      };

      const list = await saveCity(distinctCity);
      expect(list).toHaveLength(2);
      expect(list).toEqual([cityMilan, distinctCity]);
    });

    test('loadInitialState recovers cleanly when AsyncStorage contains corrupted JSON', async () => {
      await AsyncStorage.setItem('@proj01/saved_cities', '{invalid-json');
      await AsyncStorage.setItem('@proj01/user_preferences', 'not-valid-json[');

      const state = await loadInitialState();
      expect(state.savedCities).toEqual([]);
      expect(state.preferences).toEqual({
        temperatureUnit: 'celsius',
        windSpeedUnit: 'kmh',
        lastSelectedLocationId: null,
      });
      expect(state.activeLocation).toEqual(DEFAULT_FALLBACK_LOCATION);
    });
  });

  describe('Behavior Tests', () => {
    test('removeCity falls back activeLocation when the currently active saved city is deleted', async () => {
      await loadInitialState();
      await saveCity(cityMilan);
      await saveCity(cityParis);
      await selectLocation(cityMilan.id);

      const result = await removeCity(cityMilan.id);
      expect(result.savedCities).toEqual([cityParis]);
      expect(result.activeLocation).toEqual(cityParis);

      const storedPrefsRaw = await AsyncStorage.getItem('@proj01/user_preferences');
      expect(JSON.parse(storedPrefsRaw!).lastSelectedLocationId).toBe(cityParis.id);
    });

    test('selectLocation followed by loadInitialState restores lastSelectedLocationId', async () => {
      await loadInitialState();
      await saveCity(cityMilan);
      await saveCity(cityParis);
      await selectLocation(cityParis.id);

      const reloaded = await loadInitialState();
      expect(reloaded.activeLocation).toEqual(cityParis);
      expect(reloaded.preferences.lastSelectedLocationId).toBe(cityParis.id);
    });

    test('updatePreferences persists across store reloads', async () => {
      await loadInitialState();
      await updatePreferences({
        temperatureUnit: 'fahrenheit',
        windSpeedUnit: 'mph',
      });

      const reloaded = await loadInitialState();
      expect(reloaded.preferences.temperatureUnit).toBe('fahrenheit');
      expect(reloaded.preferences.windSpeedUnit).toBe('mph');
    });
  });
});
