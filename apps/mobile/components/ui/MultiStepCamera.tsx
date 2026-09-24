import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Camera, Check, Sun, X } from '../../lib/icons';

export type MultiStepCameraStep = {
  id: string;
  instruction: string;
};

export type MultiStepCameraPhoto = {
  stepId: string;
  uri: string;
  base64: string | null;
};

type MultiStepCameraProps = {
  visible: boolean;
  steps: readonly MultiStepCameraStep[];
  onClose: () => void;
  onComplete: (photos: MultiStepCameraPhoto[]) => void;
  title?: string;
  labels?: Partial<MultiStepCameraLabels>;
};

export type MultiStepCameraLabels = {
  cameraPermissionTitle: string;
  cameraPermissionDescription: string;
  allowCamera: string;
  close: string;
  closeCamera: string;
  turnFlashOn: string;
  turnFlashOff: string;
  photo: string;
  continue: string;
  next: string;
  retakePhoto: string;
  takePhoto: string;
};

const DEFAULT_LABELS: MultiStepCameraLabels = {
  cameraPermissionTitle: 'Camera access is required',
  cameraPermissionDescription: 'Allow camera access to capture the guided plant photos.',
  allowCamera: 'Allow camera',
  close: 'Close',
  closeCamera: 'Close camera',
  turnFlashOn: 'Turn flash on',
  turnFlashOff: 'Turn flash off',
  photo: 'Photo',
  continue: 'Continue',
  next: 'Next',
  retakePhoto: 'Retake photo',
  takePhoto: 'Take photo',
};

type PhotoRecord = Record<string, MultiStepCameraPhoto>;

/**
 * Reusable camera flow for one or more guided photos.
 *
 * The caller controls the step configuration, so a one-photo identity scan
 * and a two-photo diagnosis can share the same capture behavior without
 * sharing their business logic.
 */
