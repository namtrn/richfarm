import { useConvex } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../packages/convex/convex/_generated/api';
import type { PestDiseaseDetailProjection } from '../../../packages/convex/convex/lib/pestDiseaseProjection';

export type PestDiseaseDetailStatus = 'invalid' | 'loading' | 'ready' | 'empty' | 'error';

export type PestDiseaseDetailState = {
  status: PestDiseaseDetailStatus;
  detail: PestDiseaseDetailProjection | null;
  error: unknown;
};

export function classifyPestDiseaseDetail(
  key: string | null,
  detail: PestDiseaseDetailProjection | null | undefined,
  error?: unknown,
): PestDiseaseDetailStatus {
  if (!key) return 'invalid';
  if (error) return 'error';
  if (detail === undefined) return 'loading';
  return detail === null ? 'empty' : 'ready';
}

export function usePestDiseaseDetail(key: string | null, locale: string) {
  const convex = useConvex();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<PestDiseaseDetailState>({
    status: key ? 'loading' : 'invalid',
    detail: null,
    error: null,
  });

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    if (!key) {
      setState({ status: 'invalid', detail: null, error: null });
      return;
    }

    let active = true;
    setState({ status: 'loading', detail: null, error: null });
    void convex
      .query(api.pestsDiseases.getDetail, { key, locale })
      .then((detail) => {
        if (!active) return;
        setState({
          status: classifyPestDiseaseDetail(key, detail),
          detail,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ status: 'error', detail: null, error });
      });

    return () => {
      active = false;
    };
  }, [convex, key, locale, reloadToken]);

  return { ...state, retry };
}
