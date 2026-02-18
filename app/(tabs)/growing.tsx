import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Sprout, Leaf } from 'lucide-react-native';
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
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <View className="p-4 gap-y-4">
        {/* Header */}
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-3xl font-bold text-gray-900 dark:text-white">Growing</Text>
            <Text className="text-sm text-gray-500">
              {activePlants.length > 0
                ? `${activePlants.length} cây đang phát triển`
                : 'Cây của bạn đang phát triển'}
            </Text>
          </View>
        </View>

        {/* Auth warning */}
        {!isAuthLoading && !isAuthenticated && (
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <Text className="text-yellow-800 text-sm">
              Bạn cần đăng nhập để cập nhật trạng thái cây.
            </Text>
          </View>
        )}

        {/* Content */}
        {isLoading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : activePlants.length === 0 ? (
          <View className="py-16 items-center gap-y-3 bg-gray-100 dark:bg-gray-800 rounded-2xl">
            <Leaf size={48} stroke="#9ca3af" />
            <Text className="text-lg font-semibold text-gray-500">Chưa có cây nào</Text>
            <Text className="text-sm text-gray-400 text-center">
              Vào tab Planning để thêm cây mới
            </Text>
          </View>
        ) : (
          <View className="gap-y-3">
            {activePlants.map((plant) => (
              <View
                key={plant._id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 shadow-sm flex-row items-center gap-x-3"
              >
                <View className="w-11 h-11 bg-green-100 rounded-full justify-center items-center">
                  <Sprout size={22} stroke="#16a34a" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900 dark:text-white">
                    {plant.nickname ?? 'Cây chưa đặt tên'}
                  </Text>
                  <Text className="text-xs text-gray-400 capitalize">{plant.status}</Text>
                </View>
                <TouchableOpacity
                  className={`bg-green-500 rounded-xl px-3 py-1.5 ${!canEdit ? 'opacity-50' : ''}`}
                  disabled={!canEdit}
                  onPress={() => updateStatus(plant._id, 'harvested')}
                >
                  <Text className="text-white text-sm font-medium">Thu hoạch</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
