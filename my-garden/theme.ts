import { createV5Theme, defaultChildrenThemes } from '@tamagui/config/v5'
import { v5ComponentThemes } from '@tamagui/themes/v5'
import { yellow, yellowDark, red, redDark, green, greenDark } from '@tamagui/colors'

const darkPalette = ['hsla(90, 16%, 1%, 1)', 'hsla(90, 16%, 6%, 1)', 'hsla(90, 16%, 12%, 1)', 'hsla(90, 16%, 17%, 1)', 'hsla(90, 16%, 23%, 1)', 'hsla(90, 16%, 28%, 1)', 'hsla(90, 16%, 34%, 1)', 'hsla(90, 16%, 39%, 1)', 'hsla(90, 16%, 45%, 1)', 'hsla(90, 16%, 50%, 1)', 'hsla(0, 15%, 93%, 1)', 'hsla(0, 15%, 99%, 1)']
const lightPalette = ['hsla(90, 16%, 94%, 1)', 'hsla(90, 16%, 89%, 1)', 'hsla(90, 16%, 84%, 1)', 'hsla(90, 16%, 79%, 1)', 'hsla(90, 16%, 74%, 1)', 'hsla(90, 16%, 70%, 1)', 'hsla(90, 16%, 65%, 1)', 'hsla(90, 16%, 60%, 1)', 'hsla(90, 16%, 55%, 1)', 'hsla(90, 16%, 50%, 1)', 'hsla(0, 15%, 15%, 1)', 'hsla(0, 15%, 1%, 1)']

// Your custom accent color theme
const accentLight = {
    "accent1": "hsla(120, 24%, 39%, 1)",
    "accent2": "hsla(120, 24%, 42%, 1)",
    "accent3": "hsla(120, 24%, 45%, 1)",
    "accent4": "hsla(120, 24%, 48%, 1)",
    "accent5": "hsla(120, 24%, 51%, 1)",
    "accent6": "hsla(120, 24%, 53%, 1)",
    "accent7": "hsla(120, 24%, 56%, 1)",
    "accent8": "hsla(120, 24%, 59%, 1)",
    "accent9": "hsla(120, 24%, 62%, 1)",
    "accent10": "hsla(120, 24%, 65%, 1)",
    "accent11": "hsla(250, 50%, 95%, 1)",
    "accent12": "hsla(250, 50%, 95%, 1)"
}

const accentDark = {
    "accent1": "hsla(120, 24%, 35%, 1)",
    "accent2": "hsla(120, 24%, 38%, 1)",
    "accent3": "hsla(120, 24%, 41%, 1)",
    "accent4": "hsla(120, 24%, 43%, 1)",
    "accent5": "hsla(120, 24%, 46%, 1)",
    "accent6": "hsla(120, 24%, 49%, 1)",
    "accent7": "hsla(120, 24%, 52%, 1)",
    "accent8": "hsla(120, 24%, 54%, 1)",
    "accent9": "hsla(120, 24%, 57%, 1)",
    "accent10": "hsla(120, 24%, 60%, 1)",
    "accent11": "hsla(250, 50%, 90%, 1)",
    "accent12": "hsla(250, 50%, 95%, 1)"
}

const builtThemes = createV5Theme({
    darkPalette,
    lightPalette,
    componentThemes: v5ComponentThemes,
    childrenThemes: {
        // Include default color themes (blue, red, green, yellow, etc.)
        ...defaultChildrenThemes,

        // Your custom accent color
        accent: {
            light: accentLight,
            dark: accentDark,
        },

        // Semantic color themes for warnings, errors, and success states
        warning: {
            light: yellow,
            dark: yellowDark,
        },
        error: {
            light: red,
            dark: redDark,
        },
        success: {
            light: green,
            dark: greenDark,
        },
    },
})

export type Themes = typeof builtThemes

// the process.env conditional here is optional but saves web client-side bundle
// size by leaving out themes JS. tamagui automatically hydrates themes from CSS
// back into JS for you, and the bundler plugins set TAMAGUI_ENVIRONMENT. so
// long as you are using the Vite, Next, Webpack plugins this should just work,
// but if not you can just export builtThemes directly as themes:
export const themes: Themes =
    process.env.TAMAGUI_ENVIRONMENT === 'client' &&
        process.env.NODE_ENV === 'production'
        ? ({} as any)
        : (builtThemes as any)
