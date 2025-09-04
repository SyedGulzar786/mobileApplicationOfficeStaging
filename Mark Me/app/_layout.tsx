import { ThemeProvider, DefaultTheme, Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import React, { useState } from 'react';

import { AuthProvider } from '../context/AuthContext'; // ✅ Import AuthProvider
import Splash from './splash'; // ✅ Import Splash component
// ✅ Extend DefaultTheme instead of redefining everything
const LightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F5F7FA',   // 👈 consistent background
    card: '#FFFFFF',
    text: '#000000',
    border: '#E5E5E5',
  },
};

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // ✅ State to control splash visibility
  const [showSplash, setShowSplash] = useState(true);

  if (!loaded) {
    return null;
  }

  // ✅ If splash is active, render splash
  if (showSplash) {
    return <Splash onFinish={() => setShowSplash(false)} />;
  }

  // ✅ Once splash finishes, render your actual app
  return (
    <AuthProvider>
      <ThemeProvider value={LightTheme}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: LightTheme.colors.background }, // 👈 force background
          }}
        >
          <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="dark" backgroundColor={LightTheme.colors.background} />
      </ThemeProvider>
    </AuthProvider>
  );
}
