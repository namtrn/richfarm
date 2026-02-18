// Richfarm — Seed Data
// Chạy: npx convex run seed:seedAll
// Hoặc từng function riêng lẻ qua Convex dashboard

import { internalMutation } from "./_generated/server";

// ==========================================
// Seed Plant Groups
// ==========================================
export const seedPlantGroups = internalMutation({
    args: {},
    handler: async (ctx) => {
        const groups = [
            { key: "herbs", displayName: { vi: "Rau thơm", en: "Herbs" }, sortOrder: 1 },
            { key: "vegetables", displayName: { vi: "Rau củ", en: "Vegetables" }, sortOrder: 2 },
            { key: "fruits", displayName: { vi: "Cây ăn quả", en: "Fruits" }, sortOrder: 3 },
            { key: "nightshades", displayName: { vi: "Họ cà", en: "Nightshades" }, sortOrder: 4 },
            { key: "alliums", displayName: { vi: "Họ hành", en: "Alliums" }, sortOrder: 5 },
            { key: "leafy_greens", displayName: { vi: "Rau lá xanh", en: "Leafy Greens" }, sortOrder: 6 },
            { key: "roots", displayName: { vi: "Củ rễ", en: "Root Vegetables" }, sortOrder: 7 },
            { key: "legumes", displayName: { vi: "Họ đậu", en: "Legumes" }, sortOrder: 8 },
            { key: "indoor", displayName: { vi: "Cây trong nhà", en: "Indoor Plants" }, sortOrder: 9 },
            { key: "flowers", displayName: { vi: "Hoa", en: "Flowers" }, sortOrder: 10 },
        ];

        let count = 0;
        for (const group of groups) {
            const existing = await ctx.db
                .query("plantGroups")
                .withIndex("by_key", (q) => q.eq("key", group.key))
                .unique();

            if (!existing) {
                await ctx.db.insert("plantGroups", group);
                count++;
            }
        }

        return { inserted: count, total: groups.length };
    },
});

