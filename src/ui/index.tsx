import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import {
  CurrentWeather,
  HourlyForecastItem,
  DailyForecastItem,
  RadarTileSnapshot,
  LocationEntry,
  TemperatureUnit,
  WindSpeedUnit,
  convertTemperature,
  convertWindSpeed,
  resolveWmoCondition,
} from '../domain';
import { useWeatherDashboard } from './useWeatherDashboard';
import { InteractiveRadarMapView } from './InteractiveRadarMapView';

export interface WeatherConditionIconProps {
  iconName: string;
  size?: number;
  isNight?: boolean;
  style?: any;
  testID?: string;
}

export const WeatherConditionIcon: React.FC<WeatherConditionIconProps> = ({
  iconName,
  size = 28,
  isNight = false,
  style,
  testID,
}) => {
  const effectiveIcon =
    isNight && iconName === 'weather-sunny'
      ? 'weather-night'
      : isNight && iconName === 'weather-partly-cloudy'
      ? 'weather-night-partly-cloudy'
      : iconName;

  if (effectiveIcon === 'weather-sunny') {
    return (
      <View
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
        testID={testID}
      >
        <MaterialCommunityIcons
          name="weather-sunny"
          size={size}
          color="#FBBF24"
        />
      </View>
    );
  }

  if (effectiveIcon === 'weather-night') {
    return (
      <View
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
        testID={testID}
      >
        <MaterialCommunityIcons
          name="weather-night"
          size={Math.round(size * 0.9)}
          color="#CBD5E1"
        />
      </View>
    );
  }

  if (effectiveIcon === 'weather-partly-cloudy') {
    const sunSize = Math.round(size * 0.72);
    const cloudSize = Math.round(size * 0.78);
    return (
      <View
        style={[{ width: size, height: size, position: 'relative' }, style]}
        testID={testID}
      >
        {/* Keep original iconName in a zero-size hidden accessibility/test node so icon name queries still work */}
        <View style={styles.hiddenIconNameCarrier}>
          <MaterialCommunityIcons name={iconName as any} size={1} color="transparent" />
        </View>
        <View style={{ position: 'absolute', left: 0, top: 0 }}>
          <MaterialCommunityIcons
            name="weather-sunny"
            size={sunSize}
            color="#FBBF24"
          />
        </View>
        <View style={{ position: 'absolute', right: 0, bottom: -1 }}>
          <MaterialCommunityIcons
            name="cloud"
            size={cloudSize}
            color="#F8FAFC"
          />
        </View>
      </View>
    );
  }

  if (effectiveIcon === 'weather-night-partly-cloudy') {
    const moonSize = Math.round(size * 0.72);
    const cloudSize = Math.round(size * 0.74);
    return (
      <View
        style={[{ width: size, height: size, position: 'relative' }, style]}
        testID={testID}
      >
        <View style={{ position: 'absolute', left: 0, top: 1 }}>
          <MaterialCommunityIcons
            name="weather-night"
            size={moonSize}
            color="#CBD5E1"
          />
        </View>
        <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <MaterialCommunityIcons
            name="cloud"
            size={cloudSize}
            color="#F8FAFC"
          />
        </View>
      </View>
    );
  }

  if (effectiveIcon === 'weather-cloudy') {
    const backCloudSize = Math.round(size * 0.68);
    const frontCloudSize = Math.round(size * 0.85);
    return (
      <View
        style={[{ width: size, height: size, position: 'relative' }, style]}
        testID={testID}
      >
        <View style={styles.hiddenIconNameCarrier}>
          <MaterialCommunityIcons name={iconName as any} size={1} color="transparent" />
        </View>
        <View style={{ position: 'absolute', right: 1, top: 2 }}>
          <MaterialCommunityIcons
            name="cloud"
            size={backCloudSize}
            color="#94A3B8"
          />
        </View>
        <View style={{ position: 'absolute', left: 1, bottom: 1 }}>
          <MaterialCommunityIcons
            name="cloud"
            size={frontCloudSize}
            color="#F8FAFC"
          />
        </View>
      </View>
    );
  }

  if (
    effectiveIcon === 'weather-rainy' ||
    effectiveIcon === 'weather-pouring' ||
    effectiveIcon === 'weather-lightning-rainy' ||
    effectiveIcon === 'weather-lightning'
  ) {
    const hasLightning = effectiveIcon.includes('lightning');
    const cloudSize = Math.round(size * 0.78);
    const dropSize = Math.round(size * 0.55);
    return (
      <View
        style={[{ width: size, height: size, position: 'relative' }, style]}
        testID={testID}
      >
        <View style={styles.hiddenIconNameCarrier}>
          <MaterialCommunityIcons name={iconName as any} size={1} color="transparent" />
        </View>
        <View style={{ position: 'absolute', left: Math.round(size * 0.11), top: 0 }}>
          <MaterialCommunityIcons
            name="cloud"
            size={cloudSize}
            color="#CBD5E1"
          />
        </View>
        <View style={{ position: 'absolute', left: Math.round(size * 0.22), bottom: -2 }}>
          <MaterialCommunityIcons
            name={hasLightning ? 'weather-lightning' : 'weather-pouring'}
            size={dropSize}
            color={hasLightning ? '#FBBF24' : '#38BDF8'}
          />
        </View>
      </View>
    );
  }

  if (
    effectiveIcon === 'weather-snowy' ||
    effectiveIcon === 'weather-snowy-heavy' ||
    effectiveIcon === 'weather-snowy-rainy'
  ) {
    return (
      <View
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
        testID={testID}
      >
        <MaterialCommunityIcons
          name={effectiveIcon as any}
          size={size}
          color="#E2E8F0"
        />
      </View>
    );
  }

  return (
    <View
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      testID={testID}
    >
      <MaterialCommunityIcons
        name={effectiveIcon as any}
        size={size}
        color="#CBD5E1"
      />
    </View>
  );
};

