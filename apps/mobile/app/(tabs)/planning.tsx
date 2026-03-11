import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Modal, Pressable, Image, Alert, PanResponder, Animated, StyleSheet } from 'react-native';
import { Plus, Calendar, Leaf, X } from 'lucide-react-native';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useAction } from 'convex/react';
import { usePlants } from '../../hooks/usePlants';
import { useBeds } from '../../hooks/useBeds';
import { useAuth } from '../../lib/auth';
import { usePathname, useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useDeviceId } from '../../lib/deviceId';
import { api } from '../../../../packages/convex/convex/_generated/api';
import { isPremiumActive } from '../../lib/access';
import { buildAiDetectorKey, consumeAiDetectorUsage, isAiDetectorLimitReached } from '../../lib/aiDetectorLimit';
import { usePlantLibrary } from '../../hooks/usePlantLibrary';
import { normalizeCustomPlantNickname, useAddPlantFlow } from '../../hooks/useAddPlantFlow';

import { useTheme } from '../../lib/theme';
import { useAppMode } from '../../hooks/useAppMode';

export default function PlanningScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { appMode } = useAppMode();
  const { plants, isLoading, addPlant } = usePlants();
  const { createUserPlant, openLibrarySelect, openLibraryMatch } = useAddPlantFlow({ addPlant });
  const { beds, isLoading: isBedsLoading } = useBeds();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { deviceId } = useDeviceId();
  const gardensQuery = useQuery(api.gardens.getGardens, deviceId ? { deviceId } : 'skip');
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ scanner?: string | string[] }>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  // Guests (not authenticated but having a deviceId) are allowed to edit.
  // isAuthenticated refers to a "signed in" user (Google/Apple).
  const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState(t('planning.unknown_plant'));

  useEffect(() => {
    if (appMode === 'gardener') {
      router.replace('/(tabs)/garden');
    }
  }, [appMode, router]);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [aiLimitError, setAiLimitError] = useState('');
  const [aiSessionActive, setAiSessionActive] = useState(false);
  const [scanSourceOpen, setScanSourceOpen] = useState(false);
  const [detectNoMatch, setDetectNoMatch] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const scannerTriggeredRef = useRef(false);
  const gardens = gardensQuery ?? [];
  const isSetupLoading = gardensQuery === undefined || isBedsLoading;
  const hasGardenOrBed = gardens.length > 0 || beds.length > 0;
  const canCreatePlant = canEdit;
  const isSetupRequired = false;
  const isPremium = isPremiumActive(user);
  const aiDetectorKey = buildAiDetectorKey(user?._id ? String(user._id) : null, deviceId);
  const locale = i18n.language?.split('-')[0] ?? i18n.language;
  const { plants: libraryPlants } = usePlantLibrary(locale);
  const detectPlantAction = useAction((api as any).plantScan.detectPlant);

  const plannedPlants = useMemo(
    () => plants.filter((p) => p.status === 'planning' || p.status === 'planting'),
    [plants]
  );

  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          pan.setValue({ x: 0, y: gestureState.dy });
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.5) {
          setSheetOpen(false);
          setPhotoOpen(false);
          Animated.timing(pan, { toValue: { x: 0, y: 500 }, duration: 200, useNativeDriver: false }).start();
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (sheetOpen || photoOpen) {
      pan.setValue({ x: 0, y: 0 });
    }
  }, [sheetOpen, photoOpen, pan]);

  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const findLibraryMatchByName = (name: string) => {
    const query = normalize(name);
    if (!query) return null;
    return (
      libraryPlants.find((plant: any) => normalize(plant.displayName ?? '') === query || normalize(plant.scientificName ?? '') === query) ??
      libraryPlants.find((plant: any) => normalize(plant.displayName ?? '').includes(query) || normalize(plant.scientificName ?? '').includes(query)) ??
      null
    );
  };

  const handleAddPlant = async () => {
    if (!canCreatePlant || !nickname.trim()) return;
    setSaving(true);
    try {
      await createUserPlant({ nickname: nickname.trim() });
      setNickname('');
      setSheetOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddPlant = () => {
    if (isAuthLoading) return;
    if (!canEdit) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.auth_warning'),
        [
          { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.auth_sign_in'), onPress: () => router.push({ pathname: '/auth', params: { returnTo: pathname } }) },
        ]
      );
      return;
    }
    setSheetOpen(true);
  };

  const handleSearchLibrary = () => {
    if (!canCreatePlant) return;
    setSheetOpen(false);
    openLibrarySelect({ mode: 'select', from: 'planning' });
  };

  const canStartAiScan = async () => {
    if (isAuthLoading) return false;
    if (!isAuthenticated) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.scanner_signin_required'),
        [
          { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.auth_sign_in'), onPress: () => router.push({ pathname: '/auth', params: { returnTo: pathname } }) },
        ]
      );
      return false;
    }
    if (!isPremium && !aiSessionActive) {
      if (!aiDetectorKey) {
        setAiLimitError(t('common.error'));
        return false;
      }
      const reached = await isAiDetectorLimitReached(aiDetectorKey, 1);
      if (reached) {
        setAiLimitError(t('planning.detect_limit_free'));
        return false;
      }
    }
    setAiLimitError('');
    return true;
  };

  const applyPickedImage = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]?.uri) return;
    if (!isPremium && !aiSessionActive) {
      const consumption = await consumeAiDetectorUsage(aiDetectorKey, 1);
      if (!consumption.allowed) {
        setAiLimitError(t('planning.detect_limit_free'));
        return;
      }
    }
    setAiSessionActive(true);
    setPhotoUri(result.assets[0].uri);
    setDetectedName(t('planning.unknown_plant'));
    setDetectNoMatch(false);
    setPhotoOpen(true);
    if (result.assets[0].base64) {
      setIsDetecting(true);
      try {
        const detected = await detectPlantAction({ images: [result.assets[0].base64], locale: i18n.language });
        if (detected?.match?.name) {
          setDetectedName(detected.match.name);
        }
      } catch (error) {
        console.error('AI detection failed:', error);
      } finally {
        setIsDetecting(false);
      }
    }
  };

  const handleOpenScanSource = () => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.scanner_signin_required'),
        [
          { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.auth_sign_in'), onPress: () => router.push({ pathname: '/auth', params: { returnTo: pathname } }) },
        ]
      );
      return;
    }
    setAiLimitError('');
    setSheetOpen(false);
    setScanSourceOpen(true);
  };

  const handleCaptureFromCamera = async () => {
    const canStart = await canStartAiScan();
    if (!canStart) return;
    setScanSourceOpen(false);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (permission.canAskAgain) {
        Alert.alert(
          t('planning.camera_permission_title'),
          t('planning.camera_permission_desc')
        );
      } else {
        Alert.alert(
          t('planning.camera_permission_title'),
          t('planning.camera_permission_settings_desc')
        );
      }
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
        base64: true,
      });
      await applyPickedImage(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const simulatorCameraUnavailable = /camera not available on simulator/i.test(message);
      if (!simulatorCameraUnavailable) {
        Alert.alert(t('planning.camera_open_failed_title'), t('planning.camera_open_failed_desc'));
        return;
      }
      Alert.alert(t('planning.camera_unavailable_title'), t('planning.camera_unavailable_desc'));
    }
  };

  const handlePickFromLibrary = async () => {
    const canStart = await canStartAiScan();
    if (!canStart) return;
    setScanSourceOpen(false);
    const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!mediaPermission.granted) {
      if (mediaPermission.canAskAgain) {
        Alert.alert(t('planning.photo_permission_title'), t('planning.photo_permission_desc'));
      } else {
        Alert.alert(t('planning.photo_permission_title'), t('planning.photo_permission_settings_desc'));
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
    });
    await applyPickedImage(result);
  };

  const handleSavePhotoPlant = async () => {
    if (!canEdit) return;
    const detected = detectedName.trim();
    const unknown = t('planning.unknown_plant');
    const hasDetectedName = detected.length > 0 && normalize(detected) !== normalize(unknown);
    if (hasDetectedName) {
      const matchedPlant = findLibraryMatchByName(detected);
      if (matchedPlant) {
        setPhotoOpen(false);
        setPhotoUri(null);
        setAiSessionActive(false);
        setAiLimitError('');
        openLibraryMatch(String(matchedPlant._id), {
          mode: 'select',
          from: 'scanner',
          scannedPhotoUri: photoUri ?? undefined,
        });
        return;
      }
    }

    setDetectNoMatch(true);
  };

  const handleSaveAsUnknown = async () => {
    if (!canCreatePlant) return;
    setPhotoSaving(true);
    try {
      await createUserPlant({
        nickname: normalizeCustomPlantNickname(detectedName, t('planning.unknown_plant')),
      });
      setPhotoOpen(false);
      setPhotoUri(null);
      setAiSessionActive(false);
      setAiLimitError('');
      setDetectNoMatch(false);
    } finally {
      setPhotoSaving(false);
    }
  };

  useEffect(() => {
    if (!sheetOpen) {
      setAiLimitError('');
    }
  }, [sheetOpen]);

  useEffect(() => {
    if (!photoOpen) {
      setAiSessionActive(false);
      setIsDetecting(false);
    }
  }, [photoOpen]);

  useEffect(() => {
    const scannerParam = Array.isArray(params.scanner) ? params.scanner[0] : params.scanner;
    if (scannerParam !== '1' || scannerTriggeredRef.current) return;
    scannerTriggeredRef.current = true;
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.scanner_signin_required'),
        [
          { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.auth_sign_in'), onPress: () => router.push({ pathname: '/auth', params: { returnTo: pathname } }) },
        ]
      );
      return;
    }
    handleOpenScanSource();
  }, [params.scanner, canCreatePlant, canEdit, hasGardenOrBed, isAuthLoading, isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      setAiLimitError('');
      return () => {
        setAiLimitError('');
        setScanSourceOpen(false);
        setAiSessionActive(false);
      };
    }, [])
  );

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('planning.title')}</Text>
              <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500', lineHeight: 18 }}>
                {isSetupRequired
                  ? t('planning.setup_required_desc')
                  : t('planning.subtitle')}
              </Text>
            </View>
            {isSetupRequired ? (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.warning, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}
                onPress={() => router.push('/(tabs)/garden')}
                testID="e2e-planning-open-garden-setup"
              >
                <Plus size={18} color="white" strokeWidth={3} />
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>
                  {t('planning.setup_required_action')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, opacity: canCreatePlant ? 1 : 0.8 }}
                onPress={handleOpenAddPlant}
                testID="e2e-planning-add-button"
              >
                <Plus size={18} color="white" strokeWidth={3} />
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>{t('planning.add_button')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Auth warning */}
          {!isAuthLoading && !isAuthenticated && (
            <View style={{ backgroundColor: theme.warningBg, borderLeftWidth: 4, borderLeftColor: theme.warning, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 }}>
              <Text style={{ color: theme.warning, fontSize: 14, fontWeight: '600' }}>
                {t('planning.auth_warning')}
              </Text>
            </View>
          )}

          {/* Content */}
          {isLoading || isSetupLoading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
          ) : isSetupRequired ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', gap: 16, backgroundColor: theme.card, borderRadius: 24, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 15 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: theme.warningBg, justifyContent: 'center', alignItems: 'center' }}>
                <Calendar size={40} color={theme.warning} strokeWidth={1.5} />
              </View>
              <View style={{ alignItems: 'center', paddingHorizontal: 30 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text, textAlign: 'center' }}>
                  {t('planning.setup_required_title')}
                </Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '500' }}>
                  {t('planning.setup_required_desc')}
                </Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: theme.warning, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 }}
                onPress={() => router.push('/(tabs)/garden')}
                testID="e2e-planning-open-garden-setup-empty"
              >
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>
                  {t('planning.setup_required_action')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : plannedPlants.length === 0 ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', gap: 16, backgroundColor: theme.card, borderRadius: 24, borderWidth: 1, borderColor: theme.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 15 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' }}>
                <Calendar size={40} color={theme.primary} strokeWidth={1.5} />
              </View>
              <View style={{ alignItems: 'center', paddingHorizontal: 40 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: theme.text }}>{t('planning.empty_title')}</Text>
                <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '500' }}>
                  {t('planning.empty_desc')}
                </Text>
              </View>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.primary, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8, opacity: canCreatePlant ? 1 : 0.8 }}
                onPress={handleOpenAddPlant}
                testID="e2e-planning-empty-add-button"
              >
                <Plus size={20} color="white" strokeWidth={3} />
                <Text style={{ color: 'white', fontSize: 15, fontWeight: '800' }}>{t('planning.add_new')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {plannedPlants.map((plant) => (
                <TouchableOpacity
                  key={plant._id}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/plant/[userPlantId]',
                      params: { userPlantId: String(plant._id), from: 'planning' },
                    })
                  }
                  style={{ backgroundColor: theme.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.border, shadowColor: '#1a1a18', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, flexDirection: 'row', alignItems: 'center', gap: 16 }}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 56, height: 56, backgroundColor: theme.accent, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.border }}>
                    <Leaf size={28} color={theme.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: theme.text }}>
                      {plant.displayName ?? plant.scientificName ?? t('planning.unnamed')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.accent, borderWidth: 1, borderColor: theme.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('planning.status_planning')}</Text>
                      </View>
                    </View>
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
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetOpen(false)} />
          <Animated.View
            {...panResponder.panHandlers}
            style={{ backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 20, transform: [{ translateY: pan.y }] }}
          >
            <View style={{ width: 40, height: 5, borderRadius: 2.5, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('planning.modal_title')}</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} stroke={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={{ backgroundColor: theme.background, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, opacity: !canCreatePlant ? 0.6 : 1 }}
                disabled={!canCreatePlant}
                onPress={handleSearchLibrary}
                testID="e2e-planning-option-library"
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t('planning.option_library_title')}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>{t('planning.option_library_desc')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: theme.background, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.border, opacity: !canCreatePlant ? 0.6 : 1 }}
                disabled={!canCreatePlant}
                onPress={handleOpenScanSource}
                testID="e2e-planning-option-camera"
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>{t('planning.option_camera_title')}</Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4, fontWeight: '500' }}>{t('planning.option_camera_desc')}</Text>
              </TouchableOpacity>

              {!!aiLimitError && (
                <View style={{ backgroundColor: theme.dangerBg, borderWidth: 1, borderColor: theme.danger, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: theme.danger, fontSize: 12 }}>{aiLimitError}</Text>
                </View>
              )}
            </View>

            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('planning.quick_input_label')}</Text>
              <TextInput
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                placeholder={t('planning.quick_input_placeholder')}
                placeholderTextColor={theme.textMuted}
                value={nickname}
                onChangeText={setNickname}
                testID="e2e-planning-quick-input"
              />
            </View>

            <TouchableOpacity
              style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canCreatePlant || !nickname.trim() || saving) ? 0.6 : 1, marginTop: 8 }}
              disabled={!canCreatePlant || !nickname.trim() || saving}
              onPress={handleAddPlant}
              testID="e2e-planning-confirm-add"
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' }}>{t('planning.add_confirm')}</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={scanSourceOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScanSourceOpen(false)}
      >
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' }} onPress={() => setScanSourceOpen(false)} />
        <View style={{ position: 'absolute', top: 120, left: '33.5%', width: '33%', backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
          <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border }} onPress={() => { void handleCaptureFromCamera(); }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{t('planning.scan_source_camera')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ paddingHorizontal: 10, paddingVertical: 10 }} onPress={() => { void handlePickFromLibrary(); }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>{t('planning.scan_source_library')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={photoOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoOpen(false)} />
          <Animated.View
            {...panResponder.panHandlers}
            style={{ backgroundColor: theme.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 20, transform: [{ translateY: pan.y }] }}
          >
            <View style={{ width: 40, height: 5, borderRadius: 2.5, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.5 }}>{t('planning.detect_title')}</Text>
              <TouchableOpacity onPress={() => setPhotoOpen(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} stroke={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {photoUri && (
              <Image
                source={{ uri: photoUri }}
                style={{ width: '100%', height: 220, borderRadius: 20, borderWidth: 1, borderColor: theme.border }}
                resizeMode="cover"
              />
            )}
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500', textAlign: 'center' }}>{t('planning.detect_hint')}</Text>
              <TextInput
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                placeholder={t('planning.detect_name_placeholder')}
                placeholderTextColor={theme.textMuted}
                value={detectedName}
                onChangeText={(value) => {
                  setDetectedName(value);
                  if (detectNoMatch) setDetectNoMatch(false);
                }}
              />
            </View>
            {detectNoMatch && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, color: theme.warning, textAlign: 'center' }}>{t('planning.detect_not_found')}</Text>
                <TouchableOpacity
                  style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accent }}
                  onPress={handleOpenScanSource}
                >
                  <Text style={{ color: theme.textAccent, fontWeight: '700', fontSize: 14 }}>{t('planning.detect_retake')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background }}
                  onPress={() => {
                    setPhotoOpen(false);
                    openLibrarySelect({
                      mode: 'select',
                      from: 'scanner',
                      searchQuery: detectedName.trim(),
                      tab: 'plants',
                    });
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{t('planning.scan_source_library')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.primary, opacity: photoSaving ? 0.6 : 1 }}
                  disabled={photoSaving}
                  onPress={handleSaveAsUnknown}
                >
                  {photoSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('planning.detect_save_unknown')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                style={{ flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accent }}
                onPress={canCreatePlant ? handleOpenScanSource : undefined}
                disabled={!canCreatePlant}
              >
                <Text style={{ color: theme.textAccent, fontWeight: '700', fontSize: 15 }}>{t('planning.detect_retake')}</Text>
              </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canCreatePlant || photoSaving || isDetecting) ? 0.6 : 1 }}
              disabled={!canCreatePlant || photoSaving || isDetecting}
              onPress={handleSavePhotoPlant}
            >
              {(photoSaving || isDetecting) ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('planning.detect_save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

    </>
  );
}
