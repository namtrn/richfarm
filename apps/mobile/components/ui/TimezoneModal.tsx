import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Search, X, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../lib/theme';

// Common timezones list
const TIMEZONES = [
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Algiers', 'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Caracas', 'America/Chicago', 'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York', 'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto', 'America/Vancouver',
  'Asia/Almaty', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Baku', 'Asia/Bangkok', 'Asia/Beirut', 'Asia/Colombo', 'Asia/Damascus', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kabul', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Muscat', 'Asia/Novosibirsk', 'Asia/Rangoon', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Tashkent', 'Asia/Tbilisi', 'Asia/Tehran', 'Asia/Tokyo', 'Asia/Ulaanbaatar', 'Asia/Yerevan',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin', 'Europe/Brussels', 'Europe/Bucharest', 'Europe/Budapest', 'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Helsinki', 'Europe/Istanbul', 'Europe/Kiev', 'Europe/Lisbon', 'Europe/London', 'Europe/Luxembourg', 'Europe/Madrid', 'Europe/Monaco', 'Europe/Moscow', 'Europe/Oslo', 'Europe/Paris', 'Europe/Prague', 'Europe/Reykjavik', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Guadalcanal', 'Pacific/Honolulu', 'Pacific/Noumea', 'Pacific/Port_Moresby', 'UTC'
];

function getGmtOffset(timezone: string): string {
  if (timezone.startsWith('GMT')) return timezone;
  if (timezone === 'UTC') return 'GMT+0';
  
  try {
    const now = new Date();
    const tzString = now.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' });
    const offset = tzString.split(' ').pop();
    return offset?.startsWith('GMT') ? offset : 'GMT';
  } catch (e) {
    return 'GMT';
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedTimezone: string;
  onSelect: (timezone: string) => void;
};

export function TimezoneModal({ visible, onClose, selectedTimezone, onSelect }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const filteredTimezones = useMemo(() => {
    if (!search.trim()) return TIMEZONES;
    const lowerSearch = search.toLowerCase();
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(lowerSearch));
  }, [search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.content, { backgroundColor: theme.card }]}>
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
          
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              {t('profile.timezone_label')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.accent, borderColor: theme.border }]}>
            <Search size={18} color={theme.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('profile.timezone_search_placeholder', { defaultValue: 'Search timezone...' })}
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <X size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filteredTimezones}
            keyExtractor={(item) => item}
            initialNumToRender={20}
            renderItem={({ item }) => {
              const active = item === selectedTimezone;
              return (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={[
                    styles.item,
                    { borderBottomColor: theme.accent }
                  ]}
                >
                  <Text 
                    style={[
                      styles.itemText,
                      { color: active ? theme.primary : theme.text, fontWeight: active ? '700' : '400' }
                    ]}
                    numberOfLines={1}
                  >
                    {`${item.replace(/_/g, ' ')} (${getGmtOffset(item)})`}
                  </Text>
                  {active && <Check size={18} color={theme.primary} />}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    height: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  listContent: {
    paddingBottom: 40,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  itemText: {
    flex: 1,
    fontSize: 13,
  },
});
