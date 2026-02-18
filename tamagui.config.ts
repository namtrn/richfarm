import { themes } from './theme'
import { defaultConfig, createTamagui } from '@tamagui/config/v5'

export const config = createTamagui({
    ...defaultConfig,
    themes,
})
