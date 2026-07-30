import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { hideToast, showToast } from '../../lib/toast';
import { useTheme } from '../../lib/theme';
import { AlertTriangle, X } from '../../lib/icons';
import { selectSyncToastKind } from '../../lib/sync/syncToastPolicy';

const SYNC_TOAST_KEY = 'sync-status';

export function SyncToastCoordinator() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { isOffline } = useNetworkStatus();
  const {
    status,
    queuedCount,
    quarantine,
    quarantineCount,
    hasPending,
    hasQuarantine,
    isLocalOnly,
  } = useSyncStatus();
  const [reviewOpen, setReviewOpen] = useState(false);
  const previousSignature = useRef<string | null>(null);
  const previousHadPending = useRef(false);

  useEffect(() => {
    if (status === 'loading') return;
    const signature = [
      status,
      queuedCount,
      quarantineCount,
      isOffline ? 'offline' : 'online',
      isLocalOnly ? 'local' : 'account',
    ].join(':');
    if (previousSignature.current === signature) return;
    previousSignature.current = signature;

    const kind = selectSyncToastKind({
      status,
      isOffline,
      isLocalOnly,
      hasPending,
      hasQuarantine,
      previouslyHadPending: previousHadPending.current,
    });

    if (kind === 'attention') {
      showToast({
        key: SYNC_TOAST_KEY,
        tone: 'error',
        title: t('sync.attention_title', { count: quarantineCount }),
        message: t('sync.attention_desc'),
        persistent: true,
        actionLabel: t('sync.review_action', { defaultValue: 'Review' }),
        onAction: () => setReviewOpen(true),
        testID: 'e2e-toast-sync-attention',
      });
    } else if (kind === 'local') {
      showToast({
        key: SYNC_TOAST_KEY,
        tone: 'success',
        title: t('sync.local_saved'),
        message: t('sync.local_saved_desc'),
        testID: 'e2e-toast-sync-local',
      });
    } else if (kind === 'retry') {
      showToast({
        key: SYNC_TOAST_KEY,
        tone: 'error',
        title: t('sync.retry_title', { count: queuedCount }),
        message: t('sync.retry_desc'),
        duration: 5600,
        testID: 'e2e-toast-sync-retry',
      });
    } else if (kind === 'offline') {
      showToast({
        key: SYNC_TOAST_KEY,
        tone: 'warning',
        title: hasPending
          ? t('sync.offline_title', { count: queuedCount })
          : t('offline.banner'),
        message: hasPending ? t('sync.offline_desc') : undefined,
        duration: 5200,
        testID: 'e2e-toast-offline',
      });
    } else if (kind === 'pending') {
      showToast({
        key: SYNC_TOAST_KEY,
        tone: 'info',
        title: t('sync.pending_title', { count: queuedCount }),
        message: t('sync.pending_desc'),
        testID: 'e2e-toast-sync-pending',
      });
    } else if (kind === 'complete') {
      showToast({
        key: SYNC_TOAST_KEY,
        tone: 'success',
        title: t('sync.synced_title', { defaultValue: 'Changes synced' }),
        duration: 2800,
        testID: 'e2e-toast-sync-complete',
      });
    } else {
      hideToast(SYNC_TOAST_KEY);
    }
    previousHadPending.current = hasPending;
  }, [
    hasPending,
    hasQuarantine,
    isLocalOnly,
    isOffline,
    quarantineCount,
    queuedCount,
    status,
    t,
  ]);

  return (
    <Modal
      visible={reviewOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setReviewOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: theme.background, padding: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: theme.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={21} color={theme.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>
              {t('sync.review_title', { defaultValue: 'Changes to review' })}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 3 }}>
              {t('sync.attention_desc')}
            </Text>
          </View>
          <Pressable
            testID="e2e-sync-review-close"
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            onPress={() => setReviewOpen(false)}
            hitSlop={10}
            style={{ padding: 8 }}
          >
            <X size={21} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
          {quarantine.map((item, index) => {
            return (
              <View
                key={item.id}
                testID="e2e-sync-review-item"
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.card,
                  padding: 14,
                  gap: 5,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
                  {t('sync.review_item_title', {
                    defaultValue: 'Preserved change {{number}}',
                    number: index + 1,
                  })}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {t('sync.review_preserved', { defaultValue: 'This change is preserved safely on this device.' })}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
