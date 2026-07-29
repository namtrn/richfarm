import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { ExperimentVariable } from '@/features/lessons/model';
import { angleAtTime, periodSeconds, type PendulumParameters } from './physics';
import { useTheme } from '@/core/theme';

const presets: Record<ExperimentVariable, number[]> = {
  length: [0.25, 0.5, 1, 1.5],
  mass: [0.1, 0.5, 1],
  angle: [10, 20, 35],
  gravity: [1.62, 3.71, 9.81],
};

type Props = {
  editableVariables: ExperimentVariable[];
  requirePrediction?: boolean;
};

export function PendulumSimulation({ editableVariables, requirePrediction = false }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [parameters, setParameters] = useState<PendulumParameters>({
    lengthMeters: 1,
    massKg: 0.5,
    angleDegrees: 20,
    gravity: 9.81,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [predictionMade, setPredictionMade] = useState(!requirePrediction);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!isPlaying) return;
    startedAt.current = Date.now() - elapsed * 1000;
    const timer = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 33);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const angle = isPlaying ? angleAtTime(elapsed, parameters) : parameters.angleDegrees;
  const radians = (angle * Math.PI) / 180;
  const pivotX = 160;
  const pivotY = 32;
  const visualLength = 105 * Math.min(parameters.lengthMeters, 1.5);
  const bobX = pivotX + Math.sin(radians) * visualLength;
  const bobY = pivotY + Math.cos(radians) * visualLength;
  const period = useMemo(() => periodSeconds(parameters), [parameters]);

  const choose = (variable: ExperimentVariable, value: number) => {
    setElapsed(0);
    if (variable === 'length') setParameters((p) => ({ ...p, lengthMeters: value }));
    if (variable === 'mass') setParameters((p) => ({ ...p, massKg: value }));
    if (variable === 'angle') setParameters((p) => ({ ...p, angleDegrees: value }));
    if (variable === 'gravity') setParameters((p) => ({ ...p, gravity: value }));
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Svg width="100%" height={205} viewBox="0 0 320 205">
        <Line x1={75} y1={22} x2={245} y2={22} stroke={colors.border} strokeWidth={5} />
        <Line x1={pivotX} y1={pivotY} x2={bobX} y2={bobY} stroke={colors.text} strokeWidth={2} />
        <Circle cx={bobX} cy={bobY} r={11 + parameters.massKg * 3} fill={colors.primary} />
      </Svg>

      {requirePrediction && !predictionMade ? (
        <View style={styles.predictionRow}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Your prediction:</Text>
          {['Faster', 'Slower'].map((label) => (
            <Pressable
              key={label}
              onPress={() => setPredictionMade(true)}
              style={[styles.chip, { borderColor: colors.primary }]}
            >
              <Text style={{ color: colors.primary }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.result, { color: colors.text }]}>
          {t('simulation.period')}: {period.toFixed(2)} s
        </Text>
      )}

      {editableVariables.map((variable) => (
        <View key={variable} style={styles.controlRow}>
          <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>
            {t(`simulation.${variable}`)}
          </Text>
          <View style={styles.options}>
            {presets[variable].map((value) => (
              <Pressable
                key={value}
                onPress={() => choose(variable, value)}
                style={[styles.chip, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text }}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable
        disabled={!predictionMade}
        onPress={() => setIsPlaying((value) => !value)}
        style={[
          styles.playButton,
          { backgroundColor: predictionMade ? colors.primary : colors.border },
        ]}
      >
        <Text style={styles.playText}>
          {isPlaying ? t('simulation.pause') : t('simulation.play')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 420, borderWidth: 1, borderRadius: 24, padding: 16, gap: 12 },
  result: { textAlign: 'center', fontSize: 20, fontWeight: '800' },
  predictionRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  controlRow: { gap: 8 },
  controlLabel: { fontSize: 13, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  playButton: { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 'auto' },
  playText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
