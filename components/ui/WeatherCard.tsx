import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
    MapPin,
    Sun,
    CloudSun,
    Cloudy,
    Cloud,
    CloudFog,
    CloudDrizzle,
    CloudRain,
    CloudRainWind,
    CloudLightning,
    CloudHail,
    Wind,
    Tornado,
} from 'lucide-react-native';
import type { WeatherCardModel, WeatherConditionKey } from '../../features/weather/weatherLogic';
import { useTheme } from '../../lib/theme';
import type { ThemeColors } from '../../lib/theme';
import { useThemeContext } from '../../lib/ThemeContext';

type WeatherCardProps = {
    model: WeatherCardModel;
};

export function WeatherCard({ model }: WeatherCardProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { isDark } = useThemeContext();
    const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
    const statColors = useMemo(
        () => ({
            rainfall: isDark ? '#60a5fa' : '#1d4ed8',
            humidity: isDark ? '#38bdf8' : '#0369a1',
            uv: isDark ? '#fbbf24' : '#b45309',
        }),
        [isDark]
    );
    const {
        location, conditionKey, temperature, feelsLike,
        rainfall, humidity, uvIndex, uvLabel,
        soilStatus, soilBars,
    } = model;
    const localizedCondition = t(`weather_card.condition_${conditionKey}`);
    const normalizedUv = uvLabel.toLowerCase().replace(/\s+/g, '_');
    const localizedUvLabel = t(`weather_card.uv_${normalizedUv}`);
    const normalizedSoilStatus = soilStatus.toLowerCase();
    const localizedSoilStatus = t(`weather_card.soil_status_${normalizedSoilStatus}`);
    const localizedSoilNote =
        rainfall >= 5
            ? t('weather_card.soil_note_rain', { moisture: model.soilMoisture })
            : rainfall >= 1
                ? t('weather_card.soil_note_light_rain', { moisture: model.soilMoisture })
                : t('weather_card.soil_note_no_rain', { moisture: model.soilMoisture });
    const { Icon, badgeStyle, badgeIcon, heroIcon } = useMemo(
        () => resolveConditionAssets(conditionKey, isDark),
        [conditionKey, isDark]
    );

    return (
        <View style={styles.card}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <View style={styles.locationRow}>
                    <MapPin size={13} stroke={theme.textSecondary} />
                    <Text style={styles.locationText}>{location}</Text>
                </View>
                <View style={[styles.badge, badgeStyle.container]}>
                    <Icon size={12} stroke={badgeIcon.stroke} fill={badgeIcon.fill} />
                    <Text style={[styles.badgeText, badgeStyle.text]}>{localizedCondition}</Text>
                </View>
            </View>

            {/* ── Temperature row with sun icon ── */}
            <View style={styles.tempRow}>
                <View style={styles.tempCol}>
                    <View style={styles.tempLeft}>
                        <Text style={styles.tempNumber}>{temperature}°</Text>
                        <Text style={styles.tempUnit}>{t('weather_card.temp_unit')}</Text>
                    </View>
                    <Text style={styles.feelsLike}>{t('weather_card.feels_like', { value: feelsLike })}</Text>
                </View>
                <View style={styles.sunIconWrapper}>
                    <Icon size={38} stroke={heroIcon.stroke} fill={heroIcon.fill} strokeWidth={1.5} />
                </View>
            </View>

            {/* ── Stats (no icons) ── */}
            <View style={styles.statsRow}>
                <StatItem
                    label={t('weather_card.rainfall')}
                    value={`${rainfall} mm`}
                    valueColor={statColors.rainfall}
                    labelColor={theme.textMuted}
                />
                <View style={styles.statSep} />
                <StatItem
                    label={t('weather_card.humidity')}
                    value={`${humidity}%`}
                    valueColor={statColors.humidity}
                    labelColor={theme.textMuted}
                />
                <View style={styles.statSep} />
                <StatItem
                    label={t('weather_card.uv_index')}
                    value={`${uvIndex} (${localizedUvLabel})`}
                    valueColor={statColors.uv}
                    labelColor={theme.textMuted}
                />
            </View>

            {/* ── Soil Moisture Projection ── */}
            <View style={styles.soilCard}>
                <View style={styles.soilHeader}>
                    <Text style={styles.soilTitle}>{t('weather_card.soil_projection')}</Text>
                    <View style={styles.soilBadge}>
                        <Text style={styles.soilBadgeText}>{localizedSoilStatus}</Text>
                    </View>
                </View>

                <View style={styles.barsRow}>
                    {soilBars.map((h, i) => (
                        <View key={i} style={styles.barWrapper}>
                            <View
                                style={[
                                    styles.bar,
                                    {
                                        height: Math.round(h * 52),
                                        backgroundColor:
                                            h === 1.0
                                                ? theme.primary
                                                : h > 0.7
                                                    ? (isDark ? '#2f6f52' : '#2d6a4f')
                                                    : (isDark ? '#3f4f46' : '#95c4a8'),
                                    },
                                ]}
                            />
                        </View>
                    ))}
                </View>

                <Text style={styles.soilNote}>{localizedSoilNote}</Text>
            </View>
        </View>
    );
}

