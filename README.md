# proj01 — Android Weather App

A small, fast Android weather application built with React Native and Expo for daily personal use—providing a single-screen overview of current conditions, hourly and 14-day forecasts, and a static precipitation radar preview with zero API key setup.

---

## What It Does

`proj01` gives you the weather information you need on one clean screen without accounts, subscriptions, or multi-tab clutter:

- **Current Location & Saved Favorite Cities:**
  - Automatically checks the weather for your phone's current GPS position.
  - Lets you search for any city by name, save a list of favorite cities on your device, and switch between your current GPS location and saved cities at any time.
  - Works smoothly via city search and saved cities even if Android location permission is turned off.
- **Single-Screen Weather Overview:**
  - **Current Conditions:** Displays the current temperature, "feels like" temperature, sky condition label and icon, wind speed, and relative humidity.
  - **24-Hour Forecast:** Shows hour-by-hour temperatures, weather conditions, and precipitation probability for the next 24 hours.
  - **14-Day Outlook:** Summarizes daily high and low temperatures, expected conditions, and precipitation chance for the two weeks ahead.
  - **Static Precipitation Radar Map:** Shows a static map tile centered on your selected city with a live precipitation radar overlay and location pin.
- **Instant Controls:**
  - **Unit Toggle (`°C` / `°F`):** Switch between Metric (`°C`, `km/h`) and Imperial (`°F`, `mph`) at any time—every card updates immediately and your preference is saved on your phone.
  - **Pull-to-Refresh:** Swipe down on the screen to fetch the latest forecast and radar frame.

---

## Core Concepts

- **`LocationEntry`:** The place you are currently viewing or have saved as a favorite (name, region/country, coordinates, and whether it represents your live GPS position).
- **`WeatherSnapshot`:** The complete forecast for the active location—combining current conditions, the next 24 hourly entries, and the 14-day daily outlook.
- **`RadarTileSnapshot`:** The static map tile and current precipitation radar overlay centered on the active location's coordinates.
- **`UserPreferences`:** Your saved settings on the device, including your chosen temperature and wind speed units (`celsius`/`kmh` or `fahrenheit`/`mph`) and your last selected city.

---

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — How the application is decomposed into modules, how data flows between them, and the key design decisions.
- [`AGENTS.md`](./AGENTS.md) — Instructions for running, building, testing, and working inside this repository.
