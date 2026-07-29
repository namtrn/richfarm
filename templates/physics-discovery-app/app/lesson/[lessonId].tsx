import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { pendulumLesson } from '@/features/lessons/content/pendulum';
import { useLessonSession } from '@/features/lessons/state/useLessonSession';
import { PendulumSimulation } from '@/features/simulations/pendulum/PendulumSimulation';
import { useTheme } from '@/core/theme';

export default function LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { getStepIndex, advance, reset } = useLessonSession();
  const stepIndex = getStepIndex(lessonId);
  const step = useMemo(
    () => pendulumLesson.steps[Math.min(stepIndex, pendulumLesson.steps.length - 1)],
    [stepIndex],
  );
  const isComplete = stepIndex >= pendulumLesson.steps.length - 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.progressRow}>
        <Text style={[styles.progress, { color: colors.primary }]}>
          {t('lesson.progress', { current: stepIndex + 1, total: pendulumLesson.steps.length })}
        </Text>
        <Pressable onPress={() => reset(lessonId)}>
          <Text style={{ color: colors.textSecondary }}>{t('common.reset')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.kicker, { color: colors.textSecondary }]}>{step.kind.toUpperCase()}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{t(step.titleKey)}</Text>
      <Text style={[styles.prompt, { color: colors.textSecondary }]}>{t(step.promptKey)}</Text>

      <PendulumSimulation
        editableVariables={step.editableVariables}
        requirePrediction={step.kind === 'prediction'}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => advance(lessonId, pendulumLesson.steps.length)}
        disabled={isComplete}
        style={[
          styles.button,
          { backgroundColor: isComplete ? colors.border : colors.primary },
        ]}
      >
        <Text style={styles.buttonText}>
          {isComplete ? t('lesson.complete') : t('common.continue')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 10 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { fontSize: 13, fontWeight: '700' },
  kicker: { marginTop: 8, fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  title: { fontSize: 28, fontWeight: '800' },
  prompt: { fontSize: 16, lineHeight: 23, marginBottom: 4 },
  button: { borderRadius: 16, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
