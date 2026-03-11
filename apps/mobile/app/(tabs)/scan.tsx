import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanSearch, Leaf, ChevronRight, Clock, CheckCircle, HelpCircle, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { usePlantScanner } from '../../hooks/usePlantScanner';
import { useScanHistory } from '../../hooks/useScanHistory';
import { useTheme } from '../../lib/theme';
import type { ScanStatus } from '../../lib/scanHistory';

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status, theme }: { status: ScanStatus; theme: any }) {
  type Cfg = { label: string; color: string; bg: string; Icon: any };
  const cfg: Cfg = status === 'identified'
    ? { label: 'Identified', color: theme.success, bg: theme.successBg, Icon: CheckCircle }
    : status === 'saved'
    ? { label: 'Saved', color: theme.primary, bg: theme.accent, Icon: Leaf }
    : { label: 'Unknown', color: theme.warning, bg: theme.warningBg, Icon: HelpCircle };

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <cfg.Icon size={10} color={cfg.color} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day === 1) return 'Yesterday';
  return `${day}d ago`;
}

function groupLabel(ts: number): string {
  const day = Math.floor((Date.now() - ts) / 86_400_000);
  if (day === 0) return 'Today';
  if (day === 1) return 'Yesterday';
  return `${day} days ago`;
}

// ─── Scan card ───────────────────────────────────────────────────────────────

function ScanCard({ item, theme, onDelete }: { item: any; theme: any; onDelete: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      activeOpacity={0.75}
    >
      {/* Thumbnail */}
      <View style={[styles.thumbnail, { backgroundColor: theme.accent }]}>
        {item.photoUri ? (
          <Image source={{ uri: item.photoUri }} style={styles.thumbnailImg} />
        ) : (
          <Leaf size={22} color={theme.primary} />
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>
          {item.plantName}
        </Text>
        <View style={styles.cardMeta}>
          <Clock size={11} color={theme.textMuted} />
          <Text style={[styles.cardTime, { color: theme.textMuted }]}>
            {formatRelativeTime(item.scannedAt)}
          </Text>
          <StatusBadge status={item.status} theme={theme} />
        </View>
      </View>

      {/* Delete */}
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Trash2 size={15} color={theme.textMuted} />
      </TouchableOpacity>

      <ChevronRight size={15} color={theme.border} />
    </TouchableOpacity>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ theme, onScan }: { theme: any; onScan: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.accent }]}>
        <ScanSearch size={38} color={theme.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No scans yet</Text>
      <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
        Tap the button below to identify your first plant with AI
      </Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ScanScreen() {
  const theme = useTheme();
  const { openScanner, scannerModals, onScanSaved } = usePlantScanner();
  const { history, isLoading, refresh, remove } = useScanHistory();
  const { bottom: safeBottom } = useSafeAreaInsets();

  // Refresh list whenever a scan is saved
  useEffect(() => {
    return onScanSaved(() => { void refresh(); });
  }, [onScanSaved, refresh]);

  // Also refresh when tab is focused (coming back from scanner)
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  // Group by date label, preserving order (newest first)
  const groups: { title: string; data: typeof history }[] = [];
  for (const item of history) {
    const label = groupLabel(item.scannedAt);
    const last = groups[groups.length - 1];
    if (last && last.title === label) {
      last.data.push(item);
    } else {
      groups.push({ title: label, data: [item] });
    }
  }

  // Tab bar floats ~10px above home indicator; FAB sits above it
  const fabBottom = safeBottom + 66 + 16; // 66 ≈ tab bar height, 16 = gap

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Scan History</Text>
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              {isLoading ? '…' : `${history.length} plant${history.length !== 1 ? 's' : ''} scanned`}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Content ── */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : history.length === 0 ? (
        <EmptyState theme={theme} onScan={openScanner} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.title}
          contentContainerStyle={[styles.list, { paddingBottom: fabBottom + 16 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: group }) => (
            <View>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{group.title}</Text>
                <View style={[styles.sectionLine, { backgroundColor: theme.border }]} />
              </View>
              {group.data.map((scan) => (
                <ScanCard
                  key={scan.id}
                  item={scan}
                  theme={theme}
                  onDelete={() => remove(scan.id)}
                />
              ))}
            </View>
          )}
        />
      )}

      {/* ── Floating scan button (always visible) ── */}
      {!isLoading && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary, bottom: fabBottom }]}
          onPress={openScanner}
          activeOpacity={0.85}
        >
          <ScanSearch size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {scannerModals}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 26, fontWeight: '500', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2 },
  headerBadge: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: 16 },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, marginBottom: 10,
  },
  sectionLabel: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionLine: { flex: 1, height: 1 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  thumbnail: {
    width: 50, height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  thumbnailImg: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, gap: 5 },
  cardName: { fontSize: 14, fontWeight: '500', letterSpacing: -0.2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardTime: { fontSize: 11, fontWeight: '500', marginRight: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  badgeText: { fontSize: 10, fontWeight: '500' },

  emptyWrap: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: 20, fontWeight: '500', letterSpacing: -0.4 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '500', fontSize: 15 },

  fab: {
    position: 'absolute',
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
});