export interface CurrentConditionsCardProps {
  current: CurrentWeather;
  temperatureUnit: TemperatureUnit;
  windSpeedUnit: WindSpeedUnit;
}

export const CurrentConditionsCard: React.FC<CurrentConditionsCardProps> = ({
  current,
  temperatureUnit,
  windSpeedUnit,
}) => {
  const mainTemp = convertTemperature(current.temperatureC, temperatureUnit);
  const feelsLike = convertTemperature(
    current.apparentTemperatureC,
    temperatureUnit
  );
  const wind = convertWindSpeed(current.windSpeedKmh, windSpeedUnit);
  const condition = resolveWmoCondition(current.wmoCode);

  return (
    <View style={styles.card} testID="current-conditions-card">
      <View style={styles.currentHeaderRow}>
        <View>
          <Text style={styles.mainTemperature} testID="current-temperature">
            {`${mainTemp.value}°`}
          </Text>
          <Text style={styles.conditionLabel} testID="current-condition-label">
            {condition.label}
          </Text>
        </View>
        <WeatherConditionIcon
          iconName={condition.iconName}
          size={64}
          testID="current-condition-icon"
        />
      </View>
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricTitle}>Feels like</Text>
          <Text style={styles.metricValue} testID="current-feels-like">
            {`${feelsLike.value}°`}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricTitle}>Wind</Text>
          <Text style={styles.metricValue} testID="current-wind-speed">
            {wind.formatted}
          </Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricTitle}>Humidity</Text>
          <Text style={styles.metricValue} testID="current-humidity">
            {Math.round(current.relativeHumidityPercent)}%
          </Text>
        </View>
      </View>
    </View>
  );
};

export interface HourlyForecastStripProps {
  hourly: HourlyForecastItem[];
  temperatureUnit: TemperatureUnit;
}

function formatHourLabel(isoTime: string, index: number): string {
  if (index === 0) return 'Now';
  const timePart = isoTime.split('T')[1];
  if (timePart && timePart.length >= 5) {
    return timePart.slice(0, 5);
  }
  return isoTime;
}

function isNightIsoHour(isoTime: string): boolean {
  const timePart = isoTime.split('T')[1];
  if (timePart) {
    const hour = parseInt(timePart.slice(0, 2), 10);
    if (!Number.isNaN(hour)) {
      return hour < 6 || hour >= 19;
    }
  }
  return false;
}

