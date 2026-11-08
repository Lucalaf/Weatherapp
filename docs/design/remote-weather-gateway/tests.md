# remote-weather-gateway — Test Specification

Test specification for the `remote-weather-gateway` module (`src/gateway/`) in `proj01` (an Android React Native + Expo TypeScript weather application tested with Jest and `jest-expo`).

## Unit Tests

Unit tests cover the pure Web Mercator projection logic in `computeRadarTileCoordinates(latitude: number, longitude: number, zoom?: number): { zoom: number; tileX: number; tileY: number; markerOffsetX: number; markerOffsetY: number }` and helper/normalization logic without network interaction.

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `computeRadarTileCoordinates uses default zoom 7 when zoom is omitted` | Call `computeRadarTileCoordinates(0, 0)` with no `zoom` argument. | Returns `{ zoom: 7, tileX: 64, tileY: 64, markerOffsetX: 0, markerOffsetY: 0 }` with `tileX`, `tileY` as integers in `[0, 128)` and `markerOffsetX`, `markerOffsetY` in `[0, 256)`. |
| `computeRadarTileCoordinates projects known mid-latitude coordinates at zoom 7` | Call `computeRadarTileCoordinates(45.4642, 9.1900, 7)` (or another known coordinate pair). | Returns deterministic integer `tileX` and `tileY` in `[0, 128)` and pixel coordinates `markerOffsetX` and `markerOffsetY` in `[0, 256)` matching Web Mercator projection math for tile size `256` at zoom `7`. |
| `computeRadarTileCoordinates supports arbitrary zoom levels` | Call `computeRadarTileCoordinates(37.7749, -122.4194, 5)` and `computeRadarTileCoordinates(37.7749, -122.4194, 10)`. | Returns `zoom` matching the passed argument (`5` and `10`), integer `tileX` and `tileY` within `[0, 2^zoom)`, and `markerOffsetX`, `markerOffsetY` within `[0, 256)`. |
| `computeRadarTileCoordinates produces integer tile indices and in-range pixel offsets` | Call `computeRadarTileCoordinates` across representative coordinate pairs in all four hemispheres (`(40.7, -74.0)`, `(-33.8, 151.2)`, `(35.6, 139.6)`, `(-34.6, -58.3)`). | For every call, `Number.isInteger(tileX)` and `Number.isInteger(tileY)` are `true`, `0 <= tileX < 2^zoom`, `0 <= tileY < 2^zoom`, `0 <= markerOffsetX < 256`, and `0 <= markerOffsetY < 256`. |

## Integration Contract Tests

Integration contract tests verify how `fetchWeatherAndRadar` and `searchCities` interact with mocked `fetch` responses from Open-Meteo Forecast, RainViewer, and Open-Meteo Geocoding endpoints, and how their JSON payloads are normalized into canonical domain models.

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `fetchWeatherAndRadar normalizes Open-Meteo Forecast JSON into canonical WeatherSnapshot` | Mock `fetch` to return a valid 200 JSON payload from Open-Meteo Forecast (with metric units `°C` and `km/h`, current weather, at least 24 hourly entries, and at least 14 daily entries) and a valid 200 JSON payload from RainViewer. Call `fetchWeatherAndRadar(location)`. | Resolves with `weather` conforming to `WeatherSnapshot` in Metric (`°C` and `km/h`), containing exactly 24 hourly items and 14 daily items mapped from the Open-Meteo response. |
| `fetchWeatherAndRadar constructs RadarTileSnapshot with OpenStreetMap baseTileUrl and RainViewer overlayTileUrl` | Mock `fetch` to return valid Open-Meteo Forecast JSON and RainViewer JSON containing `host` (e.g. `"https://tilecache.rainviewer.com"`) and non-empty `radar.past` frames where the latest frame has `path` (e.g. `"/v2/radar/1700000000"`) and `time` (`1700000000`). Call `fetchWeatherAndRadar(location)`. | Resolves with `radar` conforming to `RadarTileSnapshot` where `baseTileUrl` uses `tile.openstreetmap.org` with the computed `{zoom}/{tileX}/{tileY}.png`, `overlayTileUrl` equals `{host}{path}/256/{zoom}/{tileX}/{tileY}/2/1_1.png`, and `radarTimestamp` matches the selected frame's timestamp. |
| `searchCities maps Open-Meteo Geocoding results to normalized LocationEntry array` | Mock `fetch` to return a 200 Open-Meteo Geocoding JSON payload containing a `results` array of city objects. Call `searchCities("Rome")`. | Calls `fetch` once against the Open-Meteo Geocoding endpoint and resolves to a `LocationEntry[]` with each item normalized from `results` and `isCurrentLocation: false`. |
| `searchCities returns empty array when Open-Meteo Geocoding response omits results` | Mock `fetch` to return a 200 Open-Meteo Geocoding JSON payload with `results: undefined` (e.g. `{ "generationtime_ms": 0.5 }` when no match is found). Call `searchCities("zzzznotacity")`. | Resolves to `[]` without throwing. |

## Boundary Tests

