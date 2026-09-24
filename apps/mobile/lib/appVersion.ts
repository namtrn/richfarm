import Constants from 'expo-constants';

export const APP_VERSION = Constants.expoConfig?.version
  ?? Constants.manifest?.version
  ?? '0.0.0';

export const APP_NAME = Constants.expoConfig?.name
  ?? Constants.manifest?.name
  ?? 'App';

export const AI_NAME = Constants.expoConfig?.extra?.aiName
  ?? Constants.manifest?.extra?.aiName
  ?? 'Sprout';
