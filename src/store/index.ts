import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { LocationEntry, UserPreferences } from '../domain';
import { searchCities as gatewaySearchCities } from '../gateway';

export type GpsStatus = 'granted' | 'denied' | 'unavailable';

export interface InitialStoreState {
  activeLocation: LocationEntry;
  currentGpsLocation: LocationEntry | null;
  savedCities: LocationEntry[];
  preferences: UserPreferences;
  gpsStatus: GpsStatus;
}

const STORAGE_KEYS = {
  SAVED_CITIES: '@proj01/saved_cities',
  PREFERENCES: '@proj01/user_preferences',
} as const;

const DEFAULT_PREFERENCES: UserPreferences = {
  temperatureUnit: 'celsius',
  windSpeedUnit: 'kmh',
  lastSelectedLocationId: null,
};

export const DEFAULT_FALLBACK_LOCATION: LocationEntry = {
  id: 'fallback-rome',
  name: 'Rome',
  region: 'Lazio',
  country: 'Italy',
  latitude: 41.8919,
  longitude: 12.5113,
  isCurrentLocation: false,
};

const COORDINATE_DEDUP_EPSILON = 0.01;

// In-memory cache synchronized with AsyncStorage
let cachedSavedCities: LocationEntry[] = [];
let cachedPreferences: UserPreferences = { ...DEFAULT_PREFERENCES };
let cachedCurrentGpsLocation: LocationEntry | null = null;
let cachedActiveLocation: LocationEntry = { ...DEFAULT_FALLBACK_LOCATION };
let isStoreLoaded = false;

function isValidTemperatureUnit(u: unknown): u is UserPreferences['temperatureUnit'] {
  return u === 'celsius' || u === 'fahrenheit';
}

function isValidWindSpeedUnit(u: unknown): u is UserPreferences['windSpeedUnit'] {
  return u === 'kmh' || u === 'mph';
}

function parseSavedCities(raw: string | null): LocationEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is LocationEntry =>
          item !== null &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number'
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        region: typeof item.region === 'string' ? item.region : undefined,
        country: typeof item.country === 'string' ? item.country : undefined,
        latitude: item.latitude,
        longitude: item.longitude,
        isCurrentLocation: false,
      }));
  } catch {
    return [];
  }
}

function parsePreferences(raw: string | null): UserPreferences {
  if (!raw) {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_PREFERENCES };
    }
    return {
      temperatureUnit: isValidTemperatureUnit(parsed.temperatureUnit)
        ? parsed.temperatureUnit
        : DEFAULT_PREFERENCES.temperatureUnit,
      windSpeedUnit: isValidWindSpeedUnit(parsed.windSpeedUnit)
        ? parsed.windSpeedUnit
        : DEFAULT_PREFERENCES.windSpeedUnit,
      lastSelectedLocationId:
        typeof parsed.lastSelectedLocationId === 'string'
          ? parsed.lastSelectedLocationId
          : null,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

async function resolveGpsLocationInternal(): Promise<{
  location: LocationEntry | null;
  gpsStatus: GpsStatus;
}> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm || perm.status !== 'granted') {
      return { location: null, gpsStatus: 'denied' };
    }

    const pos = await Location.getCurrentPositionAsync({});
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;

    let name = 'Current Location';
    let region: string | undefined;
    let country: string | undefined;

    try {
      const places = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (Array.isArray(places) && places.length > 0) {
        const first = places[0];
        const candidateName =
          first.city || first.subregion || first.district || first.name;
        if (candidateName && typeof candidateName === 'string') {
          name = candidateName;
        }
        if (first.region && typeof first.region === 'string') {
          region = first.region;
        }
        if (first.country && typeof first.country === 'string') {
          country = first.country;
        }
      }
    } catch {
      // Reverse geocoding failure is non-fatal; keep fallback 'Current Location'
    }

    const location: LocationEntry = {
      id: 'current-gps',
      name,
      region,
      country,
      latitude,
      longitude,
      isCurrentLocation: true,
    };

    return { location, gpsStatus: 'granted' };
  } catch {
    return { location: null, gpsStatus: 'unavailable' };
  }
}

