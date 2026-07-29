import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CloudOff, CloudUpload, RefreshCw, Save, X } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { useSyncStatus } from '../../hooks/useSyncStatus';

type SyncStatusBannerProps = {
  plantId?: string;
  showWhenIdle?: boolean;
  compact?: boolean;
  localOnlyToast?: boolean;
  style?: ViewStyle;
};

export function SyncStatusBanner({
  plantId,
  showWhenIdle = false,
  compact = false,
  localOnlyToast = false,
  style,
}: SyncStatusBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, queuedCount, hasPending, quarantineCount, hasQuarantine, isLocalOnly } = useSyncStatus(plantId);
  const [showLocalToast, setShowLocalToast] = useState(false);

  useEffect(() => {
    if (!localOnlyToast || !isLocalOnly || !hasPending) {
      setShowLocalToast(false);
      return;
    }

    setShowLocalToast(true);
    const timeout = setTimeout(() => setShowLocalToast(false), 4000);
    return () => clearTimeout(timeout);
  }, [hasPending, isLocalOnly, localOnlyToast, queuedCount]);

  if (status === 'loading') return null;
  if (status === 'pending' && !isLocalOnly) return null;
  if (!showWhenIdle && !hasPending && !hasQuarantine) return null;
  if (status === 'idle' && !showWhenIdle) return null;
  if (localOnlyToast && isLocalOnly && hasPending && !showLocalToast) return null;

  const config =
    isLocalOnly && hasPending
      ? {
          icon: Save,
          title: t('sync.local_saved'),
          description: t('sync.local_saved_desc'),
          backgroundColor: theme.successBg,
          borderColor: theme.success,
          textColor: theme.success,
        }
      : status === 'attention'
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
      testID={`e2e-sync-status-${status}`}
      style={{
        ...(localOnlyToast && isLocalOnly ? {
          position: 'absolute',
          top: insets.top + 8,
          left: 12,
          right: 12,
          zIndex: 100,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 10,
        } : {}),
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
        {localOnlyToast && isLocalOnly && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            hitSlop={10}
            onPress={() => setShowLocalToast(false)}
            style={{ padding: 2 }}
          >
            <X size={16} color={config.textColor} />
          </Pressable>
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
