import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing } from '@/theme/tokens';
import { useThemeColors } from '@/theme/ThemeContext';
import { useModalVisibility } from '@/hooks/useModalVisibility';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { name: 'index',    icon: 'calendar-today',   iconActive: 'calendar-today'  },
  { name: 'hub',      icon: 'view-grid-outline', iconActive: 'view-grid'       },
  { name: 'ai',       icon: 'robot-outline',     iconActive: 'robot'           },
  { name: 'settings', icon: 'cog-outline',       iconActive: 'cog'             },
] as const;

const SPRING_CFG = { damping: 18, stiffness: 380 };

// ── Animated tab item ─────────────────────────────────────────────────────────
function TabItem({
  tab,
  isFocused,
  onPress,
}: {
  tab: typeof TABS[number];
  isFocused: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  // Scale: active = 1.25, idle = 1, press-in dips to 0.85
  const scale = useSharedValue(isFocused ? 1.25 : 1);

  // Sync scale when focus changes (JS thread → Reanimated via withSpring)
  useEffect(() => {
    scale.value = withSpring(isFocused ? 1.25 : 1, SPRING_CFG);
  }, [isFocused, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.85, SPRING_CFG);
      }}
      onPressOut={() => {
        scale.value = withSpring(isFocused ? 1.25 : 1, SPRING_CFG);
      }}
      onPress={onPress}
      style={[
        styles.tab,
        isFocused && {
          backgroundColor: `${colors.primary}1A`,
        },
      ]}
    >
      <Animated.View style={[styles.tabInner, animStyle]}>
        <MaterialCommunityIcons
          name={(isFocused ? tab.iconActive : tab.icon) as any}
          size={isFocused ? 28 : 22}
          color={isFocused ? colors.primary : colors.onSurfaceVariant}
        />
      </Animated.View>
    </Pressable>
  );
}

// ── Custom floating pill tab bar ──────────────────────────────────────────────
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { modalCount } = useModalVisibility();

  // Animate bar out when any modal is open
  const barOpacity = useSharedValue(1);
  const barTranslateY = useSharedValue(0);

  useEffect(() => {
    if (modalCount > 0) {
      barOpacity.value = withTiming(0, { duration: 180 });
      barTranslateY.value = withTiming(20, { duration: 180 });
    } else {
      barOpacity.value = withTiming(1, { duration: 220 });
      barTranslateY.value = withTiming(0, { duration: 220 });
    }
  }, [modalCount, barOpacity, barTranslateY]);

  const barAnimStyle = useAnimatedStyle(() => ({
    opacity: barOpacity.value,
    transform: [{ translateY: barTranslateY.value }],
    // Disable touches when hidden so modal interactions pass through
    pointerEvents: barOpacity.value < 0.1 ? 'none' : 'auto',
  }));

  return (
    <Animated.View
      style={[
        styles.barWrapper,
        { paddingBottom: Math.max(insets.bottom, 8) },
        barAnimStyle,
      ]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: `${colors.surfaceContainerLowest}F4`,
            borderColor: colors.outlineVariant,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const tab = TABS[index];
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              tab={tab}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

// ── Tab layout ────────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Schedule' }} />
      <Tabs.Screen name="hub"      options={{ title: 'Hub' }} />
      <Tabs.Screen name="ai"       options={{ title: 'AI' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  barWrapper: {
    position: 'absolute',
    bottom: 16,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 4,
    ...Platform.select({
      android: { elevation: 10 },
    }),
  },
  tab: {
    flex: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
});
