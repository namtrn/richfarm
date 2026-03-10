// Shared seed data for plantsMaster, plantGroups, and plantI18n

import { plantI18nLocaleSeed } from "./plantI18n";

export const plantGroupsSeed = [
    { key: "herbs", displayName: { en: "Herbs", vi: "Cay gia vi" }, sortOrder: 1 },
    { key: "vegetables", displayName: { en: "Vegetables", vi: "Rau cu" }, sortOrder: 2 },
    { key: "fruits", displayName: { en: "Fruits", vi: "Cay an trai" }, sortOrder: 3 },
    { key: "nightshades", displayName: { en: "Nightshades", vi: "Ho ca" }, sortOrder: 4 },
    { key: "alliums", displayName: { en: "Alliums", vi: "Ho hanh toi" }, sortOrder: 5 },
    { key: "leafy_greens", displayName: { en: "Leafy Greens", vi: "Rau an la" }, sortOrder: 6 },
    { key: "roots", displayName: { en: "Root Vegetables", vi: "Rau cu an re" }, sortOrder: 7 },
    { key: "legumes", displayName: { en: "Legumes", vi: "Cay ho dau" }, sortOrder: 8 },
    { key: "indoor", displayName: { en: "Indoor Plants", vi: "Cay trong nha" }, sortOrder: 9 },
    { key: "flowers", displayName: { en: "Flowers", vi: "Hoa canh" }, sortOrder: 10 },
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

const DEFAULT_SEED_VARIANT_TOKEN = "__default__";

function normalizeSeedScientificName(value: string) {
    return value
        .toLowerCase()
        .replaceAll("×", "x")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeSeedCultivar(value?: string | null) {
    const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return normalized || DEFAULT_SEED_VARIANT_TOKEN;
}

export function buildPlantSeedKey(input: {
    scientificName: string;
    cultivar?: string | null;
}) {
    return `${normalizeSeedScientificName(input.scientificName)}|${normalizeSeedCultivar(
        input.cultivar
    )}`;
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
    cultivar?: string;
    group: string;
    family?: string;
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

const FAMILY_BY_GENUS: Record<string, string> = {
    Abelmoschus: "Malvaceae",
    Aglaonema: "Araceae",
    Allium: "Amaryllidaceae",
    Alocasia: "Araceae",
    Aloe: "Asphodelaceae",
    Amaranthus: "Amaranthaceae",
    Anethum: "Apiaceae",
    Ananas: "Bromeliaceae",
    Anthriscus: "Apiaceae",
    Anthurium: "Araceae",
    Antirrhinum: "Plantaginaceae",
    Apium: "Apiaceae",
    Arachis: "Fabaceae",
    Arctium: "Asteraceae",
    Artemisia: "Asteraceae",
    Asparagus: "Asparagaceae",
    Basella: "Basellaceae",
    Begonia: "Begoniaceae",
    Benincasa: "Cucurbitaceae",
    Beta: "Amaranthaceae",
    Brassica: "Brassicaceae",
    Bougainvillea: "Nyctaginaceae",
    Cajanus: "Fabaceae",
    Caladium: "Araceae",
    Camellia: "Theaceae",
    Canavalia: "Fabaceae",
    Capsicum: "Solanaceae",
    Carica: "Caricaceae",
    Cichorium: "Asteraceae",
    Chlorophytum: "Asparagaceae",
    Chrysanthemum: "Asteraceae",
    Cicer: "Fabaceae",
    Citrullus: "Cucurbitaceae",
    Citrus: "Rutaceae",
    Colocasia: "Araceae",
    Coriandrum: "Apiaceae",
    Cucumis: "Cucurbitaceae",
    Cucurbita: "Cucurbitaceae",
    Curcuma: "Zingiberaceae",
    Cynara: "Asteraceae",
    Cymbopogon: "Poaceae",
    Daucus: "Apiaceae",
    Dianthus: "Caryophyllaceae",
    Dieffenbachia: "Araceae",
    Dimocarpus: "Sapindaceae",
    Dracaena: "Asparagaceae",
    Epipremnum: "Araceae",
    Eruca: "Brassicaceae",
    Eryngium: "Apiaceae",
    Ficus: "Moraceae",
    Foeniculum: "Apiaceae",
    Fragaria: "Rosaceae",
    Goeppertia: "Marantaceae",
    Glycine: "Fabaceae",
    Helianthus: "Asteraceae",
    Hibiscus: "Malvaceae",
    Hoya: "Apocynaceae",
    Hydrangea: "Hydrangeaceae",
    Impatiens: "Balsaminaceae",
    Ipomoea: "Convolvulaceae",
    Jasminum: "Oleaceae",
    Lablab: "Fabaceae",
    Lactuca: "Asteraceae",
    Lagenaria: "Cucurbitaceae",
    Lavandula: "Lamiaceae",
    Laurus: "Lauraceae",
    Lens: "Fabaceae",
    Litchi: "Sapindaceae",
    Luffa: "Cucurbitaceae",
    Malus: "Rosaceae",
    Mangifera: "Anacardiaceae",
    Manihot: "Euphorbiaceae",
    Matricaria: "Asteraceae",
    Mentha: "Lamiaceae",
    Melissa: "Lamiaceae",
    Momordica: "Cucurbitaceae",
    Monstera: "Araceae",
    Moringa: "Moringaceae",
    Musa: "Musaceae",
    Nelumbo: "Nelumbonaceae",
    Nepeta: "Lamiaceae",
    Nicotiana: "Solanaceae",
    Ocimum: "Lamiaceae",
    Origanum: "Lamiaceae",
    Pachyrhizus: "Fabaceae",
    Passiflora: "Passifloraceae",
    Pastinaca: "Apiaceae",
    Pelargonium: "Geraniaceae",
    Peperomia: "Piperaceae",
    Perilla: "Lamiaceae",
    Persea: "Lauraceae",
    Petroselinum: "Apiaceae",
    Petunia: "Solanaceae",
    Phaseolus: "Fabaceae",
    Phalaenopsis: "Orchidaceae",
    Philodendron: "Araceae",
    Physalis: "Solanaceae",
    Pilea: "Urticaceae",
    Pisum: "Fabaceae",
    Prunus: "Rosaceae",
    Psidium: "Myrtaceae",
    Punica: "Lythraceae",
    Pyrus: "Rosaceae",
    Raphanus: "Brassicaceae",
    Rosa: "Rosaceae",
    Rosmarinus: "Lamiaceae",
    Rubus: "Rosaceae",
    Rumex: "Polygonaceae",
    Salvia: "Lamiaceae",
    Sansevieria: "Asparagaceae",
    Schefflera: "Araliaceae",
    Sechium: "Cucurbitaceae",
    Selenicereus: "Cactaceae",
    Solanum: "Solanaceae",
    Spathiphyllum: "Araceae",
    Spinacia: "Amaranthaceae",
    Stevia: "Asteraceae",
    Syngonium: "Araceae",
    Tagetes: "Asteraceae",
    Thymus: "Lamiaceae",
    Tradescantia: "Commelinaceae",
    Vaccinium: "Ericaceae",
    Valeriana: "Caprifoliaceae",
    Verbena: "Verbenaceae",
    Vigna: "Fabaceae",
    Vicia: "Fabaceae",
    Viola: "Violaceae",
    Vitis: "Vitaceae",
    Zamioculcas: "Araceae",
    Zea: "Poaceae",
    Zingiber: "Zingiberaceae",
};

function extractSeedGenus(scientificName: string) {
    const normalized = scientificName.trim().replace(/[,;]+/g, " ");
    if (!normalized) return "";
    const [firstToken] = normalized.split(/\s+/);
    return firstToken?.trim() ?? "";
}

function inferFamilyFromScientificName(scientificName: string) {
    const genus = extractSeedGenus(scientificName);
    return FAMILY_BY_GENUS[genus] ?? undefined;
}

type CultivarExpansionEntry = {
    scientificName: string;
    cultivars: string[];
};

type SupplementalPlantCatalogEntry = {
    scientificName: string;
    group: string;
    enCommonName: string;
    viCommonName: string;
    purposes: string[];
    cultivars: string[];
    typicalDaysToHarvest?: number;
    germinationDays?: number;
    lightRequirements?: string;
    spacingCm?: number;
    wateringFrequencyDays?: number;
    fertilizingFrequencyDays?: number;
};

type SupplementalPlantCatalogCompactEntry = {
    scientificName: string;
    group: string;
    enCommonName: string;
    viCommonName: string;
    cultivars: string[];
    purposes?: string[];
    typicalDaysToHarvest?: number;
    germinationDays?: number;
    lightRequirements?: string;
    spacingCm?: number;
    wateringFrequencyDays?: number;
    fertilizingFrequencyDays?: number;
};

const SUPPLEMENTAL_GROUP_DEFAULTS: Record<
    string,
    Omit<SupplementalPlantCatalogEntry, "scientificName" | "group" | "enCommonName" | "viCommonName" | "cultivars">
> = {
    herbs: {
        purposes: ["cooking_spices", "medicinal"],
        typicalDaysToHarvest: 80,
        germinationDays: 10,
        lightRequirements: "full_sun",
        spacingCm: 25,
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
    },
    leafy_greens: {
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 45,
        germinationDays: 6,
        lightRequirements: "partial_shade",
        spacingCm: 18,
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
    },
    nightshades: {
        purposes: ["cooking"],
        typicalDaysToHarvest: 95,
        germinationDays: 10,
        lightRequirements: "full_sun",
        spacingCm: 45,
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
    },
    alliums: {
        purposes: ["cooking"],
        typicalDaysToHarvest: 95,
        germinationDays: 8,
        lightRequirements: "full_sun",
        spacingCm: 14,
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
    },
    roots: {
        purposes: ["cooking"],
        typicalDaysToHarvest: 100,
        germinationDays: 10,
        lightRequirements: "full_sun",
        spacingCm: 20,
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
    },
    legumes: {
        purposes: ["cooking"],
        typicalDaysToHarvest: 85,
        germinationDays: 7,
        lightRequirements: "full_sun",
        spacingCm: 25,
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
    },
    vegetables: {
        purposes: ["cooking"],
        typicalDaysToHarvest: 85,
        germinationDays: 7,
        lightRequirements: "full_sun",
        spacingCm: 55,
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
    },
    indoor: {
        purposes: ["ornamental", "indoor"],
        typicalDaysToHarvest: 150,
        germinationDays: 18,
        lightRequirements: "partial_shade",
        spacingCm: 40,
        wateringFrequencyDays: 5,
        fertilizingFrequencyDays: 30,
    },
    fruits: {
        purposes: ["fresh_eating"],
        typicalDaysToHarvest: 140,
        germinationDays: 14,
        lightRequirements: "full_sun",
        spacingCm: 200,
        wateringFrequencyDays: 4,
        fertilizingFrequencyDays: 30,
    },
    flowers: {
        purposes: ["ornamental"],
        typicalDaysToHarvest: 90,
        germinationDays: 10,
        lightRequirements: "full_sun",
        spacingCm: 30,
        wateringFrequencyDays: 3,
        fertilizingFrequencyDays: 21,
    },
};

function makeSupplementalCatalogEntry(
    entry: SupplementalPlantCatalogCompactEntry
): SupplementalPlantCatalogEntry {
    return {
        ...SUPPLEMENTAL_GROUP_DEFAULTS[entry.group],
        ...entry,
        purposes:
            entry.purposes ?? SUPPLEMENTAL_GROUP_DEFAULTS[entry.group]?.purposes ?? ["cooking"],
    };
}

const baseRawPlantsMasterSeed: PlantSeed[] = [
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
        scientificName: "Solanum lycopersicum",
        cultivar: "Roma",
        group: "nightshades",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 75,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 50,
        source: "seed",
    },

    {
        scientificName: "Solanum lycopersicum",
        cultivar: "Beefsteak",
        group: "nightshades",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 85,
        germinationDays: 8,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 65,
        source: "seed",
    },

    {
        scientificName: "Solanum lycopersicum",
        cultivar: "Cherry",
        group: "nightshades",
        purposes: ["cooking", "salad"],
        typicalDaysToHarvest: 65,
        germinationDays: 7,
        lightRequirements: "full_sun",
        wateringFrequencyDays: 2,
        fertilizingFrequencyDays: 14,
        spacingCm: 45,
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

const supplementalPlantCatalogSeed: SupplementalPlantCatalogEntry[] = [
    { scientificName: "Lavandula angustifolia", group: "herbs", enCommonName: "Lavender", viCommonName: "O ai huong", purposes: ["aromatic", "ornamental"], cultivars: ["Munstead", "Hidcote", "Ellagance Purple", "Melissa", "Royal Velvet"], typicalDaysToHarvest: 95, germinationDays: 18, lightRequirements: "full_sun", spacingCm: 35, wateringFrequencyDays: 4, fertilizingFrequencyDays: 28 },
    { scientificName: "Salvia officinalis", group: "herbs", enCommonName: "Sage", viCommonName: "Xa thom", purposes: ["cooking_spices", "medicinal"], cultivars: ["Common", "Berggarten", "Purpurascens", "Tricolor", "Golden"], typicalDaysToHarvest: 80, germinationDays: 14, lightRequirements: "full_sun", spacingCm: 30, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Cymbopogon citratus", group: "herbs", enCommonName: "Lemongrass", viCommonName: "Sa", purposes: ["cooking_spices", "medicinal"], cultivars: ["West Indian", "East Indian", "Cochin", "Krishna", "Pragati"], typicalDaysToHarvest: 90, germinationDays: 12, lightRequirements: "full_sun", spacingCm: 40, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Brassica juncea", group: "leafy_greens", enCommonName: "Mustard Greens", viCommonName: "Cai be xanh", purposes: ["cooking"], cultivars: ["Green Wave", "Red Giant", "Mizuna", "Southern Giant", "Tendergreen"], typicalDaysToHarvest: 40, germinationDays: 5, lightRequirements: "full_sun", spacingCm: 20, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Eruca vesicaria", group: "leafy_greens", enCommonName: "Arugula", viCommonName: "Xa lach rocket", purposes: ["salad", "cooking"], cultivars: ["Astro", "Rocket", "Sylvetta", "Esmee", "Slow Bolt"], typicalDaysToHarvest: 30, germinationDays: 4, lightRequirements: "partial_shade", spacingCm: 15, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Apium graveolens", group: "leafy_greens", enCommonName: "Celery", viCommonName: "Can tay", purposes: ["cooking", "salad"], cultivars: ["Tall Utah", "Golden Self Blanching", "Tango", "Conquistador", "Redventure"], typicalDaysToHarvest: 95, germinationDays: 14, lightRequirements: "full_sun", spacingCm: 25, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Capsicum chinense", group: "nightshades", enCommonName: "Habanero Pepper", viCommonName: "Ot habanero", purposes: ["cooking"], cultivars: ["Orange Habanero", "Red Savina", "Chocolate", "Caribbean Red", "Paper Lantern"], typicalDaysToHarvest: 110, germinationDays: 12, lightRequirements: "full_sun", spacingCm: 45, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Physalis philadelphica", group: "nightshades", enCommonName: "Tomatillo", viCommonName: "Ca tomatillo", purposes: ["cooking"], cultivars: ["Toma Verde", "Purple", "Rio Grande Verde", "Grande Rio", "Milpero"], typicalDaysToHarvest: 85, germinationDays: 7, lightRequirements: "full_sun", spacingCm: 50, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Allium cepa", group: "alliums", enCommonName: "Bulb Onion", viCommonName: "Hanh tay", purposes: ["cooking"], cultivars: ["Yellow Sweet Spanish", "Red Burgundy", "Walla Walla", "Texas Early Grano"], typicalDaysToHarvest: 100, germinationDays: 7, lightRequirements: "full_sun", spacingCm: 12, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Allium porrum", group: "alliums", enCommonName: "Leek", viCommonName: "Tay hanh", purposes: ["cooking"], cultivars: ["American Flag", "King Richard", "Bandit", "Blue Solaise", "Lancelot"], typicalDaysToHarvest: 110, germinationDays: 10, lightRequirements: "full_sun", spacingCm: 15, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Pastinaca sativa", group: "roots", enCommonName: "Parsnip", viCommonName: "Cu cai vang", purposes: ["cooking"], cultivars: ["Hollow Crown", "Gladiator", "Javelin", "Albion", "Tender and True"], typicalDaysToHarvest: 110, germinationDays: 14, lightRequirements: "full_sun", spacingCm: 12, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Brassica rapa subsp. rapa", group: "roots", enCommonName: "Turnip", viCommonName: "Cu cai tron", purposes: ["cooking"], cultivars: ["Purple Top", "Tokyo Cross", "Hakurei", "Golden Ball", "Scarlet Queen"], typicalDaysToHarvest: 45, germinationDays: 5, lightRequirements: "full_sun", spacingCm: 15, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Ipomoea batatas", group: "roots", enCommonName: "Sweet Potato", viCommonName: "Khoai lang", purposes: ["cooking"], cultivars: ["Beauregard", "Jewel", "Japanese Purple", "Okinawan", "Georgia Jet"], typicalDaysToHarvest: 105, germinationDays: 12, lightRequirements: "full_sun", spacingCm: 30, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Glycine max", group: "legumes", enCommonName: "Soybean", viCommonName: "Dau nanh", purposes: ["cooking"], cultivars: ["Envy", "Midori Giant", "Tankuro", "Sayamusume", "Chiba Green"], typicalDaysToHarvest: 85, germinationDays: 6, lightRequirements: "full_sun", spacingCm: 20, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Cicer arietinum", group: "legumes", enCommonName: "Chickpea", viCommonName: "Dau ga", purposes: ["cooking"], cultivars: ["Kabuli", "Desi", "Myles", "Sarah", "CDC Orion"], typicalDaysToHarvest: 95, germinationDays: 8, lightRequirements: "full_sun", spacingCm: 18, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Abelmoschus esculentus", group: "vegetables", enCommonName: "Okra", viCommonName: "Dau bap", purposes: ["cooking"], cultivars: ["Clemson Spineless", "Jambalaya", "Burgundy", "Emerald", "Silver Queen"], typicalDaysToHarvest: 60, germinationDays: 6, lightRequirements: "full_sun", spacingCm: 35, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Luffa aegyptiaca", group: "vegetables", enCommonName: "Luffa", viCommonName: "Muop huong", purposes: ["cooking"], cultivars: ["Smooth Beauty", "Summer Long", "Lucky Boy", "Hybrid Green", "Early White"], typicalDaysToHarvest: 85, germinationDays: 7, lightRequirements: "full_sun", spacingCm: 60, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Benincasa hispida", group: "vegetables", enCommonName: "Wax Gourd", viCommonName: "Bi dao", purposes: ["cooking"], cultivars: ["Large Round", "Winter Giant", "Jade", "Long Green", "Snow White"], typicalDaysToHarvest: 95, germinationDays: 7, lightRequirements: "full_sun", spacingCm: 70, wateringFrequencyDays: 2, fertilizingFrequencyDays: 14 },
    { scientificName: "Monstera deliciosa", group: "indoor", enCommonName: "Monstera", viCommonName: "Trau ba Nam My", purposes: ["ornamental", "indoor"], cultivars: ["Thai Constellation", "Albo Variegata", "Borsigiana", "Mint", "Aurea"], typicalDaysToHarvest: 180, germinationDays: 21, lightRequirements: "partial_shade", spacingCm: 60, wateringFrequencyDays: 5, fertilizingFrequencyDays: 30 },
    { scientificName: "Spathiphyllum wallisii", group: "indoor", enCommonName: "Peace Lily", viCommonName: "Lan y", purposes: ["ornamental", "indoor"], cultivars: ["Domino", "Sensation", "Mauna Loa", "Sweet Chico", "Piccolino"], typicalDaysToHarvest: 150, germinationDays: 18, lightRequirements: "partial_shade", spacingCm: 35, wateringFrequencyDays: 4, fertilizingFrequencyDays: 30 },
    { scientificName: "Mangifera indica", group: "fruits", enCommonName: "Mango", viCommonName: "Xoai", purposes: ["fresh_eating"], cultivars: ["Nam Doc Mai", "Cat Hoa Loc", "Keitt", "Kent", "Irwin"], typicalDaysToHarvest: 150, germinationDays: 14, lightRequirements: "full_sun", spacingCm: 300, wateringFrequencyDays: 5, fertilizingFrequencyDays: 30 },
    { scientificName: "Psidium guajava", group: "fruits", enCommonName: "Guava", viCommonName: "Oi", purposes: ["fresh_eating"], cultivars: ["Ruby Supreme", "White Indian", "Crystal", "Mexican Cream", "Barbie Pink"], typicalDaysToHarvest: 130, germinationDays: 12, lightRequirements: "full_sun", spacingCm: 200, wateringFrequencyDays: 4, fertilizingFrequencyDays: 30 },
    { scientificName: "Passiflora edulis", group: "fruits", enCommonName: "Passion Fruit", viCommonName: "Chanh day", purposes: ["fresh_eating", "juice"], cultivars: ["Frederick", "Possum Purple", "Panama Red", "Sweet Sunrise", "Misty Gem"], typicalDaysToHarvest: 120, germinationDays: 15, lightRequirements: "full_sun", spacingCm: 150, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Jasminum sambac", group: "flowers", enCommonName: "Jasmine", viCommonName: "Hoa nhai", purposes: ["ornamental", "aromatic"], cultivars: ["Maid of Orleans", "Grand Duke", "Belle of India", "Sambac Single", "Arabian Nights"], typicalDaysToHarvest: 120, germinationDays: 18, lightRequirements: "full_sun", spacingCm: 45, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
    { scientificName: "Chrysanthemum morifolium", group: "flowers", enCommonName: "Chrysanthemum", viCommonName: "Cuc mam xoi", purposes: ["ornamental"], cultivars: ["Anastasia", "Spider Bronze", "Snowball", "Yellow Cushion", "Red Charm"], typicalDaysToHarvest: 90, germinationDays: 10, lightRequirements: "full_sun", spacingCm: 25, wateringFrequencyDays: 3, fertilizingFrequencyDays: 21 },
];

const expandedSupplementalPlantCatalogSeed: SupplementalPlantCatalogEntry[] = [
    makeSupplementalCatalogEntry({ scientificName: "Foeniculum vulgare", group: "herbs", enCommonName: "Fennel", viCommonName: "Tieu hoi", cultivars: ["Florence", "Zefa Fino", "Orion", "Solaris", "Finale"] }),
    makeSupplementalCatalogEntry({ scientificName: "Artemisia dracunculus", group: "herbs", enCommonName: "Tarragon", viCommonName: "Ngo om tay", cultivars: ["French", "Russian", "Sativa", "Monarch", "Green Wonder"] }),
    makeSupplementalCatalogEntry({ scientificName: "Laurus nobilis", group: "herbs", enCommonName: "Bay Laurel", viCommonName: "Nguyet que", cultivars: ["Sweet Bay", "Little Ragu", "Saratoga", "California Bay", "Compacta"] }),
    makeSupplementalCatalogEntry({ scientificName: "Anthriscus cerefolium", group: "herbs", enCommonName: "Chervil", viCommonName: "Ngo tuyet", cultivars: ["Curled", "Vertissimo", "Fine Curled", "Brussels Winter", "Plain Leaf"] }),
    makeSupplementalCatalogEntry({ scientificName: "Melissa officinalis", group: "herbs", enCommonName: "Lemon Balm", viCommonName: "Hung chanh tay", cultivars: ["Lime", "Mandarina", "Aurea", "Citronella", "Compact"] }),
    makeSupplementalCatalogEntry({ scientificName: "Stevia rebaudiana", group: "herbs", enCommonName: "Stevia", viCommonName: "Co ngot", cultivars: ["Candy", "Sweet Leaf", "Morita", "Eirete", "Criolla"] }),
    makeSupplementalCatalogEntry({ scientificName: "Nepeta cataria", group: "herbs", enCommonName: "Catnip", viCommonName: "Bạc hà mèo", cultivars: ["Citriodora", "Select Blue", "White Wonder", "Lemon", "Velvet"] }),
    makeSupplementalCatalogEntry({ scientificName: "Matricaria chamomilla", group: "herbs", enCommonName: "Chamomile", viCommonName: "Cuc La Ma", cultivars: ["Bodegold", "German", "Zloty Lan", "Astra", "Chamomilla"] }),
    makeSupplementalCatalogEntry({ scientificName: "Ocimum tenuiflorum", group: "herbs", enCommonName: "Holy Basil", viCommonName: "Hung que tay", cultivars: ["Rama", "Krishna", "Vana", "Kapoor", "Amrita"] }),
    makeSupplementalCatalogEntry({ scientificName: "Brassica oleracea var. sabellica", group: "leafy_greens", enCommonName: "Kale", viCommonName: "Cai kale", cultivars: ["Curly Green", "Red Russian", "Lacinato", "Winterbor", "Scarlet"] }),
    makeSupplementalCatalogEntry({ scientificName: "Cichorium endivia", group: "leafy_greens", enCommonName: "Endive", viCommonName: "Cu cai endive", cultivars: ["Frisee", "Batavian", "Green Curled", "Broadleaf", "Nuance"] }),
    makeSupplementalCatalogEntry({ scientificName: "Cichorium intybus", group: "leafy_greens", enCommonName: "Radicchio", viCommonName: "Xa lach tim", cultivars: ["Chioggia", "Treviso", "Verona", "Indigo", "Rossa di Milano"] }),
    makeSupplementalCatalogEntry({ scientificName: "Rumex acetosa", group: "leafy_greens", enCommonName: "Sorrel", viCommonName: "Rau chua", cultivars: ["Green de Belleville", "Red Veined", "Large Leaf", "Profusion", "Broad Leaf"] }),
    makeSupplementalCatalogEntry({ scientificName: "Basella alba", group: "leafy_greens", enCommonName: "Malabar Spinach", viCommonName: "Mong toi", cultivars: ["Green Stem", "Red Stem", "Rubra", "Select", "Vining Giant"] }),
    makeSupplementalCatalogEntry({ scientificName: "Amaranthus tricolor", group: "leafy_greens", enCommonName: "Amaranth Greens", viCommonName: "Rau den", cultivars: ["Molten Fire", "Josephs Coat", "Red Leaf", "Green Leaf", "Aurora"] }),
    makeSupplementalCatalogEntry({ scientificName: "Brassica rapa subsp. narinosa", group: "leafy_greens", enCommonName: "Tatsoi", viCommonName: "Cai thia", cultivars: ["Rosette", "Green Spoon", "Summer Fest", "Mei Qing", "Tah Tsai"] }),
    makeSupplementalCatalogEntry({ scientificName: "Brassica rapa var. perviridis", group: "leafy_greens", enCommonName: "Komatsuna", viCommonName: "Cai Nhat", cultivars: ["Green Boy", "Summerfest", "Tokyo Bekana", "Tendergreen", "Sharaku"] }),
    makeSupplementalCatalogEntry({ scientificName: "Valeriana locusta", group: "leafy_greens", enCommonName: "Corn Salad", viCommonName: "Xa lach cuu", cultivars: ["Large Dutch", "Vit", "Medaillon", "Favor", "Gala"] }),
    makeSupplementalCatalogEntry({ scientificName: "Solanum tuberosum", group: "nightshades", enCommonName: "Potato", viCommonName: "Khoai tay", cultivars: ["Yukon Gold", "Russet Burbank", "Kennebec", "Red Pontiac", "Purple Majesty"] }),
    makeSupplementalCatalogEntry({ scientificName: "Capsicum baccatum", group: "nightshades", enCommonName: "Aji Pepper", viCommonName: "Ot Aji", cultivars: ["Aji Amarillo", "Lemon Drop", "Bishop Crown", "Aji Pineapple", "Sugar Rush"] }),
    makeSupplementalCatalogEntry({ scientificName: "Capsicum pubescens", group: "nightshades", enCommonName: "Rocoto Pepper", viCommonName: "Ot Rocoto", cultivars: ["Manzano Red", "Canario", "Mini Brown", "Giant Red", "Peron"] }),
    makeSupplementalCatalogEntry({ scientificName: "Solanum muricatum", group: "nightshades", enCommonName: "Pepino Melon", viCommonName: "Dua pepino", cultivars: ["El Camino", "Miski Prolific", "Golden Globe", "Sweet Long", "Valencia"] }),
    makeSupplementalCatalogEntry({ scientificName: "Physalis peruviana", group: "nightshades", enCommonName: "Cape Gooseberry", viCommonName: "Tam bop", cultivars: ["Golden Berry", "Inca Red", "Colombia", "Giant Cape", "Aunt Molly"] }),
    makeSupplementalCatalogEntry({ scientificName: "Nicotiana alata", group: "nightshades", enCommonName: "Flowering Tobacco", viCommonName: "Thuoc la canh", cultivars: ["Lime Green", "Crimson Bedder", "Perfume White", "Domino", "Grandiflora"] }),
    makeSupplementalCatalogEntry({ scientificName: "Capsicum annuum var. glabriusculum", group: "nightshades", enCommonName: "Chiltepin Pepper", viCommonName: "Ot chim", cultivars: ["Wild Tepin", "Pequin", "Sonoran", "Texas Bird", "Fire Drop"] }),
    makeSupplementalCatalogEntry({ scientificName: "Solanum quitoense", group: "nightshades", enCommonName: "Naranjilla", viCommonName: "Ca long", cultivars: ["Baeza", "Quito Orange", "Smooth Giant", "Andean Gold", "Selva"] }),
    makeSupplementalCatalogEntry({ scientificName: "Allium cepa var. aggregatum", group: "alliums", enCommonName: "Shallot", viCommonName: "Hanh tim", cultivars: ["French Gray", "Red Sun", "Matador", "Camelot", "Zebrune"] }),
    makeSupplementalCatalogEntry({ scientificName: "Allium schoenoprasum", group: "alliums", enCommonName: "Chive", viCommonName: "He", cultivars: ["Fine Leaf", "Staro", "Polyvert", "Purly", "Nelly"] }),
    makeSupplementalCatalogEntry({ scientificName: "Allium ampeloprasum", group: "alliums", enCommonName: "Elephant Garlic", viCommonName: "Toi voi", cultivars: ["Giant", "Montana", "Ail Blanc", "Mild Giant", "Tuscan"] }),
    makeSupplementalCatalogEntry({ scientificName: "Allium tuberosum", group: "alliums", enCommonName: "Garlic Chive", viCommonName: "He toa", cultivars: ["Broad Leaf", "Oriental", "Kobold", "Geisha", "Tender"] }),
    makeSupplementalCatalogEntry({ scientificName: "Allium chinense", group: "alliums", enCommonName: "Rakkyo", viCommonName: "Cu kieu", cultivars: ["White Pearl", "Pink Stem", "Summer Bulb", "Tender Pickle", "Mini Pearl"] }),
    makeSupplementalCatalogEntry({ scientificName: "Allium victorialis", group: "alliums", enCommonName: "Victory Onion", viCommonName: "Hanh rung", cultivars: ["Alpine", "Green Spear", "Mountain Star", "Forest Leaf", "Siberian"] }),
    makeSupplementalCatalogEntry({ scientificName: "Manihot esculenta", group: "roots", enCommonName: "Cassava", viCommonName: "Khoai mi", cultivars: ["Golden Stem", "MCol22", "Kasetsart 50", "Rayong 11", "TME 419"] }),
    makeSupplementalCatalogEntry({ scientificName: "Colocasia esculenta", group: "roots", enCommonName: "Taro", viCommonName: "Khoai mon", cultivars: ["Bun Long", "Elepaio", "Mojito", "Black Magic", "Thai Giant"] }),
    makeSupplementalCatalogEntry({ scientificName: "Pachyrhizus erosus", group: "roots", enCommonName: "Jicama", viCommonName: "Cu san", cultivars: ["Cristalina", "Agua Dulce", "Yucatan White", "Morado", "Round Root"] }),
    makeSupplementalCatalogEntry({ scientificName: "Brassica napus var. napobrassica", group: "roots", enCommonName: "Rutabaga", viCommonName: "Cu cai vang", cultivars: ["American Purple Top", "Laurentian", "Helenor", "Joan", "Gowrie"] }),
    makeSupplementalCatalogEntry({ scientificName: "Apium graveolens var. rapaceum", group: "roots", enCommonName: "Celeriac", viCommonName: "Can tay cu", cultivars: ["Brilliant", "Giant Prague", "Monarch", "Prinz", "Balena"] }),
    makeSupplementalCatalogEntry({ scientificName: "Curcuma longa", group: "roots", enCommonName: "Turmeric", viCommonName: "Nghe", cultivars: ["Madras", "Alleppey", "Suvarna", "Prabha", "Roma"] }),
    makeSupplementalCatalogEntry({ scientificName: "Zingiber officinale", group: "roots", enCommonName: "Ginger", viCommonName: "Gung", cultivars: ["Nadia", "Maran", "Rio de Janeiro", "Blue Hawaiian", "Chinese"] }),
    makeSupplementalCatalogEntry({ scientificName: "Arctium lappa", group: "roots", enCommonName: "Burdock", viCommonName: "Nguu bang", cultivars: ["Takinogawa Long", "Watanabe Early", "Cardiff", "Gobou", "Long Root"] }),
    makeSupplementalCatalogEntry({ scientificName: "Vicia faba", group: "legumes", enCommonName: "Fava Bean", viCommonName: "Dau tam", cultivars: ["Windsor", "Aquadulce", "Crimson Flowered", "Broad Windsor", "Express"] }),
    makeSupplementalCatalogEntry({ scientificName: "Lens culinaris", group: "legumes", enCommonName: "Lentil", viCommonName: "Dau lentil", cultivars: ["Pardina", "Eston", "Richlea", "Laird", "Black Beluga"] }),
    makeSupplementalCatalogEntry({ scientificName: "Vigna radiata", group: "legumes", enCommonName: "Mung Bean", viCommonName: "Dau xanh", cultivars: ["KPS1", "VC1973A", "Camden", "Jade AU", "Berken"] }),
    makeSupplementalCatalogEntry({ scientificName: "Cajanus cajan", group: "legumes", enCommonName: "Pigeon Pea", viCommonName: "Dau tri", cultivars: ["ICPL 87", "Asha", "Bahar", "Durga", "Maruti"] }),
    makeSupplementalCatalogEntry({ scientificName: "Lablab purpureus", group: "legumes", enCommonName: "Hyacinth Bean", viCommonName: "Dau vong", cultivars: ["Rongai", "Ruby Moon", "Indian Mix", "White Seeded", "Purple Pod"] }),
    makeSupplementalCatalogEntry({ scientificName: "Phaseolus lunatus", group: "legumes", enCommonName: "Lima Bean", viCommonName: "Dau lima", cultivars: ["Fordhook 242", "Henderson", "Jackson Wonder", "Christmas", "Dixie"] }),
    makeSupplementalCatalogEntry({ scientificName: "Vigna mungo", group: "legumes", enCommonName: "Black Gram", viCommonName: "Dau den xanh", cultivars: ["T9", "PU31", "Uttara", "Pant U19", "Mash 1008"] }),
    makeSupplementalCatalogEntry({ scientificName: "Canavalia ensiformis", group: "legumes", enCommonName: "Jack Bean", viCommonName: "Dau ngua", cultivars: ["White Wonder", "Giant Pod", "Tropical Green", "Robust", "Field Select"] }),
    makeSupplementalCatalogEntry({ scientificName: "Sechium edule", group: "vegetables", enCommonName: "Chayote", viCommonName: "Su su", cultivars: ["Green Pear", "White Pear", "Spineless", "Mexican Cream", "Tayota"] }),
    makeSupplementalCatalogEntry({ scientificName: "Lagenaria siceraria", group: "vegetables", enCommonName: "Bottle Gourd", viCommonName: "Bau", cultivars: ["Long Bottle", "Birdhouse", "Calabash", "Round Green", "Kashi Ganga"] }),
    makeSupplementalCatalogEntry({ scientificName: "Luffa acutangula", group: "vegetables", enCommonName: "Ridge Gourd", viCommonName: "Muop khe", cultivars: ["Pusa Nasdar", "Satputia", "Hybrid Green", "Summer Queen", "Emerald"] }),
    makeSupplementalCatalogEntry({ scientificName: "Asparagus officinalis", group: "vegetables", enCommonName: "Asparagus", viCommonName: "Mang tay", cultivars: ["Mary Washington", "Jersey Knight", "Purple Passion", "UC157", "Millennium"] }),
    makeSupplementalCatalogEntry({ scientificName: "Cynara cardunculus var. scolymus", group: "vegetables", enCommonName: "Artichoke", viCommonName: "Atiso", cultivars: ["Green Globe", "Imperial Star", "Violetto", "Opera", "Colorado Star"] }),
    makeSupplementalCatalogEntry({ scientificName: "Zea mays convar. saccharata", group: "vegetables", enCommonName: "Sweet Corn", viCommonName: "Bap ngot", cultivars: ["Golden Bantam", "Honey Select", "Bodacious", "Peaches and Cream", "Silver Queen"] }),
    makeSupplementalCatalogEntry({ scientificName: "Moringa oleifera", group: "vegetables", enCommonName: "Moringa", viCommonName: "Chum ngay", cultivars: ["PKM1", "ODC3", "Periyakulam 1", "Dwarf", "High Cut"] }),
    makeSupplementalCatalogEntry({ scientificName: "Nelumbo nucifera", group: "vegetables", enCommonName: "Lotus Root", viCommonName: "Ngo sen", cultivars: ["Jade Lotus", "Ruby Stem", "Summer White", "Long Section", "Pond Select"] }),
    makeSupplementalCatalogEntry({ scientificName: "Cucumis metuliferus", group: "vegetables", enCommonName: "Horned Melon", viCommonName: "Dua sung", cultivars: ["Jelly Melon", "Horned King", "Kiwano Gold", "African Orange", "Spiny Star"] }),
    makeSupplementalCatalogEntry({ scientificName: "Musa acuminata", group: "fruits", enCommonName: "Banana", viCommonName: "Chuoi", cultivars: ["Cavendish", "Lady Finger", "Blue Java", "Namwa", "Red Dacca"] }),
    makeSupplementalCatalogEntry({ scientificName: "Ananas comosus", group: "fruits", enCommonName: "Pineapple", viCommonName: "Dua", cultivars: ["Smooth Cayenne", "Queen", "MD2", "Sugarloaf", "Red Spanish"] }),
    makeSupplementalCatalogEntry({ scientificName: "Persea americana", group: "fruits", enCommonName: "Avocado", viCommonName: "Bo", cultivars: ["Hass", "Fuerte", "Reed", "Pinkerton", "Bacon"] }),
    makeSupplementalCatalogEntry({ scientificName: "Vitis vinifera", group: "fruits", enCommonName: "Grape", viCommonName: "Nho", cultivars: ["Thompson Seedless", "Crimson Seedless", "Concord", "Red Globe", "Autumn Royal"] }),
    makeSupplementalCatalogEntry({ scientificName: "Vaccinium corymbosum", group: "fruits", enCommonName: "Blueberry", viCommonName: "Viet quat", cultivars: ["Bluecrop", "Duke", "Legacy", "Aurora", "Sunshine Blue"] }),
    makeSupplementalCatalogEntry({ scientificName: "Rubus idaeus", group: "fruits", enCommonName: "Raspberry", viCommonName: "Mam xoi do", cultivars: ["Heritage", "Caroline", "Tulameen", "Joan J", "Anne"] }),
    makeSupplementalCatalogEntry({ scientificName: "Punica granatum", group: "fruits", enCommonName: "Pomegranate", viCommonName: "Luu", cultivars: ["Wonderful", "Angel Red", "Parfianka", "Eversweet", "Salavatski"] }),
    makeSupplementalCatalogEntry({ scientificName: "Ficus carica", group: "fruits", enCommonName: "Fig", viCommonName: "Sung", cultivars: ["Brown Turkey", "Black Mission", "Celeste", "Kadota", "Chicago Hardy"] }),
    makeSupplementalCatalogEntry({ scientificName: "Malus domestica", group: "fruits", enCommonName: "Apple", viCommonName: "Tao", cultivars: ["Gala", "Fuji", "Granny Smith", "Honeycrisp", "Pink Lady"] }),
    makeSupplementalCatalogEntry({ scientificName: "Pyrus communis", group: "fruits", enCommonName: "Pear", viCommonName: "Le", cultivars: ["Bartlett", "Bosc", "Anjou", "Comice", "Forelle"] }),
    makeSupplementalCatalogEntry({ scientificName: "Prunus persica", group: "fruits", enCommonName: "Peach", viCommonName: "Dao", cultivars: ["Elberta", "Redhaven", "Belle of Georgia", "Contender", "Reliance"] }),
    makeSupplementalCatalogEntry({ scientificName: "Litchi chinensis", group: "fruits", enCommonName: "Lychee", viCommonName: "Vai", cultivars: ["Brewster", "Hak Ip", "Mauritius", "Sweetheart", "Emperor"] }),
    makeSupplementalCatalogEntry({ scientificName: "Dimocarpus longan", group: "fruits", enCommonName: "Longan", viCommonName: "Nhan", cultivars: ["Kohala", "Biew Kiew", "Diamond River", "Sri Chompoo", "Edau"] }),
    makeSupplementalCatalogEntry({ scientificName: "Selenicereus undatus", group: "fruits", enCommonName: "Dragon Fruit", viCommonName: "Thanh long", cultivars: ["Vietnam White", "American Beauty", "Physical Graffiti", "Yellow Dragon", "Purple Haze"] }),
    makeSupplementalCatalogEntry({ scientificName: "Zamioculcas zamiifolia", group: "indoor", enCommonName: "ZZ Plant", viCommonName: "Kim tien", cultivars: ["Raven", "Zenzi", "Lucky Classic", "Super Nova", "Chameleon"] }),
    makeSupplementalCatalogEntry({ scientificName: "Philodendron hederaceum", group: "indoor", enCommonName: "Heartleaf Philodendron", viCommonName: "Trau ba tim", cultivars: ["Brasil", "Micans", "Cream Splash", "Lemon Lime", "Rio"] }),
    makeSupplementalCatalogEntry({ scientificName: "Aglaonema commutatum", group: "indoor", enCommonName: "Chinese Evergreen", viCommonName: "Ngan hau", cultivars: ["Silver Queen", "Maria", "Red Valentine", "Emerald Bay", "Pink Dalmatian"] }),
    makeSupplementalCatalogEntry({ scientificName: "Goeppertia orbifolia", group: "indoor", enCommonName: "Orbifolia", viCommonName: "Duoi cong soc", cultivars: ["Orbifolia", "Big Leaf", "Silver Ring", "Round Wave", "Jungle Moon"] }),
    makeSupplementalCatalogEntry({ scientificName: "Dracaena fragrans", group: "indoor", enCommonName: "Corn Plant", viCommonName: "Thiet moc lan", cultivars: ["Massangeana", "Lemon Lime", "Janet Craig", "Compacta", "Warneckii"] }),
    makeSupplementalCatalogEntry({ scientificName: "Syngonium podophyllum", group: "indoor", enCommonName: "Arrowhead Plant", viCommonName: "Truc bach hop", cultivars: ["White Butterfly", "Neon Robusta", "Pink Splash", "Albo", "Berry"] }),
    makeSupplementalCatalogEntry({ scientificName: "Dieffenbachia seguine", group: "indoor", enCommonName: "Dumb Cane", viCommonName: "Van nien thanh", cultivars: ["Camille", "Tropic Snow", "Reflector", "Compacta", "Carina"] }),
    makeSupplementalCatalogEntry({ scientificName: "Anthurium andraeanum", group: "indoor", enCommonName: "Anthurium", viCommonName: "Hong mon", cultivars: ["Dakota", "Sierra", "Baby Pink", "White Champion", "Tropical Red"] }),
    makeSupplementalCatalogEntry({ scientificName: "Hoya carnosa", group: "indoor", enCommonName: "Wax Plant", viCommonName: "Cam cu", cultivars: ["Krimson Queen", "Krimson Princess", "Compacta", "Chelsea", "Australis"] }),
    makeSupplementalCatalogEntry({ scientificName: "Peperomia obtusifolia", group: "indoor", enCommonName: "Baby Rubber Plant", viCommonName: "Truong sinh", cultivars: ["Green", "Variegata", "Golden Gate", "Marble", "Lemon Lime"] }),
    makeSupplementalCatalogEntry({ scientificName: "Pilea peperomioides", group: "indoor", enCommonName: "Chinese Money Plant", viCommonName: "Dong tien", cultivars: ["Mojito", "Sugar", "Green Wheel", "Mooncoin", "Compact"] }),
    makeSupplementalCatalogEntry({ scientificName: "Schefflera arboricola", group: "indoor", enCommonName: "Dwarf Umbrella Tree", viCommonName: "Ngu gia bi", cultivars: ["Gold Capella", "Trinette", "Luseane", "Compacta", "Janine"] }),
    makeSupplementalCatalogEntry({ scientificName: "Alocasia amazonica", group: "indoor", enCommonName: "Amazonica", viCommonName: "Alocasia amazonica", cultivars: ["Polly", "Bambino", "Ivory Coast", "Aurea", "Dark Star"] }),
    makeSupplementalCatalogEntry({ scientificName: "Caladium bicolor", group: "indoor", enCommonName: "Caladium", viCommonName: "Mon la", cultivars: ["White Queen", "Red Flash", "Florida Sweetheart", "Aaron", "Candidum"] }),
    makeSupplementalCatalogEntry({ scientificName: "Tradescantia zebrina", group: "indoor", enCommonName: "Wandering Dude", viCommonName: "Thai duong", cultivars: ["Silver Plus", "Purpusii", "Quadricolor", "Violet Hill", "Burgundy"] }),
    makeSupplementalCatalogEntry({ scientificName: "Petunia x hybrida", group: "flowers", enCommonName: "Petunia", viCommonName: "Da yen thao", cultivars: ["Wave Purple", "Supertunia Vista", "Daddy Blue", "Dreams Red", "Double Cascade"] }),
    makeSupplementalCatalogEntry({ scientificName: "Pelargonium x hortorum", group: "flowers", enCommonName: "Geranium", viCommonName: "Phong lu", cultivars: ["Maverick Red", "Orbit White", "Calliope Dark Red", "Pinto Premium", "Patriot"] }),
    makeSupplementalCatalogEntry({ scientificName: "Begonia semperflorens", group: "flowers", enCommonName: "Wax Begonia", viCommonName: "Thu hai duong", cultivars: ["Ambassador Scarlet", "Cocktail Vodka", "Sprint Plus", "Victory Rose", "Bada Bing"] }),
    makeSupplementalCatalogEntry({ scientificName: "Impatiens walleriana", group: "flowers", enCommonName: "Impatiens", viCommonName: "Ngoc thao", cultivars: ["Accent Mix", "Super Elfin", "Dazzler", "Beacon Coral", "Imara"] }),
    makeSupplementalCatalogEntry({ scientificName: "Bougainvillea glabra", group: "flowers", enCommonName: "Bougainvillea", viCommonName: "Hoa giay", cultivars: ["Barbara Karst", "California Gold", "Imperial Thai", "Rosenka", "Torch Glow"] }),
    makeSupplementalCatalogEntry({ scientificName: "Camellia japonica", group: "flowers", enCommonName: "Camellia", viCommonName: "Tra my", cultivars: ["Debutante", "Kramer Supreme", "Nuccios Pearl", "Pink Perfection", "Professor Sargent"] }),
    makeSupplementalCatalogEntry({ scientificName: "Hydrangea macrophylla", group: "flowers", enCommonName: "Hydrangea", viCommonName: "Tu cau", cultivars: ["Nikko Blue", "Endless Summer", "Penny Mac", "Bloomstruck", "Mariesii"] }),
    makeSupplementalCatalogEntry({ scientificName: "Phalaenopsis amabilis", group: "flowers", enCommonName: "Moth Orchid", viCommonName: "Lan ho diep", cultivars: ["White Dream", "Moonlight", "Snow Angel", "Pure Love", "Classic White"] }),
    makeSupplementalCatalogEntry({ scientificName: "Antirrhinum majus", group: "flowers", enCommonName: "Snapdragon", viCommonName: "Mong soi", cultivars: ["Rocket Mix", "Madame Butterfly", "Snapshot Yellow", "Liberty Classic", "Twinny Peach"] }),
    makeSupplementalCatalogEntry({ scientificName: "Dianthus caryophyllus", group: "flowers", enCommonName: "Carnation", viCommonName: "Cam chuong", cultivars: ["Chabaud Giant", "Grenadin Red", "Lillipot", "Oscar Mix", "Can Can Scarlet"] }),
    makeSupplementalCatalogEntry({ scientificName: "Viola tricolor", group: "flowers", enCommonName: "Pansy", viCommonName: "Hoa ban", cultivars: ["Delta Yellow", "Matrix Blue", "Majestic Giants", "Cool Wave", "Swiss Giant"] }),
    makeSupplementalCatalogEntry({ scientificName: "Verbena x hybrida", group: "flowers", enCommonName: "Verbena", viCommonName: "Van anh", cultivars: ["Quartz Purple", "Obsession Mix", "Lanai Twister", "Homestead Purple", "Endurascape"] }),
];

const allSupplementalPlantCatalogSeed = [
    ...supplementalPlantCatalogSeed,
    ...expandedSupplementalPlantCatalogSeed,
];

function buildSupplementalRawPlantsSeed(
    entries: SupplementalPlantCatalogEntry[]
): PlantSeed[] {
    return entries.flatMap((entry) => {
        const base: PlantSeed = {
            scientificName: entry.scientificName,
            group: entry.group,
            purposes: entry.purposes,
            typicalDaysToHarvest: entry.typicalDaysToHarvest,
            germinationDays: entry.germinationDays,
            lightRequirements: entry.lightRequirements,
            spacingCm: entry.spacingCm,
            wateringFrequencyDays: entry.wateringFrequencyDays,
            fertilizingFrequencyDays: entry.fertilizingFrequencyDays,
            source: "seed",
        };

        return [
            base,
            ...entry.cultivars.map((cultivar, index) => ({
                ...base,
                cultivar,
                typicalDaysToHarvest:
                    typeof entry.typicalDaysToHarvest === "number"
                        ? Math.max(20, entry.typicalDaysToHarvest + (index - 2) * 4)
                        : undefined,
                spacingCm:
                    typeof entry.spacingCm === "number"
                        ? Math.max(10, entry.spacingCm + (index - 2) * 3)
                        : undefined,
            })),
        ];
    });
}

const supplementalRawPlantsSeed = buildSupplementalRawPlantsSeed(
    allSupplementalPlantCatalogSeed
);

const rawPlantsMasterSeed: PlantSeed[] = [
    ...baseRawPlantsMasterSeed,
    ...supplementalRawPlantsSeed,
];

const cultivarExpansionSeed: CultivarExpansionEntry[] = [
    { scientificName: "Ocimum basilicum", cultivars: ["Genovese", "Thai", "Lemon", "Purple Ruffles", "Sweet"] },
    { scientificName: "Mentha × piperita", cultivars: ["Chocolate", "Orange", "Variegata"] },
    { scientificName: "Coriandrum sativum", cultivars: ["Santo", "Leisure", "Calypso"] },
    { scientificName: "Ipomoea aquatica", cultivars: ["Green Stem", "Red Stem", "Broad Leaf"] },
    { scientificName: "Lactuca sativa", cultivars: ["Romaine", "Butterhead", "Iceberg", "Oakleaf", "Lollo Rosso"] },
    { scientificName: "Brassica rapa subsp. chinensis", cultivars: ["White Stem", "Shanghai Green", "Joi Choi"] },
    { scientificName: "Solanum lycopersicum", cultivars: ["San Marzano", "Brandywine", "Early Girl", "Grape"] },
    { scientificName: "Capsicum annuum", cultivars: ["California Wonder", "Purple Beauty", "Sweet Banana", "Cubanelle"] },
    { scientificName: "Capsicum frutescens", cultivars: ["Thai Bird", "Tabasco", "Piri Piri", "Malagueta"] },
    { scientificName: "Allium fistulosum", cultivars: ["White Lisbon", "Evergreen", "Ishikura", "Parade"] },
    { scientificName: "Allium sativum", cultivars: ["Music", "German Extra Hardy", "California Early", "Elephant"] },
    { scientificName: "Raphanus sativus", cultivars: ["Cherry Belle", "French Breakfast", "Watermelon", "White Icicle"] },
    { scientificName: "Daucus carota", cultivars: ["Nantes", "Danvers", "Imperator", "Chantenay", "Purple Haze"] },
    { scientificName: "Vigna unguiculata", cultivars: ["Red Noodle", "Black Seeded", "Purple Pod"] },
    { scientificName: "Cucumis sativus", cultivars: ["Marketmore 76", "English Telegraph", "Persian", "Armenian", "Diva"] },
    { scientificName: "Momordica charantia", cultivars: ["White Pearl", "Jade Star", "Taiwan Long"] },
    { scientificName: "Aloe vera", cultivars: ["Barbadensis", "Blue Elf", "Chinensis"] },
    { scientificName: "Chlorophytum comosum", cultivars: ["Vittatum", "Variegatum", "Bonnie"] },
    { scientificName: "Perilla frutescens", cultivars: ["Green Shiso", "Red Shiso", "Bicolor Shiso"] },
    { scientificName: "Eryngium foetidum", cultivars: ["Broad Leaf", "Compact Leaf"] },
    { scientificName: "Rosmarinus officinalis", cultivars: ["Tuscan Blue", "Arp", "Blue Spires"] },
    { scientificName: "Thymus vulgaris", cultivars: ["French Thyme", "English Thyme", "Lemon Thyme"] },
    { scientificName: "Origanum vulgare", cultivars: ["Greek Oregano", "Golden Oregano", "Hot and Spicy"] },
    { scientificName: "Petroselinum crispum", cultivars: ["Curly", "Italian Flat Leaf", "Dark Green"] },
    { scientificName: "Anethum graveolens", cultivars: ["Bouquet", "Mammoth", "Fernleaf"] },
    { scientificName: "Brassica oleracea var. capitata", cultivars: ["Green Acre", "Red Express", "Savoy Ace", "Golden Acre"] },
    { scientificName: "Brassica oleracea var. italica", cultivars: ["Calabrese", "Waltham 29", "Green Magic", "Marathon"] },
    { scientificName: "Brassica oleracea var. botrytis", cultivars: ["Snowball", "Romanesco", "Graffiti", "Veronica"] },
    { scientificName: "Spinacia oleracea", cultivars: ["Bloomsdale", "Baby Leaf", "Space", "Giant Winter"] },
    { scientificName: "Brassica rapa subsp. pekinensis", cultivars: ["Michihili", "Bilko", "Rubicon"] },
    { scientificName: "Beta vulgaris", cultivars: ["Detroit Dark Red", "Chioggia", "Golden Beet"] },
    { scientificName: "Solanum melongena", cultivars: ["Black Beauty", "Japanese Long", "Fairy Tale", "Rosa Bianca"] },
    { scientificName: "Phaseolus vulgaris", cultivars: ["Blue Lake", "Kentucky Wonder", "Provider", "Dragon Tongue"] },
    { scientificName: "Pisum sativum", cultivars: ["Sugar Snap", "Snow Pea", "Little Marvel", "Green Arrow"] },
    { scientificName: "Arachis hypogaea", cultivars: ["Valencia", "Virginia", "Spanish Redskin"] },
    { scientificName: "Cucurbita pepo", cultivars: ["Black Beauty", "Gold Rush", "Cocozelle", "Eight Ball"] },
    { scientificName: "Cucurbita moschata", cultivars: ["Butternut Waltham", "Musquee de Provence", "Tahitian"] },
    { scientificName: "Citrullus lanatus", cultivars: ["Crimson Sweet", "Sugar Baby", "Charleston Gray", "Yellow Crimson"] },
    { scientificName: "Cucumis melo", cultivars: ["Honeydew", "Cantaloupe", "Galia", "Hami"] },
    { scientificName: "Fragaria x ananassa", cultivars: ["Albion", "Camarosa", "Chandler", "Seascape"] },
    { scientificName: "Citrus limon", cultivars: ["Eureka", "Lisbon", "Meyer"] },
    { scientificName: "Citrus sinensis", cultivars: ["Navel", "Valencia", "Blood Orange"] },
    { scientificName: "Carica papaya", cultivars: ["Red Lady", "Sunrise Solo", "Tainung"] },
    { scientificName: "Hibiscus rosa-sinensis", cultivars: ["Red Single", "Yellow Double", "Pink Giant"] },
    { scientificName: "Tagetes erecta", cultivars: ["Orange Giant", "Yellow Supreme", "Antigua"] },
    { scientificName: "Rosa chinensis", cultivars: ["Iceberg", "Double Delight", "Mister Lincoln", "Peace"] },
    { scientificName: "Helianthus annuus", cultivars: ["Mammoth", "Teddy Bear", "Sunrich Gold"] },
    { scientificName: "Epipremnum aureum", cultivars: ["Marble Queen", "Neon", "N Joy", "Jade"] },
    { scientificName: "Sansevieria trifasciata", cultivars: ["Laurentii", "Moonshine", "Hahnii", "Black Coral"] },
    { scientificName: "Ficus elastica", cultivars: ["Burgundy", "Tineke", "Ruby", "Decora"] },
    { scientificName: "Ocimum tenuiflorum", cultivars: ["Rama", "Krishna", "Vana", "Kapoor", "Amrita"] },
    { scientificName: "Melissa officinalis", cultivars: ["Citronella", "Lime", "Quedlinburger", "Aurea"] },
    { scientificName: "Foeniculum vulgare", cultivars: ["Bronze", "Romanesco", "Finale", "Sweet Florence"] },
    { scientificName: "Brassica oleracea var. sabellica", cultivars: ["Blue Curled", "Redbor", "Black Magic", "Dwarf Green"] },
    { scientificName: "Cichorium intybus", cultivars: ["Palla Rossa", "Variegata di Castelfranco", "Treviso Tardivo", "Rossa di Verona"] },
    { scientificName: "Basella alba", cultivars: ["Ruby Vine", "Green Tower", "Ceylon", "Malabar Giant"] },
    { scientificName: "Solanum tuberosum", cultivars: ["Desiree", "Fingerling", "Katahdin", "Norland"] },
    { scientificName: "Physalis peruviana", cultivars: ["Aunt Molly", "Golden Nugget", "Peruvian Gold", "Cossack Pineapple"] },
    { scientificName: "Allium schoenoprasum", cultivars: ["Dolores", "Staro", "Fine Leaf", "Polyvert"] },
    { scientificName: "Curcuma longa", cultivars: ["Prathibha", "IISR Prabha", "Suroma", "Lakadong"] },
    { scientificName: "Zingiber officinale", cultivars: ["Himalayan", "Organic White", "Chinese Pink", "Queensland"] },
    { scientificName: "Lens culinaris", cultivars: ["Richlea", "Laird", "Pardina", "Eston"] },
    { scientificName: "Vigna radiata", cultivars: ["Jade AU", "KPS2", "Pagasa 7", "Berken"] },
    { scientificName: "Sechium edule", cultivars: ["Spineless Green", "White Choko", "Round Green", "Long Green"] },
    { scientificName: "Asparagus officinalis", cultivars: ["Jersey Giant", "Apollo", "Purple Passion", "Millennium"] },
    { scientificName: "Cynara cardunculus var. scolymus", cultivars: ["Romanesco", "Green Globe Improved", "Opera", "Violetto"] },
    { scientificName: "Musa acuminata", cultivars: ["Grand Nain", "Williams", "Pisang Raja", "Lakatan"] },
    { scientificName: "Persea americana", cultivars: ["Lamb Hass", "Sharwil", "Gwen", "Zutano"] },
    { scientificName: "Vitis vinifera", cultivars: ["Flame Seedless", "Moon Drops", "Cotton Candy", "Italia"] },
    { scientificName: "Punica granatum", cultivars: ["Bhagwa", "Kandahar", "Desertnyi", "Ariana"] },
    { scientificName: "Malus domestica", cultivars: ["Jazz", "Envy", "Braeburn", "Cosmic Crisp"] },
    { scientificName: "Pyrus communis", cultivars: ["Conference", "Packhams Triumph", "Seckel", "Hosui"] },
    { scientificName: "Litchi chinensis", cultivars: ["No Mai Tze", "Kwai Mai Pink", "Bengal", "Sweet Cliff"] },
    { scientificName: "Dimocarpus longan", cultivars: ["Chompoo", "Haew", "Ping Pong", "Biew Kiew"] },
    { scientificName: "Selenicereus undatus", cultivars: ["Condor", "Vietnam Red", "Colombiana", "Lisa"] },
    { scientificName: "Zamioculcas zamiifolia", cultivars: ["Black Raven", "Lucky Green", "Mini Zenzi", "Dark Zam"] },
    { scientificName: "Philodendron hederaceum", cultivars: ["Cream Splash", "Silver Stripe", "Gabby", "Lemon Lime"] },
    { scientificName: "Aglaonema commutatum", cultivars: ["Red Emerald", "Silver Bay", "Anyamanee", "Cutlass"] },
    { scientificName: "Dracaena fragrans", cultivars: ["Janet Craig Compacta", "Mass Cane", "Lemon Surprise", "Tornado"] },
    { scientificName: "Anthurium andraeanum", cultivars: ["Champion", "Fire Glow", "Tropical", "Baby Pink"] },
    { scientificName: "Hoya carnosa", cultivars: ["Chelsea", "Compacta Variegata", "Krinkle", "Pubicalyx Splash"] },
    { scientificName: "Petunia x hybrida", cultivars: ["Night Sky", "Shock Wave Coral", "Easy Wave Pink", "Opera Supreme"] },
    { scientificName: "Hydrangea macrophylla", cultivars: ["Mini Penny", "Twist n Shout", "Merritts Supreme", "Blue Deckle"] },
    { scientificName: "Phalaenopsis amabilis", cultivars: ["Moon Orchid", "Snow Queen", "White Cloud", "Pearl Drop"] },
    { scientificName: "Dianthus caryophyllus", cultivars: ["Benigna", "Grenadin White", "Oscar Scarlet", "Can Can White"] },
    { scientificName: "Verbena x hybrida", cultivars: ["Firehouse Red", "Quartz White", "Aztec Violet", "Lanai Blue"] },
    { scientificName: "Cucumis metuliferus", cultivars: ["Jelly Melon", "Horned King", "Kiwano Gold", "African Orange"] },
    { scientificName: "Alocasia amazonica", cultivars: ["Polly", "Bambino", "Ivory Coast", "Aurea"] },
    { scientificName: "Caladium bicolor", cultivars: ["White Queen", "Red Flash", "Florida Sweetheart", "Aaron"] },
    { scientificName: "Tradescantia zebrina", cultivars: ["Silver Plus", "Purpusii", "Quadricolor", "Violet Hill"] },
];

function dedupePlantsBySeedKey(plants: PlantSeed[]) {
    const seen = new Set<string>();
    const result: PlantSeed[] = [];
    for (const plant of plants) {
        const key = buildPlantSeedKey({
            scientificName: plant.scientificName,
            cultivar: plant.cultivar,
        });
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(plant);
    }
    return result;
}

function buildCultivarPlantSeed(
    basePlants: PlantSeed[],
    expansion: CultivarExpansionEntry[]
) {
    const baseByScientific = new Map<string, PlantSeed>();
    for (const plant of basePlants) {
        if (plant.cultivar?.trim()) continue;
        const key = normalizeSeedScientificName(plant.scientificName);
        if (!baseByScientific.has(key)) {
            baseByScientific.set(key, plant);
        }
    }

    const dayOffsets = [-8, -4, 0, 4, 8];
    const spacingOffsets = [-8, -4, 0, 4, 8];
    const generated: PlantSeed[] = [];
    for (const entry of expansion) {
        const base = baseByScientific.get(normalizeSeedScientificName(entry.scientificName));
        if (!base) continue;
        for (let index = 0; index < entry.cultivars.length; index += 1) {
            const cultivar = entry.cultivars[index];
            const daysOffset = dayOffsets[index % dayOffsets.length];
            const spacingOffset = spacingOffsets[index % spacingOffsets.length];
            const nextDays =
                typeof base.typicalDaysToHarvest === "number"
                    ? Math.max(20, base.typicalDaysToHarvest + daysOffset)
                    : undefined;
            const nextSpacing =
                typeof base.spacingCm === "number"
                    ? Math.max(10, base.spacingCm + spacingOffset)
                    : base.spacingCm;
            generated.push({
                ...base,
                cultivar,
                typicalDaysToHarvest: nextDays,
                spacingCm: nextSpacing,
                maxPlantsPerM2: undefined,
                seedRatePerM2: undefined,
                waterLitersPerM2: undefined,
                yieldKgPerM2: undefined,
            });
        }
    }

    return generated;
}

const expandedRawPlantsMasterSeed: PlantSeed[] = dedupePlantsBySeedKey([
    ...rawPlantsMasterSeed,
    ...buildCultivarPlantSeed(rawPlantsMasterSeed, cultivarExpansionSeed),
]);

type PlantI18nSeedRow = {
    scientificName: string;
    cultivar?: string;
    locale: string;
    commonName: string;
    description?: string;
};

function buildSupplementalI18nSeed(
    locale: "en" | "vi",
    entries: SupplementalPlantCatalogEntry[]
): PlantI18nSeedRow[] {
    return entries.flatMap((entry) => {
        const baseCommonName =
            locale === "en" ? entry.enCommonName : entry.viCommonName;
        const baseDescription =
            locale === "en"
                ? `${entry.enCommonName} for diversified seed coverage in the library.`
                : `${entry.viCommonName} bo sung de mo rong danh muc giong trong thu vien.`;

        return [
            {
                scientificName: entry.scientificName,
                locale,
                commonName: baseCommonName,
                description: baseDescription,
            },
            ...entry.cultivars.map((cultivar) => ({
                scientificName: entry.scientificName,
                cultivar,
                locale,
                commonName:
                    locale === "en"
                        ? `${cultivar} ${entry.enCommonName}`
                        : `${entry.viCommonName} ${cultivar}`,
                description:
                    locale === "en"
                        ? `${cultivar} cultivar of ${entry.enCommonName} for a broader plant mix.`
                        : `Giong ${cultivar} cua ${entry.viCommonName} de mo rong bo suu tap cay.`,
            })),
        ];
    });
}

const supplementalPlantI18nEnSeed = buildSupplementalI18nSeed(
    "en",
    allSupplementalPlantCatalogSeed
);

const supplementalPlantI18nViSeed = buildSupplementalI18nSeed(
    "vi",
    allSupplementalPlantCatalogSeed
);

const plantI18nEnSeed: PlantI18nSeedRow[] = [
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
        scientificName: "Solanum lycopersicum",
        cultivar: "Roma",
        locale: "en",
        commonName: "Roma Tomato",
        description: "Plum-shaped tomato variety ideal for sauce and cooking.",
    },

    {
        scientificName: "Solanum lycopersicum",
        cultivar: "Beefsteak",
        locale: "en",
        commonName: "Beefsteak Tomato",
        description: "Large, meaty slicing tomato commonly used fresh.",
    },

    {
        scientificName: "Solanum lycopersicum",
        cultivar: "Cherry",
        locale: "en",
        commonName: "Cherry Tomato",
        description: "Small, sweet tomato variety great for salads and snacks.",
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
    ...supplementalPlantI18nEnSeed,
];

const plantI18nViSeed: PlantI18nSeedRow[] = [
    { scientificName: "Ocimum basilicum", locale: "vi", commonName: "Húng quế", description: "Rau gia vi thom, de trong va de cham soc." },
    { scientificName: "Mentha × piperita", locale: "vi", commonName: "Bạc hà", description: "Rau thơm mát, lớn nhanh, dễ chăm sóc." },
    { scientificName: "Coriandrum sativum", locale: "vi", commonName: "Ngo ri", description: "Rau gia vi pho bien, dung ca la va hat." },
    { scientificName: "Ipomoea aquatica", locale: "vi", commonName: "Rau muong", description: "Rau an la lon nhanh, hop khi hau am va am uot." },
    { scientificName: "Lactuca sativa", locale: "vi", commonName: "Xa lach", description: "Rau an la gion, hop trong chau va khi hau mat." },
    { scientificName: "Brassica rapa subsp. chinensis", locale: "vi", commonName: "Cai thi", description: "Rau cai lon nhanh, than la mem de an." },
    { scientificName: "Solanum lycopersicum", locale: "vi", commonName: "Ca chua", description: "Cay an qua pho bien, nhieu giong va de trong." },
    { scientificName: "Solanum lycopersicum", cultivar: "Roma", locale: "vi", commonName: "Ca chua Roma", description: "Giong ca chua dang dai, thich hop lam sot va nau an." },
    { scientificName: "Solanum lycopersicum", cultivar: "Beefsteak", locale: "vi", commonName: "Ca chua Beefsteak", description: "Giong ca chua qua to, thit day, thuong dung an tuoi." },
    { scientificName: "Solanum lycopersicum", cultivar: "Cherry", locale: "vi", commonName: "Ca chua bi", description: "Giong ca chua qua nho, vi ngot, phu hop salad." },
    { scientificName: "Capsicum annuum", locale: "vi", commonName: "Ot chuong", description: "Qua ngot, mau sac da dang, giau vitamin C." },
    { scientificName: "Capsicum frutescens", locale: "vi", commonName: "Ot hiem", description: "Qua nho vi cay, cay khoe va cho nang suat tot." },
    { scientificName: "Allium fistulosum", locale: "vi", commonName: "Hanh la", description: "Cay hanh vi nhe, thu hoach som hoac de lon deu duoc." },
    { scientificName: "Allium sativum", locale: "vi", commonName: "Toi", description: "Cu gia vi cay nong, thuong trong vao mua mat." },
    { scientificName: "Raphanus sativus", locale: "vi", commonName: "Cu cai trang", description: "Cu gion vi nhe, hop muoi dua va nau canh." },
    { scientificName: "Daucus carota", locale: "vi", commonName: "Ca rot", description: "Cu ngot gion, giau beta-carotene." },
    { scientificName: "Vigna unguiculata", locale: "vi", commonName: "Dau dua", description: "Qua dai, chiu nong tot, cho nang suat cao." },
    { scientificName: "Cucumis sativus", locale: "vi", commonName: "Dua leo", description: "Qua thanh mat, can du am deu va gian do." },
    { scientificName: "Momordica charantia", locale: "vi", commonName: "Muop dang", description: "Qua vi dang, day leo manh, pho bien trong am thuc." },
    { scientificName: "Aloe vera", locale: "vi", commonName: "Nha dam", description: "Cay mong nuoc, it cong cham soc, chiu han tot." },
    { scientificName: "Chlorophytum comosum", locale: "vi", commonName: "Cay day nhen", description: "Cay noi that de song, thanh loc khong khi tot." },
    { scientificName: "Perilla frutescens", locale: "vi", commonName: "Tia to", description: "Rau gia vi mui dac trung, lon nhanh." },
    { scientificName: "Eryngium foetidum", locale: "vi", commonName: "Ngo gai", description: "Rau thom mui manh, chiu nong tot." },
    { scientificName: "Rosmarinus officinalis", locale: "vi", commonName: "Huong thao", description: "Cay gia vi than go, thich nang va dat thoat nuoc." },
    { scientificName: "Thymus vulgaris", locale: "vi", commonName: "Xa huong", description: "Cay gia vi than thap, chiu han sau khi on dinh." },
    { scientificName: "Origanum vulgare", locale: "vi", commonName: "Kinh gioi tay", description: "Rau gia vi pho bien trong am thuc Dia Trung Hai." },
    { scientificName: "Petroselinum crispum", locale: "vi", commonName: "Ngo tay", description: "Rau thom vi nhe, hop trong chau." },
    { scientificName: "Anethum graveolens", locale: "vi", commonName: "Thi la", description: "Rau mui hoang hoi, hop cho mon ca va do muoi." },
    { scientificName: "Brassica oleracea var. capitata", locale: "vi", commonName: "Bap cai", description: "Bap chat, cay vu mua mat." },
    { scientificName: "Brassica oleracea var. italica", locale: "vi", commonName: "Bong cai xanh", description: "Rau cai bo duong cao, an phan hoa." },
    { scientificName: "Brassica oleracea var. botrytis", locale: "vi", commonName: "Sup lo", description: "Cum hoa mem, phat trien tot khi troi mat." },
    { scientificName: "Spinacia oleracea", locale: "vi", commonName: "Rau bina", description: "Rau an la lon nhanh, hop nhiet do mat." },
    { scientificName: "Brassica rapa subsp. pekinensis", locale: "vi", commonName: "Cai thao", description: "La gion vi nhe, hop xao va lam kim chi." },
    { scientificName: "Beta vulgaris", locale: "vi", commonName: "Cu den", description: "Cu ngot vi dat, la cung co the an." },
    { scientificName: "Solanum melongena", locale: "vi", commonName: "Ca tim", description: "Cay vu mua nong, qua bong dep." },
    { scientificName: "Phaseolus vulgaris", locale: "vi", commonName: "Dau que", description: "Qua non mem, nen thu hoach thuong xuyen." },
    { scientificName: "Pisum sativum", locale: "vi", commonName: "Dau Ha Lan", description: "Cay ho dau vu mat, qua va hat ngot." },
    { scientificName: "Arachis hypogaea", locale: "vi", commonName: "Dau phong", description: "Cay ho dau vu nong, qua hinh thanh duoi dat." },
    { scientificName: "Cucurbita pepo", locale: "vi", commonName: "Bi ngoi", description: "Bi mua he nang suat cao, nen thu hoach luc qua non." },
    { scientificName: "Cucurbita moschata", locale: "vi", commonName: "Bi do", description: "Bi vu dong thit day, ngot, bao quan duoc lau." },
    { scientificName: "Citrullus lanatus", locale: "vi", commonName: "Dua hau", description: "Qua lon ngot, can nang day va khong gian rong." },
    { scientificName: "Cucumis melo", locale: "vi", commonName: "Dua luoi", description: "Qua thom ngot, can nhiet do cao va thong thoang." },
    { scientificName: "Fragaria x ananassa", locale: "vi", commonName: "Dau tay", description: "Qua ngot, thich dem mat va do am on dinh." },
    { scientificName: "Citrus limon", locale: "vi", commonName: "Chanh", description: "Cay co mui vi chua, thich nang va dat thoat nuoc." },
    { scientificName: "Citrus sinensis", locale: "vi", commonName: "Cam", description: "Cay co mui qua ngot, hop dieu kien am ap co nang." },
    { scientificName: "Carica papaya", locale: "vi", commonName: "Du du", description: "Cay an qua nhiet doi, lon nhanh va ua nang." },
    { scientificName: "Hibiscus rosa-sinensis", locale: "vi", commonName: "Dam but", description: "Hoa lon ruc ro, no dep khi co nang va am." },
    { scientificName: "Tagetes erecta", locale: "vi", commonName: "Van tho", description: "Hoa mot nam de trong, mau sac sang va xua sau." },
    { scientificName: "Rosa chinensis", locale: "vi", commonName: "Hoa hong", description: "Bui hoa co dien, nhieu giong va nhieu mau." },
    { scientificName: "Helianthus annuus", locale: "vi", commonName: "Huong duong", description: "Hoa cao lon, bong to, can nhieu nang." },
    { scientificName: "Epipremnum aureum", locale: "vi", commonName: "Trau ba", description: "Cay noi that de song, chiu thieu sang tot." },
    { scientificName: "Sansevieria trifasciata", locale: "vi", commonName: "Luoi ho", description: "Cay noi that khoe, chiu han va chiu bong ram." },
    { scientificName: "Ficus elastica", locale: "vi", commonName: "Da bun", description: "Cay la to trong nha, ua sang gian tiep." },
    ...supplementalPlantI18nViSeed,
];

function dedupeI18nByPlantLocale(rows: PlantI18nSeedRow[]) {
    const seen = new Set<string>();
    const result: PlantI18nSeedRow[] = [];
    for (const row of rows) {
        const key = `${buildPlantSeedKey({
            scientificName: row.scientificName,
            cultivar: row.cultivar,
        })}|${row.locale.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(row);
    }
    return result;
}

function buildCultivarI18nSeed(
    locale: "en" | "vi",
    expansion: CultivarExpansionEntry[],
    baseCommonNameByScientific: Map<string, string>
) {
    const rows: PlantI18nSeedRow[] = [];
    for (const entry of expansion) {
        const baseCommonName =
            baseCommonNameByScientific.get(
                normalizeSeedScientificName(entry.scientificName)
            ) ?? entry.scientificName;
        for (const cultivar of entry.cultivars) {
            const commonName =
                locale === "en"
                    ? `${cultivar} ${baseCommonName}`
                    : `${baseCommonName} ${cultivar}`;
            const description =
                locale === "en"
                    ? `Popular cultivar of ${baseCommonName} with stable growth profile.`
                    : `Giong pho bien cua ${baseCommonName}, sinh truong on dinh.`;
            rows.push({
                scientificName: entry.scientificName,
                cultivar,
                locale,
                commonName,
                description,
            });
        }
    }
    return rows;
}

const enBaseCommonNameByScientific = new Map(
    plantI18nEnSeed
        .filter((row) => !row.cultivar?.trim())
        .map(
            (row) =>
                [normalizeSeedScientificName(row.scientificName), row.commonName] as const
        )
);

const viBaseCommonNameByScientific = new Map(
    plantI18nViSeed
        .filter((row) => !row.cultivar?.trim())
        .map(
            (row) =>
                [normalizeSeedScientificName(row.scientificName), row.commonName] as const
        )
);

const generatedCultivarI18nEnSeed = buildCultivarI18nSeed(
    "en",
    cultivarExpansionSeed,
    enBaseCommonNameByScientific
);

const generatedCultivarI18nViSeed = buildCultivarI18nSeed(
    "vi",
    cultivarExpansionSeed,
    viBaseCommonNameByScientific
);

export const plantI18nSeed: PlantI18nSeedRow[] = dedupeI18nByPlantLocale(
    plantI18nLocaleSeed
);

const commonNameByPlantKey = new Map(
    plantI18nSeed
        .filter((row) => row.locale === "en")
        .map(
            (row) =>
                [
                    buildPlantSeedKey({
                        scientificName: row.scientificName,
                        cultivar: row.cultivar,
                    }),
                    row.commonName,
                ] as const
        )
);

const commonNameByScientificBase = new Map(
    plantI18nSeed
        .filter((row) => row.locale === "en" && !row.cultivar?.trim())
        .map(
            (row) =>
                [normalizeSeedScientificName(row.scientificName), row.commonName] as const
        )
);

const yieldsByGroup: Record<string, number[]> = {};
for (const plant of expandedRawPlantsMasterSeed) {
    const commonName =
        commonNameByPlantKey.get(
            buildPlantSeedKey({
                scientificName: plant.scientificName,
                cultivar: plant.cultivar,
            })
        ) ??
        commonNameByScientificBase.get(
            normalizeSeedScientificName(plant.scientificName)
        );
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

export const plantsMasterSeed = expandedRawPlantsMasterSeed.map((plant) => {
    const commonName =
        commonNameByPlantKey.get(
            buildPlantSeedKey({
                scientificName: plant.scientificName,
                cultivar: plant.cultivar,
            })
        ) ??
        commonNameByScientificBase.get(
            normalizeSeedScientificName(plant.scientificName)
        );
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
        family: plant.family ?? inferFamilyFromScientificName(plant.scientificName),
        ...(maxPlantsPerM2 !== undefined ? { maxPlantsPerM2 } : {}),
        ...(seedRatePerM2 !== undefined ? { seedRatePerM2 } : {}),
        ...(waterLitersPerM2 !== undefined ? { waterLitersPerM2 } : {}),
        ...(yieldKgPerM2 !== undefined ? { yieldKgPerM2 } : {}),
    };
});
