import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useMutation } from 'convex/react';
import { api } from '../../../packages/convex/convex/_generated/api';
import { useAppMode } from './useAppMode';
import { useDeviceId } from '../lib/deviceId';

type PositionInBed = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AddPlantArgs = {
  plantMasterId?: any;
  nickname?: string;
  bedId?: any;
  positionInBed?: PositionInBed;
  plantedAt?: number;
  notes?: string;
};

type UpdatePlantArgs = {
  plantMasterId?: any;
  nickname?: string;
  notes?: string;
  bedId?: any;
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
  bedId?: string;
  positionInBed?: PositionInBed;
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
    ...(context.searchQuery ? { q: context.searchQuery } : {}),
    ...(context.tab ? { tab: context.tab } : {}),
  };
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
  const { deviceId } = useDeviceId();
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const savePhoto = useMutation(api.storage.savePhoto);

  const navigateAfterAdd = useCallback(
    (args: Omit<CompleteLibraryAddArgs, 'plantMasterId'>) => {
      if (appMode === 'gardener' || args.from === 'gardener') {
        router.replace('/(tabs)/garden');
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
        if (router.canGoBack()) {
          router.back();
          return;
        }
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
      }
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace('/(tabs)/garden');
    },
    [appMode, router]
  );

  const createUserPlant = useCallback(
    async (args: CreateUserPlantArgs) => {
      return await addPlant({
        plantMasterId: args.plantMasterId as any,
        nickname: args.nickname,
        bedId: args.bedId as any,
        positionInBed: args.positionInBed,
      });
    },
    [addPlant]
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
        const uploadUrl = await generateUploadUrl({ deviceId });
        const response = await fetch(scannedPhotoUri);
        const blob = await response.blob();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'application/octet-stream' },
          body: blob,
        });
        if (!uploadResponse.ok) return;
        const { storageId } = await uploadResponse.json();
        await savePhoto({
          deviceId,
          plantId,
          storageId,
          capturedAt: Date.now(),
          source: 'scanner',
        });
      } catch (error) {
        console.error('Failed to upload scanner photo:', error);
      }
    },
    [deviceId, generateUploadUrl, savePhoto]
  );

  const completeLibraryAdd = useCallback(
    async (args: CompleteLibraryAddArgs) => {
      let addedPlantId: any = null;
      const positionInBed = buildPositionInBed(args);

      if (args.mode === 'attach' && args.attachPlantId) {
        if (!updatePlant) {
          throw new Error('Update plant mutation is required for attach flow');
        }
        await updatePlant(args.attachPlantId as any, {
          plantMasterId: args.plantMasterId as any,
        });
      } else if (args.from === 'bed' && args.bedId) {
        addedPlantId = await addPlant({
          plantMasterId: args.plantMasterId as any,
          bedId: args.bedId as any,
          positionInBed,
        });
      } else if (args.selectionMode === 'growing' && args.selectedBedId) {
        addedPlantId = await addPlant({
          plantMasterId: args.plantMasterId as any,
          bedId: args.selectedBedId as any,
        });
      } else {
        addedPlantId = await addPlant({
          plantMasterId: args.plantMasterId as any,
        });
      }

      if (args.from === 'scanner' && addedPlantId) {
        await uploadScannerPhoto(addedPlantId, args.scannedPhotoUri);
      }

      navigateAfterAdd(args);
      return addedPlantId;
    },
    [addPlant, navigateAfterAdd, updatePlant, uploadScannerPhoto]
  );

  return {
    createUserPlant,
    openLibrarySelect,
    openLibraryMatch,
    completeLibraryAdd,
  };
}
