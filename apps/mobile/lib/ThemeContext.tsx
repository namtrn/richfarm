import React, { createContext, useCallback, useContext, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palette, ThemeColors } from './palette';
import { updateScopedPreferences, type ThemePreference } from './state/scopedPreferencesStore';
import { useScopedPreferenceValue } from '../hooks/useScopedPreference';

export type { ThemePreference };

interface ThemeContextValue {
    themePreference: ThemePreference;
    setThemePreference: (pref: ThemePreference) => void;
    colors: ThemeColors;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemScheme = useColorScheme();
    const themePreference = useScopedPreferenceValue('theme');
    const setThemePreference = useCallback((preference: ThemePreference) => {
        void updateScopedPreferences({ theme: preference });
    }, []);

    const isDark =
        themePreference === 'system'
            ? systemScheme === 'dark'
            : themePreference === 'dark';

    const colors = isDark ? palette.dark : palette.light;

    const value = useMemo(() => ({ themePreference, setThemePreference, colors, isDark }), [
        colors,
        isDark,
        setThemePreference,
        themePreference,
    ]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useThemeContext(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
    return ctx;
}
