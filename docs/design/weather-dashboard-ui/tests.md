# weather-dashboard-ui — Test Specification

Test specification for the `weather-dashboard-ui` module (`src/ui/` and root `App.tsx`) in `proj01`, executed with Jest and `jest-expo`.

## Unit Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `renders current conditions with formatted values` | Render the current conditions view with sample weather data and active unit preference (`°C` or `°F`). | Displays the current temperature formatted via `convertTemperature` and wind speed formatted via `convertWindSpeed` matching the active unit preference. |
| `renders 24h hourly forecast items` | Render the hourly forecast section with a 24-item hourly forecast array. | Renders 24 hourly forecast items displaying each entry's converted temperature according to the current unit preference. |
| `renders 14d daily forecast items` | Render the daily forecast section with a 14-item daily forecast array. | Renders 14 daily forecast items displaying each entry's converted high/low temperatures according to the current unit preference. |
| `renders static radar card with base and overlay layers and positioned marker` | Render the static radar card when both `baseTileUrl` and a non-null `overlayTileUrl` are provided along with `(markerOffsetX, markerOffsetY)`. | Renders two `<Image>` layers (`baseTileUrl` and `overlayTileUrl`) and positions the marker pin at `(markerOffsetX, markerOffsetY)`. |
| `renders static radar card gracefully when overlayTileUrl is null` | Render the static radar card with a valid `baseTileUrl`, `overlayTileUrl: null`, and `(markerOffsetX, markerOffsetY)`. | Renders the `baseTileUrl` `<Image>` and marker pin at `(markerOffsetX, markerOffsetY)` without rendering an overlay `<Image>` or throwing an error. |

## Integration Contract Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `initial load coordinates store and weather gateway` | Mount `App.tsx` with mocked `location-and-preferences-store` and `remote-weather-gateway`. | Calls `loadInitialState()` once, then calls `fetchWeatherAndRadar(activeLocation)` with the resolved `activeLocation`, and renders current conditions, 24h hourly forecast items, 14d daily forecast items, and the static radar card. |
| `unit toggle persists preference and converts values without refetching` | Mount `App.tsx` after initial load completes, then trigger the unit toggle (`°C` <-> `°F`). | Calls `updatePreferences` with the new unit, updates displayed temperatures via `convertTemperature` and wind speeds via `convertWindSpeed`, and does not call `fetchWeatherAndRadar` again. |
| `location modal search invokes searchCities` | Open the location modal and enter a city query string. | Calls `searchCities` on `remote-weather-gateway` with the entered query and renders the returned candidate cities. |
| `location modal save and select updates store and fetches new forecast` | In the location modal, select a searched city to save or pick an existing saved city. | Calls `saveCity` (when adding a searched city) and `selectLocation` on `location-and-preferences-store`, updates `activeLocation`, and calls `fetchWeatherAndRadar` with the newly selected location. |

## Boundary Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `radar card handles null overlayTileUrl boundary` | Provide radar payload where `overlayTileUrl` is `null` and marker offsets are at tile boundaries. | Component mounts and renders without crashing, omitting the overlay image layer while keeping the base tile and marker pin intact. |
| `gps-denied state preserves interactive controls` | `loadInitialState()` resolves with a GPS-denied status and no initial coordinates or fallback state. | Renders user-visible GPS-denied feedback while keeping the city switcher (location modal trigger) and unit toggle (`°C` <-> `°F`) enabled and interactive. |
| `gateway error state preserves interactive controls` | `fetchWeatherAndRadar(activeLocation)` rejects with a network or gateway error. | Renders user-visible error feedback and keeps both the city switcher and unit toggle enabled and interactive so the user can change units or select another city. |
| `searchCities empty result set` | User searches a query in the location modal for which `searchCities` returns an empty array `[]`. | Renders an empty-results state inside the modal without crashing and keeps the search input and saved cities list interactive. |

## Behavior Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `user sees full dashboard on startup` | User opens the app with a valid `activeLocation` returned by `loadInitialState()`. | User sees loading feedback transition into populated current conditions, 24h hourly list, 14d daily list, and static radar card with marker pin. |
| `user toggles units between Celsius and Fahrenheit` | User taps the `°C` / `°F` toggle while viewing loaded weather data. | All visible temperature and wind speed values across current, hourly, and daily sections update immediately to the chosen unit without a network reload. |
| `user pulls to refresh weather data` | User triggers pull-to-refresh on the dashboard scroll container. | Invokes `fetchWeatherAndRadar` for the current `activeLocation` and updates the rendered dashboard with the fresh payload. |
| `user searches, saves, and switches to a new city` | User opens the location modal, searches for a city, taps to save and select it. | Modal calls `searchCities`, then `saveCity` and `selectLocation`, closes or updates state, and the dashboard fetches and displays weather and radar for the newly selected city. |
| `user recovers from error or GPS denial by switching city` | Dashboard is in an error or GPS-denied state; user opens the city switcher, selects a city, and toggles units. | Unit toggle updates the preference via `updatePreferences`, and selecting a city via `selectLocation` triggers `fetchWeatherAndRadar` and transitions the UI from the error state to the loaded weather dashboard. |