function chooseActiveLocation(
  preferences: UserPreferences,
  currentGps: LocationEntry | null,
  savedCities: LocationEntry[]
): LocationEntry {
  const lastId = preferences.lastSelectedLocationId;
  if (lastId) {
    if (lastId === 'current-gps' && currentGps) {
      return currentGps;
    }
    const matchedCity = savedCities.find((c) => c.id === lastId);
    if (matchedCity) {
      return matchedCity;
    }
  }

  if (currentGps) {
    return currentGps;
  }

  if (savedCities.length > 0) {
    return savedCities[0];
  }

  return { ...DEFAULT_FALLBACK_LOCATION };
}

async function ensureHydratedFromStorage(): Promise<void> {
  if (isStoreLoaded) {
    return;
  }
  try {
    const [rawCities, rawPrefs] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.SAVED_CITIES),
      AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES),
    ]);
    cachedSavedCities = parseSavedCities(rawCities);
    cachedPreferences = parsePreferences(rawPrefs);
  } catch {
    cachedSavedCities = [];
    cachedPreferences = { ...DEFAULT_PREFERENCES };
  }
  isStoreLoaded = true;
}

/**
 * Loads persisted saved cities and user preferences from AsyncStorage,
 * requests foreground GPS permissions/coordinates via expo-location,
 * and resolves a guaranteed non-null `activeLocation`.
 */
export async function loadInitialState(): Promise<InitialStoreState> {
  let rawCities: string | null = null;
  let rawPrefs: string | null = null;

  try {
    [rawCities, rawPrefs] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.SAVED_CITIES),
      AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES),
    ]);
  } catch {
    rawCities = null;
    rawPrefs = null;
  }

  cachedSavedCities = parseSavedCities(rawCities);
  cachedPreferences = parsePreferences(rawPrefs);
  isStoreLoaded = true;

  const { location: gpsLocation, gpsStatus } = await resolveGpsLocationInternal();
  cachedCurrentGpsLocation = gpsLocation;

  cachedActiveLocation = chooseActiveLocation(
    cachedPreferences,
    cachedCurrentGpsLocation,
    cachedSavedCities
  );

  return {
    activeLocation: cachedActiveLocation,
    currentGpsLocation: cachedCurrentGpsLocation,
    savedCities: [...cachedSavedCities],
    preferences: { ...cachedPreferences },
    gpsStatus,
  };
}

/**
 * Re-requests foreground GPS permission and coordinates via `expo-location`,
 * updating `lastSelectedLocationId` to `'current-gps'` when resolved.
 */
export async function refreshGpsLocation(): Promise<{
  location: LocationEntry | null;
  gpsStatus: GpsStatus;
}> {
  await ensureHydratedFromStorage();
  const { location, gpsStatus } = await resolveGpsLocationInternal();
  cachedCurrentGpsLocation = location;

  if (location) {
    cachedActiveLocation = location;
    cachedPreferences = {
      ...cachedPreferences,
      lastSelectedLocationId: 'current-gps',
    };
    await AsyncStorage.setItem(
      STORAGE_KEYS.PREFERENCES,
      JSON.stringify(cachedPreferences)
    );
  }

  return { location, gpsStatus };
}

/**
 * Selects an active location by ID (`'current-gps'` or a saved city ID),
 * persists `lastSelectedLocationId` in `UserPreferences`, and returns the chosen `LocationEntry`.
 */
