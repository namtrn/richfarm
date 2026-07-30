import { Pressable, Text, View } from 'react-native';
import Toast, { type ToastConfigParams } from 'react-native-toast-message';
import { AlertTriangle, Bell, CheckCircle, X } from '../../lib/icons';
import { useTheme } from '../../lib/theme';
import type { RichToastTone } from '../../lib/toast';
import { useTranslation } from 'react-i18next';

type RichToastProps = {
  tone?: RichToastTone;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

function RichToast({
  text1,
  text2,
  hide,
  props,
}: ToastConfigParams<RichToastProps>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const tone = props.tone ?? 'info';
  const visual = tone === 'success'
    ? { Icon: CheckCircle, accent: theme.success, surface: theme.successBg }
    : tone === 'warning'
      ? { Icon: AlertTriangle, accent: theme.warning, surface: theme.warningBg }
      : tone === 'error'
        ? { Icon: AlertTriangle, accent: theme.danger, surface: theme.dangerBg }
        : { Icon: Bell, accent: theme.primary, surface: theme.card };
  const { Icon } = visual;

  return (
    <View
      testID={props.testID ?? `toast-${tone}`}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        width: '92%',
        maxWidth: 520,
        minHeight: 68,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: visual.accent,
        backgroundColor: visual.surface,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        shadowColor: '#182016',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
        elevation: 10,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.card,
        }}
      >
        <Icon size={20} color={visual.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }} numberOfLines={2}>
          {text1}
        </Text>
        {!!text2 && (
          <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={3}>
            {text2}
          </Text>
        )}
      </View>
      {!!props.actionLabel && !!props.onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          hitSlop={8}
          onPress={() => {
            props.onAction?.();
          }}
          style={{
            minHeight: 36,
            justifyContent: 'center',
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: visual.accent,
          }}
        >
          <Text style={{ color: visual.accent, fontSize: 12, fontWeight: '800' }}>
            {props.actionLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          hitSlop={10}
          onPress={() => hide()}
          style={{ padding: 4 }}
        >
          <X size={17} color={theme.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

export function RichToastHost() {
  return (
    <Toast
      config={{ richfarm: (params) => <RichToast {...params} /> }}
      topOffset={12}
      visibilityTime={3600}
    />
  );
}
