import { YStack, Text, Button, ScrollView } from 'tamagui';
import { Plus } from '@tamagui/lucide-icons';

export default function PlanningScreen() {
  return (
    <ScrollView flex={1} backgroundColor="background">
      <YStack padding="$4" space="$4">
        <Text fontSize="$8" fontWeight="bold">
          Planning
        </Text>
        <Text fontSize="$4" color="gray11">
          Lên kế hoạch trồng cây
        </Text>
        
        <Button theme="accent" icon={Plus}>
          Thêm cây mới
        </Button>
      </YStack>
    </ScrollView>
  );
}