Boundary tests verify behavior at numeric, string-length, and array-length limits across `computeRadarTileCoordinates`, `fetchWeatherAndRadar`, and `searchCities`.

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `computeRadarTileCoordinates clamps latitude above +85.0511` | Call `computeRadarTileCoordinates(90, 0, 7)` and `computeRadarTileCoordinates(85.0511, 0, 7)`. | Both calls produce identical outputs, clamping latitude to `85.0511` with `tileY === 0` and `0 <= markerOffsetY < 256`. |
| `computeRadarTileCoordinates clamps latitude below -85.0511` | Call `computeRadarTileCoordinates(-90, 0, 7)` and `computeRadarTileCoordinates(-85.0511, 0, 7)`. | Both calls produce identical outputs, clamping latitude to `-85.0511` with `tileY === 127` (at zoom 7) and `0 <= markerOffsetY < 256`. |
| `computeRadarTileCoordinates handles antimeridian longitudes (-180 and +180)` | Call `computeRadarTileCoordinates(0, -180, 7)` and `computeRadarTileCoordinates(0, 180, 7)`. | `tileX` remains an integer within `[0, 128)` (no out-of-range `tileX === 128` at `+180`) and `markerOffsetX` remains within `[0, 256)`. |
| `searchCities short-circuits on empty string without calling fetch` | Spy on `fetch` and call `searchCities("")`. | Resolves to `[]` and `expect(fetch).not.toHaveBeenCalled()`. |
| `searchCities short-circuits on whitespace-only string without calling fetch` | Spy on `fetch` and call `searchCities("   ")`. | Resolves to `[]` and `expect(fetch).not.toHaveBeenCalled()`. |
| `searchCities short-circuits on single-character query (< 2 characters) without calling fetch` | Spy on `fetch` and call `searchCities("a")` and `searchCities(" a ")`. | Both calls resolve to `[]` and `expect(fetch).not.toHaveBeenCalled()`. |
| `searchCities executes fetch when trimmed query has exactly 2 characters` | Mock `fetch` with a valid Geocoding response and call `searchCities("Ro")`. | Calls `fetch` once and returns the normalized `LocationEntry[]`. |
| `fetchWeatherAndRadar slices or limits hourly to 24 items and daily to 14 items` | Mock `fetch` with an Open-Meteo Forecast payload containing more than 24 hourly entries (e.g. 48 or 168) and 14 daily entries. Call `fetchWeatherAndRadar(location)`. | Returned `weather` contains 24 hourly items and 14 daily items. |

## Behavior Tests

Behavior tests verify runtime fault tolerance, graceful degradation when RainViewer fails, and error propagation when Open-Meteo Forecast fails.

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `fetchWeatherAndRadar degrades gracefully when RainViewer returns HTTP 500` | Mock `fetch` so Open-Meteo Forecast returns 200 with valid JSON and RainViewer returns HTTP 500. Call `fetchWeatherAndRadar(location)`. | Resolves with the normalized `weather: WeatherSnapshot` and `radar: RadarTileSnapshot` having a valid `baseTileUrl`, `overlayTileUrl: null`, and `radarTimestamp: null`. |
| `fetchWeatherAndRadar degrades gracefully when RainViewer request rejects with network error` | Mock `fetch` so Open-Meteo Forecast returns 200 with valid JSON and the RainViewer `fetch` call rejects with `new TypeError("Network request failed")`. Call `fetchWeatherAndRadar(location)`. | Resolves with the normalized `weather: WeatherSnapshot` and `radar` having `overlayTileUrl: null` and `radarTimestamp: null`. |
| `fetchWeatherAndRadar degrades gracefully when RainViewer returns empty radar.past frames` | Mock `fetch` so Open-Meteo Forecast returns 200 with valid JSON and RainViewer returns 200 with `{ host: "https://tilecache.rainviewer.com", radar: { past: [] } }` (or missing `radar.past`). Call `fetchWeatherAndRadar(location)`. | Resolves with the normalized `weather: WeatherSnapshot` and `radar` having `overlayTileUrl: null` and `radarTimestamp: null`. |
| `fetchWeatherAndRadar rejects with descriptive Error when Open-Meteo Forecast returns non-2xx` | Mock `fetch` so Open-Meteo Forecast returns HTTP 503 (or 400/500) and RainViewer returns 200. Call `fetchWeatherAndRadar(location)`. | Rejects with an `Error` instance whose message describes the Open-Meteo forecast failure. |
| `fetchWeatherAndRadar rejects with descriptive Error when Open-Meteo Forecast returns malformed payload` | Mock `fetch` so Open-Meteo Forecast returns HTTP 200 with an incomplete or malformed JSON object (e.g. missing `current`, `hourly`, or `daily` fields) and RainViewer returns 200. Call `fetchWeatherAndRadar(location)`. | Rejects with a descriptive `Error` instance rather than resolving with partial/undefined weather fields. |
| `fetchWeatherAndRadar uses latest frame when RainViewer radar.past has multiple frames` | Mock `fetch` so Open-Meteo Forecast returns 200 and RainViewer returns 200 with multiple entries in `radar.past` in chronological order. Call `fetchWeatherAndRadar(location)`. | Builds `radar.overlayTileUrl` and `radar.radarTimestamp` from the latest frame in `radar.past`. |
