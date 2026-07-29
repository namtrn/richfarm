import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/core/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('home.eyebrow')}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{t('home.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('home.subtitle')}</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('pendulum.title')}</Text>
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
          {t('pendulum.description')}
        </Text>
        <Link href="/lesson/pendulum" asChild>
          <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.primaryButtonText}>{t('home.startLesson')}</Text>
          </Pressable>
        </Link>
        <Link href="/lab/pendulum" asChild>
          <Pressable style={[styles.secondaryButton, { borderColor: colors.border }]}>
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {t('home.openLab')}
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 12 },
  eyebrow: { marginTop: 24, fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 36, fontWeight: '800', lineHeight: 42 },
  subtitle: { fontSize: 17, lineHeight: 25, marginBottom: 20 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 14 },
  cardTitle: { fontSize: 24, fontWeight: '700' },
  cardBody: { fontSize: 16, lineHeight: 23 },
  primaryButton: { borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'center' },
  secondaryButtonText: { fontSize: 16, fontWeight: '700' },
});
