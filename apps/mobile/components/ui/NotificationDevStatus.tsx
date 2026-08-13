import { Text, View, StyleSheet } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../../packages/convex/convex/_generated/api';
import type { NotificationRegistrationState } from '../../lib/notifications';
import { buildNotificationDevStatusLines } from '../../lib/notificationStatus';

export function NotificationDevStatus({
  registration,
}: {
  registration: NotificationRegistrationState;
}) {
  const isVisible = __DEV__ && process.env.EXPO_PUBLIC_SHOW_NOTIFICATION_DEV_STATUS === 'true';
  const tokenRows = useQuery(
    api.notifications.getDeviceTokenStatus,
    isVisible ? {} : 'skip',
  );

  if (!isVisible) return null;

  const lines = buildNotificationDevStatusLines(registration, tokenRows ?? []);

  return (
    <View pointerEvents="none" style={styles.container} testID="notification-dev-status">
      <Text style={styles.title}>Push development status</Text>
      {lines.map((line) => (
        <Text key={line} style={line.startsWith('error=') ? styles.error : styles.line}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(20, 28, 36, 0.92)',
    zIndex: 100,
  },
  title: { color: '#fff', fontSize: 11, fontWeight: '700' },
  line: { color: '#d5e2ed', fontSize: 10, marginTop: 2 },
  error: { color: '#ffb4ab', fontSize: 10, marginTop: 2 },
});
