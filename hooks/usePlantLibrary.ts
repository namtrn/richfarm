import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

// Hook để lấy danh sách plants từ library (plantsMaster)
export function usePlantLibrary(group?: string, locale?: string) {
    const plants = useQuery(api.plantImages.getPlantsWithImages, {
        group,
        locale,
    });

    const plantsWithoutImages = useQuery(
        api.plantImages.getPlantsWithoutImages,
        { locale }
    );

    return {
        plants: plants ?? [],
        plantsWithoutImages: plantsWithoutImages ?? [],
        isLoading: plants === undefined,
    };
}

// Hook để lấy tất cả plant groups
export function usePlantGroups() {
    const groups = useQuery(api.plantGroups.list, {});
    return {
        groups: groups ?? [],
        isLoading: groups === undefined,
    };
}