// ==========================================
// Seed Plants Master (20 cây phổ biến VN)
// ==========================================
export const seedPlantsMaster = internalMutation({
    args: {},
    handler: async (ctx) => {
        const plants = [
            // Rau thơm
            {
                scientificName: "Ocimum basilicum",
                commonNames: [{ locale: "vi", name: "Húng quế" }, { locale: "en", name: "Basil" }],
                group: "herbs",
                purposes: ["cooking_spices", "indoor"],
                description: "Rau thơm phổ biến trong ẩm thực Việt Nam và Ý",
                typicalDaysToHarvest: 60,
                germinationDays: 7,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            {
                scientificName: "Mentha × piperita",
                commonNames: [{ locale: "vi", name: "Bạc hà" }, { locale: "en", name: "Mint" }],
                group: "herbs",
                purposes: ["cooking_spices", "medicinal"],
                description: "Cây bạc hà thơm mát, dễ trồng",
                typicalDaysToHarvest: 90,
                germinationDays: 10,
                lightRequirements: "partial_shade",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 21,
                source: "seed",
            },
            {
                scientificName: "Coriandrum sativum",
                commonNames: [{ locale: "vi", name: "Rau mùi / Ngò" }, { locale: "en", name: "Coriander" }],
                group: "herbs",
                purposes: ["cooking_spices"],
                description: "Rau mùi dùng làm gia vị phổ biến",
                typicalDaysToHarvest: 45,
                germinationDays: 10,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            // Rau lá xanh
            {
                scientificName: "Ipomoea aquatica",
                commonNames: [{ locale: "vi", name: "Rau muống" }, { locale: "en", name: "Water Spinach" }],
                group: "leafy_greens",
                purposes: ["cooking"],
                description: "Rau muống — rau xanh phổ biến nhất Việt Nam",
                typicalDaysToHarvest: 30,
                germinationDays: 7,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 1,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            {
                scientificName: "Lactuca sativa",
                commonNames: [{ locale: "vi", name: "Xà lách" }, { locale: "en", name: "Lettuce" }],
                group: "leafy_greens",
                purposes: ["cooking", "salad"],
                description: "Xà lách giòn, dễ trồng trong chậu",
                typicalDaysToHarvest: 45,
                germinationDays: 5,
                lightRequirements: "partial_shade",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            {
                scientificName: "Brassica rapa subsp. chinensis",
                commonNames: [{ locale: "vi", name: "Cải xanh" }, { locale: "en", name: "Bok Choy" }],
                group: "leafy_greens",
                purposes: ["cooking"],
                description: "Cải xanh giàu dinh dưỡng, mọc nhanh",
                typicalDaysToHarvest: 35,
                germinationDays: 5,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            // Họ cà
            {
                scientificName: "Solanum lycopersicum",
                commonNames: [{ locale: "vi", name: "Cà chua" }, { locale: "en", name: "Tomato" }],
                group: "nightshades",
                purposes: ["cooking", "salad"],
                description: "Cà chua — cây rau ăn quả phổ biến",
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
                commonNames: [{ locale: "vi", name: "Ớt chuông" }, { locale: "en", name: "Bell Pepper" }],
                group: "nightshades",
                purposes: ["cooking"],
                description: "Ớt chuông nhiều màu sắc, giàu vitamin C",
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
                commonNames: [{ locale: "vi", name: "Ớt hiểm" }, { locale: "en", name: "Bird's Eye Chili" }],
                group: "nightshades",
                purposes: ["cooking_spices"],
                description: "Ớt hiểm cay, phổ biến trong ẩm thực Việt",
                typicalDaysToHarvest: 90,
                germinationDays: 14,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 3,
                fertilizingFrequencyDays: 21,
                source: "seed",
            },
            // Họ hành
            {
                scientificName: "Allium fistulosum",
                commonNames: [{ locale: "vi", name: "Hành lá" }, { locale: "en", name: "Green Onion" }],
                group: "alliums",
                purposes: ["cooking_spices"],
                description: "Hành lá — gia vị không thể thiếu",
                typicalDaysToHarvest: 60,
                germinationDays: 7,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            {
                scientificName: "Allium sativum",
                commonNames: [{ locale: "vi", name: "Tỏi" }, { locale: "en", name: "Garlic" }],
                group: "alliums",
                purposes: ["cooking_spices", "medicinal"],
                description: "Tỏi — gia vị và dược liệu quý",
                typicalDaysToHarvest: 180,
                germinationDays: 14,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 3,
                fertilizingFrequencyDays: 30,
                source: "bulb",
            },
            // Củ rễ
            {
                scientificName: "Raphanus sativus",
                commonNames: [{ locale: "vi", name: "Củ cải trắng" }, { locale: "en", name: "Daikon Radish" }],
                group: "roots",
                purposes: ["cooking"],
                description: "Củ cải trắng dùng nấu canh và làm dưa",
                typicalDaysToHarvest: 60,
                germinationDays: 5,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 21,
                source: "seed",
            },
            {
                scientificName: "Daucus carota",
                commonNames: [{ locale: "vi", name: "Cà rốt" }, { locale: "en", name: "Carrot" }],
                group: "roots",
                purposes: ["cooking", "salad"],
                description: "Cà rốt giàu beta-carotene, ngọt tự nhiên",
                typicalDaysToHarvest: 75,
                germinationDays: 14,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 3,
                fertilizingFrequencyDays: 21,
                source: "seed",
            },
            // Họ đậu
            {
                scientificName: "Vigna unguiculata",
                commonNames: [{ locale: "vi", name: "Đậu đũa" }, { locale: "en", name: "Yard-long Bean" }],
                group: "legumes",
                purposes: ["cooking"],
                description: "Đậu đũa dài, năng suất cao",
                typicalDaysToHarvest: 60,
                germinationDays: 7,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 21,
                spacingCm: 30,
                source: "seed",
            },
            // Cây ăn quả nhỏ
            {
                scientificName: "Cucumis sativus",
                commonNames: [{ locale: "vi", name: "Dưa leo" }, { locale: "en", name: "Cucumber" }],
                group: "vegetables",
                purposes: ["cooking", "salad"],
                description: "Dưa leo mát lạnh, dễ trồng trong chậu lớn",
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
                commonNames: [{ locale: "vi", name: "Khổ qua / Mướp đắng" }, { locale: "en", name: "Bitter Melon" }],
                group: "vegetables",
                purposes: ["cooking", "medicinal"],
                description: "Khổ qua tốt cho sức khỏe, phổ biến trong ẩm thực Việt",
                typicalDaysToHarvest: 60,
                germinationDays: 7,
                lightRequirements: "full_sun",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 14,
                source: "seed",
            },
            // Cây trong nhà
            {
                scientificName: "Aloe vera",
                commonNames: [{ locale: "vi", name: "Nha đam / Lô hội" }, { locale: "en", name: "Aloe Vera" }],
                group: "indoor",
                purposes: ["medicinal", "cosmetic", "indoor"],
                description: "Nha đam dễ chăm, chịu hạn tốt, nhiều công dụng",
                typicalDaysToHarvest: 365,
                germinationDays: 0,
                lightRequirements: "partial_shade",
                wateringFrequencyDays: 7,
                fertilizingFrequencyDays: 60,
                source: "cutting",
            },
            {
                scientificName: "Chlorophytum comosum",
                commonNames: [{ locale: "vi", name: "Cây nhện / Lan chi" }, { locale: "en", name: "Spider Plant" }],
                group: "indoor",
                purposes: ["indoor", "air_purifying"],
                description: "Cây nhện lọc không khí, cực dễ trồng",
                lightRequirements: "partial_shade",
                wateringFrequencyDays: 5,
                fertilizingFrequencyDays: 30,
                source: "cutting",
            },
            // Rau đặc trưng VN
            {
                scientificName: "Perilla frutescens",
                commonNames: [{ locale: "vi", name: "Tía tô" }, { locale: "en", name: "Perilla / Shiso" }],
                group: "herbs",
                purposes: ["cooking_spices", "medicinal"],
                description: "Tía tô thơm đặc trưng, dùng trong nhiều món Việt",
                typicalDaysToHarvest: 60,
                germinationDays: 10,
                lightRequirements: "partial_shade",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 21,
                source: "seed",
            },
            {
                scientificName: "Eryngium foetidum",
                commonNames: [{ locale: "vi", name: "Ngò gai / Mùi tàu" }, { locale: "en", name: "Culantro" }],
                group: "herbs",
                purposes: ["cooking_spices"],
                description: "Ngò gai thơm mạnh, dùng trong phở và bún bò",
                typicalDaysToHarvest: 70,
                germinationDays: 14,
                lightRequirements: "partial_shade",
                wateringFrequencyDays: 2,
                fertilizingFrequencyDays: 21,
                source: "seed",
            },
        ];

        let count = 0;
        for (const plant of plants) {
            const existing = await ctx.db
                .query("plantsMaster")
                .withIndex("by_scientific_name", (q) =>
                    q.eq("scientificName", plant.scientificName)
                )
                .unique();

            if (!existing) {
                await ctx.db.insert("plantsMaster", plant as any);
                count++;
            }
        }

        return { inserted: count, total: plants.length };
    },
});

// Chạy tất cả seed functions — gọi: npx convex run seed:seedAll
export const seedAll = internalMutation({
    args: {},
    handler: async (ctx) => {
        // --- Seed Plant Groups ---
        const groupDefs = [
            { key: "herbs", displayName: { vi: "Rau thơm", en: "Herbs" }, sortOrder: 1 },
            { key: "vegetables", displayName: { vi: "Rau củ", en: "Vegetables" }, sortOrder: 2 },
            { key: "fruits", displayName: { vi: "Cây ăn quả", en: "Fruits" }, sortOrder: 3 },
            { key: "nightshades", displayName: { vi: "Họ cà", en: "Nightshades" }, sortOrder: 4 },
            { key: "alliums", displayName: { vi: "Họ hành", en: "Alliums" }, sortOrder: 5 },
            { key: "leafy_greens", displayName: { vi: "Rau lá xanh", en: "Leafy Greens" }, sortOrder: 6 },
            { key: "roots", displayName: { vi: "Củ rễ", en: "Root Vegetables" }, sortOrder: 7 },
            { key: "legumes", displayName: { vi: "Họ đậu", en: "Legumes" }, sortOrder: 8 },
            { key: "indoor", displayName: { vi: "Cây trong nhà", en: "Indoor Plants" }, sortOrder: 9 },
            { key: "flowers", displayName: { vi: "Hoa", en: "Flowers" }, sortOrder: 10 },
        ];

        let groupsInserted = 0;
        for (const group of groupDefs) {
            const existing = await ctx.db
                .query("plantGroups")
                .withIndex("by_key", (q) => q.eq("key", group.key))
                .unique();
            if (!existing) {
                await ctx.db.insert("plantGroups", group);
                groupsInserted++;
            }
        }

        return {
            groups: { inserted: groupsInserted, total: groupDefs.length },
            message: "Seed completed! Run seedPlantsMaster separately to add plants.",
        };
    },
});
