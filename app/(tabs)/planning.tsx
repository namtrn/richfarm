import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Modal, Pressable } from 'react-native';
import { Plus, Calendar, Leaf } from 'lucide-react-native';
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
      <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-950">
        <View className="p-4 gap-y-4">
          {/* Header */}
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-3xl font-bold text-gray-900 dark:text-white">Planning</Text>
              <Text className="text-sm text-gray-500">Lên kế hoạch trồng cây</Text>
            </View>
            <TouchableOpacity
              className={`flex-row items-center gap-x-1 bg-green-500 rounded-xl px-3 py-2 ${!canEdit ? 'opacity-50' : ''}`}
              disabled={!canEdit}
              onPress={() => setSheetOpen(true)}
            >
              <Plus size={16} color="white" />
              <Text className="text-white text-sm font-medium">Thêm cây</Text>
            </TouchableOpacity>
          </View>

          {/* Auth warning */}
          {!isAuthLoading && !isAuthenticated && (
            <View className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
              <Text className="text-yellow-800 text-sm">
                Bạn cần đăng nhập để thêm và đồng bộ cây.
              </Text>
            </View>
          )}

          {/* Content */}
          {isLoading ? (
            <View className="py-16 items-center">
              <ActivityIndicator size="large" color="#16a34a" />
            </View>
          ) : plannedPlants.length === 0 ? (
            <View className="py-16 items-center gap-y-3 bg-gray-100 dark:bg-gray-800 rounded-2xl">
              <Calendar size={48} color="#9ca3af" />
              <Text className="text-lg font-semibold text-gray-500">Chưa có kế hoạch</Text>
              <Text className="text-sm text-gray-400 text-center">
                Nhấn "Thêm cây" để bắt đầu lên kế hoạch
              </Text>
              <TouchableOpacity
                className={`flex-row items-center gap-x-1 bg-green-500 rounded-xl px-4 py-2 mt-1 ${!canEdit ? 'opacity-50' : ''}`}
                disabled={!canEdit}
                onPress={() => setSheetOpen(true)}
              >
                <Plus size={16} color="white" />
                <Text className="text-white text-sm font-medium">Thêm cây mới</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-y-3">
              {plannedPlants.map((plant) => (
                <View key={plant._id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 shadow-sm flex-row items-center gap-x-3">
                  <View className="w-11 h-11 bg-green-100 rounded-full justify-center items-center">
                    <Leaf size={22} color="#16a34a" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900 dark:text-white">
                      {plant.nickname ?? 'Cây chưa đặt tên'}
                    </Text>
                    <Text className="text-xs text-gray-400">Đang lên kế hoạch</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Sheet Modal */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable className="flex-1 bg-black/40" onPress={() => setSheetOpen(false)} />
        <View className="bg-white dark:bg-gray-900 rounded-t-3xl px-6 py-6 gap-y-4">
          <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-2" />
          <Text className="text-xl font-bold text-gray-900 dark:text-white">Thêm cây mới</Text>
          <TextInput
            className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            placeholder="Tên cây (ví dụ: Cà chua, Rau muống...)"
            placeholderTextColor="#9ca3af"
            value={nickname}
            onChangeText={setNickname}
            autoFocus
          />
          <TouchableOpacity
            className={`bg-green-500 rounded-xl py-4 items-center ${(!canEdit || !nickname.trim() || saving) ? 'opacity-50' : ''}`}
            disabled={!canEdit || !nickname.trim() || saving}
            onPress={handleAddPlant}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Thêm cây</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
