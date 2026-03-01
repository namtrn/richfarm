export const palette = {
    light: {
        background: '#faf8f4',
        card: '#ffffff',
        text: '#1c1917',
        textSecondary: '#78716c',
        textAccent: '#5c5247',
        textMuted: '#a8a29e',
        border: '#e7e0d6',
        primary: '#1a4731',
        accent: '#f5f0e8',
        warning: '#f97316',
        warningBg: '#fff7ed',
        danger: '#dc2626',
        dangerBg: '#fef2f2',
        success: '#16a34a',
        successBg: '#f0fdf4',
    },
    dark: {
        background: '#0c0a09',
        card: '#1c1917',
        text: '#f5f5f4',
        textSecondary: '#a8a29e',
        textAccent: '#d6d3d1',
        textMuted: '#57534e',
        border: '#292524',
        primary: '#40916c',
        accent: '#292524',
        warning: '#fb923c',
        warningBg: '#431407',
        danger: '#ef4444',
        dangerBg: '#450a0a',
        success: '#22c55e',
        successBg: '#052e16',
    }
};

export type ThemeColors = typeof palette.light;
