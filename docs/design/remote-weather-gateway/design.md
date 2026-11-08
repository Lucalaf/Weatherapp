# remote-weather-gateway

Design specification for the `remote-weather-gateway` module (`src/gateway/`) in `proj01`, an Android React Native + Expo TypeScript weather application.

## Functional Responsibilities

`remote-weather-gateway` fetches forecasts, geocoding search results, and radar metadata from external HTTP APIs, and computes the static radar tile coordinates and marker offsets for a location.

## Encapsulated Knowledge

The secret it hides:
- The choice of external APIs (Open-Meteo, RainViewer, OpenStreetMap).
- Their JSON payload schemas.
- Partial failure handling for radar frames.
- The Web Mercator slippy-tile projection math.

## Classification

**External Service & Protocol Hider (Information Hiding / Parnas):** Hides external vendor protocols, third-party JSON formats, and specialized spatial projection algorithms behind a domain-shaped interface.

## Integration Contracts

### Module Boundaries

| Integration | Crosses Interface | Stays Hidden |
| --- | --- | --- |
| `remote-weather-gateway -> weather-domain` | Canonical domain types (`LocationEntry`, `WeatherSnapshot`, `RadarTileSnapshot`) and canonical baseline unit assumptions (Celsius, km/h). | Gateway hides HTTP URLs, raw JSON responses, and Web Mercator math; Domain hides display unit conversion and WMO icon mapping. |
| `location-and-preferences-store -> remote-weather-gateway` | City search query string (`searchCities(query: string): Promise<LocationEntry[]>`) to look up candidate cities for saving/selecting. | Store hides how selected cities are deduplicated and persisted; Gateway hides the Open-Meteo Geocoding HTTP call and response parsing. |
| `weather-dashboard-ui -> remote-weather-gateway` | Request to load weather and radar for an active location (`fetchWeatherAndRadar(location: LocationEntry): Promise<{ weather: WeatherSnapshot; radar: RadarTileSnapshot }>`). | UI hides how cards and layered `<Image>` views are styled; Gateway hides parallel fetching of Open-Meteo and RainViewer, radar fallback logic, and tile math. |

### Detailed API Contracts

#### `fetchWeatherAndRadar(location: LocationEntry): Promise<{ weather: WeatherSnapshot; radar: RadarTileSnapshot }>`

- **Open-Meteo Forecast Request:** Calls the Open-Meteo Forecast API at:
  `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=14&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`
- **Forecast Mapping:** Slices 24 hourly forecast entries starting from the current hour (or first 24 available) and 14 daily forecast entries into a canonical `WeatherSnapshot`.
- **RainViewer Metadata Request:** Calls the RainViewer Weather Maps API (`https://api.rainviewer.com/public/weather-maps.json`), reads the latest past radar frame (`radar.past[radar.past.length - 1]`), and constructs `overlayTileUrl` (`{host}{path}/256/{zoom}/{tileX}/{tileY}/2/1_1.png`) and `radarTimestamp`.
- **Web Mercator Slippy-Tile Computation:** Computes coordinates at static radar zoom (default `zoom = 7`) for `(location.latitude, location.longitude)`:
  - `n = 2 ^ zoom`
  - Exact fractional tile coordinates:
    - `xFloat = ((lon + 180) / 360) * n`
    - `yFloat = ((1 - ln(tan(latRad) + sec(latRad)) / pi) / 2) * n`
  - Integer tile coordinates:
    - `tileX = floor(xFloat)`
    - `tileY = floor(yFloat)`
  - Pixel offsets within the 256×256 tile in `[0, 256)`:
    - `markerOffsetX = floor((xFloat - tileX) * 256)`
    - `markerOffsetY = floor((yFloat - tileY) * 256)`
  - Base tile URL:
    - `baseTileUrl = https://tile.openstreetmap.org/{zoom}/{tileX}/{tileY}.png`
- **Graceful Radar Degradation Invariant:** If the RainViewer HTTP call fails, times out, or has no radar frames, `fetchWeatherAndRadar` still resolves with the valid `WeatherSnapshot` and a `RadarTileSnapshot` containing valid `baseTileUrl`, `tileX`, `tileY`, `markerOffsetX`, `markerOffsetY`, and `overlayTileUrl: null`, `radarTimestamp: null`. If the Open-Meteo Forecast call fails, `fetchWeatherAndRadar` rejects with a descriptive `Error`.

#### `searchCities(query: string): Promise<LocationEntry[]>`

- Trims `query`; if fewer than 2 characters, returns `[]` without making a network call.
- Queries the Open-Meteo Geocoding API (`https://geocoding-api.open-meteo.com/v1/search?name={encoded}&count=8&language=en&format=json`) and maps results into `LocationEntry[]` with `isCurrentLocation: false`.

#### `computeRadarTileCoordinates(latitude: number, longitude: number, zoom?: number): { zoom: number; tileX: number; tileY: number; markerOffsetX: number; markerOffsetY: number }`

- Pure helper exported for deterministic unit testing of spatial math.

## Change Vectors

- Swapping Open-Meteo or RainViewer for another weather/radar API.
- Adjusting the static radar zoom level or switching the base map tile provider URL/headers.
- Adapting to upstream JSON field changes in Open-Meteo or RainViewer.
