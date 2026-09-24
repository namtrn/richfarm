import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Alert, Image, Modal, NativeModules, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useAction } from 'convex/react';
import { useAuth } from '../lib/auth';
import { useDeviceId } from '../lib/deviceId';
import { palette, useTheme } from '../lib/theme';
import { addScanEntry, updateScanEntry } from '../lib/scanHistory';
import { usePlantLibrary } from './usePlantLibrary';
import { usePlants } from './usePlants';
import { normalizeCustomPlantNickname, useAddPlantFlow } from './useAddPlantFlow';
import { useInputModalLifecycle } from './useInputModalLifecycle';
import { InputSheet } from '../components/ui/InputSheet';
import { useAuthPrompt } from './useAuthPrompt';
import { usePaywall } from './usePaywall';
import { useAiScanQuota } from './useAiScanQuota';
import { AiScanLimitNotice } from '../components/scan/AiScanLimitNotice';
import { api } from '../../../packages/convex/convex/_generated/api';

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
  /** Call to register a listener that fires after every completed scan */
  onScanSaved: (cb: () => void) => () => void;
};

export type ScanMode = 'identify' | 'diagnose';

type DetectPlantResponse = {
  match?: {
    name?: string;
    plantMasterId?: string | null;
  } | null;
};

type DiagnosePlantResponse = {
  plantName?: string | null;
  assessment?: 'healthy' | 'pest' | 'disease' | 'stress' | 'unknown';
  confidence?: number;
  diagnosis?: string;
  causes?: string[];
  recommendedActions?: string[];
  prevention?: string[];
};

