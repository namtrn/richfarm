import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAppMode } from './useAppMode';
import { usePlantSync } from './usePlantSync';
import { updateScanEntry } from '../lib/scanHistory';
import type { PlantStatus } from './usePlants';
import { createLocalId } from '../lib/plantLocalData';

type PositionInBed = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AddPlantArgs = {
  plantMasterId?: any;
  nickname?: string;
  gardenId?: any | null;
  bedId?: any | null;
  positionInBed?: PositionInBed;
  plantedAt?: number;
  expectedHarvestDate?: number;
  status?: PlantStatus;
  notes?: string;
  clientRequestId?: string;
};

type UpdatePlantArgs = {
  plantMasterId?: any;
  nickname?: string;
  notes?: string;
  gardenId?: any | null;
  bedId?: any | null;
  positionInBed?: PositionInBed;
  expectedHarvestDate?: number;
};

type FlowContext = {
  from?: string;
  mode?: string;
  attachPlantId?: string;
  bedId?: string;
  x?: string;
  y?: string;
  backFrom?: string;
  backBedId?: string;
  backGardenId?: string;
  scannedPhotoUri?: string;
  scanHistoryId?: string;
  searchQuery?: string;
  tab?: string;
};

type CompleteLibraryAddArgs = FlowContext & {
  plantMasterId: string;
  selectionMode: 'planning' | 'growing';
  selectedBedId?: string;
};

type CreateUserPlantArgs = {
  plantMasterId?: string;
  nickname?: string;
  gardenId?: string;
  bedId?: string;
  positionInBed?: PositionInBed;
  plantedAt?: number;
  expectedHarvestDate?: number;
  status?: 'planning' | 'growing';
  scannedPhotoUri?: string;
};

type UseAddPlantFlowOptions = {
  addPlant: (args: AddPlantArgs) => Promise<any>;
  updatePlant?: (plantId: any, updates: UpdatePlantArgs) => Promise<any>;
};

function buildPositionInBed(args: { bedId?: string; x?: string; y?: string }) {
  const xValue = args.x !== undefined ? Number(args.x) : undefined;
  const yValue = args.y !== undefined ? Number(args.y) : undefined;
  if (!args.bedId) return undefined;
  if (typeof xValue !== 'number' || !Number.isFinite(xValue)) return undefined;
  if (typeof yValue !== 'number' || !Number.isFinite(yValue)) return undefined;
  return { x: xValue, y: yValue, width: 1, height: 1 };
}

function buildLibraryParams(context: FlowContext, detail: boolean) {
  return {
    ...(context.mode ? { mode: context.mode } : {}),
    ...(context.from ? { from: context.from } : {}),
    ...(context.attachPlantId
      ? detail
        ? { fromPlantId: String(context.attachPlantId) }
        : { userPlantId: String(context.attachPlantId) }
      : {}),
    ...(context.bedId ? { bedId: String(context.bedId) } : {}),
    ...(context.x !== undefined ? { x: String(context.x) } : {}),
    ...(context.y !== undefined ? { y: String(context.y) } : {}),
    ...(context.backFrom ? { backFrom: context.backFrom } : {}),
    ...(context.backBedId ? { backBedId: context.backBedId } : {}),
    ...(context.backGardenId ? { backGardenId: context.backGardenId } : {}),
    ...(context.scannedPhotoUri ? { scannedPhotoUri: context.scannedPhotoUri } : {}),
    ...(context.scanHistoryId ? { scanHistoryId: context.scanHistoryId } : {}),
    ...(context.searchQuery ? { q: context.searchQuery } : {}),
    ...(context.tab ? { tab: context.tab } : {}),
  };
}

function resolveFlowRole(appMode: string | undefined, from?: string): 'gardener' | 'farmer' {
  return appMode === 'gardener' || from === 'gardener' ? 'gardener' : 'farmer';
}

export function normalizeCustomPlantNickname(value: string, unknownLabel?: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (unknownLabel && trimmed.toLowerCase() === unknownLabel.trim().toLowerCase()) {
    return undefined;
  }
  return trimmed;
}

