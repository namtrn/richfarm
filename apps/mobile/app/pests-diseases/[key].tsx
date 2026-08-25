import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bug, RefreshCw } from '../../lib/icons';
import { MarkdownText } from '../../components/MarkdownText';
import { PlantImage } from '../../components/ui/PlantImage';
import { usePestDiseaseDetail } from '../../hooks/usePestDiseaseDetail';
import {
  normalizePestDiseaseLocaleParam,
  normalizePestDiseaseRouteParam,
} from '../../lib/pestDiseaseRouting';
import { useTheme } from '../../lib/theme';

type DetailStateViewProps = {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  retry?: boolean;
};

const DetailStateView = memo(function DetailStateView({
  title,
  message,
  actionLabel,
  onAction,
  retry = false,
}: DetailStateViewProps) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: theme.background }}>
      {retry ? <RefreshCw size={44} stroke={theme.textMuted} /> : <Bug size={44} stroke={theme.textMuted} />}
      <Text style={{ marginTop: 16, color: theme.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      <Text style={{ marginTop: 8, color: theme.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={{ marginTop: 20, borderRadius: 10, backgroundColor: theme.primary, paddingHorizontal: 18, paddingVertical: 11 }}
      >
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
});

const InfoSection = memo(function InfoSection({ title, items }: { title: string; items: readonly string[] }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: theme.textAccent, fontSize: 14, fontWeight: '700', marginBottom: 7 }}>{title}</Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}`} style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 4 }}>• {item}</Text>
      ))}
    </View>
  );
});

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function PestDiseaseDetailScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string | string[]; locale?: string | string[] }>();
  const key = normalizePestDiseaseRouteParam(params.key);
  const requestedLocale = normalizePestDiseaseLocaleParam(params.locale);
  const locale = requestedLocale ?? i18n.language?.trim().toLowerCase() ?? 'en';
  const state = usePestDiseaseDetail(key, locale);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/library?tab=pests');
  }, [router]);

  const goHome = useCallback(() => router.replace('/(tabs)/library?tab=pests'), [router]);

  if (state.status === 'invalid') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <DetailStateView
          title={t('health.detail_invalid_title', { defaultValue: 'Invalid health guide' })}
          message={t('health.detail_invalid_message', { defaultValue: 'This pest or disease link is not valid.' })}
          actionLabel={t('health.detail_back_to_library', { defaultValue: 'Back to library' })}
          onAction={goHome}
        />
      </>
    );
  }

  if (state.status === 'loading') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ marginTop: 14, color: theme.textSecondary }}>{t('common.loading')}</Text>
        </View>
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <DetailStateView
          title={t('health.detail_error_title', { defaultValue: 'Could not load this guide' })}
          message={t('health.detail_error_message', { defaultValue: 'Check your connection and try again.' })}
          actionLabel={t('common.retry', { defaultValue: 'Retry' })}
          onAction={state.retry}
          retry
        />
      </>
    );
  }

  if (state.status === 'empty' || !state.detail) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <DetailStateView
          title={t('health.detail_missing_title', { defaultValue: 'Guide not found' })}
          message={t('health.detail_missing_message', { defaultValue: 'This pest or disease is no longer available.' })}
          actionLabel={t('health.detail_back_to_library', { defaultValue: 'Back to library' })}
          onAction={goHome}
        />
      </>
    );
  }

  const detail = state.detail;
  const typeLabel = detail.type === 'disease'
    ? t('library.disease_label', { defaultValue: 'Disease' })
    : t('library.pest_label', { defaultValue: 'Pest' });
  const imageUri = detail.imageUrl ?? undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ headerShown: false, title: detail.localizedName }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.card }}>
        <Pressable accessibilityLabel={t('common.back', { defaultValue: 'Back' })} accessibilityRole="button" onPress={goBack} hitSlop={8} style={{ padding: 6, marginRight: 8 }}>
          <ArrowLeft size={22} stroke={theme.text} />
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 18, fontWeight: '600' }}>{detail.localizedName}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 44 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center' }}>
          <PlantImage uri={imageUri} size={170} borderRadius={16} />
          <Text style={{ marginTop: 12, color: detail.type === 'disease' ? theme.info : theme.danger, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{typeLabel}</Text>
          {detail.localizedName !== detail.name ? <Text style={{ marginTop: 5, color: theme.textMuted, fontSize: 13 }}>{detail.name}</Text> : null}
          {detail.scientificNames.length > 0 ? <Text style={{ marginTop: 5, color: theme.textMuted, fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>{detail.scientificNames.join(', ')}</Text> : null}
        </View>

        {detail.detailContent ? (
          <View style={{ marginTop: 20 }}>
            <MarkdownText>{detail.detailContent}</MarkdownText>
          </View>
        ) : null}
        {detail.description ? <Text style={{ marginTop: 8, color: theme.textSecondary, fontSize: 14, lineHeight: 22 }}>{detail.description}</Text> : null}
        <InfoSection title={t('health.section_identification')} items={detail.identification} />
        <InfoSection title={t('health.section_damage')} items={detail.damage} />
        <InfoSection title={t('health.section_prevention')} items={detail.prevention} />
        <InfoSection title={t('health.section_plants')} items={detail.plantsAffected} />
        <InfoSection title={t('health.section_physical', { defaultValue: 'Physical control' })} items={detail.control.physical} />
        <InfoSection title={t('health.section_organic', { defaultValue: 'Organic control' })} items={detail.control.organic} />
        <InfoSection title={t('health.section_chemical', { defaultValue: 'Chemical control' })} items={detail.control.chemical} />
      </ScrollView>
    </View>
  );
}