export async function selectLocation(locationId: string): Promise<LocationEntry> {
  await ensureHydratedFromStorage();

  let target: LocationEntry | undefined;
  if (locationId === 'current-gps' && cachedCurrentGpsLocation) {
    target = cachedCurrentGpsLocation;
  } else {
    target = cachedSavedCities.find((c) => c.id === locationId);
  }

  if (!target) {
    if (locationId === DEFAULT_FALLBACK_LOCATION.id) {
      target = { ...DEFAULT_FALLBACK_LOCATION };
    } else {
      throw new Error(`Location with id "${locationId}" was not found.`);
    }
  }

  cachedActiveLocation = target;
  cachedPreferences = {
    ...cachedPreferences,
    lastSelectedLocationId: target.id,
  };

  await AsyncStorage.setItem(
    STORAGE_KEYS.PREFERENCES,
    JSON.stringify(cachedPreferences)
  );

  return cachedActiveLocation;
}

function areCoordinatesDuplicate(a: LocationEntry, b: LocationEntry): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= COORDINATE_DEDUP_EPSILON &&
    Math.abs(a.longitude - b.longitude) <= COORDINATE_DEDUP_EPSILON
  );
}

/**
 * Saves a city to `savedCities` (deduplicating by ID or coordinates within 0.01 degrees),
 * forces `isCurrentLocation: false`, persists to `AsyncStorage`, and returns the updated list.
 */
export async function saveCity(city: LocationEntry): Promise<LocationEntry[]> {
  await ensureHydratedFromStorage();

  const normalizedCity: LocationEntry = {
    ...city,
    isCurrentLocation: false,
  };

  const isDuplicate = cachedSavedCities.some(
    (existing) =>
      existing.id === normalizedCity.id ||
      areCoordinatesDuplicate(existing, normalizedCity)
  );

  if (!isDuplicate) {
    cachedSavedCities = [...cachedSavedCities, normalizedCity];
  }

  await AsyncStorage.setItem(
    STORAGE_KEYS.SAVED_CITIES,
    JSON.stringify(cachedSavedCities)
  );

  return [...cachedSavedCities];
}

/**
 * Removes a saved city by `locationId`, persists to `AsyncStorage`,
 * and falls back `activeLocation` if the removed city was active.
 */
export async function removeCity(locationId: string): Promise<{
  savedCities: LocationEntry[];
  activeLocation: LocationEntry;
}> {
  await ensureHydratedFromStorage();

  cachedSavedCities = cachedSavedCities.filter((c) => c.id !== locationId);
  await AsyncStorage.setItem(
    STORAGE_KEYS.SAVED_CITIES,
    JSON.stringify(cachedSavedCities)
  );

  const wasActive =
    cachedActiveLocation.id === locationId ||
    cachedPreferences.lastSelectedLocationId === locationId;

  if (wasActive) {
    const nextActive =
      cachedCurrentGpsLocation ??
      cachedSavedCities[0] ?? { ...DEFAULT_FALLBACK_LOCATION };

    cachedActiveLocation = nextActive;
    cachedPreferences = {
      ...cachedPreferences,
      lastSelectedLocationId: nextActive.id,
    };
    await AsyncStorage.setItem(
      STORAGE_KEYS.PREFERENCES,
      JSON.stringify(cachedPreferences)
    );
  }

  return {
    savedCities: [...cachedSavedCities],
    activeLocation: cachedActiveLocation,
  };
}

/**
 * Merges partial updates into `UserPreferences`, persists immediately to `AsyncStorage`,
 * and returns the updated `UserPreferences`.
 */
export async function updatePreferences(
  partial: Partial<UserPreferences>
): Promise<UserPreferences> {
  await ensureHydratedFromStorage();

  cachedPreferences = {
    ...cachedPreferences,
    ...partial,
  };

  await AsyncStorage.setItem(
    STORAGE_KEYS.PREFERENCES,
    JSON.stringify(cachedPreferences)
  );

  return { ...cachedPreferences };
}

/**
 * Delegates city search queries to `remote-weather-gateway.searchCities`.
 */
export async function searchCities(query: string): Promise<LocationEntry[]> {
  return gatewaySearchCities(query);
}
