# location-and-preferences-store — Test Specification

Test specification for the `location-and-preferences-store` module (`src/store/`) in `proj01`, executed with Jest and `jest-expo` using mocked `expo-location`, `@react-native-async-storage/async-storage`, and `remote-weather-gateway`.

## Unit Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `loadInitialState returns default metric preferences when AsyncStorage is empty` | `@react-native-async-storage/async-storage` returns `null` for stored preferences and saved cities. | `loadInitialState()` resolves with `preferences` set to default metric units (`celsius`, `kmh`) and `savedCities` as an empty array `[]`. |
| `saveCity appends a new city and persists to AsyncStorage` | `saveCity(city)` is called with a `LocationEntry` not currently in `savedCities`. | Resolves with the updated `LocationEntry[]` containing `city`, and writes the serialized list to `@react-native-async-storage/async-storage`. |
| `saveCity deduplicates city with identical ID` | `saveCity(city)` is called with a `LocationEntry` whose `id` matches an existing entry in `savedCities`. | Resolves with `LocationEntry[]` without creating a duplicate entry, preserving a single entry for that ID in `@react-native-async-storage/async-storage`. |
| `removeCity deletes a non-active saved city without changing activeLocation` | `removeCity(locationId)` is called for a saved city ID while `activeLocation` is a different location. | Resolves with `{ savedCities, activeLocation }` where `savedCities` no longer contains `locationId`, `activeLocation` is unchanged, and the updated `savedCities` list is persisted to `@react-native-async-storage/async-storage`. |
| `selectLocation selects a saved city ID and persists lastSelectedLocationId` | `selectLocation(locationId)` is called with an existing saved city ID. | Resolves with the matching `LocationEntry` as the active location and updates `preferences.lastSelectedLocationId` to `locationId` in `@react-native-async-storage/async-storage`. |
| `selectLocation selects current-gps and persists lastSelectedLocationId` | `selectLocation('current-gps')` is called when `currentGpsLocation` is available. | Resolves with the `currentGpsLocation` entry (`id: 'current-gps'`) and updates `preferences.lastSelectedLocationId` to `'current-gps'` in `@react-native-async-storage/async-storage`. |
| `updatePreferences toggles units from metric to imperial and persists immediately` | `updatePreferences({ temperatureUnit: 'fahrenheit', windSpeedUnit: 'mph' })` (or partial unit update) is called when current preferences are `celsius` / `kmh`. | Resolves with the merged `UserPreferences` reflecting `fahrenheit` and `mph`, and immediately persists the updated preferences JSON to `@react-native-async-storage/async-storage`. |
| `updatePreferences toggles units from imperial to metric and persists immediately` | `updatePreferences({ temperatureUnit: 'celsius', windSpeedUnit: 'kmh' })` is called when current preferences are `fahrenheit` / `mph`. | Resolves with the merged `UserPreferences` reflecting `celsius` and `kmh`, and immediately persists the updated preferences JSON to `@react-native-async-storage/async-storage`. |

## Integration Contract Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `loadInitialState resolves current-gps via expo-location and reverse-geocodes label when permission is granted` | Mocked `expo-location` returns granted permission, `getCurrentPositionAsync` returns coordinates, and reverse geocoding returns a city and region. | `loadInitialState()` resolves with `gpsStatus: 'granted'`, `currentGpsLocation` populated as a `LocationEntry` (`id: 'current-gps'`) with the reverse-geocoded city/region label and coordinates, and `activeLocation` resolved according to the active selection contract. |
| `loadInitialState falls back to saved city when GPS permission is denied` | Mocked `expo-location` permission status is `'denied'`, and `@react-native-async-storage/async-storage` contains at least one saved city. | `loadInitialState()` resolves without throwing, sets `gpsStatus: 'denied'`, `currentGpsLocation: null`, and sets `activeLocation` to the saved city. |
| `loadInitialState falls back to built-in default fallback city when GPS permission is denied and no saved cities exist` | Mocked `expo-location` permission status is `'denied'`, and `@react-native-async-storage/async-storage` has no saved cities. | `loadInitialState()` resolves without throwing, sets `gpsStatus: 'denied'`, `currentGpsLocation: null`, and sets `activeLocation` to the built-in default fallback `LocationEntry`. |
| `loadInitialState falls back gracefully when getCurrentPositionAsync throws` | Mocked `expo-location` grants permission, but `getCurrentPositionAsync` rejects with an error. | `loadInitialState()` catches the error, sets `gpsStatus: 'unavailable'`, `currentGpsLocation: null`, and falls back `activeLocation` to a saved city or the built-in default fallback city without rejecting. |
| `searchCities delegates query to remote-weather-gateway and returns normalized LocationEntry list` | `searchCities('Rome')` is called with mocked `remote-weather-gateway.searchCities`. | Calls `remote-weather-gateway.searchCities('Rome')` exactly once and resolves with the normalized `LocationEntry[]` returned by the gateway. |

## Boundary Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `saveCity deduplicates city with coordinates within 0.01 degrees` | `saveCity(city)` is called with a `LocationEntry` whose `id` differs from an existing saved city, but whose latitude and longitude differences from that existing city are within `0.01` degrees (e.g., `|Δlat| <= 0.01` and `|Δlon| <= 0.01`). | Treats the city as a duplicate, does not increase the length of `savedCities`, and resolves with the deduplicated `LocationEntry[]`. |
| `saveCity retains city when coordinate difference exceeds 0.01 degrees` | `saveCity(city)` is called with a `LocationEntry` whose coordinates differ from all existing saved cities by more than `0.01` degrees. | Appends the city to `savedCities`, persists to `@react-native-async-storage/async-storage`, and resolves with both cities present in `LocationEntry[]`. |
| `loadInitialState recovers cleanly when AsyncStorage contains corrupted JSON` | `@react-native-async-storage/async-storage` `getItem` returns malformed/corrupted JSON strings (e.g., `"{invalid-json"`) for preferences and/or saved cities. | `loadInitialState()` does not throw or reject; it falls back to default metric preferences (`celsius`, `kmh`), an empty `savedCities` array `[]`, and a valid `activeLocation`. |

## Behavior Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `removeCity falls back activeLocation when the currently active saved city is deleted` | The store has an active saved city (`activeLocation.id === 'city-1'`). `removeCity('city-1')` is called. | Resolves with `{ savedCities, activeLocation }` where `'city-1'` is removed from `savedCities`, `activeLocation` falls back to `'current-gps'` (if available), another remaining saved city, or the built-in default fallback city, and `preferences.lastSelectedLocationId` is updated accordingly in `@react-native-async-storage/async-storage`. |
| `selectLocation followed by loadInitialState restores lastSelectedLocationId` | A user saves a city, calls `selectLocation(city.id)`, and subsequently `loadInitialState()` is called on a fresh store initialization reading from `@react-native-async-storage/async-storage`. | `loadInitialState()` reads the persisted `preferences.lastSelectedLocationId` and restores the selected saved city as `activeLocation`. |
| `updatePreferences persists across store reloads` | `updatePreferences` switches units from `celsius`/`kmh` to `fahrenheit`/`mph`, and `loadInitialState()` is subsequently called. | `loadInitialState()` reads the persisted preferences from `@react-native-async-storage/async-storage` and returns `fahrenheit` and `mph` in `preferences`. |
