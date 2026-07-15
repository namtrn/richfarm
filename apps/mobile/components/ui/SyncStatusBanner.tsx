import { Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { AlertTriangle, CloudOff, CloudUpload, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { useSyncStatus } from '../../hooks/useSyncStatus';

type SyncStatusBannerProps = {
  plantId?: string;
  showWhenIdle?: boolean;
  compact?: boolean;
  style?: ViewStyle;
};

export function SyncStatusBanner({
  plantId,
  showWhenIdle = false,
  compact = false,
  style,
}: SyncStatusBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { status, queuedCount, hasPending, quarantineCount, hasQuarantine } = useSyncStatus(plantId);

  if (status === 'loading') return null;
  if (status === 'pending') return null;
  if (!showWhenIdle && !hasPending && !hasQuarantine) return null;
  if (status === 'idle' && !showWhenIdle) return null;

  const config =
    status === 'attention'
      ? {
          icon: AlertTriangle,
          title: t('sync.attention_title', { count: quarantineCount }),
          description: t('sync.attention_desc'),
          backgroundColor: theme.dangerBg,
          borderColor: theme.danger,
          textColor: theme.danger,
        }
      : status === 'offline'
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
        borderRadius: 12,
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
            fontWeight: '500',
            color: config.textColor,
          }}
        >
          {config.title}
        </Text>
      </View>
      {!compact && (
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
          {config.description}
        </Text>
      )}
    </View>
  );
}
