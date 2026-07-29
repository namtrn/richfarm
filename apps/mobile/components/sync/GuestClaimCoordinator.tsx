import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useDeviceId } from '../../lib/deviceId';
import {
  consumeServerCreatedAccountMarker,
  deferGuestClaim,
  isGuestClaimDeferred,
} from '../../lib/sync/accountClaimIntent';
import { claimGuestDataset, completeGuestClaim, loadGuestClaim } from '../../lib/sync/guestClaim';
import { resolveLocalSyncIdentity } from '../../lib/sync/identity';
import { loadOutbox } from '../../lib/sync/queue';
import { loadAuthoritativeProjection } from '../../lib/sync/reconciliation';
import { useSyncExecutor } from '../../lib/sync/useSyncExecutor';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTranslation } from 'react-i18next';
import { useMobileRuntime } from '../../lib/state/mobileRuntimeStore';

export function GuestClaimCoordinator() {
  const { deviceId } = useDeviceId();
  const session = useMobileRuntime((state) => state.session);
  const isPending = useMobileRuntime((state) => state.authStatus === 'loading');
  const { execute } = useSyncExecutor();
  const { t } = useTranslation();
  const { isOnline } = useNetworkStatus();
  const handledRef = useRef<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [claimMessage, setClaimMessage] = useState<'running' | 'complete' | 'attention' | null>(null);

  useEffect(() => {
    const user = session?.user as ({ id?: string; isAnonymous?: boolean } | undefined);
    if (!deviceId || isPending || !user?.id || user.isAnonymous === true) return;
    if (!isOnline) {
      handledRef.current = null;
      return;
    }
    const accountUserId = user.id;
    const handleKey = `${deviceId}:${accountUserId}`;
    if (handledRef.current === handleKey) return;
    handledRef.current = handleKey;
    let active = true;

    const executeClaim = async (guest: Awaited<ReturnType<typeof resolveLocalSyncIdentity>>) => {
      if (guest.kind !== 'guest') return;
      setClaimMessage('running');
      const account = await resolveLocalSyncIdentity(deviceId, accountUserId);
      if (account.kind !== 'account') return;
      const record = await claimGuestDataset(guest, account);
      if (!active) return;
      if (record.status === 'needs_attention') {
        setClaimMessage('attention');
        return;
      }
      const result = await execute();
      if (!active) return;
      const retryLater = () => setTimeout(() => {
        if (!active) return;
        handledRef.current = null;
        setRetryNonce((value) => value + 1);
      }, 2_000);
      if (result.queuedCount > 0 || result.errorCount > 0) {
        retryLater();
        return;
      }
      const projection = await loadAuthoritativeProjection(account.scopeKey);
      if (projection?.complete) {
        const completed = await completeGuestClaim({
          datasetId: guest.guestDatasetId,
          activeAccountUserId: accountUserId,
          generation: projection.generation,
        });
        if (completed.status === 'complete') {
          setClaimMessage('complete');
          setTimeout(() => { if (active) setClaimMessage(null); }, 3_000);
        } else {
          retryLater();
        }
      } else {
        retryLater();
      }
    };

    void (async () => {
      const guest = await resolveLocalSyncIdentity(deviceId, null);
      if (guest.kind !== 'guest') return;
      const existingClaim = await loadGuestClaim(guest.guestDatasetId);
      if (existingClaim?.targetAccountUserId === accountUserId && existingClaim.status !== 'complete') {
        await executeClaim(guest);
        return;
      }
      const source = await loadOutbox(guest.scopeKey);
      if (source.operations.length === 0 && source.quarantine.length === 0) return;
      if (await consumeServerCreatedAccountMarker(accountUserId)) {
        await executeClaim(guest);
        return;
      }
      if (await isGuestClaimDeferred(guest.guestDatasetId, accountUserId)) return;
      if (!active) return;
      Alert.alert(
        t('sync.claim_existing_title'),
        t('sync.claim_existing_desc'),
        [
          {
            text: t('sync.claim_keep_device'),
            style: 'cancel',
            onPress: () => { void deferGuestClaim(guest.guestDatasetId, accountUserId); },
          },
          { text: t('sync.claim_add_account'), onPress: () => { void executeClaim(guest); } },
        ],
        { cancelable: false }
      );
    })().catch(() => {
      handledRef.current = null;
    });

    return () => { active = false; };
  }, [deviceId, execute, isOnline, isPending, retryNonce, session?.user, t]);

  if (!claimMessage) return null;
  return (
    <View style={{ backgroundColor: claimMessage === 'attention' ? '#fef3c7' : '#ecfdf5', paddingHorizontal: 16, paddingVertical: 10 }}>
      <Text style={{ color: claimMessage === 'attention' ? '#92400e' : '#166534', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
        {t(`sync.claim_${claimMessage}`)}
      </Text>
    </View>
  );
}
