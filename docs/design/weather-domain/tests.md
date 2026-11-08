# weather-domain — Test Specification

Test specification for the `weather-domain` module (`src/domain/`) in `proj01`, executed with Jest and `jest-expo`.

## Unit Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `convertTemperature rounds and formats positive Celsius values` | Call `convertTemperature(21.4, 'celsius')` and `convertTemperature(21.6, 'celsius')`. | Returns `{ value: 21, formatted: '21°C' }` for `21.4` and `{ value: 22, formatted: '22°C' }` for `21.6`. |
| `convertTemperature rounds and formats negative Celsius values` | Call `convertTemperature(-4.6, 'celsius')`. | Returns `{ value: -5, formatted: '-5°C' }`. |
| `convertTemperature converts, rounds, and formats Celsius to Fahrenheit` | Call `convertTemperature(0, 'fahrenheit')` and `convertTemperature(20, 'fahrenheit')`. | Returns `{ value: 32, formatted: '32°F' }` for `0` and `{ value: 68, formatted: '68°F' }` for `20`. |
| `convertWindSpeed rounds and formats km/h values` | Call `convertWindSpeed(15.2, 'kmh')` and `convertWindSpeed(15.7, 'kmh')`. | Returns `{ value: 15, formatted: '15 km/h' }` for `15.2` and `{ value: 16, formatted: '16 km/h' }` for `15.7`. |
| `convertWindSpeed converts km/h to mph using 0.621371 factor, rounds, and formats` | Call `convertWindSpeed(10, 'mph')` (`10 * 0.621371 = 6.21371`) and `convertWindSpeed(100, 'mph')` (`100 * 0.621371 = 62.1371`). | Returns `{ value: 6, formatted: '6 mph' }` for `10` and `{ value: 62, formatted: '62 mph' }` for `100`. |
| `resolveWmoCondition returns WmoConditionInfo for known WMO codes in 0..99` | Call `resolveWmoCondition` with known WMO codes within `0..99` (e.g., `0`). | Returns a `WmoConditionInfo` object `{ wmoCode, label, iconName }` where `wmoCode` equals the input code and `label` and `iconName` are non-empty strings. |

## Integration Contract Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `domain module exports all settled types and pure functions` | Import `LocationEntry`, `WeatherSnapshot`, `CurrentWeather`, `HourlyForecastItem`, `DailyForecastItem`, `RadarTileSnapshot`, `UserPreferences`, `TemperatureUnit`, `WindSpeedUnit`, `WmoConditionInfo`, `convertTemperature`, `convertWindSpeed`, and `resolveWmoCondition` from `src/domain/`. | Functions `convertTemperature`, `convertWindSpeed`, and `resolveWmoCondition` are defined functions (`typeof fn === 'function'`), and TypeScript compilation succeeds for all exported domain types. |
| `UserPreferences unit fields are directly compatible with conversion functions` | Pass `preferences.temperatureUnit` (`TemperatureUnit`: `'celsius' \| 'fahrenheit'`) to `convertTemperature` and `preferences.windSpeedUnit` (`WindSpeedUnit`: `'kmh' \| 'mph'`) to `convertWindSpeed`. | Both functions accept the `UserPreferences` unit properties without type transformation and return `{ value: number, formatted: string }`. |
| `WeatherSnapshot weather codes and measurements integrate with domain functions` | Pass temperatures, wind speeds, and WMO codes from `CurrentWeather`, `HourlyForecastItem`, and `DailyForecastItem` into `convertTemperature`, `convertWindSpeed`, and `resolveWmoCondition`. | `convertTemperature` and `convertWindSpeed` return `{ value: number, formatted: string }`, and `resolveWmoCondition` returns `{ wmoCode: number, label: string, iconName: string }` matching `WmoConditionInfo`. |

## Boundary Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `convertTemperature normalizes -0 to 0 in Celsius` | Call `convertTemperature(-0, 'celsius')` and `convertTemperature(-0.2, 'celsius')`. | Returns `{ value: 0, formatted: '0°C' }`, and `Object.is(result.value, 0)` is `true` (not `-0`). |
| `convertTemperature normalizes -0 to 0 in Fahrenheit` | Call `convertTemperature(-17.77, 'fahrenheit')` (which converts to `-0.004...` before rounding). | Returns `{ value: 0, formatted: '0°F' }`, and `Object.is(result.value, 0)` is `true` (not `-0`). |
| `convertWindSpeed handles zero wind speed in kmh and mph` | Call `convertWindSpeed(0, 'kmh')` and `convertWindSpeed(0, 'mph')`. | Returns `{ value: 0, formatted: '0 km/h' }` and `{ value: 0, formatted: '0 mph' }`. |
| `resolveWmoCondition handles lower and upper bounds of valid WMO range (0 and 99)` | Call `resolveWmoCondition(0)` and `resolveWmoCondition(99)`. | Both return a valid `WmoConditionInfo` object (`{ wmoCode: 0, label, iconName }` and `{ wmoCode: 99, label, iconName }`) without throwing. |
| `resolveWmoCondition returns safe fallback for out-of-range and unknown WMO codes` | Call `resolveWmoCondition(-1)`, `resolveWmoCondition(100)`, `resolveWmoCondition(999)`, and `resolveWmoCondition(NaN)`. | Returns a safe fallback `WmoConditionInfo` object with non-empty `label` and `iconName` strings without throwing. |

## Behavior Tests

| Test Name | Scenario | Expected Behavior |
| --- | --- | --- |
| `convertTemperature is pure and deterministic across repeated invocations` | Call `convertTemperature(18.6, 'fahrenheit')` multiple times with the same inputs. | Every call returns a deeply equal result with an integer `value` and `formatted` equal to `"\${value}°F"`, with no observable side effects. |
| `convertWindSpeed is pure and deterministic across unit switches` | Call `convertWindSpeed(25, 'kmh')` followed by `convertWindSpeed(25, 'mph')` and `convertWindSpeed(25, 'kmh')` again. | Returns `{ value: 25, formatted: '25 km/h' }`, then `{ value: 16, formatted: '16 mph' }`, then `{ value: 25, formatted: '25 km/h' }` consistently. |
| `resolveWmoCondition always provides render-safe condition metadata for any numeric input` | Iterate across `0..99` and representative unmapped numbers (e.g., `-50`, `42`, `150`) and call `resolveWmoCondition(code)`. | Every returned `WmoConditionInfo` has a numeric `wmoCode`, a non-empty `label`, and a non-empty `iconName`, ensuring consumers never receive `undefined` or `null` fields. |
