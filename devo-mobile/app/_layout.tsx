import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { useStore } from '../src/store/useStore';
import SplashIntro from '../src/components/SplashIntro';

export default function RootLayout() {
  const colorScheme = useStore((s) => s.colorScheme);
  const hasSeenOnboarding = useStore((s) => s.hasSeenOnboarding);
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s._hydrated);
  const router = useRouter();
  const segments = useSegments();

  const [showSplash, setShowSplash] = useState(true);

  // Load custom fonts
  const [fontsLoaded] = useFonts({
    'EditorsNote-Italic': require('../assets/fonts/EditorsNote-Italic.ttf'),
  });

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasSeenOnboarding && segments[0] !== 'onboarding') {
      setShowSplash(false); // skip splash for onboarding
      router.replace('/onboarding');
    }
  }, [hydrated, hasSeenOnboarding, segments]);

  // Show loading while hydrating or fonts loading
  if (!hydrated || !fontsLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: '#0b1220' }]}>
        <ActivityIndicator size="large" color="#486bec" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colorScheme === 'dark' ? '#0b1220' : '#f5f5fa',
          },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="verse-chat"
          options={{
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="immersive-tts"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
      </Stack>

      {/* Splash intro — shows on every launch after onboarding */}
      {showSplash && hasSeenOnboarding && (
        <SplashIntro onFinish={() => setShowSplash(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
