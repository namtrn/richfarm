import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Bell, Check, Droplets, Scissors, Sprout } from 'lucide-react-native';
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
    <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 shadow-sm flex-row items-center gap-x-3">
      <View className="w-11 h-11 bg-green-100 rounded-full justify-center items-center">
        <Icon size={22} stroke="#16a34a" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 dark:text-white">{reminder.title}</Text>
        {reminder.description && (
          <Text className="text-xs text-gray-400">{reminder.description}</Text>
        )}
        <Text className="text-xs text-gray-400">{time}</Text>
      </View>
      <TouchableOpacity
        className={`w-9 h-9 bg-green-500 rounded-full justify-center items-center ${!canEdit ? 'opacity-50' : ''}`}
        disabled={!canEdit}
        onPress={onComplete}
      >
        <Check size={18} color="white" />
      </TouchableOpacity>
    </View>
  );
}

export default function ReminderScreen() {
  const { todayReminders, isLoading, completeReminder } = useReminders();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const canEdit = !isAuthLoading && isAuthenticated;

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <View className="p-4 gap-y-4">
        <View>
          <Text className="text-3xl font-bold text-gray-900 dark:text-white">Reminder</Text>
          <Text className="text-sm text-gray-500">Nhắc nhở chăm sóc hôm nay</Text>
        </View>

        {!isAuthLoading && !isAuthenticated && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <Text className="text-yellow-800 text-sm">
              Bạn cần đăng nhập để hoàn thành nhắc nhở.
            </Text>
          </View>
        )}

        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : todayReminders.length === 0 ? (
          <View className="py-16 items-center gap-y-3 bg-gray-100 dark:bg-gray-800 rounded-2xl">
            <Bell size={48} stroke="#9ca3af" />
            <Text className="text-lg font-semibold text-gray-500">Không có nhắc nhở</Text>
            <Text className="text-sm text-gray-400 text-center">
              Tạo nhắc nhở để không quên chăm cây
            </Text>
          </View>
        ) : (
          <View className="gap-y-3">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
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
          </View>
        )}
      </View>
    </ScrollView>
  );
}