export function usePlantScanner(): UsePlantScannerResult {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = theme.background === palette.dark.background;
  const promptSignIn = useAuthPrompt();
  const { presentPaywall } = usePaywall();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { deviceId } = useDeviceId();
  const { addPlant, plants: userPlants } = usePlants();
  const { createUserPlant, openLibraryMatch, openLibrarySelect } = useAddPlantFlow({ addPlant });
  const locale = i18n.language?.split('-')[0] ?? i18n.language;
  const { plants: libraryPlants } = usePlantLibrary(locale);
  const detectPlantAction = useAction(api.plantScan.detectPlant);
  const { quota: scanQuota, isPremium, limitReached: aiLimitReached, canStartScan: canStartAiScan, handleScanError, resetLimit } = useAiScanQuota();

  const [scanSourceOpen, setScanSourceOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('identify');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState(t('planning.unknown_plant'));
  const [detectedPlantMasterId, setDetectedPlantMasterId] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [detectNoMatch, setDetectNoMatch] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [diagnosisCameraOpen, setDiagnosisCameraOpen] = useState(false);
  const [diagnosisPhotos, setDiagnosisPhotos] = useState<MultiStepCameraPhoto[]>([]);
  const [diagnosisResultOpen, setDiagnosisResultOpen] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosePlantResponse | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // Listeners that want to be notified when a scan entry is saved
  const scanSavedListeners = useRef<Set<() => void>>(new Set());
  const notifyScanSaved = useCallback(() => {
    scanSavedListeners.current.forEach((cb) => cb());
  }, []);
  const onScanSaved = useCallback((cb: () => void) => {
    scanSavedListeners.current.add(cb);
    return () => { scanSavedListeners.current.delete(cb); };
  }, []);

  // Tracks the most-recently created scan history entry id so we can update it later
  const currentScanIdRef = useRef<string | null>(null);

  const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);
  const diagnosisSteps = useMemo(() => [
    { id: 'whole-plant', instruction: t('planning.diagnose_step_whole_plant') },
    { id: 'damaged-part', instruction: t('planning.diagnose_step_damaged_part') },
  ], [t]);
  const cameraLabels = useMemo(() => ({
    cameraPermissionTitle: t('planning.camera_permission_title'),
    cameraPermissionDescription: t('planning.camera_permission_desc'),
    allowCamera: t('planning.camera_allow'),
    close: t('common.cancel'),
    closeCamera: t('common.cancel'),
    turnFlashOn: t('planning.camera_flash_on'),
    turnFlashOff: t('planning.camera_flash_off'),
    photo: t('planning.camera_photo'),
    continue: t('planning.camera_continue'),
    next: t('planning.camera_continue'),
    retakePhoto: t('planning.detect_retake'),
    takePhoto: t('planning.scan_source_camera'),
  }), [t]);

  const resetPhotoDraft = useCallback(() => {
    setPhotoUri(null);
    setDetectedName(t('planning.unknown_plant'));
    setDetectedPlantMasterId(null);
    setDetectNoMatch(false);
    setIsDetecting(false);
  }, [t]);
  const {
    activeInputRef: detectedNameInputRef,
    close: closePhotoSheet,
  } = useInputModalLifecycle({
    visible: photoOpen,
    onClose: () => setPhotoOpen(false),
    onDiscard: resetPhotoDraft,
  });

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
    closePhotoSheet();
    resetLimit();
    openLibraryMatch(String(matchedPlant._id), {
      mode: 'select',
      from: 'scanner',
      scannedPhotoUri: photoUri ?? undefined,
      scanHistoryId: currentScanIdRef.current ?? undefined,
    });
  }, [closePhotoSheet, openLibraryMatch, photoUri, resetLimit]);

  const applyPickedImage = useCallback(async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    const unknownLabel = t('planning.unknown_plant');
    setDetectedName(unknownLabel);
    setDetectedPlantMasterId(null);
    setDetectNoMatch(false);
    setPhotoOpen(true);

    let finalName = unknownLabel;
    let finalMasterId: string | null = null;

    if (result.assets[0].base64) {
      setIsDetecting(true);
      try {
        const detected = await detectPlantAction({ images: [result.assets[0].base64], locale: i18n.language }) as DetectPlantResponse;
        if (detected?.match?.name) {
          finalName = detected.match.name;
          setDetectedName(finalName);
        }
        finalMasterId = detected?.match?.plantMasterId ? String(detected.match.plantMasterId) : null;
        setDetectedPlantMasterId(finalMasterId);
      } catch (error) {
        const handled = handleScanError(error);
        if (handled) {
          // Not a real scan: drop the draft and show the reason on the source picker.
          closePhotoSheet();
          if (handled === 'limit') setScanSourceOpen(true);
          return;
        }
        console.error('AI detection failed:', error);
      } finally {
        setIsDetecting(false);
      }
    }

    // Save to history immediately after detection
    const isIdentified = finalName.trim().length > 0 && finalName !== unknownLabel;
    try {
      const entry = await addScanEntry({
        photoUri: uri,
        plantName: finalName,
        plantMasterId: finalMasterId,
        userPlantId: null,
        status: isIdentified ? 'identified' : 'unknown',
      });
      currentScanIdRef.current = entry.id;
      notifyScanSaved();
    } catch (err) {
      console.error('Failed to save scan history entry:', err);
    }
  }, [closePhotoSheet, detectPlantAction, handleScanError, i18n.language, notifyScanSaved, t]);

  const handleCaptureFromCamera = useCallback(async () => {
    if (!canStartAiScan()) return;
    setScanSourceOpen(false);

    if (scanMode === 'diagnose') {
      setDiagnosisCameraOpen(true);
      return;
    }

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
  }, [applyPickedImage, canStartAiScan, scanMode, t]);

  const handlePickFromLibrary = useCallback(async () => {
    if (!canStartAiScan()) return;
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
    if (scanMode === 'diagnose') {
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: diagnosisSteps.length,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
      });
      if (result.canceled || !result.assets || result.assets.length !== diagnosisSteps.length) {
        if (!result.canceled) setAiLimitError(t('planning.diagnose_missing_photos'));
        return;
      }
      await applyDiagnosisPhotos(result.assets.map((asset, index) => ({
        stepId: diagnosisSteps[index].id,
        uri: asset.uri,
        base64: asset.base64 ?? null,
      })));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
    });
    await applyPickedImage(result);
  }, [applyDiagnosisPhotos, applyPickedImage, canStartAiScan, diagnosisSteps, scanMode, t]);

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
      const createdPlantId = await createUserPlant({
        nickname: normalizeCustomPlantNickname(detectedName, t('planning.unknown_plant')),
        scannedPhotoUri: photoUri ?? undefined,
      });
      // Update the existing history entry to 'saved'
      if (currentScanIdRef.current) {
        void updateScanEntry(currentScanIdRef.current, {
          status: 'saved',
          userPlantId: String(createdPlantId),
        }).then(notifyScanSaved);
        currentScanIdRef.current = null;
      }
      closePhotoSheet();
      resetLimit();
      setDetectNoMatch(false);
    } finally {
      setPhotoSaving(false);
    }
  }, [canEdit, closePhotoSheet, createUserPlant, detectedName, notifyScanSaved, photoUri, resetLimit, t]);

  const openScanner = useCallback(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      promptSignIn(t('planning.scanner_signin_required'));
      return;
    }
    resetLimit();
    if (photoOpen) closePhotoSheet();
    setScanSourceOpen(true);
  }, [closePhotoSheet, isAuthLoading, isAuthenticated, photoOpen, promptSignIn, resetLimit, t]);

  const handleUpgrade = useCallback(() => {
    setScanSourceOpen(false);
    closePhotoSheet();
    void presentPaywall();
  }, [closePhotoSheet, presentPaywall]);

  const handleDiagnosisComplete = useCallback((photos: MultiStepCameraPhoto[]) => {
    void applyDiagnosisPhotos(photos);
  }, [applyDiagnosisPhotos]);

  useEffect(() => {
    if (!photoOpen) {
      setIsDetecting(false);
      setDetectedPlantMasterId(null);
    }
  }, [photoOpen]);

  useFocusEffect(
    useCallback(() => {
      resetLimit();
      return () => {
        resetLimit();
        setScanSourceOpen(false);
        setPhotoOpen(false);
      };
    }, [resetLimit])
  );

  const limitNotice = aiLimitReached ? (
    <AiScanLimitNotice isPremium={isPremium} limit={scanQuota?.limit} onUpgrade={handleUpgrade} />
  ) : null;

  const scanSourceModal = (
    <Modal
      visible={scanSourceOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setScanSourceOpen(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setScanSourceOpen(false)} />
        <View testID="e2e-scanner-source-modal" style={{ width: '70%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)' }}>
          <View style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]} pointerEvents="none">
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
            <Text testID="e2e-scanner-source-title" style={{ fontSize: 18, fontWeight: '500', color: theme.text, letterSpacing: -0.3, textAlign: 'center' }}>
              {t('planning.scan_source_title')}
            </Text>
            {!!scanQuota && !aiLimitReached && (
              <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'center' }}>
                {t('planning.detect_quota_remaining', { remaining: scanQuota.remaining, limit: scanQuota.limit })}
              </Text>
            )}
            {limitNotice}
            <TouchableOpacity
              testID="e2e-scanner-source-camera"
              style={{ borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.primary }}
              onPress={() => { void handleCaptureFromCamera(); }}
            >
              <Text style={{ color: '#fff', fontWeight: '500', fontSize: 15 }}>{t('planning.scan_source_camera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="e2e-scanner-source-library"
              style={{ borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.accent }}
              onPress={() => { void handlePickFromLibrary(); }}
            >
              <Text style={{ color: theme.textAccent, fontWeight: '500', fontSize: 15 }}>{t('planning.scan_source_library')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="e2e-scanner-source-cancel"
              style={{ borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background }}
              onPress={() => setScanSourceOpen(false)}
            >
              <Text style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 15 }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const photoModal = (
    <InputSheet
      visible={photoOpen}
      title={t('planning.detect_title')}
      onClose={closePhotoSheet}
      closeTestID="e2e-scanner-photo-close"
      contentContainerStyle={{ gap: 20 }}
    >
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={{ width: '100%', height: 220, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
              resizeMode="cover"
            />
          )}
          <View style={{ gap: 12 }}>
            <Text style={{ fontSize: 13, color: theme.textSecondary, fontWeight: '500', textAlign: 'center' }}>{t('planning.detect_hint')}</Text>
            <TextInput
              ref={detectedNameInputRef}
              testID="e2e-scanner-detected-name"
              style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
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
              <Text style={{ fontSize: 12, color: theme.success, textAlign: 'center', fontWeight: '500' }}>
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
                <Text style={{ color: '#fff', fontWeight: '500', fontSize: 13 }}>
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
                <Text style={{ color: theme.textAccent, fontWeight: '500', fontSize: 14 }}>{t('planning.detect_retake')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background }}
                onPress={() => {
                  closePhotoSheet();
                  openLibrarySelect({
                    mode: 'select',
                    from: 'scanner',
                    scannedPhotoUri: photoUri ?? undefined,
                    scanHistoryId: currentScanIdRef.current ?? undefined,
                    searchQuery: detectedName.trim(),
                    tab: 'plants',
                  });
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '500', fontSize: 14 }}>{t('planning.scan_source_library')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.primary, opacity: photoSaving ? 0.6 : 1 }}
                disabled={photoSaving}
                onPress={handleSaveAsUnknown}
              >
                {photoSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '500', fontSize: 14 }}>{t('planning.detect_save_unknown')}</Text>
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
              <Text style={{ color: theme.textAccent, fontWeight: '500', fontSize: 15 }}>{t('planning.detect_retake')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canEdit || photoSaving || isDetecting) ? 0.6 : 1 }}
              disabled={!canEdit || photoSaving || isDetecting}
              onPress={handleSavePhotoPlant}
            >
              {(photoSaving || isDetecting) ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '500', fontSize: 15 }}>{t('planning.detect_save')}</Text>
              )}
            </TouchableOpacity>
          </View>
    </InputSheet>
  );

  const diagnosisResultModal = (
    <InputSheet
      visible={diagnosisResultOpen}
      title={t('planning.diagnose_result_title')}
      onClose={() => {
        setDiagnosisResultOpen(false);
        setDiagnosisPhotos([]);
        setAiSessionActive(false);
      }}
      contentContainerStyle={{ gap: 16 }}
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {diagnosisPhotos.map((photo) => (
          <Image
            key={photo.stepId}
            source={{ uri: photo.uri }}
            style={{ flex: 1, height: 130, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
            resizeMode="cover"
          />
        ))}
      </View>
      {isDiagnosing ? (
        <ActivityIndicator color={theme.primary} />
      ) : diagnosisResult ? (
        <>
          {!!diagnosisResult.plantName && (
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
              {diagnosisResult.plantName}
            </Text>
          )}
          <View style={{ borderRadius: 12, padding: 14, backgroundColor: theme.accent, gap: 8 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
              {t('planning.diagnose_assessment')}: {diagnosisResult.assessment ?? 'unknown'}
            </Text>
            <Text style={{ color: theme.text, fontSize: 15, lineHeight: 22 }}>
              {diagnosisResult.diagnosis ?? t('planning.diagnose_no_result')}
            </Text>
            {typeof diagnosisResult.confidence === 'number' ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {t('planning.diagnose_confidence', { percent: Math.round(diagnosisResult.confidence * 100) })}
              </Text>
            ) : null}
          </View>
          {diagnosisResult.causes?.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('planning.diagnose_causes')}</Text>
              {diagnosisResult.causes.map((item) => (
                <Text key={item} style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>• {item}</Text>
              ))}
            </View>
          ) : null}
          {diagnosisResult.recommendedActions?.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('planning.diagnose_actions')}</Text>
              {diagnosisResult.recommendedActions.map((item) => (
                <Text key={item} style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>• {item}</Text>
              ))}
            </View>
          ) : null}
          {diagnosisResult.prevention?.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('planning.diagnose_prevention')}</Text>
              {diagnosisResult.prevention.map((item) => (
                <Text key={item} style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>• {item}</Text>
              ))}
            </View>
          ) : null}
          <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 17 }}>
            {t('planning.diagnose_disclaimer')}
          </Text>
        </>
      ) : null}
    </InputSheet>
  );

  const scannerModals = useMemo(() => (
    <>
      {mounted && scanSourceModal}
      {mounted && photoModal}
      {mounted && (
        <MultiStepCamera
          visible={diagnosisCameraOpen}
          steps={diagnosisSteps}
          title={t('planning.scan_mode_diagnose')}
          labels={cameraLabels}
          onClose={() => setDiagnosisCameraOpen(false)}
          onComplete={handleDiagnosisComplete}
        />
      )}
      {mounted && diagnosisResultModal}
    </>
  ), [diagnosisCameraOpen, diagnosisResultModal, diagnosisSteps, handleDiagnosisComplete, mounted, photoModal, scanSourceModal, t]);

  return { openScanner, scannerModals, onScanSaved };
}

const styles = StyleSheet.create({
  glassTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 12,
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
    borderRadius: 12,
  },
});
