import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  SourceSerif4_400Regular,
  SourceSerif4_500Medium,
  SourceSerif4_600SemiBold,
} from '@expo-google-fonts/source-serif-4';
import { runMigrations } from '@/db/schema';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';
import {
  setupNotificationChannel,
  scheduleAllNotifications,
  getNotificationEnabled,
} from '@/services/notificationService';
import { getEventsByDate } from '@/db/events';
import { ModalVisibilityProvider } from '@/hooks/useModalVisibility';
import { TimeFormatProvider } from '@/hooks/useTimeFormatContext';

SplashScreen.preventAutoHideAsync();

// Inner layout needs access to theme context
function AppShell() {
  const { colors, isDark } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    'Inter-Regular':         Inter_400Regular,
    'Inter-Medium':          Inter_500Medium,
    'Inter-SemiBold':        Inter_600SemiBold,
    'SourceSerif4-Regular':  SourceSerif4_400Regular,
    'SourceSerif4-Medium':   SourceSerif4_500Medium,
    'SourceSerif4-SemiBold': SourceSerif4_600SemiBold,
  });

  useEffect(() => {
    // Initialize SQLite schema and notification channel on first launch
    try {
      runMigrations();
    } catch (e) {
      console.error('DB migration failed:', e);
    }
    setupNotificationChannel().catch(() => {});

    // Schedule all notifications for today if the user has enabled them
    if (getNotificationEnabled()) {
      const today = new Date().toISOString().slice(0, 10);
      const todayEvents = getEventsByDate(today);
      scheduleAllNotifications(todayEvents).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <ModalVisibilityProvider>
      <TimeFormatProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </TimeFormatProvider>
    </ModalVisibilityProvider>
  );
}
