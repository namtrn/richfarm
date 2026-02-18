import { YStack, Text, Button, ScrollView, XStack, Card, Input, Sheet, Spinner } from 'tamagui';
import { Plus, Calendar, Leaf } from '@tamagui/lucide-icons';
import { useState } from 'react';
import { usePlants } from '../../hooks/usePlants';
import { useAuth } from '../../lib/auth';

export default function PlanningScreen() {
  const { plants, isLoading, addPlant } = usePlants();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = !isAuthLoading && isAuthenticated;

  const plannedPlants = plants.filter((p) => p.status === 'planting');

  const handleAddPlant = async () => {
    if (!canEdit || !nickname.trim()) return;
    setSaving(true);
    try {
      await addPlant({ nickname: nickname.trim() });
      setNickname('');
      setSheetOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView flex={1} backgroundColor="$background">
        <YStack padding="$4" space="$4">
          <XStack justifyContent="space-between" alignItems="center">
            <YStack>
              <Text fontSize="$8" fontWeight="bold">
                Planning
              </Text>
              <Text fontSize="$4" color="$gray11">
                Lên kế hoạch trồng cây
              </Text>
            </YStack>
            <Button
              theme="accent"
              icon={Plus}
              size="$3"
              disabled={!canEdit}
              onPress={() => setSheetOpen(true)}
            >
              Thêm cây
            </Button>
          </XStack>

          {!isAuthLoading && !isAuthenticated && (
            <Card bordered padding="$3" backgroundColor="$yellow2">
              <Text fontSize="$3" color="$yellow11">
                Bạn cần đăng nhập để thêm và đồng bộ cây.
              </Text>
            </Card>
          )}

          {isLoading ? (
            <YStack padding="$8" alignItems="center">
              <Spinner size="large" color="$accent8" />
            </YStack>
          ) : plannedPlants.length === 0 ? (
            <YStack
              padding="$8"
              alignItems="center"
              space="$3"
              backgroundColor="$gray2"
              borderRadius="$4"
            >
              <Calendar size={48} color="$gray8" />
              <Text fontSize="$5" color="$gray10" fontWeight="600">
                Chưa có kế hoạch
              </Text>
              <Text fontSize="$3" color="$gray9" textAlign="center">
                Nhấn "Thêm cây" để bắt đầu lên kế hoạch
              </Text>
              <Button
                theme="accent"
                icon={Plus}
                disabled={!canEdit}
                onPress={() => setSheetOpen(true)}
              >
                Thêm cây mới
              </Button>
            </YStack>
          ) : (
            <YStack space="$3">
              {plannedPlants.map((plant) => (
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
                      <Leaf size={22} color="$accent9" />
                    </YStack>
                    <YStack flex={1}>
                      <Text fontSize="$4" fontWeight="600">
                        {plant.nickname ?? 'Cây chưa đặt tên'}
                      </Text>
                      <Text fontSize="$2" color="$gray10">
                        Đang lên kế hoạch
                      </Text>
                    </YStack>
                  </XStack>
                </Card>
              ))}
            </YStack>
          )}
        </YStack>
      </ScrollView>

      {/* Bottom Sheet thêm cây */}
      <Sheet
        modal
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        snapPoints={[40]}
        dismissOnSnapToBottom
      >
        <Sheet.Overlay />
        <Sheet.Frame padding="$4" space="$4">
          <Sheet.Handle />
          <Text fontSize="$6" fontWeight="bold">
            Thêm cây mới
          </Text>
          <Input
            placeholder="Tên cây (ví dụ: Cà chua, Rau muống...)"
            value={nickname}
            onChangeText={setNickname}
            size="$4"
            autoFocus
          />
          <Button
            theme="accent"
            size="$4"
            onPress={handleAddPlant}
            disabled={!canEdit || !nickname.trim() || saving}
            icon={saving ? <Spinner /> : Plus}
          >
            {saving ? 'Đang lưu...' : 'Thêm cây'}
          </Button>
        </Sheet.Frame>
      </Sheet>
    </>
  );
}
