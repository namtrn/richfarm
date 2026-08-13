import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';
import { flattenAdaptationLabels, type AdaptationGroups } from '../../lib/plantDetailMetadata';

type NamedCode = { code: string; name?: string; label?: string };

export type PlantMetadata = {
  purposes?: string[];
  propagationMethods?: string[];
  originCountries?: NamedCode[];
  adaptation?: AdaptationGroups;
};

function MetadataRow({ label, values }: { label: string; values: string[] }) {
  const theme = useTheme();
  if (values.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </Text>
      {values.map((value, index) => (
        <View key={`${value}-${index}`} style={{ backgroundColor: theme.accent, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 }}>
          <Text style={{ fontSize: 12, color: theme.primary, fontWeight: '700' }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function PlantMetadataRows({
  plant,
  propagationLabels,
}: {
  plant: PlantMetadata;
  propagationLabels: string[];
}) {
  const { t } = useTranslation();
  const purposeLabels = (plant.purposes ?? []).map((purpose) =>
    t(`purposes.${purpose}`, { defaultValue: purpose.replace(/_/g, ' ') }),
  );
  const originLabels = (plant.originCountries ?? [])
    .map((country) => country.name?.trim() || country.code?.trim())
    .filter(Boolean);
  const adaptationLabels = flattenAdaptationLabels(plant.adaptation);

  const rows = [
    { key: 'uses', label: t('library.detail_uses', { defaultValue: 'Uses' }), values: purposeLabels },
    { key: 'propagation', label: t('library.detail_propagation', { defaultValue: 'Propagation' }), values: propagationLabels },
    { key: 'origin', label: t('library.detail_origin', { defaultValue: 'Origin' }), values: originLabels },
    { key: 'conditions', label: t('library.detail_growing_conditions', { defaultValue: 'Growing conditions' }), values: adaptationLabels },
  ].filter((row) => row.values.length > 0);

  if (rows.length === 0) return null;
  return (
    <View testID="plant-metadata" style={{ gap: 10, marginBottom: 16 }}>
      {rows.map((row) => <MetadataRow key={row.key} label={row.label} values={row.values} />)}
    </View>
  );
}
