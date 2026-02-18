import { YStack, Text, ScrollView, Button, XStack, Card, Spinner } from 'tamagui';
import { Sprout, Leaf } from '@tamagui/lucide-icons';
import { usePlants } from '../../hooks/usePlants';
import { useAuth } from '../../lib/auth';

export default function GrowingScreen() {
  const { plants, isLoading, updateStatus } = usePlants();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const canEdit = !isAuthLoading && isAuthenticated;

  const activePlants = plants.filter(
    (p) => p.status === 'growing' || p.status === 'planting'
  );

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack padding="$4" space="$4">
        <XStack justifyContent="space-between" alignItems="center">
          <YStack>
            <Text fontSize="$8" fontWeight="bold">
              Growing
            </Text>
            <Text fontSize="$4" color="$gray11">
              {activePlants.length > 0
                ? `${activePlants.length} cây đang phát triển`
                : 'Cây của bạn đang phát triển'}
            </Text>
          </YStack>
        </XStack>

        {!isAuthLoading && !isAuthenticated && (
          <Card bordered padding="$3" backgroundColor="$yellow2">
            <Text fontSize="$3" color="$yellow11">
              Bạn cần đăng nhập để cập nhật trạng thái cây.
            </Text>
          </Card>
        )}

        {isLoading ? (
          <YStack padding="$8" alignItems="center">
            <Spinner size="large" color="$accent8" />
          </YStack>
        ) : activePlants.length === 0 ? (
          <YStack
            padding="$8"
            alignItems="center"
            space="$3"
            backgroundColor="$gray2"
            borderRadius="$4"
          >
            <Leaf size={48} color="$gray8" />
            <Text fontSize="$5" color="$gray10" fontWeight="600">
              Chưa có cây nào
            </Text>
            <Text fontSize="$3" color="$gray9" textAlign="center">
              Vào tab Planning để thêm cây mới
            </Text>
          </YStack>
        ) : (
          <YStack space="$3">
            {activePlants.map((plant) => (
              <Card key={plant._id} elevate bordered padding="$3">
                <XStack alignItems="center" space="$3">
                  <YStack
                    width={44}
                    height={44}
                    backgroundColor="$accent3"
                    borderRadius={22}
                    justifyContent="center"
                    alignItems="center"
                  >
                    <Sprout size={22} color="$accent9" />
                  </YStack>
                  <YStack flex={1}>
                    <Text fontSize="$4" fontWeight="600">
                      {plant.nickname ?? 'Cây chưa đặt tên'}
                    </Text>
                    <Text fontSize="$2" color="$gray10" textTransform="capitalize">
                      {plant.status}
                    </Text>
                  </YStack>
                  <Button
                    size="$2"
                    theme="accent"
                    disabled={!canEdit}
                    onPress={() => updateStatus(plant._id, 'harvested')}
                  >
                    Thu hoạch
                  </Button>
                </XStack>
              </Card>
            ))}
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}
