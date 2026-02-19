export type UnitSystem = 'metric' | 'imperial';

const SQM_TO_SQFT = 10.7639;
const CM_TO_IN = 0.3937007874;
const LITER_TO_GAL = 0.2641720524;
const KG_TO_LB = 2.2046226218;

export function resolveUnitSystem(unitSystem?: string, locale?: string, region?: string): UnitSystem {
    if (unitSystem === 'imperial' || unitSystem === 'metric') return unitSystem;
    const normalized = (locale ?? '').toLowerCase();
    const normalizedRegion = (region ?? '').toUpperCase();
    if (normalizedRegion === 'US') return 'imperial';
    if (normalized.includes('en-us')) return 'imperial';
    return 'metric';
}

export function toSqFt(areaM2: number) {
    return areaM2 * SQM_TO_SQFT;
}

export function toSqM(areaFt2: number) {
    return areaFt2 / SQM_TO_SQFT;
}

export function getAreaUnitLabel(unitSystem: UnitSystem) {
    return unitSystem === 'imperial' ? 'ft²' : 'm²';
}

export function getLengthUnitLabel(unitSystem: UnitSystem) {
    return unitSystem === 'imperial' ? 'in' : 'cm';
}

export function getVolumeUnitLabel(unitSystem: UnitSystem) {
    return unitSystem === 'imperial' ? 'gal' : 'L';
}

function formatNumber(value: number) {
    const rounded = Math.round(value * 10) / 10;
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(1);
}

export function formatAreaValue(areaM2: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') return formatNumber(toSqFt(areaM2));
    return formatNumber(areaM2);
}

export function formatArea(areaM2: number, unitSystem: UnitSystem) {
    return `${formatAreaValue(areaM2, unitSystem)} ${getAreaUnitLabel(unitSystem)}`;
}

export function parseAreaInput(value: string, unitSystem: UnitSystem) {
    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return unitSystem === 'imperial' ? toSqM(parsed) : parsed;
}

export function toInches(cm: number) {
    return cm * CM_TO_IN;
}

export function toGallons(liters: number) {
    return liters * LITER_TO_GAL;
}

export function toPounds(kg: number) {
    return kg * KG_TO_LB;
}

export function formatLengthCm(cm: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') return `${formatNumber(toInches(cm))} ${getLengthUnitLabel(unitSystem)}`;
    return `${formatNumber(cm)} ${getLengthUnitLabel(unitSystem)}`;
}

export function formatVolume(liters: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') return `${formatNumber(toGallons(liters))} ${getVolumeUnitLabel(unitSystem)}`;
    return `${formatNumber(liters)} ${getVolumeUnitLabel(unitSystem)}`;
}

export function formatVolumeValue(liters: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') return formatNumber(toGallons(liters));
    return formatNumber(liters);
}

export function parseVolumeInput(value: string, unitSystem: UnitSystem) {
    const cleaned = value.trim().replace(',', '.');
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return unitSystem === 'imperial' ? parsed / LITER_TO_GAL : parsed;
}

export function formatSeedsPerArea(seedsPerM2: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') {
        return `${formatNumber(seedsPerM2 / SQM_TO_SQFT)} seeds/ft²`;
    }
    return `${formatNumber(seedsPerM2)} seeds/m²`;
}

export function formatPlantsPerArea(plantsPerM2: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') {
        return `${formatNumber(plantsPerM2 / SQM_TO_SQFT)} plants/ft²`;
    }
    return `${formatNumber(plantsPerM2)} plants/m²`;
}

export function formatWaterPerArea(litersPerM2: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') {
        const perFt2 = toGallons(litersPerM2) / SQM_TO_SQFT;
        return `${formatNumber(perFt2)} gal/ft²`;
    }
    return `${formatNumber(litersPerM2)} L/m²`;
}

export function formatYieldPerArea(kgPerM2: number, unitSystem: UnitSystem) {
    if (unitSystem === 'imperial') {
        const perFt2 = toPounds(kgPerM2) / SQM_TO_SQFT;
        return `${formatNumber(perFt2)} lb/ft²`;
    }
    return `${formatNumber(kgPerM2)} kg/m²`;
}
