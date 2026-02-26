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

type WeatherCardProps = {
    model: WeatherCardModel;
};

export function WeatherCard({ model }: WeatherCardProps) {
    const { t } = useTranslation();
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
    const { Icon, badgeStyle, badgeIcon, heroIcon } = resolveConditionAssets(conditionKey);

    return (
        <View style={styles.card}>
            {/* ── Header ── */}
            <View style={styles.header}>
                <View style={styles.locationRow}>
                    <MapPin size={13} stroke="#78716c" />
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
                <StatItem label={t('weather_card.rainfall')} value={`${rainfall} mm`} valueColor="#1d4ed8" />
                <View style={styles.statSep} />
                <StatItem label={t('weather_card.humidity')} value={`${humidity}%`} valueColor="#0369a1" />
                <View style={styles.statSep} />
                <StatItem label={t('weather_card.uv_index')} value={`${uvIndex} (${localizedUvLabel})`} valueColor="#b45309" />
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
                                        backgroundColor: h === 1.0 ? '#1a4731' : h > 0.7 ? '#2d6a4f' : '#95c4a8',
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
    label, value, valueColor,
}: {
    label: string;
    value: string;
    valueColor: string;
}) {
    return (
        <View style={styles.statItem}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
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

function resolveConditionAssets(conditionKey: WeatherConditionKey): ConditionAsset {
    switch (conditionKey) {
        case 'sunny':
            return buildAsset(Sun, '#fef9c3', '#fde68a', '#b45309', '#f59e0b', '#fef08a');
        case 'partly_cloudy':
            return buildAsset(CloudSun, '#fef3c7', '#fde68a', '#b45309', '#f59e0b', '#fef08a');
        case 'mostly_cloudy':
            return buildAsset(Cloudy, '#f3f4f6', '#e5e7eb', '#6b7280', '#9ca3af', '#e5e7eb');
        case 'overcast':
            return buildAsset(Cloud, '#f3f4f6', '#e5e7eb', '#6b7280', '#9ca3af', '#e5e7eb');
        case 'fog':
            return buildAsset(CloudFog, '#f3f4f6', '#e5e7eb', '#6b7280', '#9ca3af', '#e5e7eb');
        case 'drizzle':
            return buildAsset(CloudDrizzle, '#e0f2fe', '#bae6fd', '#0369a1', '#0ea5e9', '#bae6fd');
        case 'light_rain':
            return buildAsset(CloudDrizzle, '#e0f2fe', '#bae6fd', '#0369a1', '#0ea5e9', '#bae6fd');
        case 'rain':
            return buildAsset(CloudRain, '#e0f2fe', '#bae6fd', '#0369a1', '#0ea5e9', '#bae6fd');
        case 'heavy_rain':
            return buildAsset(CloudRainWind, '#e0f2fe', '#bae6fd', '#0369a1', '#0ea5e9', '#bae6fd');
        case 'thunderstorm':
            return buildAsset(CloudLightning, '#eef2ff', '#c7d2fe', '#4338ca', '#6366f1', '#e0e7ff');
        case 'storm':
            return buildAsset(CloudLightning, '#eef2ff', '#c7d2fe', '#4338ca', '#6366f1', '#e0e7ff');
        case 'hail':
            return buildAsset(CloudHail, '#e0f2fe', '#bae6fd', '#0369a1', '#0ea5e9', '#bae6fd');
        case 'wind':
            return buildAsset(Wind, '#ecfeff', '#a5f3fc', '#0e7490', '#06b6d4', '#cffafe');
        case 'tornado':
            return buildAsset(Tornado, '#f3f4f6', '#e5e7eb', '#6b7280', '#9ca3af', '#e5e7eb');
        default:
            return buildAsset(Sun, '#fef9c3', '#fde68a', '#b45309', '#f59e0b', '#fef08a');
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

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: '#e7e0d6',
        shadowColor: '#1a1a18',
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
        color: '#78716c',
        fontWeight: '500',
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#fef9c3',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#fde68a',
    },
    badgeText: {
        fontSize: 11,
        color: '#b45309',
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
        color: '#1c1917',
        letterSpacing: -1.5,
        lineHeight: 40,
    },
    tempUnit: {
        fontSize: 16,
        fontWeight: '600',
        color: '#78716c',
        marginTop: 6,
        marginLeft: 2,
    },
    sunIconWrapper: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#fefce8',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#fde68a',
    },
    feelsLike: {
        fontSize: 13,
        color: '#a8a29e',
        fontWeight: '400',
    },

    // stats
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#f0ebe3',
        paddingTop: 10,
        marginTop: 2,
    },
    statSep: {
        width: 1,
        height: 28,
        backgroundColor: '#f0ebe3',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
        gap: 3,
    },
    statLabel: {
        fontSize: 9,
        color: '#a8a29e',
        fontWeight: '700',
        letterSpacing: 0.6,
        textAlign: 'center',
    },
    statValue: {
        fontSize: 13,
        fontWeight: '700',
        textAlign: 'center',
    },

    // soil projection
    soilCard: {
        backgroundColor: '#f8f6f2',
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
        color: '#1c1917',
        letterSpacing: 0.8,
    },
    soilBadge: {
        backgroundColor: '#d1fae5',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: '#6ee7b7',
    },
    soilBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#065f46',
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
        color: '#78716c',
        lineHeight: 16,
    },
});
