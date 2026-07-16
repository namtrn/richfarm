import { useEffect, useRef, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { BottomTabBar, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Bell, BookOpen, UserRound, Home, Fence, ScanSearch, Plus, Sprout, Grid2X2Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  Easing,
  NativeModules,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { palette, useTheme } from '../../lib/theme';
import { useAppMode } from '../../hooks/useAppMode';
import { useGardens } from '../../hooks/useGardens';
import { usePlantScanner } from '../../hooks/usePlantScanner';

// expo-blur requires a native rebuild — guard against Expo Go where the native
// module hasn't been compiled in yet.
let BlurView: React.ComponentType<{ style?: any; intensity?: number; tint?: string }> | null = null;
const isBlurAvailable = !!NativeModules?.ExpoBlurViewManager || !!NativeModules?.ExpoBlurModule;
if (isBlurAvailable) {
  try {
    BlurView = require('expo-blur').BlurView;
  } catch {
    BlurView = null;
  }
}

// A dev client can have the JS package installed before its native module has
// been rebuilt. The package availability helpers require the native module, so
// guard them with an optional lookup first.
const isGlassEffectModuleLinked = Platform.OS === 'ios'
  && requireOptionalNativeModule('ExpoGlassEffect') !== null;

// Use pixel values so centering is reliable on all devices
const TAB_BAR_WIDTH = 370;
const TAB_BAR_SIDE_GAP = 24;

type AnimatedTabButtonProps = BottomTabBarButtonProps & {
  activePillColor: string;
};

function AnimatedTabButton({ accessibilityState, children, style, activePillColor, ...rest }: AnimatedTabButtonProps) {
  const { onPress, onLongPress, testID, accessibilityLabel } = rest;
  const isSelected = accessibilityState?.selected ?? false;
  const progress = useRef(new Animated.Value(isSelected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isSelected ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isSelected, progress]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      style={[style, styles.tabButtonPressable]}
    >
      <Animated.View
        style={[
          styles.itemPill,
          {
            transform: [
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
            ],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            {
              backgroundColor: activePillColor,
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
            },
          ]}
        />
        <View style={styles.itemContent}>{children}</View>
      </Animated.View>
    </Pressable>
  );
}

function ActionTabButton({ onOpen, color }: { onOpen: () => void; color: string }) {
  return (
    <Pressable
      onPress={onOpen}
      testID="e2e-tab-actions"
      accessibilityRole="button"
      accessibilityLabel="Quick actions"
      style={styles.actionTabButton}
    >
      <View style={[styles.actionTabCircle, { backgroundColor: color }]}>
        <Plus size={25} color="white" strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}

function LiquidGlassBackground({ isDark }: { isDark: boolean }) {
  const tintOverlay = isDark ? 'rgba(10, 8, 7, 0.50)' : 'rgba(255, 255, 255, 0.30)';
  const topEdge = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.90)';
  const shimmer = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.50)';
  const bottomRim = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)';
  const fallbackBg = isDark ? 'rgba(28, 22, 18, 0.94)' : 'rgba(252, 249, 244, 0.90)';

  return (
    // overflow:hidden + borderRadius here so the blur clips to the shape
    <View style={[StyleSheet.absoluteFill, { borderRadius: 28, overflow: 'hidden' }]} pointerEvents="none">
      {BlurView ? (
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={90}
          tint={isDark ? 'dark' : 'light'}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]} />
      )}
      {/* Tint overlay */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tintOverlay }]} />
      {/* Top-edge highlight — glass rim */}
      <View style={[styles.glassTopEdge, { backgroundColor: topEdge }]} />
      {/* Soft shimmer strip */}
      <View style={[styles.glassShimmer, { backgroundColor: shimmer }]} />
      {/* Bottom inner glow */}
      <View style={[styles.glassBottomRim, { backgroundColor: bottomRim }]} />
    </View>
  );
}

