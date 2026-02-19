// Shared seed data for plantsMaster, plantGroups, and plantI18n

export const plantGroupsSeed = [
    { key: "herbs", displayName: { en: "Herbs" }, sortOrder: 1 },
    { key: "vegetables", displayName: { en: "Vegetables" }, sortOrder: 2 },
    { key: "fruits", displayName: { en: "Fruits" }, sortOrder: 3 },
    { key: "nightshades", displayName: { en: "Nightshades" }, sortOrder: 4 },
    { key: "alliums", displayName: { en: "Alliums" }, sortOrder: 5 },
    { key: "leafy_greens", displayName: { en: "Leafy Greens" }, sortOrder: 6 },
    { key: "roots", displayName: { en: "Root Vegetables" }, sortOrder: 7 },
    { key: "legumes", displayName: { en: "Legumes" }, sortOrder: 8 },
    { key: "indoor", displayName: { en: "Indoor Plants" }, sortOrder: 9 },
    { key: "flowers", displayName: { en: "Flowers" }, sortOrder: 10 },
];

const SQ_CM_PER_M2 = 10000;
function deriveMaxPlantsPerM2(spacingCm?: number) {
    if (!spacingCm || spacingCm <= 0) return undefined;
    const perM2 = SQ_CM_PER_M2 / (spacingCm * spacingCm);
    return Math.round(perM2 * 10) / 10;
}

