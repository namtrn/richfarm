import { YStack, Text, ScrollView, XStack, Card, Button, Spinner } from 'tamagui';
import { Bell, Check, Droplets, Scissors, Sprout } from '@tamagui/lucide-icons';
import { useReminders } from '../../hooks/useReminders';
import { useAuth } from '../../lib/auth';

const REMINDER_ICONS: Record<string, any> = {
  watering: Droplets,
  pruning: Scissors,
  fertilizing: Sprout,
  default: Bell,
};

function ReminderCard({
  reminder,
  onComplete,
  canEdit,
}: {
  reminder: any;
  onComplete: () => void;
  canEdit: boolean;
}) {
  const Icon = REMINDER_ICONS[reminder.type] ?? REMINDER_ICONS.default;
  const time = new Date(reminder.nextRunAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card elevate bordered padding="$3">
      <XStack alignItems="center" space="$3">
        <YStack
          width={44}
          height={44}
          backgroundColor="$accent3"
          borderRadius={22}
          justifyContent="center"
          alignItems="center"
        >
          <Icon size={22} color="$accent9" />
        </YStack>
        <YStack flex={1}>
          <Text fontSize="$4" fontWeight="600">
            {reminder.title}
          </Text>
          {reminder.description && (
            <Text fontSize="$2" color="$gray10">
              {reminder.description}
            </Text>
          )}
          <Text fontSize="$2" color="$gray9">
            {time}
          </Text>
        </YStack>
        <Button
          size="$3"
          theme="accent"
          icon={Check}
          circular
          disabled={!canEdit}
          onPress={onComplete}
        />
      </XStack>
    </Card>
  );
}

export default function ReminderScreen() {
  const { todayReminders, isLoading, completeReminder } = useReminders();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const canEdit = !isAuthLoading && isAuthenticated;

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <YStack padding="$4" space="$4">
        <YStack>
          <Text fontSize="$8" fontWeight="bold">
            Reminder
          </Text>
          <Text fontSize="$4" color="$gray11">
            Nhắc nhở chăm sóc hôm nay
          </Text>
        </YStack>

        {!isAuthLoading && !isAuthenticated && (
          <Card bordered padding="$3" backgroundColor="$yellow2">
            <Text fontSize="$3" color="$yellow11">
              Bạn cần đăng nhập để hoàn thành nhắc nhở.
            </Text>
          </Card>
        )}

        {isLoading ? (
          <YStack padding="$8" alignItems="center">
            <Spinner size="large" color="$accent8" />
          </YStack>
        ) : todayReminders.length === 0 ? (
          <YStack
            padding="$8"
            alignItems="center"
            space="$3"
            backgroundColor="$gray2"
            borderRadius="$4"
          >
            <Bell size={48} color="$gray8" />
            <Text fontSize="$5" color="$gray10" fontWeight="600">
              Không có nhắc nhở
            </Text>
            <Text fontSize="$3" color="$gray9" textAlign="center">
              Tạo nhắc nhở để không quên chăm cây
            </Text>
          </YStack>
        ) : (
          <YStack space="$3">
            <Text fontSize="$3" color="$gray9" fontWeight="600">
              HÔM NAY — {todayReminders.length} nhắc nhở
            </Text>
            {todayReminders.map((reminder: any) => (
              <ReminderCard
                key={reminder._id}
                reminder={reminder}
                onComplete={() => completeReminder(reminder._id)}
                canEdit={canEdit}
              />
            ))}
          </YStack>
        )}
      </YStack>
    </ScrollView>
  );
}
