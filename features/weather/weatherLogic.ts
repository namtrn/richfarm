export type WeatherSnapshot = {
    location: string;
    temperatureC: number;
    feelsLikeC?: number;
    rainfallMm?: number;
    humidityPercent?: number;
    uvIndex?: number;
    soilMoisturePercent?: number;
    soilMoistureForecast?: number[];
    conditionKey?: WeatherConditionKey;
};

export type WeatherConditionKey =
    | 'sunny'
    | 'partly_cloudy'
    | 'mostly_cloudy'
    | 'overcast'
    | 'fog'
    | 'drizzle'
    | 'light_rain'
    | 'rain'
    | 'heavy_rain'
    | 'thunderstorm'
    | 'hail'
    | 'storm'
    | 'wind'
    | 'tornado';

export type WeatherCardModel = {
    location: string;
    condition: string;
    conditionKey: WeatherConditionKey;
    temperature: number;
    feelsLike: number;
    rainfall: number;
    humidity: number;
    uvIndex: number;
    uvLabel: string;
    soilMoisture: number;
    soilStatus: string;
    soilNote: string;
    soilBars: number[];
};

export const MOCK_WEATHER_SNAPSHOT: WeatherSnapshot = {
    location: 'Đà Lạt, Lâm Đồng',
    temperatureC: 24,
    feelsLikeC: 22,
    rainfallMm: 3.2,
    humidityPercent: 68,
    uvIndex: 5,
    soilMoisturePercent: 74,
};

const SOIL_PROJECTION_DAYS = 7;
const SOIL_DRYING_PER_DAY = 4;

export function buildWeatherCardModel(snapshot: WeatherSnapshot): WeatherCardModel {
    const temperature = Math.round(snapshot.temperatureC);
    const feelsLike = Math.round(snapshot.feelsLikeC ?? snapshot.temperatureC);
    const rainfall = roundTo(snapshot.rainfallMm ?? 0, 1);
    const humidity = clamp(Math.round(snapshot.humidityPercent ?? 0), 0, 100);
    const uvIndex = Math.max(0, Math.round(snapshot.uvIndex ?? 0));
    const conditionKey = resolveConditionKey({
        override: snapshot.conditionKey,
        temperature,
        rainfall,
        humidity,
    });

    const soilMoisture = clamp(
        Math.round(snapshot.soilMoisturePercent ?? estimateSoilMoisture(rainfall, humidity)),
        0,
        100,
    );

    const soilBars = normalizeSoilBars(
        snapshot.soilMoistureForecast ?? buildSoilProjection(soilMoisture, rainfall),
    );

    return {
        location: snapshot.location,
        condition: getConditionLabel(conditionKey),
        conditionKey,
        temperature,
        feelsLike,
        rainfall,
        humidity,
        uvIndex,
        uvLabel: resolveUvLabel(uvIndex),
        soilMoisture,
        soilStatus: resolveSoilStatus(soilMoisture),
        soilNote: buildSoilNote(soilMoisture, rainfall),
        soilBars,
    };
}

function resolveConditionKey({
    override,
    temperature,
    rainfall,
    humidity,
}: {
    override?: WeatherConditionKey;
    temperature: number;
    rainfall: number;
    humidity: number;
}) {
    if (override) return override;
    if (rainfall >= 25) return 'heavy_rain';
    if (rainfall >= 10) return 'rain';
    if (rainfall >= 3) return 'light_rain';
    if (rainfall >= 0.5) return 'drizzle';
    if (humidity >= 96 && temperature <= 22) return 'fog';
    if (humidity >= 88) return 'overcast';
    if (humidity >= 75) return 'mostly_cloudy';
    if (humidity >= 60) return 'partly_cloudy';
    return 'sunny';
}

function getConditionLabel(key: WeatherConditionKey) {
    switch (key) {
        case 'sunny':
            return 'SUNNY';
        case 'partly_cloudy':
            return 'PARTLY CLOUDY';
        case 'mostly_cloudy':
            return 'MOSTLY CLOUDY';
        case 'overcast':
            return 'OVERCAST';
        case 'fog':
            return 'FOG';
        case 'drizzle':
            return 'DRIZZLE';
        case 'light_rain':
            return 'LIGHT RAIN';
        case 'rain':
            return 'RAIN';
        case 'heavy_rain':
            return 'HEAVY RAIN';
        case 'thunderstorm':
            return 'THUNDERSTORM';
        case 'hail':
            return 'HAIL';
        case 'storm':
            return 'STORM';
        case 'wind':
            return 'WINDY';
        case 'tornado':
            return 'TORNADO';
        default:
            return 'SUNNY';
    }
}

function resolveUvLabel(uvIndex: number) {
    if (uvIndex <= 2) return 'Low';
    if (uvIndex <= 5) return 'Mod';
    if (uvIndex <= 7) return 'High';
    if (uvIndex <= 10) return 'Very High';
    return 'Extreme';
}

function resolveSoilStatus(soilMoisture: number) {
    if (soilMoisture >= 75) return 'WET';
    if (soilMoisture >= 50) return 'OPTIMAL';
    if (soilMoisture >= 35) return 'DRYING';
    return 'DRY';
}

function estimateSoilMoisture(rainfall: number, humidity: number) {
    const rainBoost = Math.min(rainfall * 4, 25);
    const humidityBoost = Math.max((humidity - 55) * 0.35, 0);
    return clamp(35 + rainBoost + humidityBoost, 20, 90);
}

function buildSoilProjection(soilMoisture: number, rainfall: number) {
    const rainBoost = Math.min(rainfall * 2.5, 12);
    const start = clamp(soilMoisture + rainBoost, 20, 95);

    return Array.from({ length: SOIL_PROJECTION_DAYS }, (_, index) => {
        return clamp(start - index * SOIL_DRYING_PER_DAY, 15, 95);
    });
}

function normalizeSoilBars(soilForecast: number[]) {
    const lastValue = soilForecast.length > 0 ? soilForecast[soilForecast.length - 1] : 50;
    const padded = soilForecast.length >= SOIL_PROJECTION_DAYS
        ? soilForecast.slice(0, SOIL_PROJECTION_DAYS)
        : [...soilForecast, ...Array.from({ length: SOIL_PROJECTION_DAYS - soilForecast.length }, () => lastValue)];

    return padded.map((value) => clamp(value / 100, 0.15, 1));
}

function buildSoilNote(soilMoisture: number, rainfall: number) {
    if (rainfall >= 5) {
        return `Rain today should keep soil moisture near ${soilMoisture}% for the next 48 hours.`;
    }
    if (rainfall >= 1) {
        return `Light rain today helps maintain about ${soilMoisture}% soil moisture through tomorrow.`;
    }
    return `No rain today. Expect soil moisture around ${soilMoisture}% to dry over the next 48 hours.`;
}

function roundTo(value: number, decimals: number) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}
