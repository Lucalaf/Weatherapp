# location-and-preferences-store

Design specification for the `location-and-preferences-store` module (`src/store/`) in `proj01`, an Android React Native + Expo TypeScript weather application.

## Functional Responsibilities

The `location-and-preferences-store` module (`src/store/`) resolves current device GPS coordinates, searches cities via the gateway, and loads/persists saved cities and user preferences on the device with fallback rules.

## Encapsulated Knowledge

The module hides how Android `expo-location` permissions/reverse-geocoding are invoked and how `@react-native-async-storage/async-storage` keys, JSON serialization, and coordinate deduplication are implemented.

## Classification

**Device Platform & Persistence Hider (Information Hiding / Parnas):** Isolates hardware/OS platform bridges (`expo-location`) and local storage representations (`AsyncStorage`) from both domain logic and UI rendering.

## Integration Contracts

### Module Integrations

| Integration | Crosses Interface | Stays Hidden |
| --- | --- | --- |
| `location-and-preferences-store -> weather-domain` | Canonical `LocationEntry` and `UserPreferences` data structures. | Store hides `AsyncStorage` keys, JSON serialization, and `expo-location` native calls; Domain hides weather metrics and formatting. |
| `location-and-preferences-store -> remote-weather-gateway` | City search query string (`searchCities(query: string): Promise<LocationEntry[]>`) to look up candidate cities for saving/selecting. | Store hides how selected cities are deduplicated and persisted; Gateway hides the Open-Meteo Geocoding HTTP call and response parsing. |
| `weather-dashboard-ui -> location-and-preferences-store` | Commands and state reads to load initial state, request current GPS location, search/save/remove/select cities, and toggle `UserPreferences` units. | UI hides screen layout and modal state; Store hides Android permission status codes, fallback order, and `AsyncStorage` keys. |

### Exported Types and Operations

```ts
type GpsStatus = 'granted' | 'denied' | 'unavailable';

interface InitialStoreState {
  activeLocation: LocationEntry;
  currentGpsLocation: LocationEntry | null;
  savedCities: LocationEntry[];
  preferences: UserPreferences;
  gpsStatus: GpsStatus;
}
```

- `loadInitialState(): Promise<InitialStoreState>`
  - Loads saved cities and `UserPreferences` from `AsyncStorage` (defaults to `{ temperatureUnit: 'celsius', windSpeedUnit: 'kmh', lastSelectedLocationId: null }` on first launch or corrupted storage).
  - Requests foreground GPS permission via `expo-location` (`requestForegroundPermissionsAsync`). If granted, fetches coordinates (`getCurrentPositionAsync`) and reverse-geocodes a readable city/region name (`reverseGeocodeAsync`, falling back to `"Current Location"` if reverse-geocoding fails), creating a `LocationEntry` with `id: 'current-gps'` and `isCurrentLocation: true`.
  - Determines `activeLocation` in priority order:
    1. If `preferences.lastSelectedLocationId` matches a saved city (or `'current-gps'` when GPS succeeded), selects it.
    2. Else if GPS succeeded, selects `currentGpsLocation`.
    3. Else if `savedCities.length > 0`, selects `savedCities[0]`.
    4. Else falls back to a built-in default fallback `LocationEntry` (e.g., Rome / New York / London with valid coordinates and `isCurrentLocation: false`) so `activeLocation` is **always** non-null even when GPS is denied on first launch.
- `refreshGpsLocation(): Promise<{ location: LocationEntry | null; gpsStatus: GpsStatus }>` — Re-requests permission/position via `expo-location` and updates `lastSelectedLocationId` to `'current-gps'` when resolved.
- `selectLocation(locationId: string): Promise<LocationEntry>` — Sets the active location by `id` (either `'current-gps'` or a saved city ID), persists `lastSelectedLocationId` in `UserPreferences`, and returns the chosen `LocationEntry`.
- `saveCity(city: LocationEntry): Promise<LocationEntry[]>` — Deduplicates by `id` or rounded coordinates (`Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01`), sets `isCurrentLocation: false`, persists the updated `savedCities` list to `AsyncStorage`, and returns it.
- `removeCity(locationId: string): Promise<{ savedCities: LocationEntry[]; activeLocation: LocationEntry }>` — Removes the matching city from `savedCities`, persists to `AsyncStorage`, and if `locationId` was the active location, reassigns `activeLocation` to `currentGpsLocation`, the next saved city, or the built-in fallback city.
- `updatePreferences(partial: Partial<UserPreferences>): Promise<UserPreferences>` — Merges partial preference updates (such as toggling `temperatureUnit` and `windSpeedUnit` together), persists to `AsyncStorage`, and returns the updated `UserPreferences`.
- `searchCities(query: string): Promise<LocationEntry[]>` — Delegates city name lookup to `remote-weather-gateway.searchCities(query)`.

## Change Vectors

- Migrating local persistence from `AsyncStorage` to `expo-sqlite` or MMKV.
- Adjusting Android GPS accuracy settings, timeouts, or permission fallback behavior.
- Changing coordinate deduplication thresholds or the built-in fallback city.