function StatItem({
    label, value, valueColor, labelColor,
}: {
    label: string;
    value: string;
    valueColor: string;
    labelColor: string;
}) {
    return (
        <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
            <Text
                style={{
                    fontSize: 9,
                    color: labelColor,
                    fontWeight: '700',
                    letterSpacing: 0.6,
                    textAlign: 'center',
                }}
            >
                {label}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '700', textAlign: 'center', color: valueColor }}>
                {value}
            </Text>
        </View>
    );
}

type ConditionAsset = {
    Icon: typeof Sun;
    badgeStyle: {
        container: { backgroundColor: string; borderColor: string };
        text: { color: string };
    };
    badgeIcon: { stroke: string; fill?: string };
    heroIcon: { stroke: string; fill?: string };
};

function resolveConditionAssets(conditionKey: WeatherConditionKey, isDark: boolean): ConditionAsset {
    switch (conditionKey) {
        case 'sunny':
            return buildAsset(
                Sun,
                isDark ? '#3f2f07' : '#fef9c3',
                isDark ? '#854d0e' : '#fde68a',
                isDark ? '#fcd34d' : '#b45309',
                '#f59e0b',
                isDark ? '#854d0e' : '#fef08a'
            );
        case 'partly_cloudy':
            return buildAsset(
                CloudSun,
                isDark ? '#3f2f07' : '#fef3c7',
                isDark ? '#854d0e' : '#fde68a',
                isDark ? '#fcd34d' : '#b45309',
                '#f59e0b',
                isDark ? '#854d0e' : '#fef08a'
            );
        case 'mostly_cloudy':
            return buildAsset(
                Cloudy,
                isDark ? '#1f2937' : '#f3f4f6',
                isDark ? '#374151' : '#e5e7eb',
                isDark ? '#cbd5e1' : '#6b7280',
                isDark ? '#cbd5e1' : '#9ca3af',
                isDark ? '#374151' : '#e5e7eb'
            );
        case 'overcast':
            return buildAsset(
                Cloud,
                isDark ? '#1f2937' : '#f3f4f6',
                isDark ? '#374151' : '#e5e7eb',
                isDark ? '#cbd5e1' : '#6b7280',
                isDark ? '#cbd5e1' : '#9ca3af',
                isDark ? '#374151' : '#e5e7eb'
            );
        case 'fog':
            return buildAsset(
                CloudFog,
                isDark ? '#1f2937' : '#f3f4f6',
                isDark ? '#374151' : '#e5e7eb',
                isDark ? '#cbd5e1' : '#6b7280',
                isDark ? '#cbd5e1' : '#9ca3af',
                isDark ? '#374151' : '#e5e7eb'
            );
        case 'drizzle':
            return buildAsset(
                CloudDrizzle,
                isDark ? '#082f49' : '#e0f2fe',
                isDark ? '#155e75' : '#bae6fd',
                isDark ? '#7dd3fc' : '#0369a1',
                '#0ea5e9',
                isDark ? '#164e63' : '#bae6fd'
            );
        case 'light_rain':
            return buildAsset(
                CloudDrizzle,
                isDark ? '#082f49' : '#e0f2fe',
                isDark ? '#155e75' : '#bae6fd',
                isDark ? '#7dd3fc' : '#0369a1',
                '#0ea5e9',
                isDark ? '#164e63' : '#bae6fd'
            );
        case 'rain':
            return buildAsset(
                CloudRain,
                isDark ? '#082f49' : '#e0f2fe',
                isDark ? '#155e75' : '#bae6fd',
                isDark ? '#7dd3fc' : '#0369a1',
                '#0ea5e9',
                isDark ? '#164e63' : '#bae6fd'
            );
        case 'heavy_rain':
            return buildAsset(
                CloudRainWind,
                isDark ? '#082f49' : '#e0f2fe',
                isDark ? '#155e75' : '#bae6fd',
                isDark ? '#7dd3fc' : '#0369a1',
                '#0ea5e9',
                isDark ? '#164e63' : '#bae6fd'
            );
        case 'thunderstorm':
            return buildAsset(
                CloudLightning,
                isDark ? '#1e1b4b' : '#eef2ff',
                isDark ? '#4338ca' : '#c7d2fe',
                isDark ? '#a5b4fc' : '#4338ca',
                '#6366f1',
                isDark ? '#312e81' : '#e0e7ff'
            );
        case 'storm':
            return buildAsset(
                CloudLightning,
                isDark ? '#1e1b4b' : '#eef2ff',
                isDark ? '#4338ca' : '#c7d2fe',
                isDark ? '#a5b4fc' : '#4338ca',
                '#6366f1',
                isDark ? '#312e81' : '#e0e7ff'
            );
        case 'hail':
            return buildAsset(
                CloudHail,
                isDark ? '#082f49' : '#e0f2fe',
                isDark ? '#155e75' : '#bae6fd',
                isDark ? '#7dd3fc' : '#0369a1',
                '#0ea5e9',
                isDark ? '#164e63' : '#bae6fd'
            );
        case 'wind':
            return buildAsset(
                Wind,
                isDark ? '#083344' : '#ecfeff',
                isDark ? '#155e75' : '#a5f3fc',
                isDark ? '#67e8f9' : '#0e7490',
                '#06b6d4',
                isDark ? '#164e63' : '#cffafe'
            );
        case 'tornado':
            return buildAsset(
                Tornado,
                isDark ? '#1f2937' : '#f3f4f6',
                isDark ? '#374151' : '#e5e7eb',
                isDark ? '#cbd5e1' : '#6b7280',
                isDark ? '#cbd5e1' : '#9ca3af',
                isDark ? '#374151' : '#e5e7eb'
            );
        default:
            return buildAsset(
                Sun,
                isDark ? '#3f2f07' : '#fef9c3',
                isDark ? '#854d0e' : '#fde68a',
                isDark ? '#fcd34d' : '#b45309',
                '#f59e0b',
                isDark ? '#854d0e' : '#fef08a'
            );
    }
}

