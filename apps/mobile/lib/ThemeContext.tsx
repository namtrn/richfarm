import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useUserSettings } from '../hooks/useUserSettings';
import { palette, ThemeColors } from './palette';

type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
    themePreference: ThemePreference;
    setThemePreference: (pref: ThemePreference) => void;
    colors: ThemeColors;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemScheme = useColorScheme();
    const { settings } = useUserSettings();
    const [themePreference, setThemePreference] = useState<ThemePreference>(
        (settings?.theme as ThemePreference) ?? 'system'
    );

    // Sync from Convex when settings load/change (e.g. on first mount or new device)
    useEffect(() => {
        if (settings?.theme) {
            setThemePreference(settings.theme as ThemePreference);
        }
    }, [settings?.theme]);

    const isDark =
        themePreference === 'system'
            ? systemScheme === 'dark'
            : themePreference === 'dark';

    const colors = isDark ? palette.dark : palette.light;

    return (
        <ThemeContext.Provider value={{ themePreference, setThemePreference, colors, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useThemeContext(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
    return ctx;
}
