import { YStack, Text, ScrollView } from 'tamagui';

export default function GrowingScreen() {
  return (
    <ScrollView flex={1} backgroundColor="background">
      <YStack padding="$4" space="$4">
        <Text fontSize="$8" fontWeight="bold">
          Growing
        </Text>
        <Text fontSize="$4" color="gray11">
          Cây của bạn đang phát triển
        </Text>
        
        <YStack padding="$8" alignItems="center">
          <Text fontSize="$5" color="gray10">
            Chưa có cây nào
          </Text>
          <Text fontSize="$3" color="gray9">
            Thêm cây để bắt đầu theo dõi
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
