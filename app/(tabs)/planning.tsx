import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Modal, Pressable, Image } from 'react-native';
import { Plus, Calendar, Leaf } from 'lucide-react-native';
import { useState } from 'react';
import { usePlants } from '../../hooks/usePlants';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

export default function PlanningScreen() {
  const { t } = useTranslation();
  const { plants, isLoading, addPlant } = usePlants();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const canEdit = !isAuthLoading && isAuthenticated;
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState(t('planning.unknown_plant'));
  const [photoSaving, setPhotoSaving] = useState(false);

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

  const handleSearchLibrary = () => {
    setSheetOpen(false);
    router.push('/(tabs)/library?mode=select&from=planning');
  };

  const handleCapture = async () => {
    setSheetOpen(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
    setDetectedName(t('planning.unknown_plant'));
    setPhotoOpen(true);
  };

  const handleSavePhotoPlant = async () => {
    if (!canEdit) return;
    setPhotoSaving(true);
    try {
      await addPlant({ nickname: detectedName.trim() || t('planning.unknown_plant') });
      setPhotoOpen(false);
      setPhotoUri(null);
    } finally {
      setPhotoSaving(false);
    }
  };

  return (
    <>
      <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-950">
        <View className="p-4 gap-y-4">
          {/* Header */}
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-3xl font-bold text-gray-900 dark:text-white">{t('planning.title')}</Text>
              <Text className="text-sm text-gray-500">{t('planning.subtitle')}</Text>
            </View>
            <TouchableOpacity
              className={`flex-row items-center gap-x-1 bg-green-500 rounded-xl px-3 py-2 ${!canEdit ? 'opacity-50' : ''}`}
              disabled={!canEdit}
              onPress={() => setSheetOpen(true)}
            >
              <Plus size={16} color="white" />
              <Text className="text-white text-sm font-medium">{t('planning.add_button')}</Text>
            </TouchableOpacity>
          </View>

          {/* Auth warning */}
          {!isAuthLoading && !isAuthenticated && (
            <View className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
              <Text className="text-yellow-800 text-sm">
                {t('planning.auth_warning')}
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
              <Text className="text-lg font-semibold text-gray-500">{t('planning.empty_title')}</Text>
              <Text className="text-sm text-gray-400 text-center">
                {t('planning.empty_desc')}
              </Text>
              <TouchableOpacity
                className={`flex-row items-center gap-x-1 bg-green-500 rounded-xl px-4 py-2 mt-1 ${!canEdit ? 'opacity-50' : ''}`}
                disabled={!canEdit}
                onPress={() => setSheetOpen(true)}
              >
                <Plus size={16} color="white" />
                <Text className="text-white text-sm font-medium">{t('planning.add_new')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-y-3">
              {plannedPlants.map((plant) => (
                <TouchableOpacity
                  key={plant._id}
                  onPress={() => router.push(`/(tabs)/plant/${plant._id}`)}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 shadow-sm flex-row items-center gap-x-3"
                  activeOpacity={0.8}
                >
                  <View className="w-11 h-11 bg-green-100 rounded-full justify-center items-center">
                    <Leaf size={22} color="#16a34a" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900 dark:text-white">
                      {plant.nickname ?? t('planning.unnamed')}
                    </Text>
                    <Text className="text-xs text-gray-400">{t('planning.status_planning')}</Text>
                  </View>
                </TouchableOpacity>
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
          <Text className="text-xl font-bold text-gray-900 dark:text-white">{t('planning.modal_title')}</Text>

          <TouchableOpacity
            className={`bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-4 ${!canEdit ? 'opacity-50' : ''}`}
            disabled={!canEdit}
            onPress={handleSearchLibrary}
          >
            <Text className="text-base font-semibold text-gray-900 dark:text-white">{t('planning.option_library_title')}</Text>
            <Text className="text-xs text-gray-500 mt-1">{t('planning.option_library_desc')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-4 ${!canEdit ? 'opacity-50' : ''}`}
            disabled={!canEdit}
            onPress={handleCapture}
          >
            <Text className="text-base font-semibold text-gray-900 dark:text-white">{t('planning.option_camera_title')}</Text>
            <Text className="text-xs text-gray-500 mt-1">{t('planning.option_camera_desc')}</Text>
          </TouchableOpacity>

          <Text className="text-xs text-gray-400 mt-2">{t('planning.quick_input_label')}</Text>
          <TextInput
            className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            placeholder={t('planning.quick_input_placeholder')}
            placeholderTextColor="#9ca3af"
            value={nickname}
            onChangeText={setNickname}
          />
          <TouchableOpacity
            className={`bg-green-500 rounded-xl py-4 items-center ${(!canEdit || !nickname.trim() || saving) ? 'opacity-50' : ''}`}
            disabled={!canEdit || !nickname.trim() || saving}
            onPress={handleAddPlant}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">{t('planning.add_confirm')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={photoOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoOpen(false)}
      >
        <Pressable className="flex-1 bg-black/40" onPress={() => setPhotoOpen(false)} />
        <View className="bg-white dark:bg-gray-900 rounded-t-3xl px-6 py-6 gap-y-4">
          <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-2" />
          <Text className="text-xl font-bold text-gray-900 dark:text-white">{t('planning.detect_title')}</Text>
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={{ width: '100%', height: 180, borderRadius: 16 }}
              resizeMode="cover"
            />
          )}
          <Text className="text-xs text-gray-500">{t('planning.detect_hint')}</Text>
          <TextInput
            className="bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            placeholder={t('planning.detect_name_placeholder')}
            placeholderTextColor="#9ca3af"
            value={detectedName}
            onChangeText={setDetectedName}
          />
          <View className="flex-row gap-x-2">
            <TouchableOpacity
              className="flex-1 bg-gray-200 rounded-xl py-3 items-center"
              onPress={handleCapture}
            >
              <Text className="text-gray-700 font-semibold">{t('planning.detect_retake')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 bg-green-500 rounded-xl py-3 items-center ${(!canEdit || photoSaving) ? 'opacity-50' : ''}`}
              disabled={!canEdit || photoSaving}
              onPress={handleSavePhotoPlant}
            >
              {photoSaving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">{t('planning.detect_save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </>
  );
}
