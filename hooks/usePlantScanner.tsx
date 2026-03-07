import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, Animated, Image, Modal, NativeModules, PanResponder, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAction } from 'convex/react';
import { X } from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { useDeviceId } from '../lib/deviceId';
import { palette, useTheme } from '../lib/theme';
import { isPremiumActive } from '../lib/access';
import { buildAiDetectorKey, consumeAiDetectorUsage, isAiDetectorLimitReached } from '../lib/aiDetectorLimit';
import { usePlantLibrary } from './usePlantLibrary';
import { usePlants } from './usePlants';
import { normalizeCustomPlantNickname, useAddPlantFlow } from './useAddPlantFlow';
import { api } from '../convex/_generated/api';

let BlurView: React.ComponentType<{ style?: any; intensity?: number; tint?: string }> | null = null;
const isBlurAvailable = !!NativeModules?.ExpoBlurViewManager || !!NativeModules?.ExpoBlurModule;
if (isBlurAvailable) {
  try {
    BlurView = require('expo-blur').BlurView;
  } catch {
    BlurView = null;
  }
}

type UsePlantScannerResult = {
  openScanner: () => void;
  scannerModals: ReactElement;
};

type DetectPlantResponse = {
  match?: {
    name?: string;
    plantMasterId?: string | null;
  } | null;
};