export function MultiStepCamera({
  visible,
  steps,
  onClose,
  onComplete,
  title,
  labels: labelOverrides,
}: MultiStepCameraProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [photos, setPhotos] = useState<PhotoRecord>({});
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...labelOverrides }), [labelOverrides]);

  const activeStep = steps[activeIndex] ?? steps[0];
  const activePhoto = activeStep ? photos[activeStep.id] : undefined;
  const capturedPhotos = useMemo(
    () => steps.map((step) => photos[step.id]).filter(Boolean) as MultiStepCameraPhoto[],
    [photos, steps]
  );
  const allStepsComplete = steps.length > 0 && capturedPhotos.length === steps.length;

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(0);
    setPhotos({});
    setIsCapturing(false);
    setFlashEnabled(false);
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission, visible]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !activeStep || isCapturing) return;
    setIsCapturing(true);
    try {
      const captured: CameraCapturedPicture | undefined = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        shutterSound: true,
      });
      if (!captured?.uri) return;

      setPhotos((current) => ({
        ...current,
        [activeStep.id]: {
          stepId: activeStep.id,
          uri: captured.uri,
          base64: captured.base64 ?? null,
        },
      }));

      // Once a step is captured, move the guide to the next empty slot. This
      // is the key behavior for Diagnose: whole plant -> damaged part.
      const nextIndex = steps.findIndex((step, index) => index > activeIndex && !photos[step.id]);
      if (nextIndex >= 0) setActiveIndex(nextIndex);
    } finally {
      setIsCapturing(false);
    }
  }, [activeIndex, activeStep, isCapturing, photos, steps]);

  const handleContinue = useCallback(() => {
    if (!activeStep || !activePhoto) return;
    if (!allStepsComplete) {
      const nextIndex = steps.findIndex((step, index) => index > activeIndex && !photos[step.id]);
      if (nextIndex >= 0) setActiveIndex(nextIndex);
      return;
    }
    onComplete(capturedPhotos);
  }, [activeIndex, activePhoto, activeStep, allStepsComplete, capturedPhotos, onComplete, photos, steps]);

  const handleSelectStep = useCallback((index: number) => {
    if (steps[index]) setActiveIndex(index);
  }, [steps]);

  if (!activeStep) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            flash={flashEnabled ? 'on' : 'off'}
          />
        ) : (
          <View style={styles.permissionFallback}>
            {permission === null ? <ActivityIndicator color="#fff" /> : null}
            {permission && !permission.granted ? (
              <>
                <Text style={styles.permissionTitle}>{labels.cameraPermissionTitle}</Text>
                <Text style={styles.permissionDescription}>
                  {labels.cameraPermissionDescription}
                </Text>
                {permission.canAskAgain ? (
                  <TouchableOpacity style={styles.permissionButton} onPress={() => { void requestPermission(); }}>
                    <Text style={styles.permissionButtonText}>{labels.allowCamera}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.permissionCloseButton} onPress={onClose}>
                  <Text style={styles.permissionCloseText}>{labels.close}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        )}

        <SafeAreaView style={styles.overlay} pointerEvents="box-none">
          <View style={styles.topBar}>
            <TouchableOpacity
              accessibilityLabel={labels.closeCamera}
              onPress={onClose}
              style={styles.iconButton}
            >
              <X size={28} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            {title ? <Text style={styles.title}>{title}</Text> : <View />}
            <TouchableOpacity
              accessibilityLabel={flashEnabled ? labels.turnFlashOff : labels.turnFlashOn}
              onPress={() => setFlashEnabled((enabled) => !enabled)}
              style={styles.iconButton}
            >
              <Sun size={24} color={flashEnabled ? '#ffd166' : '#fff'} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={styles.guideArea} pointerEvents="none">
            <View style={styles.guideCornerTopLeft} />
            <View style={styles.guideCornerTopRight} />
            <View style={styles.guideCornerBottomLeft} />
            <View style={styles.guideCornerBottomRight} />
          </View>

          <View style={styles.instructionPill}>
            <Text style={styles.instructionText}>{activeStep.instruction}</Text>
          </View>

          <View style={styles.bottomPanel}>
            <View style={styles.stepRow}>
              {steps.map((step, index) => {
                const photo = photos[step.id];
                const isActive = index === activeIndex;
                return (
                  <Pressable
                    key={step.id}
                    accessibilityLabel={`${labels.photo} ${index + 1}`}
                    onPress={() => handleSelectStep(index)}
                    style={[styles.thumbnailSlot, isActive && styles.thumbnailSlotActive]}
                  >
                    {photo ? (
                      <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
                    ) : (
                      <Text style={styles.thumbnailNumber}>{index + 1}</Text>
                    )}
                    {photo ? (
                      <View style={styles.thumbnailCheck}>
                        <Check size={12} color="#173b2b" strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={allStepsComplete ? labels.continue : labels.next}
                onPress={handleContinue}
                disabled={!activePhoto || isCapturing}
                style={[styles.continueButton, (!activePhoto || isCapturing) && styles.disabledButton]}
              >
                <Text style={styles.continueText}>{allStepsComplete ? labels.continue : labels.next}</Text>
              </TouchableOpacity>
            </View>

            {permission?.granted ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={activePhoto ? labels.retakePhoto : labels.takePhoto}
                onPress={() => { void handleCapture(); }}
                disabled={isCapturing}
                style={styles.shutterButton}
              >
                <View style={styles.shutterInner}>
                  {isCapturing ? <ActivityIndicator color="#173b2b" /> : <Camera size={30} color="#173b2b" strokeWidth={2.5} />}
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  guideArea: {
    position: 'absolute',
    top: '23%',
    left: 34,
    right: 34,
    bottom: '30%',
  },
  guideCornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 82, height: 7, borderTopLeftRadius: 8, backgroundColor: '#fff' },
  guideCornerTopRight: { position: 'absolute', top: 0, right: 0, width: 82, height: 7, borderTopRightRadius: 8, backgroundColor: '#fff' },
  guideCornerBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 82, height: 7, borderBottomLeftRadius: 8, backgroundColor: '#fff' },
  guideCornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 82, height: 7, borderBottomRightRadius: 8, backgroundColor: '#fff' },
  instructionPill: {
    alignSelf: 'center',
    marginTop: '13%',
    maxWidth: '82%',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 32,
    backgroundColor: 'rgba(55,55,55,0.88)',
  },
  instructionText: { color: '#fff', fontSize: 19, fontWeight: '600', textAlign: 'center' },
  bottomPanel: {
    marginHorizontal: 0,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(32,32,32,0.88)',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnailSlot: {
    width: 74,
    height: 74,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  thumbnailSlotActive: { borderColor: '#63c69d', borderWidth: 3 },
  thumbnail: { width: '100%', height: '100%', borderRadius: 10 },
  thumbnailNumber: { color: 'rgba(255,255,255,0.8)', fontSize: 22, fontWeight: '700' },
  thumbnailCheck: {
    position: 'absolute',
    top: -9,
    right: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#63c69d',
  },
  continueButton: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 18,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2f9b76',
  },
  disabledButton: { opacity: 0.45 },
  continueText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  shutterButton: { alignSelf: 'center', marginTop: 18, width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#63c69d', alignItems: 'center', justifyContent: 'center' },
  permissionFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, backgroundColor: '#111' },
  permissionTitle: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  permissionDescription: { color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
  permissionButton: { marginTop: 24, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 24, backgroundColor: '#2f9b76' },
  permissionButtonText: { color: '#fff', fontWeight: '700' },
  permissionCloseButton: { marginTop: 14, padding: 10 },
  permissionCloseText: { color: 'rgba(255,255,255,0.72)', fontWeight: '600' },
});
