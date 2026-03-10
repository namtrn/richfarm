import { Text, TouchableOpacity, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { useSyncStatus } from '../../hooks/useSyncStatus';

type SyncStatusBannerProps = {
  plantId?: string;
  onRetry?: () => void;
  showWhenIdle?: boolean;
  compact?: boolean;
  style?: ViewStyle;
};

export function SyncStatusBanner({
  plantId,
  onRetry,
  showWhenIdle = false,
  compact = false,
  style,
}: SyncStatusBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { status, queuedCount, hasPending, isOffline } = useSyncStatus(plantId);

  if (status === 'loading') return null;
  if (!showWhenIdle && !hasPending) return null;
  if (status === 'idle' && !showWhenIdle) return null;

  const config =
    status === 'offline'
      ? {
          icon: CloudOff,
          title: t('sync.offline_title', { count: queuedCount }),
          description: t('sync.offline_desc'),
          backgroundColor: theme.warningBg,
          borderColor: theme.warning,
          textColor: theme.warning,
        }
      : status === 'retry'
        ? {
            icon: RefreshCw,
            title: t('sync.retry_title', { count: queuedCount }),
            description: t('sync.retry_desc'),
            backgroundColor: theme.dangerBg,
            borderColor: theme.danger,
            textColor: theme.danger,
          }
        : {
            icon: CloudUpload,
            title: t('sync.pending_title', { count: queuedCount }),
            description: t('sync.pending_desc'),
            backgroundColor: theme.successBg,
            borderColor: theme.success,
            textColor: theme.success,
          };

  const Icon = config.icon;

  return (
    <View
      style={{
        backgroundColor: config.backgroundColor,
        borderWidth: 1,
        borderColor: config.borderColor,
        borderRadius: compact ? 12 : 16,
        paddingHorizontal: compact ? 12 : 14,
        paddingVertical: compact ? 8 : 12,
        gap: 6,
        ...style,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon size={compact ? 16 : 18} color={config.textColor} />
        <Text
          style={{
            flex: 1,
            fontSize: compact ? 12 : 13,
            fontWeight: '700',
            color: config.textColor,
          }}
        >
          {config.title}
        </Text>
        {!!onRetry && !isOffline && (
          <TouchableOpacity
            onPress={onRetry}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: config.borderColor,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: config.textColor }}>
              {t('sync.retry_action')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {!compact && (
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
          {config.description}
        </Text>
      )}
    </View>
  );
}
