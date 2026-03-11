import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SCOPED_KEY_PREFIXES = [
  'rf_current_user_v1_',
  'rf_current_user_v2_',
  'rf_user_settings_v1_',
  'rf_user_settings_v2_',
  'rf_plants_v1_',
  'rf_plants_v2_',
  'rf_beds_v1_',
  'rf_beds_v2_',
  'rf_reminders_v1_',
  'rf_reminders_v2_',
  'rf_reminders_today_v1_',
  'rf_reminders_today_v2_',
  'rf_favorites_v1_',
  'rf_favorites_v2_',
  'rf_show_weather_card_v1_',
  'rf_show_weather_card_v2_',
];

const USER_SCOPED_EXACT_KEYS = ['onboarding_profile_v1'];

export async function clearCachedCurrentUser(deviceId?: string | null) {
  if (!deviceId) return;

  const keys = await AsyncStorage.getAllKeys();
  const keysToRemove = keys.filter(
    (key) =>
      USER_SCOPED_EXACT_KEYS.includes(key) ||
      USER_SCOPED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix) && key.includes(deviceId))
  );

  if (keysToRemove.length === 0) return;
  await AsyncStorage.multiRemove(keysToRemove);
}
