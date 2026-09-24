import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Plus, Calendar, Leaf } from '../../lib/icons';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePlants } from '../../hooks/usePlants';
import { useBeds } from '../../hooks/useBeds';
import { useGardens } from '../../hooks/useGardens';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDeviceId } from '../../lib/deviceId';
import { useAddPlantFlow } from '../../hooks/useAddPlantFlow';
import { useAuthPrompt } from '../../hooks/useAuthPrompt';
import { usePlantScanner } from '../../hooks/usePlantScanner';

import { useTheme } from '../../lib/theme';
import { useAppMode } from '../../hooks/useAppMode';
import { InputSheet } from '../../components/ui/InputSheet';
import { useInputModalLifecycle } from '../../hooks/useInputModalLifecycle';

export default function PlanningScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { appMode } = useAppMode();
  const { plants, isLoading, addPlant } = usePlants();
  const { createUserPlant, openLibrarySelect } = useAddPlantFlow({ addPlant });
  const { beds, isLoading: isBedsLoading } = useBeds();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { deviceId } = useDeviceId();
  const { gardens: gardensQuery } = useGardens();
  const router = useRouter();
  const promptSignIn = useAuthPrompt();
  const { openScanner, scannerModals } = usePlantScanner();
  const params = useLocalSearchParams<{ scanner?: string | string[] }>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  // Guests (not authenticated but having a deviceId) are allowed to edit.
  // isAuthenticated refers to a "signed in" user (Google/Apple).
  const canEdit = !isAuthLoading && (isAuthenticated || !!deviceId);

  useEffect(() => {
    if (appMode === 'gardener') {
      router.replace('/(tabs)/garden');
    }
  }, [appMode, router]);
  const scannerTriggeredRef = useRef(false);
  const gardens = gardensQuery ?? [];
  const isSetupLoading = gardensQuery === undefined || isBedsLoading;
  const hasGardenOrBed = gardens.length > 0 || beds.length > 0;
  const canCreatePlant = canEdit;
  const isSetupRequired = false;

  const plannedPlants = useMemo(
    () => plants.filter((p) => p.status === 'planning' || p.status === 'planting'),
    [plants]
  );

  const resetQuickDraft = useCallback(() => setNickname(''), []);
  const { activeInputRef: nicknameInputRef, close: closeQuickSheet } = useInputModalLifecycle({
    visible: sheetOpen,
    onClose: () => setSheetOpen(false),
    onDiscard: resetQuickDraft,
  });
  const handleAddPlant = async () => {
    if (!canCreatePlant || !nickname.trim()) return;
    setSaving(true);
    try {
      await createUserPlant({ nickname: nickname.trim() });
      closeQuickSheet();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddPlant = () => {
    if (isAuthLoading) return;
    if (!canEdit) {
      promptSignIn(t('planning.auth_warning'));
      return;
    }
    setSheetOpen(true);
  };

  const handleSearchLibrary = () => {
    if (!canCreatePlant) return;
    closeQuickSheet();
    openLibrarySelect({ mode: 'select', from: 'planning' });
  };

  const handleOpenScanSource = () => {
    closeQuickSheet();
    openScanner();
  };

  useEffect(() => {
    const scannerParam = Array.isArray(params.scanner) ? params.scanner[0] : params.scanner;
    if (scannerParam !== '1' || scannerTriggeredRef.current || isAuthLoading) return;
    scannerTriggeredRef.current = true;
    openScanner();
  }, [params.scanner, isAuthLoading, openScanner]);

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
          {!canEdit && (
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
                  testID="e2e-planning-plant-card"
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

      <InputSheet
        visible={sheetOpen}
        title={t('planning.modal_title')}
        onClose={closeQuickSheet}
        closeTestID="e2e-planning-quick-close"
        contentContainerStyle={{ gap: 20, paddingBottom: 20 }}
        footer={(
          <TouchableOpacity
            style={{ backgroundColor: theme.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (!canCreatePlant || !nickname.trim() || saving) ? 0.6 : 1, marginTop: 8 }}
            disabled={!canCreatePlant || !nickname.trim() || saving}
            onPress={handleAddPlant}
            testID="e2e-planning-confirm-add"
          >
            {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' }}>{t('planning.add_confirm')}</Text>}
          </TouchableOpacity>
        )}
      >
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

            </View>

            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{t('planning.quick_input_label')}</Text>
              <TextInput
                ref={nicknameInputRef}
                style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: theme.text }}
                placeholder={t('planning.quick_input_placeholder')}
                placeholderTextColor={theme.textMuted}
                value={nickname}
                onChangeText={setNickname}
                testID="e2e-planning-quick-input"
              />
            </View>

      </InputSheet>

      {scannerModals}
    </>
  );
}