export function useAddPlantFlow({ addPlant, updatePlant }: UseAddPlantFlowOptions) {
  const router = useRouter();
  const { appMode } = useAppMode();
  const { queuePhoto } = usePlantSync();
  const pendingAddRequestIds = useRef(new Map<string, string>());

  const navigateAfterAdd = useCallback(
    (args: Omit<CompleteLibraryAddArgs, 'plantMasterId'>) => {
      const flowRole = resolveFlowRole(appMode, args.from);
      if (flowRole === 'gardener') {
        router.replace('/(tabs)/garden?tab=plants');
        return;
      }
      if (args.from === 'planning' || (args.selectionMode === 'planning' && args.mode !== 'attach')) {
        router.replace('/(tabs)/garden?tab=planning');
        return;
      }
      if (args.from === 'bed' && args.bedId) {
        router.replace(`/(tabs)/bed/${args.bedId}`);
        return;
      }
      if (args.selectionMode === 'growing') {
        router.replace('/(tabs)/garden?tab=growing');
        return;
      }
      if (args.from === 'garden') {
        router.replace('/(tabs)/garden');
        return;
      }
      if (args.from === 'plant') {
        if (args.attachPlantId) {
          router.replace({
            pathname: '/(tabs)/plant/[userPlantId]',
            params: {
              userPlantId: String(args.attachPlantId),
              from: args.backFrom,
              bedId: args.backBedId,
              gardenId: args.backGardenId,
            },
          });
          return;
        }
        if (router.canGoBack()) {
          router.back();
          return;
        }
      }
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace('/(tabs)/garden');
    },
    [appMode, router]
  );

  const openLibrarySelect = useCallback(
    (context: FlowContext) => {
      router.push({
        pathname: '/(tabs)/library',
        params: buildLibraryParams(context, false),
      });
    },
    [router]
  );

  const openLibraryMatch = useCallback(
    (masterPlantId: string, context: FlowContext) => {
      router.push({
        pathname: '/(tabs)/library/[masterPlantId]',
        params: {
          masterPlantId: String(masterPlantId),
          ...buildLibraryParams(context, true),
        },
      });
    },
    [router]
  );

  const uploadScannerPhoto = useCallback(
    async (plantId: any, scannedPhotoUri?: string) => {
      if (!scannedPhotoUri || !plantId) return;
      try {
        await queuePhoto(String(plantId), {
          id: createLocalId(),
          uri: scannedPhotoUri,
          date: Date.now(),
          source: 'camera',
        });
      } catch (error) {
        console.error('Failed to upload scanner photo:', error);
      }
    },
    [queuePhoto]
  );

  const createUserPlant = useCallback(
    async (args: CreateUserPlantArgs) => {
      const flowRole = resolveFlowRole(appMode, undefined);
      const requestSignature = JSON.stringify({
        flow: 'create',
        plantMasterId: args.plantMasterId,
        nickname: args.nickname,
        gardenId: args.gardenId,
        bedId: flowRole === 'gardener' ? undefined : args.bedId,
        positionInBed: flowRole === 'gardener' ? undefined : args.positionInBed,
        plantedAt: args.plantedAt,
        expectedHarvestDate: args.expectedHarvestDate,
        status: args.status,
      });
      let clientRequestId = pendingAddRequestIds.current.get(requestSignature);
      if (!clientRequestId) {
        clientRequestId = `create:${createLocalId()}`;
        pendingAddRequestIds.current.set(requestSignature, clientRequestId);
      }
      const addedPlantId = await addPlant({
        plantMasterId: args.plantMasterId as any,
        nickname: args.nickname,
        gardenId: args.gardenId as any,
        bedId: flowRole === 'gardener' ? undefined : (args.bedId as any),
        positionInBed: flowRole === 'gardener' ? undefined : args.positionInBed,
        plantedAt: args.plantedAt,
        expectedHarvestDate: args.expectedHarvestDate,
        status: args.status,
        clientRequestId,
      });
      await uploadScannerPhoto(addedPlantId, args.scannedPhotoUri);
      pendingAddRequestIds.current.delete(requestSignature);
      return addedPlantId;
    },
    [addPlant, appMode, uploadScannerPhoto]
  );

  const completeLibraryAdd = useCallback(
    async (args: CompleteLibraryAddArgs) => {
      let addedPlantId: any = null;
      const flowRole = resolveFlowRole(appMode, args.from);
      const isGardenerFlow = flowRole === 'gardener';
      const normalizedSelectionMode: 'planning' | 'growing' = args.selectionMode;
      const normalizedBedId = isGardenerFlow ? undefined : args.bedId;
      const normalizedSelectedBedId = isGardenerFlow ? undefined : args.selectedBedId;
      const positionInBed = isGardenerFlow ? undefined : buildPositionInBed(args);
      const requestSignature = JSON.stringify({
        plantMasterId: args.plantMasterId,
        selectionMode: normalizedSelectionMode,
        bedId: normalizedSelectedBedId ?? normalizedBedId,
        positionInBed,
        from: args.from,
        scanHistoryId: args.scanHistoryId,
      });
      let clientRequestId = args.scanHistoryId ? `scan:${args.scanHistoryId}` : pendingAddRequestIds.current.get(requestSignature);
      if (!clientRequestId) {
        clientRequestId = `library:${createLocalId()}`;
        pendingAddRequestIds.current.set(requestSignature, clientRequestId);
      }

      if (args.mode === 'attach' && args.attachPlantId) {
        if (!updatePlant) {
          throw new Error('Update plant mutation is required for attach flow');
        }
        await updatePlant(args.attachPlantId as any, {
          plantMasterId: args.plantMasterId as any,
        });
      } else if (!isGardenerFlow && args.from === 'bed' && normalizedBedId) {
        addedPlantId = await addPlant({
          plantMasterId: args.plantMasterId as any,
          bedId: normalizedBedId as any,
          positionInBed,
          clientRequestId,
        });
      } else if (normalizedSelectionMode === 'growing' && normalizedSelectedBedId) {
        addedPlantId = await addPlant({
          plantMasterId: args.plantMasterId as any,
          bedId: normalizedSelectedBedId as any,
          clientRequestId,
        });
      } else {
        addedPlantId = await addPlant({
          plantMasterId: args.plantMasterId as any,
          status: normalizedSelectionMode,
          clientRequestId,
        });
      }

      if (args.from === 'scanner' && addedPlantId) {
        await uploadScannerPhoto(addedPlantId, args.scannedPhotoUri);
      }

      const linkedPlantId = addedPlantId ?? args.attachPlantId;
      if (args.from === 'scanner' && args.scanHistoryId && linkedPlantId) {
        await updateScanEntry(args.scanHistoryId, {
          status: 'saved',
          userPlantId: String(linkedPlantId),
          plantMasterId: String(args.plantMasterId),
        });
      }

      navigateAfterAdd({
        ...args,
        selectionMode: normalizedSelectionMode,
        bedId: normalizedBedId,
      });
      pendingAddRequestIds.current.delete(requestSignature);
      return addedPlantId;
    },
    [addPlant, appMode, navigateAfterAdd, updatePlant, uploadScannerPhoto]
  );

  return {
    createUserPlant,
    openLibrarySelect,
    openLibraryMatch,
    completeLibraryAdd,
  };
}
