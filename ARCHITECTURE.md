# Architecture Overview

Modular architecture for `proj01`, an Android mobile weather app built with React Native and Expo (TypeScript).

## Design Method

- **Scope & Module Budget:** Designed for **small** scope (a real tool used by a handful of people, maintained by one person), constrained to a **3–6 module budget** (settled at **4 modules**).
- **Method:** **Information Hiding (David Parnas)**. Rather than splitting the app along execution steps, every module hides one cohesive design decision or external constraint that is likely to change behind a stable TypeScript interface. This directly optimizes for the project's primary evolution axis—frequent changes to the single-screen UI layout, weather cards, and visual styling—while keeping external HTTP protocols, slippy-tile radar projection math, and Android GPS/storage mechanics strictly isolated.

## Functional Requirements Summary

- **Location Management (`LocationEntry`):** Request Android foreground GPS permissions (`expo-location`) to resolve current coordinates and a readable place label; search cities by name via Open-Meteo Geocoding; save, deduplicate, remove, and switch favorite cities stored locally (`@react-native-async-storage/async-storage`); and fall back gracefully when GPS permission is denied or unavailable.
- **Single-Screen Forecast (`WeatherSnapshot`):** Display current conditions (temperature, feels-like temperature, WMO condition label and icon, wind speed, relative humidity), a 24-hour hourly forecast (temperature, condition, precipitation probability), and a 14-day daily forecast (high/low temperatures, condition summary, precipitation probability).
- **Static Precipitation Radar (`RadarTileSnapshot`):** Render a static 256×256 OpenStreetMap base map tile centered on the active location's slippy-tile coordinates layered with a transparent 256×256 RainViewer precipitation PNG tile and a positioned location marker pin.
- **Controls & Preferences (`UserPreferences`):** Support pull-to-refresh for live forecast/radar updates and an instant unit toggle between Metric (`°C`, `km/h`) and Imperial (`°F`, `mph`) that updates all displayed numbers immediately without network refetching and persists across app launches.

## Module Map

1. **`weather-domain`** — Defines the canonical domain contracts (`LocationEntry`, `WeatherSnapshot`, `RadarTileSnapshot`, `UserPreferences`), converts canonical Metric values into target display units, and maps WMO weather codes to human labels and icon identifiers (hides conversion formulas, rounding precision, and the WMO lookup table).
   - Design: [`docs/design/weather-domain/design.md`](./docs/design/weather-domain/design.md)
   - Tests: [`docs/design/weather-domain/tests.md`](./docs/design/weather-domain/tests.md)
2. **`remote-weather-gateway`** — Fetches forecasts, geocoding search results, and radar metadata from external HTTP APIs (Open-Meteo, RainViewer, OpenStreetMap), and computes the static radar tile coordinates and marker offsets for a location (hides third-party endpoints, JSON payload schemas, partial radar failure handling, and Web Mercator slippy-tile math).
   - Design: [`docs/design/remote-weather-gateway/design.md`](./docs/design/remote-weather-gateway/design.md)
   - Tests: [`docs/design/remote-weather-gateway/tests.md`](./docs/design/remote-weather-gateway/tests.md)
3. **`location-and-preferences-store`** — Resolves current device GPS coordinates, searches cities via the gateway, and loads/persists saved cities and user preferences on the device with fallback rules (hides `expo-location` permission/reverse-geocoding behavior and `AsyncStorage` keys, JSON serialization, and coordinate deduplication).
   - Design: [`docs/design/location-and-preferences-store/design.md`](./docs/design/location-and-preferences-store/design.md)
   - Tests: [`docs/design/location-and-preferences-store/tests.md`](./docs/design/location-and-preferences-store/tests.md)
4. **`weather-dashboard-ui`** — Renders the single-screen weather overview, static radar tile overlay, unit toggle, pull-to-refresh control, and location selector modal, coordinating user actions across the store and gateway (hides the React Native component hierarchy, `StyleSheet` rules, `@expo/vector-icons` rendering, and layered `<Image>` composition).
   - Design: [`docs/design/weather-dashboard-ui/design.md`](./docs/design/weather-dashboard-ui/design.md)
   - Tests: [`docs/design/weather-dashboard-ui/tests.md`](./docs/design/weather-dashboard-ui/tests.md)

## How the Modules Work Together

