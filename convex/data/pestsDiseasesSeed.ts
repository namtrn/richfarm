// Shared seed data for pests and diseases

export type PestDiseaseSeed = {
    key: string;
    type: "pest" | "disease";
    name: string;
    imageUrl?: string;
    identification: string[];
    damage: string[];
    prevention: string[];
    control: {
        physical: string[];
        organic: string[];
        chemical: string[];
    };
    plantsAffected: string[];
    sortOrder: number;
};

const MOCK_PEST_IMAGE =
    "https://images.unsplash.com/photo-1628359355624-855775b5c9c4?auto=format&fit=crop&w=1200&q=80";
const MOCK_DISEASE_IMAGE =
    "https://images.unsplash.com/photo-1592150621744-aca64f48394a?auto=format&fit=crop&w=1200&q=80";

const basePestsDiseasesSeed: PestDiseaseSeed[] = [
    {
        key: "aphids",
        type: "pest",
        name: "Aphids",
        identification: [
            "Clusters of soft-bodied insects on new growth",
            "Sticky honeydew on leaves or stems",
            "Curled or distorted leaves",
        ],
        damage: [
            "Stunted growth and yellowing",
            "Sooty mold developing on honeydew",
            "Can transmit plant viruses",
        ],
        prevention: [
            "Encourage lady beetles and lacewings",
            "Avoid excess nitrogen fertilization",
            "Inspect new growth weekly",
        ],
        control: {
            physical: [
                "Blast off with a strong stream of water",
                "Prune heavily infested tips",
                "Use yellow sticky traps",
            ],
            organic: [
                "Insecticidal soap sprays",
                "Neem oil applications",
                "Horticultural oil coverage",
            ],
            chemical: [
                "Use labeled contact insecticides",
                "Rotate active ingredients to slow resistance",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Pepper",
            "Lettuce",
            "Basil",
            "Cucumber",
            "Rose",
        ],
        sortOrder: 1,
    },
    {
        key: "spider_mites",
        type: "pest",
        name: "Spider Mites",
        identification: [
            "Fine webbing on undersides of leaves",
            "Tiny yellow stippling on leaf surfaces",
            "Mites visible with a hand lens",
        ],
        damage: [
            "Leaf bronzing and drop",
            "Reduced plant vigor and yield",
        ],
        prevention: [
            "Reduce dust and increase humidity",
            "Avoid drought stress",
        ],
        control: {
            physical: [
                "Rinse leaves, especially undersides",
                "Remove heavily infested leaves",
            ],
            organic: [
                "Neem oil sprays",
                "Insecticidal soap",
                "Release predatory mites",
            ],
            chemical: [
                "Use labeled miticides",
                "Rotate modes of action",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Bean",
            "Strawberry",
            "Cucumber",
            "Houseplants",
        ],
        sortOrder: 2,
    },
    {
        key: "whiteflies",
        type: "pest",
        name: "Whiteflies",
        identification: [
            "Small white insects fly when disturbed",
            "Sticky honeydew and sooty mold",
        ],
        damage: [
            "Yellowing and leaf drop",
            "Reduced plant vigor",
        ],
        prevention: [
            "Remove weeds and crop residue",
            "Use reflective mulch or netting",
        ],
        control: {
            physical: [
                "Vacuum adults in the morning",
                "Use yellow sticky traps",
            ],
            organic: [
                "Insecticidal soap sprays",
                "Neem oil applications",
            ],
            chemical: [
                "Use labeled systemic insecticides",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Pepper",
            "Eggplant",
            "Cucumber",
        ],
        sortOrder: 3,
    },
    {
        key: "caterpillars",
        type: "pest",
        name: "Caterpillars",
        identification: [
            "Chewed holes in leaves",
            "Green larvae on leaf undersides",
            "Dark frass pellets",
        ],
        damage: [
            "Defoliation and contamination of heads",
            "Fruit scarring",
        ],
        prevention: [
            "Use row covers",
            "Remove eggs by hand",
        ],
        control: {
            physical: [
                "Handpick larvae",
                "Till soil between crops",
            ],
            organic: [
                "Bt (Bacillus thuringiensis) sprays",
            ],
            chemical: [
                "Spinosad or other labeled insecticides",
            ],
        },
        plantsAffected: [
            "Cabbage",
            "Kale",
            "Broccoli",
            "Lettuce",
            "Tomato",
        ],
        sortOrder: 4,
    },
    {
        key: "thrips",
        type: "pest",
        name: "Thrips",
        identification: [
            "Silvery streaks or scarring on leaves",
            "Black specks of frass",
            "Distorted new growth",
        ],
        damage: [
            "Leaf and flower damage",
            "Can transmit plant viruses",
        ],
        prevention: [
            "Remove weeds and crop debris",
            "Use blue sticky traps",
        ],
        control: {
            physical: [
                "Prune infested tips",
                "Rinse foliage",
            ],
            organic: [
                "Neem oil sprays",
                "Insecticidal soap",
            ],
            chemical: [
                "Spinosad or pyrethroids",
                "Rotate active ingredients",
            ],
        },
        plantsAffected: [
            "Onion",
            "Pepper",
            "Tomato",
            "Cucumber",
            "Houseplants",
        ],
        sortOrder: 5,
    },
    {
        key: "mealybugs",
        type: "pest",
        name: "Mealybugs",
        identification: [
            "White cotton-like masses on stems and leaf joints",
            "Sticky honeydew and black sooty mold",
            "Slow, weak growth in container plants",
        ],
        damage: [
            "Sap loss causing leaf yellowing and drop",
            "Reduced flowering and vigor",
        ],
        prevention: [
            "Inspect new plants before bringing indoors",
            "Avoid over-fertilizing with nitrogen",
        ],
        control: {
            physical: [
                "Wipe clusters with alcohol-dipped cotton swab",
                "Prune heavily infested stems",
            ],
            organic: [
                "Neem oil sprays",
                "Insecticidal soap applications",
            ],
            chemical: [
                "Use labeled systemic insecticides when severe",
            ],
        },
        plantsAffected: [
            "Houseplants",
            "Citrus",
            "Pepper",
            "Succulents",
        ],
        sortOrder: 6,
    },
    {
        key: "fungus_gnats",
        type: "pest",
        name: "Fungus Gnats",
        identification: [
            "Tiny dark flies hovering around soil",
            "Larvae in potting mix feeding on roots",
            "Most common in constantly wet containers",
        ],
        damage: [
            "Root injury in seedlings and young plants",
            "Poor growth and wilting in potted crops",
        ],
        prevention: [
            "Let top soil layer dry between waterings",
            "Use sterile, well-draining potting mix",
        ],
        control: {
            physical: [
                "Use yellow sticky traps for adults",
                "Top-dress pots with coarse sand",
            ],
            organic: [
                "Apply BTI products to soil",
                "Beneficial nematodes in potting mix",
            ],
            chemical: [
                "Use labeled soil drenches if needed",
            ],
        },
        plantsAffected: [
            "Houseplants",
            "Seedlings",
            "Herbs",
            "Lettuce",
        ],
        sortOrder: 7,
    },
    {
        key: "slugs_snails",
        type: "pest",
        name: "Slugs and Snails",
        identification: [
            "Irregular holes in leaves and fruit",
            "Silvery slime trails on soil and foliage",
            "Feeding damage is worst at night",
        ],
        damage: [
            "Severe chewing on seedlings and leafy greens",
            "Fruit scarring near soil line",
        ],
        prevention: [
            "Reduce mulch touching stems",
            "Water in morning so soil dries by evening",
        ],
        control: {
            physical: [
                "Handpick at dusk or dawn",
                "Use copper barriers around beds/containers",
            ],
            organic: [
                "Iron phosphate bait products",
            ],
            chemical: [
                "Use labeled molluscicides with caution",
            ],
        },
        plantsAffected: [
            "Lettuce",
            "Strawberry",
            "Basil",
            "Seedlings",
        ],
        sortOrder: 8,
    },
    {
        key: "powdery_mildew",
        type: "disease",
        name: "Powdery Mildew",
        identification: [
            "White powdery coating on leaves",
            "Spots that spread quickly",
            "Leaves may curl",
        ],
        damage: [
            "Reduced photosynthesis and yield",
            "Premature leaf drop",
        ],
        prevention: [
            "Provide good airflow and spacing",
            "Water at soil level",
            "Choose resistant varieties",
        ],
        control: {
            physical: [
                "Remove infected leaves",
                "Sanitize tools between plants",
            ],
            organic: [
                "Sulfur or potassium bicarbonate sprays",
                "Neem oil applications",
            ],
            chemical: [
                "Use labeled fungicides for powdery mildew",
            ],
        },
        plantsAffected: [
            "Squash",
            "Cucumber",
            "Zucchini",
            "Rose",
        ],
        sortOrder: 1,
    },
    {
        key: "downy_mildew",
        type: "disease",
        name: "Downy Mildew",
        identification: [
            "Yellow patches on upper leaf surfaces",
            "Gray or purple growth underneath",
            "Rapid leaf collapse in humid weather",
        ],
        damage: [
            "Defoliation and crop loss",
        ],
        prevention: [
            "Improve airflow",
            "Avoid overhead irrigation",
            "Use resistant varieties when available",
        ],
        control: {
            physical: [
                "Remove infected leaves",
                "Destroy crop debris",
            ],
            organic: [
                "Copper-based fungicide",
            ],
            chemical: [
                "Use labeled systemic fungicides",
            ],
        },
        plantsAffected: [
            "Basil",
            "Cucumber",
            "Spinach",
            "Lettuce",
        ],
        sortOrder: 2,
    },
    {
        key: "early_blight",
        type: "disease",
        name: "Early Blight",
        identification: [
            "Target-like dark spots on older leaves",
            "Yellowing around spots",
        ],
        damage: [
            "Leaf drop and reduced fruit size",
        ],
        prevention: [
            "Rotate crops",
            "Mulch to prevent soil splash",
        ],
        control: {
            physical: [
                "Remove lower infected leaves",
                "Sanitize tools between plants",
            ],
            organic: [
                "Copper-based fungicides",
            ],
            chemical: [
                "Use labeled protectant fungicides",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Potato",
            "Eggplant",
        ],
        sortOrder: 3,
    },
    {
        key: "root_rot",
        type: "disease",
        name: "Root Rot",
        identification: [
            "Wilting despite moist soil",
            "Brown, mushy roots",
        ],
        damage: [
            "Plant collapse",
        ],
        prevention: [
            "Improve drainage",
            "Avoid overwatering",
        ],
        control: {
            physical: [
                "Remove affected plants",
                "Sterilize pots and tools",
            ],
            organic: [
                "Biological fungicides such as Trichoderma",
            ],
            chemical: [
                "Use labeled soil fungicides",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Pepper",
            "Lettuce",
            "Houseplants",
        ],
        sortOrder: 4,
    },
    {
        key: "leaf_spot",
        type: "disease",
        name: "Leaf Spot",
        identification: [
            "Small dark spots with yellow halos",
            "Spots may merge into larger lesions",
        ],
        damage: [
            "Leaf drop and weakened plants",
        ],
        prevention: [
            "Water at soil line",
            "Remove infected debris",
        ],
        control: {
            physical: [
                "Prune affected leaves",
                "Sanitize tools",
            ],
            organic: [
                "Copper or sulfur sprays",
            ],
            chemical: [
                "Use labeled fungicides for leaf spot",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Pepper",
            "Spinach",
            "Herbs",
        ],
        sortOrder: 5,
    },
    {
        key: "rust",
        type: "disease",
        name: "Rust",
        identification: [
            "Orange or brown pustules on leaf undersides",
            "Yellow spots above lesions",
        ],
        damage: [
            "Reduced growth and yield",
        ],
        prevention: [
            "Increase airflow",
            "Avoid wet foliage",
        ],
        control: {
            physical: [
                "Remove infected leaves",
            ],
            organic: [
                "Sulfur sprays",
            ],
            chemical: [
                "Use labeled fungicides for rust",
            ],
        },
        plantsAffected: [
            "Bean",
            "Garlic",
            "Mint",
            "Rose",
        ],
        sortOrder: 6,
    },
    {
        key: "late_blight",
        type: "disease",
        name: "Late Blight",
        identification: [
            "Water-soaked dark lesions on leaves and stems",
            "White fuzzy growth on lesion edges in humidity",
            "Firm brown blotches on fruit",
        ],
        damage: [
            "Rapid foliage collapse in cool, wet weather",
            "Major fruit and tuber losses",
        ],
        prevention: [
            "Start with clean transplants and seed potatoes",
            "Provide good spacing and airflow",
            "Avoid overhead irrigation late in day",
        ],
        control: {
            physical: [
                "Remove and destroy infected plants quickly",
                "Do not compost diseased material",
            ],
            organic: [
                "Copper-based protectant sprays",
            ],
            chemical: [
                "Use labeled blight fungicides preventively",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Potato",
        ],
        sortOrder: 7,
    },
    {
        key: "botrytis_gray_mold",
        type: "disease",
        name: "Botrytis (Gray Mold)",
        identification: [
            "Gray fuzzy mold on flowers, stems, or fruit",
            "Soft brown lesions on damaged tissue",
            "Most common in dense, humid canopies",
        ],
        damage: [
            "Flower blight and fruit rot",
            "Stem cankers and plant decline",
        ],
        prevention: [
            "Prune for airflow and remove senescent tissue",
            "Water early and avoid prolonged leaf wetness",
        ],
        control: {
            physical: [
                "Remove infected flowers and fruit immediately",
                "Sanitize tools and harvest bins",
            ],
            organic: [
                "Biocontrol products based on Bacillus species",
            ],
            chemical: [
                "Use labeled gray mold fungicides and rotate modes",
            ],
        },
        plantsAffected: [
            "Strawberry",
            "Tomato",
            "Rose",
            "Lettuce",
        ],
        sortOrder: 8,
    },
    {
        key: "bacterial_wilt",
        type: "disease",
        name: "Bacterial Wilt",
        identification: [
            "Sudden wilting without leaf yellowing",
            "Brown vascular streaking in stems",
            "Bacterial ooze from cut stems in water test",
        ],
        damage: [
            "Rapid collapse of entire plants",
            "Persistent soil infestation in warm climates",
        ],
        prevention: [
            "Use resistant varieties where available",
            "Rotate with non-host crops for multiple seasons",
            "Control insect vectors and weeds",
        ],
        control: {
            physical: [
                "Rogue infected plants and nearby roots",
                "Disinfect stakes and pruning tools",
            ],
            organic: [
                "Use microbial soil health amendments preventively",
            ],
            chemical: [
                "No reliable curative chemicals once infected",
            ],
        },
        plantsAffected: [
            "Tomato",
            "Eggplant",
            "Pepper",
            "Potato",
        ],
        sortOrder: 9,
    },
    {
        key: "damping_off",
        type: "disease",
        name: "Damping-off",
        identification: [
            "Seedlings collapse at soil line",
            "Water-soaked stem constriction",
            "Poor emergence in trays",
        ],
        damage: [
            "High seedling mortality",
            "Uneven stands and re-sowing costs",
        ],
        prevention: [
            "Use sterile seed-starting mix and clean trays",
            "Avoid overwatering and overcrowding",
            "Provide bottom heat and airflow",
        ],
        control: {
            physical: [
                "Discard affected flats promptly",
                "Improve drainage and reduce humidity",
            ],
            organic: [
                "Trichoderma-based biological drenches",
            ],
            chemical: [
                "Use labeled seed treatment or drench products",
            ],
        },
        plantsAffected: [
            "Seedlings",
            "Tomato",
            "Pepper",
            "Cabbage",
            "Herbs",
        ],
        sortOrder: 10,
    },
];

export const pestsDiseasesSeed: PestDiseaseSeed[] = basePestsDiseasesSeed.map(
    (entry) => ({
        ...entry,
        imageUrl:
            entry.imageUrl ??
            (entry.type === "pest" ? MOCK_PEST_IMAGE : MOCK_DISEASE_IMAGE),
    })
);