function SplitTabBarBackground({
  isDark,
  borderColor,
}: {
  isDark: boolean;
  borderColor: string;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.navigationCluster,
          {
            borderColor,
            shadowColor: isDark ? '#000000' : '#1a4731',
            shadowOpacity: isDark ? 0.75 : 0.30,
          },
        ]}
      >
        <LiquidGlassBackground isDark={isDark} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { appMode } = useAppMode();
  const router = useRouter();
  const { gardens } = useGardens();
  const { openScanner, scannerModals } = usePlantScanner();
  const [actionsOpen, setActionsOpen] = useState(false);
  const isGardener = appMode === 'gardener';
  const isDark = theme.background === palette.dark.background;
  const hasNativeGlass = isGlassEffectModuleLinked
    && isLiquidGlassAvailable()
    && isGlassEffectAPIAvailable();

  const activePillColor = isDark
    ? 'rgba(64, 145, 108, 0.40)'
    : 'rgba(26, 71, 49, 0.12)';

  const borderColor = isDark
    ? 'rgba(255, 255, 255, 0.22)'
    : 'rgba(255, 255, 255, 0.95)';

  // Float 10px above the home indicator (safe area bottom)
  const floatBottom = safeBottom + 10;

  const runAction = (action: 'plant' | 'scan' | 'bed' | 'garden') => {
    setActionsOpen(false);
    if (action === 'scan') {
      requestAnimationFrame(openScanner);
      return;
    }
    if (action === 'plant') {
      router.push(`/(tabs)/library?mode=select&from=${isGardener ? 'gardener' : 'planning'}`);
      return;
    }
    if (action === 'garden') {
      router.push('/(tabs)/garden?create=1');
      return;
    }
    if (gardens.length === 1) {
      router.push({
        pathname: '/(tabs)/garden/[gardenId]',
        params: { gardenId: String(gardens[0]._id), addBed: '1' },
      });
      return;
    }
    router.push('/(tabs)/garden');
  };

  const actionItems = [
    { key: 'plant' as const, label: t('garden.my_plants_add'), Icon: Sprout },
    { key: 'scan' as const, label: t('tabs.scan'), Icon: ScanSearch },
    ...(!isGardener ? [
      { key: 'bed' as const, label: t('garden.add_bed'), Icon: Grid2X2Plus },
      { key: 'garden' as const, label: t('garden.create_button'), Icon: Fence },
    ] : []),
  ];

  return (
    <>
    <Tabs
      tabBar={(props) => (
        <View
          pointerEvents="box-none"
          style={[
            styles.tabBarOuter,
            {
              paddingHorizontal: TAB_BAR_SIDE_GAP,
              paddingBottom: floatBottom,
            },
          ]}
        >
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => (
          <AnimatedTabButton {...props} activePillColor={activePillColor} />
        ),
        tabBarBackground: () => (
          <SplitTabBarBackground isDark={isDark} borderColor={borderColor} />
        ),
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: [
          styles.tabBar,
          {
            position: 'relative',
            bottom: 0,
            width: windowWidth > TAB_BAR_WIDTH ? TAB_BAR_WIDTH : '100%',
            alignSelf: 'center',
            backgroundColor: 'transparent',
          },
        ],
      }}
    >
      {/* Hidden routes */}
      <Tabs.Screen name="garden/[gardenId]" options={{ href: null }} />
      <Tabs.Screen name="bed/[bedId]" options={{ href: null }} />
      <Tabs.Screen name="plant" options={{ href: null }} />
      <Tabs.Screen name="planning" options={{ href: null }} />
      <Tabs.Screen name="growing" options={{ href: null }} />
      <Tabs.Screen name="explorer" options={{ href: null }} />

      {/* Visible tabs — order: Home | Garden | Library | Reminder | Actions */}
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarButtonTestID: 'e2e-tab-home',
          tabBarIcon: ({ color }) => <Home size={22} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="garden/index"
        options={{
          title: isGardener ? t('tabs.my_plants') : t('tabs.garden'),
          tabBarButtonTestID: 'e2e-tab-garden',
          tabBarIcon: ({ color }) => <Fence size={22} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarButtonTestID: 'e2e-tab-library',
          tabBarIcon: ({ color }) => <BookOpen size={22} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="reminder"
        options={{
          title: t('tabs.reminder'),
          tabBarButtonTestID: 'e2e-tab-reminder',
          tabBarIcon: ({ color }) => <Bell size={22} stroke={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarItemStyle: styles.actionTabItem,
          tabBarButton: () => (
            <ActionTabButton onOpen={() => setActionsOpen(true)} color={theme.primaryDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.more'),
          tabBarButtonTestID: 'e2e-tab-more',
          href: null,
          tabBarIcon: ({ color }) => <UserRound size={22} stroke={color} />,
        }}
      />
    </Tabs>
    <Modal
        visible={actionsOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setActionsOpen(false)}
      >
        <View style={styles.actionModal}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.actionBackdrop}
            onPress={() => setActionsOpen(false)}
          />
          {hasNativeGlass ? (
            <GlassView
              glassEffectStyle="clear"
              colorScheme={isDark ? 'dark' : 'light'}
              isInteractive
              style={[
                styles.actionPopup,
                {
                  bottom: floatBottom + 64,
                  backgroundColor: 'transparent',
                  shadowColor: isDark ? '#000000' : theme.text,
                },
              ]}
            >
              {actionItems.map(({ key, label, Icon }) => (
                <Pressable
                  key={key}
                  onPress={() => runAction(key)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.actionRow,
                    { backgroundColor: pressed ? theme.accent : theme.card },
                  ]}
                >
                  <View style={[styles.actionIcon, { backgroundColor: theme.accent }]}>
                    <Icon size={20} color={theme.primary} />
                  </View>
                  <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
                </Pressable>
              ))}
            </GlassView>
          ) : (
            <View
              style={[
                styles.actionPopup,
                {
                  bottom: floatBottom + 64,
                  backgroundColor: theme.card,
                  shadowColor: isDark ? '#000000' : theme.text,
                },
              ]}
            >
            {actionItems.map(({ key, label, Icon }) => (
              <Pressable
                key={key}
                onPress={() => runAction(key)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionRow,
                  { backgroundColor: pressed ? theme.accent : theme.card },
                ]}
              >
                <View style={[styles.actionIcon, { backgroundColor: theme.accent }]}>
                  <Icon size={20} color={theme.primary} />
                </View>
                <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
              </Pressable>
            ))}
            </View>
          )}
        </View>
    </Modal>
    {scannerModals}
    </>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    position: 'relative',
    // left/right/bottom are set dynamically in the component using safe area insets
    height: 56,
    borderWidth: 0,
    borderRadius: 28,
    elevation: 0,
    // NOTE: DO NOT add overflow:hidden here — it clips the borderRadius pill shape
    // Clipping is handled inside LiquidGlassBackground
    paddingBottom: Platform.select({ ios: 4, android: 2, default: 2 }),
    paddingTop: 2,
  },
  navigationCluster: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 62,
    borderWidth: 2,
    borderRadius: 28,
    elevation: 12,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 40,
  },
  tabBarItem: {
    marginHorizontal: 2,
  },
  tabButtonPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: -1,
  },
  itemPill: {
    minWidth: 44,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: 'hidden',
  },
  itemContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTabButton: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTabItem: {
    flex: 0,
    width: 52,
    marginLeft: 10,
    marginRight: 0,
  },
  actionTabCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModal: {
    flex: 1,
  },
  actionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  actionPopup: {
    position: 'absolute',
    right: TAB_BAR_SIDE_GAP,
    width: 210,
    borderRadius: 18,
    padding: 5,
    elevation: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  actionRow: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  glassTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 28,
  },
  glassShimmer: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    height: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  glassBottomRim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 28,
  },
});
