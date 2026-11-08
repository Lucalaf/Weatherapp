# AGENTS.md — Coding Agent Guide for `proj01`

Guidelines, architectural constraints, and verification rules for coding agents working in this repository.

## Where to look

- [`README.md`](./README.md) — What the project is, who it is for, and the domain vocabulary and user actions.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Modular architecture overview, Information Hiding rationale, integration contracts, and trade-offs.
- **Per-Module Design & Test Specifications:**
  - **`weather-domain`** (Canonical domain contracts, metric-to-imperial unit conversions, and WMO weather code mappings):
    - [`docs/design/weather-domain/design.md`](./docs/design/weather-domain/design.md)
    - [`docs/design/weather-domain/tests.md`](./docs/design/weather-domain/tests.md)
  - **`remote-weather-gateway`** (Open-Meteo forecast & geocoding HTTP clients, RainViewer radar metadata client, and Web Mercator slippy-tile coordinate math):
    - [`docs/design/remote-weather-gateway/design.md`](./docs/design/remote-weather-gateway/design.md)
    - [`docs/design/remote-weather-gateway/tests.md`](./docs/design/remote-weather-gateway/tests.md)
  - **`location-and-preferences-store`** (Android foreground GPS lookup via `expo-location`, saved cities deduplication, fallback rules, and `AsyncStorage` persistence):
    - [`docs/design/location-and-preferences-store/design.md`](./docs/design/location-and-preferences-store/design.md)
    - [`docs/design/location-and-preferences-store/tests.md`](./docs/design/location-and-preferences-store/tests.md)
  - **`weather-dashboard-ui`** (Single-screen React Native dashboard, weather cards, layered `<Image>` static radar tile, unit toggle, pull-to-refresh, and city search/selection modal):
    - [`docs/design/weather-dashboard-ui/design.md`](./docs/design/weather-dashboard-ui/design.md)
    - [`docs/design/weather-dashboard-ui/tests.md`](./docs/design/weather-dashboard-ui/tests.md)

---

## What the Project Is

`proj01` is a small Android mobile weather app built with **React Native** and **Expo (Managed Workflow, TypeScript)**. It presents a single-screen overview of current conditions, a 24-hour forecast, a 7-day forecast, and a static precipitation radar map for either the device's current GPS location or a list of saved favorite cities, with instant `°C`/`°F` (`km/h`/`mph`) unit switching and pull-to-refresh.

---

## Technology Stack

- **Runtime & Framework:** React Native + Expo (Managed Workflow) with strict TypeScript (`tsconfig.json` `strict: true`).
- **Styling & Icons:** React Native `StyleSheet` and `@expo/vector-icons` (`MaterialCommunityIcons` / `Feather`). Do not introduce Tailwind/NativeWind or third-party component kits unless asked.
- **Location:** `expo-location` (foreground permission request, current position lookup, and reverse geocoding).
- **Persistence:** `@react-native-async-storage/async-storage` for persisting saved cities and user preferences (`temperatureUnit`, `windSpeedUnit`, `lastSelectedLocationId`).
- **Networking:** Native `fetch` against free, no-key public endpoints:
  - Open-Meteo Forecast API (`https://api.open-meteo.com/v1/forecast`)
  - Open-Meteo Geocoding API (`https://geocoding-api.open-meteo.com/v1/search`)
  - RainViewer Weather Maps API (`https://api.rainviewer.com/public/weather-maps.json`)
  - OpenStreetMap standard 256×256 tile server (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)
- **Static Radar View:** Layered React Native `<Image>` components (base OpenStreetMap 256×256 PNG tile + RainViewer 256×256 precipitation PNG overlay + positioned pin marker). Do not add native map SDKs requiring Google Maps API billing keys.
- **Testing:** Jest + `jest-expo`.

---

## How to Run, Build, and Test

Once the Expo project is initialized in this repository:

- **Install dependencies:**
  ```bash
  npm install
  ```
- **Start the Expo development server (for Android / Expo Go):**
  ```bash
  npx expo start --android
  ```
- **Type-check the codebase:**
  ```bash
  npx tsc --noEmit
  ```
- **Run automated tests (Jest):**
  ```bash
  npm test -- --watchAll=false
  ```

---

## Architectural Constraints & Conventions

This project is designed using **Information Hiding (Parnas)** with a **4-module budget**. Respect every boundary when writing or modifying code:

1. **`weather-domain` (`src/domain/`)**
   - Owns all canonical TypeScript types (`LocationEntry`, `WeatherSnapshot`, `CurrentWeather`, `HourlyForecastItem`, `DailyForecastItem`, `RadarTileSnapshot`, `UserPreferences`, `TemperatureUnit`, `WindSpeedUnit`, `WmoConditionInfo`).
   - Owns all deterministic conversion math (`convertTemperature`, `convertWindSpeed`) and WMO numeric weather code mappings (`resolveWmoCondition`).
   - **Rule:** Keep this module pure TypeScript with zero React, Expo, network, or storage imports. All `WeatherSnapshot` payloads are stored in canonical baseline Metric (`°C`, `km/h`).

2. **`remote-weather-gateway` (`src/gateway/`)**
   - Owns all HTTP calls to Open-Meteo and RainViewer, response normalization, and Web Mercator slippy-tile math (`lat/lon` → `zoom`, `tileX`, `tileY`, `markerOffsetX`, `markerOffsetY` in `[0, 256)`).
   - **Rule:** Always fetch Open-Meteo forecasts in canonical Metric (`°C`, `km/h`). Never leak raw API JSON shapes or slippy-tile projection math into UI components or the store. If RainViewer fails or returns no frames, resolve `fetchWeatherAndRadar` with `overlayTileUrl: null` and `radarTimestamp: null` so the forecast and base map still display.

3. **`location-and-preferences-store` (`src/store/`)**
   - Owns Android GPS permission handling (`expo-location`), reverse-geocoding fallback naming, `AsyncStorage` keys and JSON serialization, and saved city coordinate/ID deduplication.
   - **Rule:** If GPS permission is denied or location services fail, never crash or block the app—always fall back gracefully to the last selected city, first saved city, or a sensible built-in default city so `loadInitialState()` always provides a valid `activeLocation`.

4. **`weather-dashboard-ui` (`src/ui/` and root `App.tsx`)**
   - Owns the React Native component hierarchy, `StyleSheet` rules, pull-to-refresh gesture handling, layered `<Image>` radar card rendering, and the city search/selection modal.
   - **Rule:** Convert temperatures and wind speeds at render time via `weather-domain` functions so toggling units (`°C` ↔ `°F`) updates the screen instantaneously without triggering a network refetch.

---

## Checklist Before Finishing Any Change

1. Verify that module dependency directions follow [`ARCHITECTURE.md`](./ARCHITECTURE.md) and no module reaches into another module's hidden implementation details.
2. Run `npx tsc --noEmit` and confirm there are zero TypeScript errors.
3. Run `npm test -- --watchAll=false` and ensure all unit, integration contract, boundary, and behavior tests specified in `docs/design/*/tests.md` pass.
