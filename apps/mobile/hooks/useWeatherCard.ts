import { useMemo } from 'react';
import { buildWeatherCardModel, MOCK_WEATHER_SNAPSHOT } from '../features/weather/weatherLogic';

export function useWeatherCard() {
    const model = useMemo(() => buildWeatherCardModel(MOCK_WEATHER_SNAPSHOT), []);

    return {
        model,
        isLoading: false,
    };
}
