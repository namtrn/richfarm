// Shared seed data for pests and diseases

export type PestDiseaseSeed = {
    key: string;
    type: "pest" | "disease";
    name: string;
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

export const pestsDiseasesSeed: PestDiseaseSeed[] = [
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
];
