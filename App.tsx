import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { WeatherDashboardScreen } from './src/ui';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <WeatherDashboardScreen />
    </>
  );
}
