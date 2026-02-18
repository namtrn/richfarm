import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useDeviceId } from '../../lib/deviceId';

// Hook để lấy danh sách plants từ library (plantsMaster)
export function usePlantLibrary(group?: string) {
    const { deviceId } = useDeviceId();
    const plants = useQuery(api.plantImages.getPlantsWithImages, {
        group,
    });

    const plantsWithoutImages = useQuery(
        api.plantImages.getPlantsWithoutImages,
        {}
    );

    const updatePlantImageMutation = useMutation(api.plantImages.updatePlantImage);

    const updatePlantImage = async (
        plantId: Id<'plantsMaster'>,
        storageId: Id<'_storage'>
    ) => {
        return await updatePlantImageMutation({ plantId, storageId, deviceId });
    };

    return {
        plants: plants ?? [],
        plantsWithoutImages: plantsWithoutImages ?? [],
        isLoading: plants === undefined,
        updatePlantImage,
    };
}

// Hook để upload ảnh lên Convex Storage
export function usePlantImageUpload() {
    const { deviceId } = useDeviceId();
    const generateUploadUrlMutation = useMutation(api.storage.generateUploadUrl);
    const updatePlantImageMutation = useMutation(api.plantImages.updatePlantImage);

    const uploadImage = async (
        plantId: Id<'plantsMaster'>,
        imageUri: string
    ): Promise<string> => {
        // 1. Lấy upload URL từ Convex
        const uploadUrl = await generateUploadUrlMutation({ deviceId });

        // 2. Fetch ảnh từ local URI
        const response = await fetch(imageUri);
        const blob = await response.blob();

        // 3. Upload lên Convex Storage
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type },
            body: blob,
        });

        if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        const { storageId } = await uploadResponse.json();

        // 4. Cập nhật plantsMaster với URL mới
        const imageUrl = await updatePlantImageMutation({ plantId, storageId, deviceId });

        return imageUrl;
    };

    return { uploadImage };
}
