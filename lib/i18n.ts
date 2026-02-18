import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

// Import translations
const en = require('./locales/en.json');
const vi = require('./locales/vi.json');
const es = require('./locales/es.json');
const pt = require('./locales/pt.json');
const fr = require('./locales/fr.json');
const zh = require('./locales/zh.json');

const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
const supportedLngs = ['en', 'vi', 'es', 'pt', 'fr', 'zh'];

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            vi: { translation: vi },
            es: { translation: es },
            pt: { translation: pt },
            fr: { translation: fr },
            zh: { translation: zh },
        },
        lng: 'en', // default English
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        compatibilityJSON: 'v4',
    });

export default i18n;