function buildAsset(
    Icon: typeof Sun,
    badgeBg: string,
    badgeBorder: string,
    textColor: string,
    iconStroke: string,
    iconFill?: string,
): ConditionAsset {
    return {
        Icon,
        badgeStyle: {
            container: { backgroundColor: badgeBg, borderColor: badgeBorder },
            text: { color: textColor },
        },
        badgeIcon: { stroke: iconStroke, fill: iconFill },
        heroIcon: { stroke: iconStroke, fill: iconFill },
    };
}

function createStyles(theme: ThemeColors, isDark: boolean) {
    return StyleSheet.create({
    card: {
        backgroundColor: theme.card,
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: theme.border,
        shadowColor: isDark ? '#000000' : '#1a1a18',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        gap: 10,
    },

    // header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    locationText: {
        fontSize: 13,
        color: theme.textSecondary,
        fontWeight: '500',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: theme.accent,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: theme.border,
    },
    badgeText: {
        fontSize: 11,
        color: theme.textAccent,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    // temperature
    tempRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    tempCol: {
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
    },
    tempLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tempNumber: {
        fontSize: 36,
        fontWeight: '800',
        color: theme.text,
        letterSpacing: -1.5,
        lineHeight: 40,
    },
    tempUnit: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.textSecondary,
        marginTop: 6,
        marginLeft: 2,
    },
    sunIconWrapper: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: isDark ? theme.card : '#fefce8',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: isDark ? theme.border : '#fde68a',
    },
    feelsLike: {
        fontSize: 13,
        color: theme.textMuted,
        fontWeight: '400',
    },

    // stats
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: theme.border,
        paddingTop: 10,
        marginTop: 2,
    },
    statSep: {
        width: 1,
        height: 28,
        backgroundColor: theme.border,
    },

    // soil projection
    soilCard: {
        backgroundColor: theme.accent,
        borderRadius: 14,
        padding: 14,
        gap: 10,
    },
    soilHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    soilTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: theme.text,
        letterSpacing: 0.8,
    },
    soilBadge: {
        backgroundColor: theme.successBg,
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: theme.success,
    },
    soilBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: theme.success,
        letterSpacing: 0.5,
    },
    barsRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 5,
        height: 56,
    },
    barWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
        height: 56,
    },
    bar: {
        borderRadius: 5,
        width: '100%',
    },
    soilNote: {
        fontSize: 11,
        color: theme.textSecondary,
        lineHeight: 16,
    },
});
}