export function usePlantScanner(): UsePlantScannerResult {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = theme.background === palette.dark.background;
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { deviceId } = useDeviceId();
  const { addPlant, plants: userPlants } = usePlants();
  const { createUserPlant, openLibraryMatch, openLibrarySelect } = useAddPlantFlow({ addPlant });
  const locale = i18n.language?.split('-')[0] ?? i18n.language;
  const { plants: libraryPlants } = usePlantLibrary(locale);
  const detectPlantAction = useAction((api as any).plantScan.detectPlant);

  const [scanSourceOpen, setScanSourceOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState(t('planning.unknown_plant'));
  const [detectedPlantMasterId, setDetectedPlantMasterId] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [aiLimitError, setAiLimitError] = useState('');
  const [aiSessionActive, setAiSessionActive] = useState(false);
  const [detectNoMatch, setDetectNoMatch] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  const isPremium = isPremiumActive(user);
  const aiDetectorKey = buildAiDetectorKey(user?._id ? String(user._id) : null, deviceId);
  const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);

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
          setPhotoOpen(false);
          Animated.timing(pan, { toValue: { x: 0, y: 500 }, duration: 200, useNativeDriver: false }).start();
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (photoOpen) {
      pan.setValue({ x: 0, y: 0 });
    }
  }, [photoOpen, pan]);

  const normalize = useCallback((value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim(),
    []
  );

  const findLibraryMatchByName = useCallback((name: string) => {
    const query = normalize(name);
    if (!query) return null;
    return (
      libraryPlants.find((plant: any) => normalize(plant.displayName ?? '') === query || normalize(plant.scientificName ?? '') === query) ??
      libraryPlants.find((plant: any) => normalize(plant.displayName ?? '').includes(query) || normalize(plant.scientificName ?? '').includes(query)) ??
      null
    );
  }, [libraryPlants, normalize]);

  const findLibraryMatch = useCallback((name: string, plantMasterId?: string | null) => {
    if (plantMasterId) {
      const byId = libraryPlants.find((plant: any) => String(plant._id) === String(plantMasterId));
      if (byId) return byId;
    }
    return findLibraryMatchByName(name);
  }, [findLibraryMatchByName, libraryPlants]);

  const findUserPlantMatch = useCallback((libraryPlant: any) => {
    if (!libraryPlant) return null;
    const libraryId = String(libraryPlant._id ?? '');
    return (
      userPlants.find((plant: any) => plant?.plantMasterId && String(plant.plantMasterId) === libraryId) ??
      userPlants.find((plant: any) => {
        const plantDisplay = normalize(plant?.displayName ?? '');
        const plantScientific = normalize(plant?.scientificName ?? '');
        return (
          plantDisplay === normalize(libraryPlant?.displayName ?? '') ||
          plantScientific === normalize(libraryPlant?.scientificName ?? '')
        );
      }) ??
      null
    );
  }, [normalize, userPlants]);

  const detectedLibraryMatch = useMemo(() => {
    const detected = detectedName.trim();
    const unknown = t('planning.unknown_plant');
    if (!detected || normalize(detected) === normalize(unknown)) return null;
    return findLibraryMatch(detected, detectedPlantMasterId);
  }, [detectedName, detectedPlantMasterId, findLibraryMatch, normalize, t]);

  const detectedUserPlantMatch = useMemo(
    () => findUserPlantMatch(detectedLibraryMatch),
    [detectedLibraryMatch, findUserPlantMatch]
  );

  const navigateToMatchedLibraryPlant = useCallback((matchedPlant: any) => {
    if (!matchedPlant) return;
    setPhotoOpen(false);
    setPhotoUri(null);
    setDetectedPlantMasterId(null);
    setAiSessionActive(false);
    setAiLimitError('');
    openLibraryMatch(String(matchedPlant._id), {
      mode: 'select',
      from: 'scanner',
      scannedPhotoUri: photoUri ?? undefined,
    });
  }, [openLibraryMatch, photoUri]);

  const canStartAiScan = useCallback(async () => {
    if (isAuthLoading) return false;
    if (!isAuthenticated) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.scanner_signin_required'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.auth_sign_in'), onPress: () => router.push('/(tabs)/profile') },
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
  }, [aiDetectorKey, aiSessionActive, isAuthLoading, isAuthenticated, isPremium, router, t]);

  const applyPickedImage = useCallback(async (result: ImagePicker.ImagePickerResult) => {
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
    setDetectedPlantMasterId(null);
    setDetectNoMatch(false);
    setPhotoOpen(true);
    if (result.assets[0].base64) {
      setIsDetecting(true);
      try {
        const detected = await detectPlantAction({ images: [result.assets[0].base64], locale: i18n.language }) as DetectPlantResponse;
        if (detected?.match?.name) {
          setDetectedName(detected.match.name);
        }
        setDetectedPlantMasterId(detected?.match?.plantMasterId ? String(detected.match.plantMasterId) : null);
      } catch (error) {
        console.error('AI detection failed:', error);
      } finally {
        setIsDetecting(false);
      }
    }
  }, [aiDetectorKey, aiSessionActive, detectPlantAction, i18n.language, isPremium, t]);

  const handleCaptureFromCamera = useCallback(async () => {
    const canStart = await canStartAiScan();
    if (!canStart) return;
    setScanSourceOpen(false);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (permission.canAskAgain) {
        Alert.alert(t('planning.camera_permission_title'), t('planning.camera_permission_desc'));
      } else {
        Alert.alert(t('planning.camera_permission_title'), t('planning.camera_permission_settings_desc'));
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
  }, [applyPickedImage, canStartAiScan, t]);

  const handlePickFromLibrary = useCallback(async () => {
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
  }, [applyPickedImage, canStartAiScan, t]);

  const handleSavePhotoPlant = useCallback(async () => {
    if (!canEdit) return;
    const detected = detectedName.trim();
    const unknown = t('planning.unknown_plant');
    const hasDetectedName = detected.length > 0 && normalize(detected) !== normalize(unknown);
    if (hasDetectedName && detectedLibraryMatch) {
      navigateToMatchedLibraryPlant(detectedLibraryMatch);
      return;
    }

    setDetectNoMatch(true);
  }, [canEdit, detectedLibraryMatch, detectedName, navigateToMatchedLibraryPlant, normalize, t]);

  const handleSaveAsUnknown = useCallback(async () => {
    if (!canEdit) return;
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
  }, [canEdit, createUserPlant, detectedName, t]);

  const openScanner = useCallback(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      Alert.alert(
        t('profile.auth_sign_in'),
        t('planning.scanner_signin_required'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.auth_sign_in'), onPress: () => router.push('/(tabs)/profile') },
        ]
      );
      return;
    }
    setAiLimitError('');
    setScanSourceOpen(true);
  }, [isAuthLoading, isAuthenticated, router, t]);

  useEffect(() => {
    if (!photoOpen) {
      setAiSessionActive(false);
      setIsDetecting(false);
      setDetectedPlantMasterId(null);
    }
  }, [photoOpen]);

  useFocusEffect(
    useCallback(() => {
      setAiLimitError('');
      return () => {
        setAiLimitError('');
        setScanSourceOpen(false);
        setAiSessionActive(false);
        setPhotoOpen(false);
      };
    }, [])
  );

  const scanSourceModal = (
    <Modal
      visible={scanSourceOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setScanSourceOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setScanSourceOpen(false)} />
        <View style={{ width: '70%', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)' }}>
          <View style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]} pointerEvents="none">
            {BlurView ? (
              <BlurView style={StyleSheet.absoluteFill} intensity={90} tint={isDark ? 'dark' : 'light'} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(28, 22, 18, 0.94)' : 'rgba(252, 249, 244, 0.90)' }]} />
            )}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(10, 8, 7, 0.50)' : 'rgba(255, 255, 255, 0.30)' }]} />
            <View style={[styles.glassTopEdge, { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.90)' }]} />
            <View style={[styles.glassShimmer, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.50)' }]} />
            <View style={[styles.glassBottomRim, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)' }]} />
          </View>
          <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.text, letterSpacing: -0.3, textAlign: 'center' }}>
              {t('planning.scan_source_title')}
            </Text>
            {!!aiLimitError && (
              <View style={{ backgroundColor: theme.dangerBg, borderWidth: 1, borderColor: theme.danger, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: theme.danger, fontSize: 12, textAlign: 'center' }}>{aiLimitError}</Text>
              </View>
            )}
            <TouchableOpacity
              style={{ borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.primary }}
              onPress={() => { void handleCaptureFromCamera(); }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('planning.scan_source_camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accent }}
              onPress={() => { void handlePickFromLibrary(); }}
            >
              <Text style={{ color: theme.textAccent, fontWeight: '700', fontSize: 15 }}>{t('planning.scan_source_library')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background }}
              onPress={() => setScanSourceOpen(false)}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 15 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const photoModal = (
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
                setDetectedPlantMasterId(null);
                if (detectNoMatch) setDetectNoMatch(false);
              }}
            />
          </View>
          {!!detectedLibraryMatch && !detectNoMatch && (
            <View style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.success, backgroundColor: theme.successBg, gap: 6 }}>
              <Text style={{ fontSize: 12, color: theme.success, textAlign: 'center', fontWeight: '700' }}>
                {t('planning.detect_found_in_library')}
              </Text>
              {!!detectedUserPlantMatch && (
                <Text style={{ fontSize: 12, color: theme.success, textAlign: 'center' }}>
                  {t('planning.detect_already_in_garden')}
                </Text>
              )}
              <TouchableOpacity
                style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.primary }}
                onPress={() => navigateToMatchedLibraryPlant(detectedLibraryMatch)}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  {t('planning.detect_open_library')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {detectNoMatch && (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, color: theme.warning, textAlign: 'center' }}>{t('planning.detect_not_found')}</Text>
              <TouchableOpacity
                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accent }}
                onPress={openScanner}
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
              onPress={canEdit ? openScanner : undefined}
              disabled={!canEdit}
            >
              <Text style={{ color: theme.textAccent, fontWeight: '700', fontSize: 15 }}>{t('planning.detect_retake')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canEdit || photoSaving || isDetecting) ? 0.6 : 1 }}
              disabled={!canEdit || photoSaving || isDetecting}
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
  );

  const scannerModals = useMemo(() => (
    <>
      {scanSourceModal}
      {photoModal}
    </>
  ), [scanSourceModal, photoModal]);

  return { openScanner, scannerModals };
}

const styles = StyleSheet.create({
  glassTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 20,
  },
  glassShimmer: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    height: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  glassBottomRim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 20,
  },
});
