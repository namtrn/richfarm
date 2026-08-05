import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookHarness = vi.hoisted(() => {
  type Effect = { index: number; run: () => unknown };
  let slots: any[] = [];
  let cursor = 0;
  let effects: Effect[] = [];
  let component: (() => unknown) | null = null;
  let processing = false;
  let renderQueued = false;
  let responseListener: ((response: unknown) => void) | null = null;
  let resolveLastResponse: ((response: unknown) => void) | null = null;
  let lastResponsePromise: Promise<unknown>;
  let scope: string | null = null;
  let projectionComplete = false;
  let reminders: any[] = [];
  let plants: any[] = [];

  const routerCalls: unknown[] = [];
  const router = { push: (route: unknown) => routerCalls.push(route) };
  const auth = { user: { id: 'account-a' }, deviceId: undefined };
  const registerMutation = async () => undefined;

  function resetLastResponse() {
    lastResponsePromise = new Promise((resolve) => {
      resolveLastResponse = resolve;
    });
  }

  function dependenciesChanged(previous: unknown[] | undefined, next: unknown[] | undefined) {
    if (!previous || !next || previous.length !== next.length) return true;
    return next.some((value, index) => !Object.is(value, previous[index]));
  }

  function scheduleRender() {
    renderQueued = true;
    if (!processing) flush();
  }

  function useState(initial: unknown) {
    const index = cursor++;
    if (!slots[index]) {
      const slot: any = {
        kind: 'state',
        value: typeof initial === 'function' ? (initial as () => unknown)() : initial,
      };
      slot.set = (next: unknown) => {
        const resolved = typeof next === 'function' ? (next as (value: unknown) => unknown)(slot.value) : next;
        if (Object.is(slot.value, resolved)) return;
        slot.value = resolved;
        scheduleRender();
      };
      slots[index] = slot;
    }
    return [slots[index].value, slots[index].set];
  }

  function useRef(initial: unknown) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { kind: 'ref', current: initial };
    return slots[index];
  }

  function useEffect(run: () => unknown, dependencies?: unknown[]) {
    const index = cursor++;
    const previous = slots[index];
    const changed = !previous || dependenciesChanged(previous.dependencies, dependencies);
    if (!previous) slots[index] = { kind: 'effect', dependencies, cleanup: undefined };
    else if (changed) previous.dependencies = dependencies;
    if (changed) effects.push({ index, run });
  }

  function flush() {
    if (processing) return;
    renderQueued = true;
    while (renderQueued) {
      renderQueued = false;
      processing = true;
      cursor = 0;
      effects = [];
      component?.();
      for (const effect of effects) {
        const slot = slots[effect.index];
        slot.cleanup?.();
        const cleanup = effect.run();
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
      processing = false;
    }
  }

  function reset() {
    slots = [];
    cursor = 0;
    effects = [];
    component = null;
    processing = false;
    renderQueued = false;
    responseListener = null;
    scope = null;
    projectionComplete = false;
    reminders = [];
    plants = [];
    routerCalls.length = 0;
    resetLastResponse();
  }

  reset();

  return {
    auth,
    router,
    registerMutation,
    routerCalls,
    useState,
    useRef,
    useEffect,
    reset,
    mount(nextComponent: () => unknown) {
      component = nextComponent;
      flush();
    },
    render: flush,
    emit(response: unknown) {
      responseListener?.(response);
    },
    subscribe(listener: (response: unknown) => void) {
      responseListener = listener;
      return { remove: () => { responseListener = null; } };
    },
    resolveLastResponse(response: unknown) {
      resolveLastResponse?.(response);
      resolveLastResponse = null;
    },
    getLastNotificationResponse() {
      return lastResponsePromise;
    },
    setScope(nextScope: string | null) {
      scope = nextScope;
    },
    getScope() {
      return scope;
    },
    setProjection(next: { complete: boolean; reminders: any[]; plants?: any[] }) {
      projectionComplete = next.complete;
      reminders = next.reminders;
      plants = next.plants ?? [];
    },
    getProjection() {
      return { projectionComplete, reminders, plants };
    },
  };
});

vi.mock('react', () => ({
  useEffect: hookHarness.useEffect,
  useRef: hookHarness.useRef,
  useState: hookHarness.useState,
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  Platform: { OS: 'ios' },
}));
vi.mock('@react-native-community/netinfo', () => ({
  default: { addEventListener: () => () => undefined },
}));
vi.mock('convex/react', () => ({
  useMutation: () => hookHarness.registerMutation,
}));
vi.mock('expo-router', () => ({
  useRouter: () => hookHarness.router,
}));
vi.mock('../lib/auth', () => ({
  useAuth: () => hookHarness.auth,
}));
vi.mock('../lib/notifications', () => ({
  getLastNotificationResponse: () => hookHarness.getLastNotificationResponse(),
  getPushPermissionStatus: async () => 'unsupported',
  registerForPushNotificationsAsync: async () => null,
  subscribeNotificationRegistrationRetry: () => () => undefined,
  subscribeNotificationResponses: (listener: (response: unknown) => void) => hookHarness.subscribe(listener),
  subscribePushTokenChanges: () => ({ remove: () => undefined }),
}));
vi.mock('../lib/state/syncScopeStore', () => ({
  useSyncScope: (selector: (state: { scope: string | null }) => unknown) => selector({ scope: hookHarness.getScope() }),
}));
vi.mock('./useSyncProjection', () => ({
  useSyncProjectionEntities: (type: string) => hookHarness.getProjection()[type === 'reminder' ? 'reminders' : 'plants'],
  useSyncProjectionMeta: () => ({ isComplete: hookHarness.getProjection().projectionComplete }),
}));

import { useNotifications } from './useNotifications';

const reminders = [{
  _id: 'reminder-a', entityUuid: 'entity-a', userId: 'account-a',
  userPlantId: 'plant-a', nextRunAt: 100, enabled: true,
}];
const plants = [{ _id: 'plant-a', userId: 'account-a', status: 'growing' }];
const response = {
  notification: {
    request: {
      identifier: 'response-a',
      content: {
        data: {
          version: 'care-plan-v2', userId: 'account-a',
          reminderId: 'entity-a', occurrenceKey: 'entity-a:100',
        },
      },
    },
  },
};

function settle() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe('useNotifications response routing integration', () => {
  beforeEach(() => hookHarness.reset());

  it('routes a warm response that arrives after the projection is already complete and deduplicates it', () => {
    hookHarness.setScope('account-a');
    hookHarness.setProjection({ complete: true, reminders, plants });
    hookHarness.mount(() => useNotifications());

    hookHarness.emit(response);
    expect(hookHarness.routerCalls).toHaveLength(1);
    expect(hookHarness.routerCalls[0]).toEqual({
      pathname: '/(tabs)/reminder',
      params: { reminderId: 'reminder-a', userPlantId: 'plant-a' },
    });

    hookHarness.emit(response);
    expect(hookHarness.routerCalls).toHaveLength(1);
  });

  it('retains a cold response delivered before authoritative hydration and routes after null-to-account projection completion', async () => {
    hookHarness.setProjection({ complete: false, reminders: [] });
    hookHarness.mount(() => useNotifications());

    hookHarness.resolveLastResponse(response);
    await settle();
    expect(hookHarness.routerCalls).toHaveLength(0);

    hookHarness.setScope('account-a');
    hookHarness.render();
    expect(hookHarness.routerCalls).toHaveLength(0);

    hookHarness.setProjection({ complete: true, reminders, plants });
    hookHarness.render();
    expect(hookHarness.routerCalls).toHaveLength(1);
  });
});