1. **App Launch & Initial Location Resolution:**
   - `weather-dashboard-ui` invokes `location-and-preferences-store.loadInitialState()`.
   - `location-and-preferences-store` reads persisted `savedCities` and `UserPreferences` from `AsyncStorage` and checks Android foreground GPS permissions via `expo-location`.
   - It resolves a guaranteed valid `activeLocation: LocationEntry` (live GPS if selected/available, the user's `lastSelectedLocationId`, the first saved city, or a default fallback city if GPS is denied and no cities are saved) and returns `{ activeLocation, savedCities, preferences, gpsStatus }`.
2. **Fetching Forecast & Static Radar Snapshot:**
   - Whenever `activeLocation` is resolved, switched, or refreshed via pull-to-refresh, `weather-dashboard-ui` calls `remote-weather-gateway.fetchWeatherAndRadar(activeLocation)`.
   - `remote-weather-gateway` queries Open-Meteo Forecast API (in canonical Metric units: Celsius and km/h) and RainViewer Weather Maps API in parallel, normalizes the forecast into `WeatherSnapshot`, and computes Web Mercator slippy-tile coordinates (`zoom`, `tileX`, `tileY`, `markerOffsetX`, `markerOffsetY`) and URLs (`baseTileUrl`, `overlayTileUrl`) inside `RadarTileSnapshot`.
   - If RainViewer has no active frame or fails, `remote-weather-gateway` returns `overlayTileUrl: null` and `radarTimestamp: null` so `weather-dashboard-ui` still renders the forecast and base map cleanly.
3. **Instant Unit Toggling (`°C`/`°F`, `km/h`/`mph`):**
   - When the user taps the unit toggle in `weather-dashboard-ui`, the UI calls `location-and-preferences-store.updatePreferences({ temperatureUnit, windSpeedUnit })`.
   - During render, `weather-dashboard-ui` passes the already-loaded canonical `WeatherSnapshot` values and the updated `UserPreferences` into `weather-domain`'s pure formatters (`convertTemperature`, `convertWindSpeed`, `resolveWmoCondition`). All cards update on the next frame with zero network traffic.
4. **Searching, Saving, and Switching Cities:**
   - From the city selector modal, typing a query calls `location-and-preferences-store.searchCities(query)`, which delegates the network lookup to `remote-weather-gateway.searchCities(query)` and returns normalized `LocationEntry[]` items.
   - Selecting, saving (`saveCity`), or deleting (`removeCity`) a city updates `AsyncStorage` via `location-and-preferences-store` (deduplicating coordinates/IDs and ensuring `activeLocation` remains valid) and triggers `weather-dashboard-ui` to fetch the newly selected city's weather and radar.

## Design Assessment

| Integration | What crosses the interface | What stays hidden on each side | Sound? | Action |
| :--- | :--- | :--- | :--- | :--- |
| **`remote-weather-gateway` -> `weather-domain`** | Canonical domain types (`LocationEntry`, `WeatherSnapshot`, `RadarTileSnapshot`) and canonical baseline unit assumptions (Celsius, km/h). | Gateway hides HTTP URLs, raw JSON responses, and Web Mercator math; Domain hides display unit conversion and WMO icon mapping. | Sound — both share only the stable canonical data model in baseline metric units. | none |
| **`location-and-preferences-store` -> `weather-domain`** | Canonical `LocationEntry` and `UserPreferences` data structures. | Store hides `AsyncStorage` keys, JSON serialization, and `expo-location` native calls; Domain hides weather metrics and formatting. | Sound — no native or storage types cross into the domain contract. | none |
| **`location-and-preferences-store` -> `remote-weather-gateway`** | City search query string (`searchCities(query: string): Promise<LocationEntry[]>`) to look up candidate cities for saving/selecting. | Store hides how selected cities are deduplicated and persisted; Gateway hides the Open-Meteo Geocoding HTTP call and response parsing. | Sound — store operates strictly on normalized `LocationEntry[]` results. | none |
| **`weather-dashboard-ui` -> `location-and-preferences-store`** | Commands and state reads to load initial state, request current GPS location, search/save/remove/select cities, and toggle `UserPreferences` units. | UI hides screen layout and modal state; Store hides Android permission status codes, fallback order, and `AsyncStorage` keys. | Sound — UI receives normalized `LocationEntry`, `UserPreferences`, and abstract GPS availability state. | none |
| **`weather-dashboard-ui` -> `remote-weather-gateway`** | Request to load weather and radar for an active location (`fetchWeatherAndRadar(location: LocationEntry): Promise<{ weather: WeatherSnapshot; radar: RadarTileSnapshot }>`). | UI hides how cards and layered `<Image>` views are styled; Gateway hides parallel fetching of Open-Meteo and RainViewer, radar fallback logic, and tile math. | Sound — UI gets ready-to-render canonical snapshots and tile URLs/offsets without knowing slippy-tile math or API schemas. | none |
| **`weather-dashboard-ui` -> `weather-domain`** | Calls to pure formatter/selector functions (`convertTemperature(celsius, unit)`, `convertWindSpeed(kmh, unit)`, `resolveWmoCondition(wmoCode)`) using canonical `WeatherSnapshot` and current `UserPreferences`. | UI hides visual styling and layout; Domain hides conversion math, rounding, and WMO lookup tables. | Sound — enables instantaneous unit toggling without network refetch or mutating stored state. | none |

## Design Decisions and Trade-offs

1. **Encapsulating Web Mercator Slippy-Tile Math Inside `remote-weather-gateway`:**
   - *Considered:* Computing tile `x/y/z` coordinates and pixel pin offsets inside `weather-dashboard-ui`'s radar card component.
   - *Chosen:* Placed slippy-tile coordinate projection and URL assembly inside `remote-weather-gateway`, returning a ready-to-render `RadarTileSnapshot` with `baseTileUrl`, `overlayTileUrl`, and `markerOffsetX/Y` in `[0, 256)`.
   - *Why (Information Hiding):* Keeps spatial projection math and tile provider URL templates out of the UI so changing radar zoom levels, tile servers, or coordinate calculations never touches presentation code.
2. **Canonical Metric Baseline (`°C`, `km/h`) + Pure Display-Time Conversion in `weather-domain`:**
   - *Considered:* Passing `temperature_unit=fahrenheit&wind_speed_unit=mph` to Open-Meteo and re-fetching when the user toggles units.
   - *Chosen:* `remote-weather-gateway` always requests and normalizes forecasts in Metric (`°C`, `km/h`), and `weather-domain` provides pure conversion functions called during render.
   - *Why (Information Hiding):* Decouples the user preference toggle from network availability and API query parameters, guaranteeing instantaneous unit switching without mutating cached forecast data.
3. **Layered Static PNG `<Image>` Tiles Instead of a Native Map SDK:**
   - *Considered:* Embedding `react-native-maps` in static/lite mode with a `UrlTile` overlay.
   - *Chosen:* Layered 256×256 React Native `<Image>` views (OpenStreetMap base tile + RainViewer precipitation PNG + positioned marker pin).
   - *Why:* Runs out of the box in Expo Go and standalone Android APK builds without requiring a Google Maps API key or billing account, while keeping the UI lightweight.

## Unresolved Risks

- **OpenStreetMap Tile Usage Policy (`remote-weather-gateway` & `weather-dashboard-ui`):**
  - *Risk:* OpenStreetMap's standard tile server (`tile.openstreetmap.org`) requires visible attribution and a descriptive `User-Agent` header and discourages heavy uncached automated traffic.
  - *Condition to revisit:* Acceptable for a personal app rendering one static 256×256 tile per refresh. Must be revisited inside `remote-weather-gateway` (by configuring custom request headers or swapping `baseTileUrl` to an alternative free raster tile provider) if requests are ever rate-limited or return HTTP 403.
- **Icon Identifier Vocabulary Between `weather-domain` and `weather-dashboard-ui`:**
  - *Risk:* `weather-domain.resolveWmoCondition(wmoCode)` returns an `iconName` string aligned with `@expo/vector-icons` (`MaterialCommunityIcons` / `Feather`) rendered by `weather-dashboard-ui`.
  - *Condition to revisit:* Must be revisited only if the app replaces `@expo/vector-icons` with custom SVGs or a different icon pack, in which case either the mapping table in `weather-domain` or an icon lookup map in `weather-dashboard-ui` will be updated.
- **Shared Canonical Domain Types (`weather-domain`):**
  - *Risk:* Adding a brand-new weather dimension (such as UV index or air quality) requires adding the field to `WeatherSnapshot` in `weather-domain`, parsing it in `remote-weather-gateway`, and rendering it in `weather-dashboard-ui`.
  - *Condition to revisit:* Revisit only if weather metrics become dynamically configured at runtime rather than fixed dashboard cards.
