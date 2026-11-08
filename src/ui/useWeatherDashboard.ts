import { useState, useEffect, useCallback } from 'react';
import {
  LocationEntry,
  WeatherSnapshot,
  RadarTileSnapshot,
  UserPreferences,
} from '../domain';
import {
  loadInitialState,
  refreshGpsLocation,
  selectLocation,
  saveCity,
  removeCity,
  updatePreferences,
  searchCities,
  GpsStatus,
  DEFAULT_FALLBACK_LOCATION,
} from '../store';
import { fetchWeatherAndRadar } from '../gateway';

export interface WeatherDashboardState {
  activeLocation: LocationEntry;
  currentGpsLocation: LocationEntry | null;
  savedCities: LocationEntry[];
  preferences: UserPreferences;
  gpsStatus: GpsStatus;
  weather: WeatherSnapshot | null;
  radar: RadarTileSnapshot | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isLocationModalVisible: boolean;
  searchQuery: string;
  searchResults: LocationEntry[];
  isSearching: boolean;
  hasSearched: boolean;
}

export interface WeatherDashboardActions {
  onRefresh: () => Promise<void>;
  onToggleUnits: () => Promise<void>;
  onSelectLocation: (id: string) => Promise<void>;
  onRequestGps: () => Promise<void>;
  onSearchCities: (query: string) => Promise<void>;
  onSaveCity: (city: LocationEntry) => Promise<void>;
  onSaveAndSelectCity: (city: LocationEntry) => Promise<void>;
  onRemoveCity: (id: string) => Promise<void>;
  openLocationModal: () => void;
  closeLocationModal: () => void;
}

export function useWeatherDashboard(): WeatherDashboardState &
  WeatherDashboardActions {
  const [activeLocation, setActiveLocation] = useState<LocationEntry>(
    DEFAULT_FALLBACK_LOCATION
  );
  const [currentGpsLocation, setCurrentGpsLocation] =
    useState<LocationEntry | null>(null);
  const [savedCities, setSavedCities] = useState<LocationEntry[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({
    temperatureUnit: 'celsius',
    windSpeedUnit: 'kmh',
    lastSelectedLocationId: null,
  });
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('granted');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [radar, setRadar] = useState<RadarTileSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [isLocationModalVisible, setIsLocationModalVisible] =
    useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<LocationEntry[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const loadForecastForLocation = useCallback(
    async (loc: LocationEntry, refreshing = false) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      try {
        const result = await fetchWeatherAndRadar(loc);
        setWeather(result.weather);
        setRadar(result.radar);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to load weather forecast.';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const init = await loadInitialState();
        if (!mounted) return;
        const resolvedActive =
          init.activeLocation ?? DEFAULT_FALLBACK_LOCATION;
        setActiveLocation(resolvedActive);
        setCurrentGpsLocation(init.currentGpsLocation);
        setSavedCities(init.savedCities);
        setPreferences(init.preferences);
        setGpsStatus(init.gpsStatus);

        const result = await fetchWeatherAndRadar(resolvedActive);
        if (!mounted) return;
        setWeather(result.weather);
        setRadar(result.radar);
      } catch (err) {
        if (!mounted) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to load weather forecast.';
        setError(msg);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    await loadForecastForLocation(activeLocation, true);
  }, [activeLocation, loadForecastForLocation]);

  const onToggleUnits = useCallback(async () => {
    const nextTempUnit =
      preferences.temperatureUnit === 'celsius' ? 'fahrenheit' : 'celsius';
    const nextWindUnit = nextTempUnit === 'celsius' ? 'kmh' : 'mph';

    // Optimistically update in-memory state immediately so UI re-renders without waiting
    setPreferences((prev) => ({
      ...prev,
      temperatureUnit: nextTempUnit,
      windSpeedUnit: nextWindUnit,
    }));

    try {
      const updated = await updatePreferences({
        temperatureUnit: nextTempUnit,
        windSpeedUnit: nextWindUnit,
      });
      setPreferences(updated);
    } catch {
      // Keep optimistic preference if storage write fails
    }
  }, [preferences.temperatureUnit]);

  const onSelectLocation = useCallback(
    async (id: string) => {
      try {
        const chosen = await selectLocation(id);
        setActiveLocation(chosen);
        setPreferences((prev) => ({
          ...prev,
          lastSelectedLocationId: chosen.id,
        }));
        setIsLocationModalVisible(false);
        await loadForecastForLocation(chosen, false);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not select location.';
        setError(msg);
      }
    },
    [loadForecastForLocation]
  );

  const onRequestGps = useCallback(async () => {
    try {
      const { location, gpsStatus: nextStatus } = await refreshGpsLocation();
      setGpsStatus(nextStatus);
      setCurrentGpsLocation(location);
      if (location) {
        setActiveLocation(location);
        setPreferences((prev) => ({
          ...prev,
          lastSelectedLocationId: 'current-gps',
        }));
        setIsLocationModalVisible(false);
        await loadForecastForLocation(location, false);
      }
    } catch {
      setGpsStatus('unavailable');
    }
  }, [loadForecastForLocation]);

  const onSearchCities = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchCities(query);
      setSearchResults(results);
      setHasSearched(true);
    } catch {
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const onSaveCity = useCallback(async (city: LocationEntry) => {
    const updatedList = await saveCity(city);
    setSavedCities(updatedList);
  }, []);

  const onSaveAndSelectCity = useCallback(
    async (city: LocationEntry) => {
      const updatedList = await saveCity(city);
      setSavedCities(updatedList);
      // Find the matching saved city (in case coordinate deduplication matched an existing entry)
      const matched =
        updatedList.find(
          (c) =>
            c.id === city.id ||
            (Math.abs(c.latitude - city.latitude) <= 0.01 &&
              Math.abs(c.longitude - city.longitude) <= 0.01)
        ) ?? city;
      const chosen = await selectLocation(matched.id);
      setActiveLocation(chosen);
      setPreferences((prev) => ({
        ...prev,
        lastSelectedLocationId: chosen.id,
      }));
      setIsLocationModalVisible(false);
      await loadForecastForLocation(chosen, false);
    },
    [loadForecastForLocation]
  );

  const onRemoveCity = useCallback(
    async (id: string) => {
      const wasActive = activeLocation.id === id;
      const { savedCities: nextCities, activeLocation: nextActive } =
        await removeCity(id);
      setSavedCities(nextCities);
      setActiveLocation(nextActive);
      if (wasActive && nextActive.id !== id) {
        await loadForecastForLocation(nextActive, false);
      }
    },
    [activeLocation.id, loadForecastForLocation]
  );

  const openLocationModal = useCallback(() => {
    setIsLocationModalVisible(true);
  }, []);

  const closeLocationModal = useCallback(() => {
    setIsLocationModalVisible(false);
  }, []);

  return {
    activeLocation,
    currentGpsLocation,
    savedCities,
    preferences,
    gpsStatus,
    weather,
    radar,
    isLoading,
    isRefreshing,
    error,
    isLocationModalVisible,
    searchQuery,
    searchResults,
    isSearching,
    hasSearched,
    onRefresh,
    onToggleUnits,
    onSelectLocation,
    onRequestGps,
    onSearchCities,
    onSaveCity,
    onSaveAndSelectCity,
    onRemoveCity,
    openLocationModal,
    closeLocationModal,
  };
}
