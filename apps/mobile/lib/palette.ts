export const palette = {
    light: {
        background: '#fffffff7',
        card: '#fffffff7',
        text: '#1a1a1a',
        textSecondary: '#737373', // Neutral 500
        textAccent: '#1e293b',
        textMuted: '#a3a3a3', // Neutral 400
        border: '#e5e5e5', // Neutral 200
        primary: '#5d7f52', // Forest Green
        accent: '#f5f5f5', // Neutral 100 or close (f1f2f4 was original)
        warning: '#b89561ff',
        warningBg: '#fff7ed',
        danger: '#b87a5a',
        dangerBg: '#fee2e2',
        success: '#6b8c5f',
        successBg: '#d4dfceff',
        // Additional colors
        premium: '#fbbf24',
        info: '#3b82f6',
        infoLight: '#60a5fa',
        admin: '#8b5cf6',
        primaryLight: '#7b996f',
        primaryLighter: '#96ad8c',
        primaryDark: '#4a6741',
        accentSage: '#8a9a7e',
        accentMoss: '#7a8c6a',
        accentBark: '#8a7a68',
        accentPine: '#3e5241',
        accentOlive: '#6b705c',
        accentClay: '#b07d62',
        accentForest: '#2d4c3b',
    },
    dark: {
        background: '#141414',
        card: '#242424',
        text: '#f9fafb',
        textSecondary: '#a3a3a3', // Neutral 400
        textAccent: 'rgba(255, 255, 255, 0.9)',
        textMuted: '#737373', // Neutral 500
        border: '#404040', // Neutral 700
        primary: '#7a9670',
        accent: '#171717', // Neutral 900 or close (1c1c1c was original)
        warning: '#c4a678',
        warningBg: 'rgba(154, 52, 18, 0.2)',
        danger: '#ef4444',
        dangerBg: 'rgba(153, 27, 27, 0.2)',
        success: '#6b8c5f',
        successBg: 'rgba(6, 95, 70, 0.2)',
        // Additional colors
        premium: '#fbbf24',
        info: '#60a5fa',
        infoLight: '#93c5fd',
        admin: '#8b5cf6',
        primaryLight: '#96ad8c',
        primaryLighter: '#b4c9ab',
        primaryDark: '#5d7f52',
        accentSage: '#8a9a7e',
        accentMoss: '#7a8c6a',
        accentBark: '#8a7a68',
        accentPine: '#4e6351',
        accentOlive: '#7c8269',
        accentClay: '#c18e74',
        accentForest: '#3d5c4b',
    }
};

export type ThemeColors = typeof palette.light;
