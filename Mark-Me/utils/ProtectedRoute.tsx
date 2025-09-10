// MyMobileApp/utils/ProtectedRoute.tsx
import React, { ReactNode, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

type Props = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const { isAuthReady, isLoggedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isLoggedIn) {
      // Replace navigation so user can't go back to a protected screen
      // Root ('/') will render your _layout.tsx which shows the Login UI when not logged in.
      try {
        router.replace('/');
      } catch (err) {
        // fallback: do nothing if router fails
        console.warn('ProtectedRoute: redirect failed', err);
      }
    }
  }, [isAuthReady, isLoggedIn, router]);

  // While auth is being initialized, show a small consistent loader
  if (!isAuthReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Checking session…</Text>
      </View>
    );
  }

  // If auth is ready but user is not logged in, we've already called replace('/') above;
  // return null so nothing sensitive renders while redirect happens.
  if (!isLoggedIn) {
    return null;
  }

  // Auth ready and logged in → render children (protected content)
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: 'rgb(79, 70, 229)', // keeps consistent primary color with your app
    fontWeight: '500',
  },
});
