import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const palette = {
  light: {
    background: '#F7F8FC',
    card: '#FFFFFF',
    text: '#172033',
    textSecondary: '#667085',
    border: '#E2E6EF',
    primary: '#4A67D6',
    experiment: '#E9EEFF',
  },
  dark: {
    background: '#111522',
    card: '#1B2132',
    text: '#F7F8FC',
    textSecondary: '#A8B0C2',
    border: '#31394D',
    primary: '#8298EF',
    experiment: '#252E4B',
  },
};

type ThemePreference = 'light' | 'dark' | 'system';
type ThemeValue = {
  colors: typeof palette.light;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);
const STORAGE_KEY = 'physics-discovery/theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setPreferenceState(saved);
    });
  }, []);

  const setPreference = (value: ThemePreference) => {
    setPreferenceState(value);
    void AsyncStorage.setItem(STORAGE_KEY, value);
  };
  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const value = useMemo(
    () => ({ colors: isDark ? palette.dark : palette.light, isDark, preference, setPreference }),
    [isDark, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
