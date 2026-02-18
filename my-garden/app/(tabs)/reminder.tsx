import { YStack, Text, ScrollView } from 'tamagui';

export default function ReminderScreen() {
  return (
    <ScrollView flex={1} backgroundColor="background">
      <YStack padding="$4" space="$4">
        <Text fontSize="$8" fontWeight="bold">
          Reminder
        </Text>
        <Text fontSize="$4" color="gray11">
          Nhắc nhở chăm sóc
        </Text>
        
        <YStack padding="$8" alignItems="center">
          <Text fontSize="$5" color="gray10">
            Không có nhắc nhở
          </Text>
          <Text fontSize="$3" color="gray9">
            Tạo nhắc nhở để không quên chăm cây
          </Text>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