const INCH_TO_L_PER_M2 = 25.4;
function normalizeKey(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const WATER_INCHES_BY_COMMON: Record<string, [number, number]> = {
    "basil": [1, 1.5],
    "beans": [1, 1.5],
    "common bean": [1, 1.5],
    "yard long bean": [1, 1.5],
    "beetroot": [1, 2],
    "broccoli": [0.5, 1.5],
    "cabbage": [1, 2],
    "napa cabbage": [1, 2],
    "carrot": [1, 2],
    "cauliflower": [0.5, 1.5],
    "celery": [1, 2],
    "coriander": [1, 1.5],
    "culantro": [1, 1.5],
    "cucumber": [1, 2],
    "dill": [1, 1.5],
    "eggplant": [1, 2],
    "garlic": [1, 1.5],
    "green onion": [1, 1.5],
    "lettuce": [1, 2],
    "mint": [1, 2],
    "mustard": [1, 2],
    "bok choy": [1, 2],
    "oregano": [1, 1.5],
    "parsley": [1, 1.5],
    "pea": [0.5, 1],
    "peanut": [1, 2],
    "perilla shiso": [1, 1.5],
    "bell pepper": [1, 2],
    "bird s eye chili": [1, 2],
    "radish": [0.5, 1],
    "rosemary": [1, 1.5],
    "spinach": [1, 2],
    "squash": [1, 2],
    "zucchini": [1, 2],
    "strawberry": [1, 2],
    "thyme": [1, 1.5],
    "tomato": [1, 2],
    "water spinach": [1, 2],
    "watermelon": [1, 2],
    "melon": [1, 2],
};

const DEFAULT_WATER_RANGE_INCHES: [number, number] = [1, 2];

const YIELD_QT_HA_BY_COMMON: Record<string, [number, number]> = {
    "cabbage": [250, 300],
    "napa cabbage": [250, 300],
    "cauliflower": [200, 250],
    "pea": [80, 100],
    "common bean": [100, 125],
    "yard long bean": [100, 125],
    "bird s eye chili": [75, 90],
    "bell pepper": [60, 70],
    "eggplant": [150, 200],
    "lettuce": [60, 70],
    "celery": [60, 75],
    "mustard": [60, 75],
    "cucumber": [60, 70],
    "pumpkin": [60, 75],
    "carrot": [125, 200],
    "radish": [200, 250],
    "beetroot": [150, 200],
    "garlic": [60, 100],
    "green onion": [100, 120],
    "tomato": [200, 250],
    "turnip": [150, 200],
};

function toWaterLitersPerM2(commonName?: string) {
    const key = commonName ? normalizeKey(commonName) : "";
    const range = WATER_INCHES_BY_COMMON[key] ?? DEFAULT_WATER_RANGE_INCHES;
    const avgInches = (range[0] + range[1]) / 2;
    return Math.round(avgInches * INCH_TO_L_PER_M2 * 10) / 10;
}

function toYieldKgPerM2(commonName: string | undefined, fallbackKgPerM2: number) {
    const key = commonName ? normalizeKey(commonName) : "";
    const range = YIELD_QT_HA_BY_COMMON[key];
    const qtHa = range ? (range[0] + range[1]) / 2 : undefined;
    if (qtHa === undefined) return fallbackKgPerM2;
    const kgM2 = qtHa * 0.01;
    return Math.round(kgM2 * 100) / 100;
}

type PlantSeed = {
    scientificName: string;
    group: string;
    purposes: string[];
    typicalDaysToHarvest?: number;
    germinationDays?: number;
    lightRequirements?: string;
    soilPref?: string;
    spacingCm?: number;
    wateringFrequencyDays?: number;
    fertilizingFrequencyDays?: number;
    companionPlants?: string[];
    avoidPlants?: string[];
    pestsDiseases?: string[];
    imageUrl?: string;
    source?: string;
    maxPlantsPerM2?: number;
    seedRatePerM2?: number;
    waterLitersPerM2?: number;
    yieldKgPerM2?: number;
};

const rawPlantsMasterSeed: PlantSeed[] = [
    {
        scientificName: "Ocimum basilicum",
        group: "herbs",
        purposes: ["cooking_spices", "indoor"],
        typicalDaysToHarvest: 60,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Mentha × piperita",
        group: "herbs",
        purposes: ["cooking_spices", "medicinal"],
        typicalDaysToHarvest: 90,
        germinationDays: 10,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Coriandrum sativum",
        group: "herbs",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 45,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Ipomoea aquatica",
        group: "leafy_greens",
        purposes: ["cooking"],
        typicalDaysToHarvest: 30,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 1,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Lactuca sativa",
        group: "leafy_greens",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 45,
        germinationDays: 5,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Brassica rapa subsp. chinensis",
        group: "leafy_greens",
        purposes: ["cooking"],
        typicalDaysToHarvest: 35,
        germinationDays: 5,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Solanum lycopersicum",
        group: "nightshades",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 70,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 60,
        source: "seed",
    },

    {
        scientificName: "Capsicum annuum",
        group: "nightshades",
        purposes: ["cooking"],
        typicalDaysToHarvest: 80,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 45,
        source: "seed",
    },

    {
        scientificName: "Capsicum frutescens",
        group: "nightshades",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 90,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Allium fistulosum",
        group: "alliums",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 60,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Allium sativum",
        group: "alliums",
        purposes: ["cooking_spices", "medicinal"],
        typicalDaysToHarvest: 180,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        source: "bulb",
    },

    {
        scientificName: "Raphanus sativus",
        group: "roots",
        purposes: ["cooking"],
        typicalDaysToHarvest: 60,
        germinationDays: 5,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Daucus carota",
        group: "roots",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 75,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Vigna unguiculata",
        group: "legumes",
        purposes: ["cooking"],
        typicalDaysToHarvest: 60,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 30,
        source: "seed",
    },

    {
        scientificName: "Cucumis sativus",
        group: "vegetables",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 55,
        germinationDays: 5,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 45,
        source: "seed",
    },

    {
        scientificName: "Momordica charantia",
        group: "vegetables",
        purposes: ["cooking", "medicinal"],
        typicalDaysToHarvest: 60,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Aloe vera",
        group: "indoor",
        purposes: ["medicinal", "cosmetic", "indoor"],
        typicalDaysToHarvest: 365,
        germinationDays: 0,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 7,
        fertilizingFrequencyDays: 60,
        source: "cutting",
    },

    {
        scientificName: "Chlorophytum comosum",
        group: "indoor",
        purposes: ["indoor", "air_purifying"],
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 5,
        fertilizingFrequencyDays: 30,
        source: "cutting",
    },

    {
        scientificName: "Perilla frutescens",
        group: "herbs",
        purposes: ["cooking_spices", "medicinal"],
        typicalDaysToHarvest: 60,
        germinationDays: 10,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Eryngium foetidum",
        group: "herbs",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 70,
        germinationDays: 14,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Rosmarinus officinalis",
        group: "herbs",
        purposes: ["cooking_spices", "indoor"],
        typicalDaysToHarvest: 90,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        source: "seed",
    },

    {
        scientificName: "Thymus vulgaris",
        group: "herbs",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 80,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        source: "seed",
    },

    {
        scientificName: "Origanum vulgare",
        group: "herbs",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 80,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        source: "seed",
    },

    {
        scientificName: "Petroselinum crispum",
        group: "herbs",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 70,
        germinationDays: 14,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Anethum graveolens",
        group: "herbs",
        purposes: ["cooking_spices"],
        typicalDaysToHarvest: 50,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Brassica oleracea var. capitata",
        group: "leafy_greens",
        purposes: ["cooking"],
        typicalDaysToHarvest: 90,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 45,
        source: "seed",
    },

    {
        scientificName: "Brassica oleracea var. italica",
        group: "leafy_greens",
        purposes: ["cooking"],
        typicalDaysToHarvest: 80,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 45,
        source: "seed",
    },

    {
        scientificName: "Brassica oleracea var. botrytis",
        group: "leafy_greens",
        purposes: ["cooking"],
        typicalDaysToHarvest: 85,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 45,
        source: "seed",
    },

    {
        scientificName: "Spinacia oleracea",
        group: "leafy_greens",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 40,
        germinationDays: 7,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        source: "seed",
    },

    {
        scientificName: "Brassica rapa subsp. pekinensis",
        group: "leafy_greens",
        purposes: ["cooking"],
        typicalDaysToHarvest: 75,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 35,
        source: "seed",
    },

    {
        scientificName: "Beta vulgaris",
        group: "roots",
        purposes: ["cooking"],
        typicalDaysToHarvest: 70,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Solanum melongena",
        group: "nightshades",
        purposes: ["cooking"],
        typicalDaysToHarvest: 80,
        germinationDays: 10,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 50,
        source: "seed",
    },

    {
        scientificName: "Phaseolus vulgaris",
        group: "legumes",
        purposes: ["cooking"],
        typicalDaysToHarvest: 55,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 25,
        source: "seed",
    },

    {
        scientificName: "Pisum sativum",
        group: "legumes",
        purposes: ["cooking"],
        typicalDaysToHarvest: 60,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 25,
        source: "seed",
    },

    {
        scientificName: "Arachis hypogaea",
        group: "legumes",
        purposes: ["cooking"],
        typicalDaysToHarvest: 120,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        spacingCm: 30,
        source: "seed",
    },

    {
        scientificName: "Cucurbita pepo",
        group: "vegetables",
        purposes: ["cooking"],
        typicalDaysToHarvest: 55,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 60,
        source: "seed",
    },

    {
        scientificName: "Cucurbita moschata",
        group: "vegetables",
        purposes: ["cooking"],
        typicalDaysToHarvest: 90,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 90,
        source: "seed",
    },

    {
        scientificName: "Citrullus lanatus",
        group: "fruits",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 85,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
        spacingCm: 100,
        source: "seed",
    },

    {
        scientificName: "Cucumis melo",
        group: "fruits",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 80,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
        spacingCm: 80,
        source: "seed",
    },

    {
        scientificName: "Fragaria x ananassa",
        group: "fruits",
        purposes: ["salad", "dessert"],
        typicalDaysToHarvest: 90,
        germinationDays: 14,
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        spacingCm: 30,
        source: "seed",
    },

    {
        scientificName: "Citrus limon",
        group: "fruits",
        purposes: ["cooking"],
        typicalDaysToHarvest: 180,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 4,
        fertilizingFrequencyDays: 30,
        source: "seed",
    },

    {
        scientificName: "Citrus sinensis",
        group: "fruits",
        purposes: ["cooking"],
        typicalDaysToHarvest: 200,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 4,
        fertilizingFrequencyDays: 30,
        source: "seed",
    },

    {
        scientificName: "Carica papaya",
        group: "fruits",
        purposes: ["cooking"],
        typicalDaysToHarvest: 240,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 4,
        fertilizingFrequencyDays: 30,
        source: "seed",
    },

    {
        scientificName: "Hibiscus rosa-sinensis",
        group: "flowers",
        purposes: ["ornamental"],
        typicalDaysToHarvest: 120,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        source: "cutting",
    },

    {
        scientificName: "Tagetes erecta",
        group: "flowers",
        purposes: ["ornamental"],
        typicalDaysToHarvest: 70,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Rosa chinensis",
        group: "flowers",
        purposes: ["ornamental"],
        typicalDaysToHarvest: 120,
        germinationDays: 14,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 30,
        source: "cutting",
    },

    {
        scientificName: "Helianthus annuus",
        group: "flowers",
        purposes: ["ornamental"],
        typicalDaysToHarvest: 80,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 21,
        source: "seed",
    },

    {
        scientificName: "Epipremnum aureum",
        group: "indoor",
        purposes: ["indoor", "air_purifying"],
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 5,
        fertilizingFrequencyDays: 30,
        source: "cutting",
    },

    {
        scientificName: "Sansevieria trifasciata",
        group: "indoor",
        purposes: ["indoor", "air_purifying"],
        lightRequirements: "shade",
        wateringFrequencyDays: 10,
        fertilizingFrequencyDays: 60,
        source: "cutting",
    },

    {
        scientificName: "Ficus elastica",
        group: "indoor",
        purposes: ["indoor", "air_purifying"],
        lightRequirements: "partial_shade",
        wateringFrequencyDays: 7,
        fertilizingFrequencyDays: 45,
        source: "cutting",
    },
];

export const plantI18nSeed = [
    {
        scientificName: "Ocimum basilicum",
        locale: "en",
        commonName: "Basil",
        description: "Aromatic herb used in cooking; easy to grow.",
    },

    {
        scientificName: "Mentha × piperita",
        locale: "en",
        commonName: "Mint",
        description: "Cool, aromatic herb; fast-growing and easy to care for.",
    },

    {
        scientificName: "Coriandrum sativum",
        locale: "en",
        commonName: "Coriander",
        description: "Fragrant herb used for leaves and seeds in cooking.",
    },

    {
        scientificName: "Ipomoea aquatica",
        locale: "en",
        commonName: "Water Spinach",
        description: "Fast-growing leafy green that thrives in warm, moist conditions.",
    },

    {
        scientificName: "Lactuca sativa",
        locale: "en",
        commonName: "Lettuce",
        description: "Crisp, cool-season leafy green; great for containers.",
    },

    {
        scientificName: "Brassica rapa subsp. chinensis",
        locale: "en",
        commonName: "Bok Choy",
        description: "Quick-growing leafy brassica with tender stalks.",
    },

    {
        scientificName: "Solanum lycopersicum",
        locale: "en",
        commonName: "Tomato",
        description: "Popular fruiting vegetable with many varieties.",
    },

    {
        scientificName: "Capsicum annuum",
        locale: "en",
        commonName: "Bell Pepper",
        description: "Colorful, sweet peppers; high in vitamin C.",
    },

    {
        scientificName: "Capsicum frutescens",
        locale: "en",
        commonName: "Bird's Eye Chili",
        description: "Small, hot chili peppers; vigorous and productive.",
    },

    {
        scientificName: "Allium fistulosum",
        locale: "en",
        commonName: "Green Onion",
        description: "Mild onion with edible stalks; harvest young or mature.",
    },

    {
        scientificName: "Allium sativum",
        locale: "en",
        commonName: "Garlic",
        description: "Pungent bulb used in cooking; plant cloves in cool season.",
    },

    {
        scientificName: "Raphanus sativus",
        locale: "en",
        commonName: "Daikon Radish",
        description: "Crisp, mild root; good for pickling and soups.",
    },

    {
        scientificName: "Daucus carota",
        locale: "en",
        commonName: "Carrot",
        description: "Sweet, crunchy root rich in beta-carotene.",
    },

    {
        scientificName: "Vigna unguiculata",
        locale: "en",
        commonName: "Yard-long Bean",
        description: "Long, slender pods; heat-tolerant and productive.",
    },

    {
        scientificName: "Cucumis sativus",
        locale: "en",
        commonName: "Cucumber",
        description: "Refreshing fruit; best with consistent moisture and support.",
    },

    {
        scientificName: "Momordica charantia",
        locale: "en",
        commonName: "Bitter Melon",
        description: "Bitter, bumpy fruit used in many cuisines; vigorous vine.",
    },

    {
        scientificName: "Aloe vera",
        locale: "en",
        commonName: "Aloe Vera",
        description: "Succulent with soothing gel; drought-tolerant and low maintenance.",
    },

    {
        scientificName: "Chlorophytum comosum",
        locale: "en",
        commonName: "Spider Plant",
        description: "Easy houseplant that tolerates low light; air-purifying.",
    },

    {
        scientificName: "Perilla frutescens",
        locale: "en",
        commonName: "Perilla / Shiso",
        description: "Aromatic herb with distinctive flavor; grows quickly.",
    },

    {
        scientificName: "Eryngium foetidum",
        locale: "en",
        commonName: "Culantro",
        description: "Strongly aromatic herb with long leaves; heat-tolerant.",
    },

    {
        scientificName: "Rosmarinus officinalis",
        locale: "en",
        commonName: "Rosemary",
        description: "Woody herb with pine-like aroma; prefers sun and well-drained soil.",
    },

    {
        scientificName: "Thymus vulgaris",
        locale: "en",
        commonName: "Thyme",
        description: "Low-growing herb with subtle flavor; drought-tolerant once established.",
    },

    {
        scientificName: "Origanum vulgare",
        locale: "en",
        commonName: "Oregano",
        description: "Aromatic herb popular in Mediterranean cooking.",
    },

    {
        scientificName: "Petroselinum crispum",
        locale: "en",
        commonName: "Parsley",
        description: "Mild, fresh herb; grows well in pots.",
    },

    {
        scientificName: "Anethum graveolens",
        locale: "en",
        commonName: "Dill",
        description: "Feathery herb with anise-like flavor; good for fish and pickles.",
    },

    {
        scientificName: "Brassica oleracea var. capitata",
        locale: "en",
        commonName: "Cabbage",
        description: "Compact heads; cool-season crop.",
    },

    {
        scientificName: "Brassica oleracea var. italica",
        locale: "en",
        commonName: "Broccoli",
        description: "Nutrient-rich brassica with edible florets.",
    },

    {
        scientificName: "Brassica oleracea var. botrytis",
        locale: "en",
        commonName: "Cauliflower",
        description: "Tender curds; prefers cool weather.",
    },

    {
        scientificName: "Spinacia oleracea",
        locale: "en",
        commonName: "Spinach",
        description: "Fast-growing leafy green; prefers cooler temperatures.",
    },

    {
        scientificName: "Brassica rapa subsp. pekinensis",
        locale: "en",
        commonName: "Napa Cabbage",
        description: "Crisp, mild leaves; great for stir-fries and kimchi.",
    },

    {
        scientificName: "Beta vulgaris",
        locale: "en",
        commonName: "Beetroot",
        description: "Sweet, earthy root; edible greens too.",
    },

    {
        scientificName: "Solanum melongena",
        locale: "en",
        commonName: "Eggplant",
        description: "Warm-season plant producing glossy fruits.",
    },

    {
        scientificName: "Phaseolus vulgaris",
        locale: "en",
        commonName: "Common Bean",
        description: "Tender pods; harvest frequently for best yield.",
    },

    {
        scientificName: "Pisum sativum",
        locale: "en",
        commonName: "Pea",
        description: "Cool-season legume with sweet pods and peas.",
    },

    {
        scientificName: "Arachis hypogaea",
        locale: "en",
        commonName: "Peanut",
        description: "Warm-season legume that forms pods underground.",
    },

    {
        scientificName: "Cucurbita pepo",
        locale: "en",
        commonName: "Zucchini",
        description: "Prolific summer squash; harvest young.",
    },

    {
        scientificName: "Cucurbita moschata",
        locale: "en",
        commonName: "Squash",
        description: "Winter squash with sweet, dense flesh; stores well.",
    },

    {
        scientificName: "Citrullus lanatus",
        locale: "en",
        commonName: "Watermelon",
        description: "Large, sweet fruit; needs full sun and space.",
    },

    {
        scientificName: "Cucumis melo",
        locale: "en",
        commonName: "Melon",
        description: "Sweet, aromatic fruit; needs heat and good airflow.",
    },

    {
        scientificName: "Fragaria x ananassa",
        locale: "en",
        commonName: "Strawberry",
        description: "Sweet berries; prefers cool nights and consistent moisture.",
    },

    {
        scientificName: "Citrus limon",
        locale: "en",
        commonName: "Lemon",
        description: "Citrus tree with tart fruit; likes sun and well-drained soil.",
    },

    {
        scientificName: "Citrus sinensis",
        locale: "en",
        commonName: "Orange",
        description: "Citrus tree with sweet fruit; warm, sunny conditions.",
    },

    {
        scientificName: "Carica papaya",
        locale: "en",
        commonName: "Papaya",
        description: "Tropical fruit tree; fast-growing and sun-loving.",
    },

    {
        scientificName: "Hibiscus rosa-sinensis",
        locale: "en",
        commonName: "Hibiscus",
        description: "Showy flowers; blooms with sun and warmth.",
    },

    {
        scientificName: "Tagetes erecta",
        locale: "en",
        commonName: "Marigold",
        description: "Bright annual flowers; easy and pest-deterring.",
    },

    {
        scientificName: "Rosa chinensis",
        locale: "en",
        commonName: "Rose",
        description: "Classic flowering shrub with many varieties.",
    },

    {
        scientificName: "Helianthus annuus",
        locale: "en",
        commonName: "Sunflower",
        description: "Tall annual with large blooms; needs full sun.",
    },

    {
        scientificName: "Epipremnum aureum",
        locale: "en",
        commonName: "Pothos",
        description: "Hardy houseplant; tolerates low light.",
    },

    {
        scientificName: "Sansevieria trifasciata",
        locale: "en",
        commonName: "Snake Plant",
        description: "Tough, drought-tolerant houseplant; low light tolerant.",
    },

    {
        scientificName: "Ficus elastica",
        locale: "en",
        commonName: "Rubber Plant",
        description: "Broad-leaf houseplant; prefers bright, indirect light.",
    },
];

const commonNameByScientific = new Map(
    plantI18nSeed
        .filter((row) => row.locale === "en")
        .map((row) => [row.scientificName, row.commonName] as const)
);

const yieldsByGroup: Record<string, number[]> = {};
for (const plant of rawPlantsMasterSeed) {
    const commonName = commonNameByScientific.get(plant.scientificName);
    const key = commonName ? normalizeKey(commonName) : "";
    const range = YIELD_QT_HA_BY_COMMON[key];
    if (!range) continue;
    const avgQt = (range[0] + range[1]) / 2;
    const kgM2 = avgQt * 0.01;
    const group = plant.group ?? "other";
    if (!yieldsByGroup[group]) yieldsByGroup[group] = [];
    yieldsByGroup[group].push(kgM2);
}

const globalYieldFallback = (() => {
    const all = Object.values(yieldsByGroup).flat();
    if (all.length === 0) return 2.5;
    const avg = all.reduce((sum, v) => sum + v, 0) / all.length;
    return Math.round(avg * 100) / 100;
})();

export const plantsMasterSeed = rawPlantsMasterSeed.map((plant) => {
    const commonName = commonNameByScientific.get(plant.scientificName);
    const maxPlantsPerM2 = plant.maxPlantsPerM2 ?? deriveMaxPlantsPerM2(plant.spacingCm);
    const seedRatePerM2 = maxPlantsPerM2 ? Math.round(maxPlantsPerM2 * 1.2 * 10) / 10 : undefined;
    const waterLitersPerM2 = plant.waterLitersPerM2 ?? toWaterLitersPerM2(commonName);

    const group = plant.group ?? "other";
    const groupValues = yieldsByGroup[group] ?? [];
    const groupFallback =
        groupValues.length > 0
            ? Math.round((groupValues.reduce((sum, v) => sum + v, 0) / groupValues.length) * 100) / 100
            : globalYieldFallback;
    const yieldKgPerM2 = plant.yieldKgPerM2 ?? toYieldKgPerM2(commonName, groupFallback);

    return {
        ...plant,
        ...(maxPlantsPerM2 !== undefined ? { maxPlantsPerM2 } : {}),
        ...(seedRatePerM2 !== undefined ? { seedRatePerM2 } : {}),
        ...(waterLitersPerM2 !== undefined ? { waterLitersPerM2 } : {}),
        ...(yieldKgPerM2 !== undefined ? { yieldKgPerM2 } : {}),
    };
});