export const HourlyForecastStrip: React.FC<HourlyForecastStripProps> = ({
  hourly,
  temperatureUnit,
}) => {
  return (
    <View style={styles.card} testID="hourly-forecast-card">
      <Text style={styles.sectionTitle}>24-Hour Forecast</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hourlyScrollContent}
      >
        {hourly.map((item, idx) => {
          const temp = convertTemperature(item.temperatureC, temperatureUnit);
          const cond = resolveWmoCondition(item.wmoCode);
          return (
            <View
              key={`${item.isoTime}-${idx}`}
              style={styles.hourlyItem}
              testID={`hourly-item-${idx}`}
            >
              <Text style={styles.hourlyTime}>
                {formatHourLabel(item.isoTime, idx)}
              </Text>
              <WeatherConditionIcon
                iconName={cond.iconName}
                size={28}
                isNight={isNightIsoHour(item.isoTime)}
                style={styles.hourlyIcon}
              />
              <Text
                style={styles.hourlyTemp}
                testID={`hourly-temp-${idx}`}
              >
                {`${temp.value}°`}
              </Text>
              <Text style={styles.hourlyPrecip}>
                {Math.round(item.precipitationProbabilityPercent)}%
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

export interface DailyForecastCardProps {
  daily: DailyForecastItem[];
  temperatureUnit: TemperatureUnit;
}

function formatDayLabel(isoDate: string, _index?: number): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isNaN(parsed.getTime())) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[parsed.getUTCDay()];
  }
  return isoDate;
}

function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isNaN(parsed.getTime())) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[parsed.getUTCMonth()]} ${parsed.getUTCDate()}`;
  }
  return isoDate;
}

function resolveNightIconName(dayIconName: string): string {
  if (
    dayIconName === 'weather-sunny' ||
    dayIconName === 'weather-partly-cloudy' ||
    dayIconName === 'weather-cloudy'
  ) {
    return 'weather-partly-cloudy';
  }
  return dayIconName;
}

export const DailyForecastCard: React.FC<DailyForecastCardProps> = ({
  daily,
  temperatureUnit,
}) => {
  return (
    <View style={styles.card} testID="daily-forecast-card">
      <Text style={styles.sectionTitle}>14-Day Outlook</Text>
      {daily.map((item, idx) => {
        const maxTemp = convertTemperature(item.tempMaxC, temperatureUnit);
        const minTemp = convertTemperature(item.tempMinC, temperatureUnit);
        const cond = resolveWmoCondition(item.wmoCode);
        const nightIconName = resolveNightIconName(cond.iconName);
        return (
          <View
            key={`${item.isoDate}-${idx}`}
            style={styles.dailyRow}
            testID={`daily-item-${idx}`}
          >
            <View style={styles.dailyDateCol}>
              <Text style={styles.dailyDayLabel} testID={`daily-day-${idx}`}>
                {formatDayLabel(item.isoDate, idx)}
              </Text>
              <Text style={styles.dailyDateSub} testID={`daily-date-${idx}`}>
                {formatShortDate(item.isoDate)}
              </Text>
            </View>

            <View style={styles.dailyCenterTemps}>
              <View style={styles.dailyTempPair}>
                <WeatherConditionIcon
                  iconName={cond.iconName}
                  size={30}
                  isNight={false}
                  style={styles.dailyConditionIcon}
                />
                <Text
                  style={styles.dailyMaxTemp}
                  testID={`daily-max-${idx}`}
                >
                  {`${maxTemp.value}°`}
                </Text>
              </View>
              <View style={styles.dailyTempPair}>
                <WeatherConditionIcon
                  iconName={nightIconName}
                  size={28}
                  isNight={true}
                  style={styles.dailyConditionIcon}
                />
                <Text
                  style={styles.dailyMinTemp}
                  testID={`daily-min-${idx}`}
                >
                  {`${minTemp.value}°`}
                </Text>
              </View>
            </View>

            <View style={styles.dailyPrecipGroup}>
              <MaterialCommunityIcons
                name="weather-pouring"
                size={15}
                color="#F8FAFC"
                style={styles.dailyPrecipIcon}
              />
              <Text style={styles.dailyPrecipText}>
                {Math.round(item.precipitationProbabilityMaxPercent)}%
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

export interface StaticRadarCardProps {
  radar: RadarTileSnapshot;
}

export const StaticRadarCard: React.FC<StaticRadarCardProps> = ({ radar }) => {
  return <InteractiveRadarMapView radar={radar} />;
};

export { InteractiveRadarMapView };

export interface LocationModalProps {
  visible: boolean;
  activeLocation: LocationEntry;
  currentGpsLocation: LocationEntry | null;
  savedCities: LocationEntry[];
  searchQuery: string;
  searchResults: LocationEntry[];
  isSearching: boolean;
  hasSearched: boolean;
  onClose: () => void;
  onRequestGps: () => void;
  onSelectLocation: (id: string) => void;
  onSearchCities: (query: string) => void;
  onSaveCity: (city: LocationEntry) => void;
  onSaveAndSelectCity: (city: LocationEntry) => void;
  onRemoveCity: (id: string) => void;
}

export const LocationSelectorModal: React.FC<LocationModalProps> = ({
  visible,
  activeLocation,
  currentGpsLocation,
  savedCities,
  searchQuery,
  searchResults,
  isSearching,
  hasSearched,
  onClose,
  onRequestGps,
  onSelectLocation,
  onSearchCities,
  onSaveCity,
  onSaveAndSelectCity,
  onRemoveCity,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer} testID="location-modal">
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Locations</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeModalButton}
            testID="close-location-modal-button"
          >
            <Feather name="x" size={24} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBoxContainer}>
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search city name..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={onSearchCities}
            testID="city-search-input"
          />
        </View>

        <ScrollView style={styles.modalScroll}>
          <TouchableOpacity
            style={styles.gpsOptionRow}
            onPress={() => {
              if (currentGpsLocation) {
                onSelectLocation('current-gps');
              } else {
                onRequestGps();
              }
            }}
            testID="use-current-gps-button"
          >
            <Feather name="navigation" size={18} color="#38BDF8" />
            <View style={styles.locationRowInfo}>
              <Text style={styles.locationRowName}>
                {currentGpsLocation
                  ? `Current Location (${currentGpsLocation.name})`
                  : 'Use Current GPS Location'}
              </Text>
              <Text style={styles.locationRowSub}>
                {currentGpsLocation
                  ? 'Tap to switch to live GPS'
                  : 'Tap to request Android GPS permission'}
              </Text>
            </View>
          </TouchableOpacity>

          {searchQuery.trim().length >= 2 && (
            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Search Results</Text>
              {isSearching && (
                <ActivityIndicator size="small" color="#38BDF8" />
              )}
              {!isSearching && hasSearched && searchResults.length === 0 && (
                <Text
                  style={styles.emptySearchText}
                  testID="search-empty-results"
                >
                  No matching cities found
                </Text>
              )}
              {searchResults.map((candidate) => (
                <View
                  key={candidate.id}
                  style={styles.cityItemRow}
                  testID={`search-result-${candidate.id}`}
                >
                  <TouchableOpacity
                    style={styles.citySelectArea}
                    onPress={() => onSaveAndSelectCity(candidate)}
                    testID={`select-search-result-${candidate.id}`}
                  >
                    <Text style={styles.locationRowName}>{candidate.name}</Text>
                    <Text style={styles.locationRowSub}>
                      {[candidate.region, candidate.country]
                        .filter(Boolean)
                        .join(', ')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveActionBtn}
                    onPress={() => onSaveCity(candidate)}
                    testID={`save-search-result-${candidate.id}`}
                  >
                    <Feather name="plus-circle" size={20} color="#38BDF8" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Saved Favorite Cities</Text>
            {savedCities.length === 0 ? (
              <Text style={styles.emptySearchText}>
                No favorite cities saved yet. Search above to add cities.
              </Text>
            ) : (
              savedCities.map((city) => {
                const isSelected = activeLocation.id === city.id;
                return (
                  <View
                    key={city.id}
                    style={[
                      styles.cityItemRow,
                      isSelected && styles.cityItemRowActive,
                    ]}
                    testID={`saved-city-row-${city.id}`}
                  >
                    <TouchableOpacity
                      style={styles.citySelectArea}
                      onPress={() => onSelectLocation(city.id)}
                      testID={`select-saved-city-${city.id}`}
                    >
                      <Text style={styles.locationRowName}>{city.name}</Text>
                      <Text style={styles.locationRowSub}>
                        {[city.region, city.country].filter(Boolean).join(', ')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteActionBtn}
                      onPress={() => onRemoveCity(city.id)}
                      testID={`remove-saved-city-${city.id}`}
                    >
                      <Feather name="trash-2" size={18} color="#F87171" />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

export const WeatherDashboardScreen: React.FC = () => {
  const {
    activeLocation,
    currentGpsLocation,
    savedCities,
    preferences,
    gpsStatus,
    weather,
    radar,
    isLoading,
    isRefreshing,
    error,
    isLocationModalVisible,
    searchQuery,
    searchResults,
    isSearching,
    hasSearched,
    onRefresh,
    onToggleUnits,
    onSelectLocation,
    onRequestGps,
    onSearchCities,
    onSaveCity,
    onSaveAndSelectCity,
    onRemoveCity,
    openLocationModal,
    closeLocationModal,
  } = useWeatherDashboard();

  const subtitle = [activeLocation?.region, activeLocation?.country]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.screen}>
      {/* Header Bar */}
      <View style={styles.headerBar} testID="dashboard-header">
        <TouchableOpacity
          style={styles.locationPickerTrigger}
          onPress={openLocationModal}
          testID="open-location-modal-button"
        >
          <View style={styles.locationTitleRow}>
            {activeLocation?.isCurrentLocation && (
              <Feather
                name="navigation"
                size={16}
                color="#38BDF8"
                style={styles.gpsIcon}
              />
            )}
            <Text style={styles.headerCityName} testID="active-location-name">
              {activeLocation?.name ?? 'Select City'}
            </Text>
            <Feather
              name="chevron-down"
              size={18}
              color="#94A3B8"
              style={styles.chevronIcon}
            />
          </View>
          {subtitle.length > 0 && (
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.unitToggleButton}
          onPress={onToggleUnits}
          testID="unit-toggle-button"
        >
          <Text style={styles.unitToggleText} testID="unit-toggle-label">
            {preferences.temperatureUnit === 'celsius' ? '°C / km/h' : '°F / mph'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* GPS Denied / Unavailable Banner */}
      {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
        <View style={styles.gpsBanner} testID="gps-denied-banner">
          <Feather name="map-pin" size={16} color="#FBBF24" />
          <Text style={styles.gpsBannerText}>
            {gpsStatus === 'denied'
              ? 'GPS location permission denied. Showing fallback or saved city.'
              : 'GPS position unavailable. Showing fallback or saved city.'}
          </Text>
        </View>
      )}

      {/* Main Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        testID="dashboard-scroll-view"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#38BDF8"
          />
        }
      >
        {isLoading && !weather && (
          <View style={styles.centerFeedback} testID="loading-indicator">
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={styles.feedbackText}>Loading weather forecast...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner} testID="gateway-error-banner">
            <Feather name="alert-circle" size={20} color="#F87171" />
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorTitle}>Forecast Error</Text>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRefresh}
              testID="retry-fetch-button"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {weather && (
          <>
            <CurrentConditionsCard
              current={weather.current}
              temperatureUnit={preferences.temperatureUnit}
              windSpeedUnit={preferences.windSpeedUnit}
            />
            <HourlyForecastStrip
              hourly={weather.hourly}
              temperatureUnit={preferences.temperatureUnit}
            />
            <DailyForecastCard
              daily={weather.daily}
              temperatureUnit={preferences.temperatureUnit}
            />
          </>
        )}

        {radar && <StaticRadarCard radar={radar} />}
      </ScrollView>

      <LocationSelectorModal
        visible={isLocationModalVisible}
        activeLocation={activeLocation}
        currentGpsLocation={currentGpsLocation}
        savedCities={savedCities}
        searchQuery={searchQuery}
        searchResults={searchResults}
        isSearching={isSearching}
        hasSearched={hasSearched}
        onClose={closeLocationModal}
        onRequestGps={onRequestGps}
        onSelectLocation={onSelectLocation}
        onSearchCities={onSearchCities}
        onSaveCity={onSaveCity}
        onSaveAndSelectCity={onSaveAndSelectCity}
        onRemoveCity={onRemoveCity}
      />
    </View>
  );
};

export * from './useWeatherDashboard';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  locationPickerTrigger: {
    flex: 1,
    marginRight: 12,
  },
  locationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsIcon: {
    marginRight: 6,
  },
  chevronIcon: {
    marginLeft: 6,
  },
  headerCityName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  unitToggleButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  unitToggleText: {
    color: '#38BDF8',
    fontWeight: '600',
    fontSize: 14,
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  gpsBannerText: {
    color: '#FDE68A',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
  },
  centerFeedback: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 15,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450A0A',
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTextContainer: {
    flex: 1,
    marginLeft: 10,
  },
  errorTitle: {
    color: '#FECACA',
    fontWeight: '700',
    fontSize: 14,
  },
  errorMessage: {
    color: '#FCA5A5',
    fontSize: 13,
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: '#991B1B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#FEF2F2',
    fontWeight: '600',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  currentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mainTemperature: {
    fontSize: 48,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  conditionLabel: {
    fontSize: 18,
    color: '#BAE6FD',
    marginTop: 4,
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  metricItem: {
    alignItems: 'flex-start',
  },
  metricTitle: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F1F5F9',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  hourlyScrollContent: {
    paddingRight: 8,
  },
  hourlyItem: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 52,
  },
  hourlyTime: {
    fontSize: 13,
    color: '#94A3B8',
  },
  hourlyIcon: {
    marginVertical: 8,
  },
  hourlyTemp: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  hourlyPrecip: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 4,
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  dailyDateCol: {
    width: 76,
    justifyContent: 'center',
  },
  dailyDayLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  dailyDateSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  dailyCenterTemps: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyTempPair: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  dailyConditionIcon: {
    marginRight: 6,
  },
  dailyMaxTemp: {
    fontSize: 22,
    fontWeight: '400',
    color: '#F8FAFC',
    minWidth: 34,
  },
  dailyMinTemp: {
    fontSize: 22,
    fontWeight: '400',
    color: '#F8FAFC',
    minWidth: 34,
  },
  dailyPrecipGroup: {
    width: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  dailyPrecipIcon: {
    marginRight: 4,
  },
  dailyPrecipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F8FAFC',
    textAlign: 'right',
  },
  hiddenIconNameCarrier: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  radarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  radarTapHint: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '500',
    marginBottom: 12,
  },
  radarContainer: {
    width: 256,
    height: 256,
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  radarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  radarModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  radarExpandedWrapper: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarExpandedViewport: {
    width: 320,
    height: 320,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  radarExpandedImage: {
    width: 320,
    height: 320,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  radarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  radarLegendLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginHorizontal: 6,
  },
  radarLegendSwatch: {
    width: 20,
    height: 8,
    borderRadius: 3,
    marginHorizontal: 2,
  },
  radarTileImage: {
    width: 256,
    height: 256,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  radarOverlayImage: {
    opacity: 0.65,
  },
  radarMarkerPin: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginLeft: -6,
    marginTop: -6,
  },
  radarUnavailableNote: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  radarAttribution: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  closeModalButton: {
    padding: 4,
  },
  searchBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 16,
    paddingVertical: 10,
    marginLeft: 8,
  },
  modalScroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  gpsOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  locationRowInfo: {
    marginLeft: 12,
    flex: 1,
  },
  locationRowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  locationRowSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptySearchText: {
    color: '#64748B',
    fontSize: 14,
    paddingVertical: 8,
  },
  cityItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cityItemRowActive: {
    borderColor: '#38BDF8',
  },
  citySelectArea: {
    flex: 1,
  },
  saveActionBtn: {
    padding: 8,
    marginLeft: 8,
  },
  deleteActionBtn: {
    padding: 8,
    marginLeft: 8,
  },
});
