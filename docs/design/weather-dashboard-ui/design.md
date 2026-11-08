# weather-dashboard-ui

Design specification for the `weather-dashboard-ui` module (`src/ui/` and root `App.tsx`) in `proj01`, an Android React Native + Expo TypeScript weather application.

## Functional Responsibilities

Renders the single-screen weather overview, static radar tile overlay, unit toggle, pull-to-refresh control, and location selector modal, coordinating user actions across the store and gateway.

### Single-Screen Dashboard Components (`ScrollView` with `RefreshControl`)

- **Header Bar:** Active location name + region/country badge (and GPS indicator icon if `isCurrentLocation`), button to open the Location Picker Modal, and the `°C / °F` Unit Toggle button.
- **Current Conditions Card:** Main temperature (`convertTemperature`), weather condition icon & label (`resolveWmoCondition`), "Feels like" temperature (`convertTemperature`), wind speed (`convertWindSpeed`), and relative humidity (`%`).
- **24-Hour Forecast Strip:** Horizontal `ScrollView`/`FlatList` rendering the 24 `HourlyForecastItem` entries (hour label, condition icon, converted temperature, and precipitation probability `%`).
- **14-Day Forecast Card:** Vertical list of the 14 `DailyForecastItem` entries (day label, condition icon & label, precipitation probability `%`, and converted daily min/max temperatures).
- **Static Precipitation Radar Card:** Fixed 256×256 container rendering:
  1. Base map `<Image source={{ uri: radar.baseTileUrl }} />` (256×256).
  2. Conditional precipitation overlay `<Image source={{ uri: radar.overlayTileUrl }} />` (256×256 with semi-transparent opacity) when `radar.overlayTileUrl !== null`, or a subtle note when radar overlay is unavailable.
  3. Center marker pin positioned at `{ left: radar.markerOffsetX, top: radar.markerOffsetY }` indicating the exact city location inside the tile, plus OpenStreetMap / RainViewer attribution caption.
- **Location Selector & Search Modal:** Allows switching to Current GPS location (or re-requesting GPS), searching cities via `searchCities`, saving a searched city to favorites, switching to a saved city, or deleting a saved city.

## Encapsulated Knowledge

The secret this module hides: the React Native component tree, `StyleSheet` layout, `@expo/vector-icons` rendering, layered `<Image>` composition, and UI state transitions.

## Classification

**User Interface & Presentation Hider (Information Hiding / Parnas):** encapsulates the highest-churn presentation decisions (cards, charts, styling, modal presentation) so frequent visual and layout adjustments never propagate into data fetching, slippy-tile math, or device storage modules.

## Integration Contracts

| Integration | Crosses Interface | Stays Hidden |
| --- | --- | --- |
| `weather-dashboard-ui -> location-and-preferences-store` | Commands and state reads to load initial state, request current GPS location, search/save/remove/select cities, and toggle `UserPreferences` units. | UI hides screen layout and modal state; Store hides Android permission status codes, fallback order, and `AsyncStorage` keys. |
| `weather-dashboard-ui -> remote-weather-gateway` | Request to load weather and radar for an active location (`fetchWeatherAndRadar(location: LocationEntry): Promise<{ weather: WeatherSnapshot; radar: RadarTileSnapshot }>`). | UI hides how cards and layered `<Image>` views are styled; Gateway hides parallel fetching of Open-Meteo and RainViewer, radar fallback logic, and tile math. |
| `weather-dashboard-ui -> weather-domain` | Calls to pure formatter/selector functions (`convertTemperature(celsius, unit)`, `convertWindSpeed(kmh, unit)`, `resolveWmoCondition(wmoCode)`) using canonical `WeatherSnapshot` and current `UserPreferences`. | UI hides visual styling and layout; Domain hides conversion math, rounding, and WMO lookup tables. |

### Dashboard Coordinator Hook / State (`useWeatherDashboard`)

- On mount, calls `location-and-preferences-store.loadInitialState()` and then `remote-weather-gateway.fetchWeatherAndRadar(activeLocation)`.
- Exposes actions for:
  - `onRefresh()` (pull-to-refresh)
  - `onToggleUnits()` (toggles between `{ temperatureUnit: 'celsius', windSpeedUnit: 'kmh' }` and `{ temperatureUnit: 'fahrenheit', windSpeedUnit: 'mph' }` via `updatePreferences`)
  - `onSelectLocation(id)`
  - `onRequestGps()`
  - `onSearchCities(query)`
  - `onSaveCity(city)`
  - `onRemoveCity(id)`

## Change Vectors

- Redesigning weather cards, colors, spacing, or typography.
- Adding new visual charts (e.g., hourly temperature curve or precipitation bar chart) derived from `WeatherSnapshot`.
- Replacing the city picker modal with a bottom sheet or drawer.
