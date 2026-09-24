import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

type Props = {
  isPremium: boolean;
  limit?: number;
  onUpgrade: () => void;
};

/** Shown when today's AI scans are used up. Upgrading is offered, never forced. */
export function AiScanLimitNotice({ isPremium, limit, onUpgrade }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={{ backgroundColor: theme.dangerBg, borderWidth: 1, borderColor: theme.danger, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
      <Text style={{ color: theme.danger, fontSize: 12, textAlign: 'center' }}>
        {t(isPremium ? 'planning.detect_limit_premium' : 'planning.detect_limit_free', { limit: limit ?? '' })}
      </Text>
      {!isPremium && (
        <TouchableOpacity
          style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: theme.primary }}
          onPress={onUpgrade}
        >
          <Text style={{ color: '#fff', fontWeight: '500', fontSize: 13 }}>{t('profile.sub_upgrade')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
