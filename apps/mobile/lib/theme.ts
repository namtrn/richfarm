import { palette, ThemeColors } from './palette';
import { useThemeContext } from './ThemeContext';

export { palette, ThemeColors };

export function useTheme(): ThemeColors {
    const { colors } = useThemeContext();
    return colors;
}
