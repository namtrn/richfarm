import { useCallback, useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { isPremiumActive } from '../lib/access';
import { useAuthPrompt } from './useAuthPrompt';
import { api } from '../../../packages/convex/convex/_generated/api';

function getConvexErrorCode(error: unknown): string | undefined {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

/**
 * AI scan gate shared by every scanner entry point.
 * The server (`aiScanQuota.reserveScan`) is the source of truth; this only
 * mirrors it so the UI can explain why a scan cannot start.
 */
export function useAiScanQuota() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const promptSignIn = useAuthPrompt();
  const quota = useQuery(api.aiScanQuota.getScanQuota, isAuthenticated ? {} : 'skip');
  const [limitReached, setLimitReached] = useState(false);

  /** Returns true when a scan may start; otherwise shows the reason. */
  const canStartScan = useCallback(() => {
    if (isAuthLoading) return false;
    if (!isAuthenticated) {
      promptSignIn(t('planning.scanner_signin_required'));
      return false;
    }
    if (quota && quota.remaining <= 0) {
      setLimitReached(true);
      return false;
    }
    setLimitReached(false);
    return true;
  }, [isAuthLoading, isAuthenticated, promptSignIn, quota, t]);

  /** Handles quota/auth errors from `detectPlant`; returns which one it was, or null. */
  const handleScanError = useCallback((error: unknown): 'limit' | 'auth' | null => {
    const code = getConvexErrorCode(error);
    if (code === 'AI_SCAN_LIMIT_REACHED') {
      setLimitReached(true);
      return 'limit';
    }
    if (code === 'AUTH_REQUIRED') {
      promptSignIn(t('planning.scanner_signin_required'));
      return 'auth';
    }
    return null;
  }, [promptSignIn, t]);

  const resetLimit = useCallback(() => setLimitReached(false), []);

  return {
    quota,
    isPremium: isPremiumActive(user),
    limitReached,
    canStartScan,
    handleScanError,
    resetLimit,
  };
}
