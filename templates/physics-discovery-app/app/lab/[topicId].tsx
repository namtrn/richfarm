import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/core/theme';
import { PendulumSimulation } from '@/features/simulations/pendulum/PendulumSimulation';

export default function LabScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('lab.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('lab.subtitle')}</Text>
      <PendulumSimulation editableVariables={['length', 'mass', 'angle', 'gravity']} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 8 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 16, lineHeight: 23, marginBottom: 6 },
});
