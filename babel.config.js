// Babel configuration for BiomechIQ
// - babel-preset-expo: Expo SDK 55 / New Architecture defaults (incl. expo-router).
// - react-native-worklets-core/plugin: enables VisionCamera frame-processor worklets.
// - react-native-reanimated/plugin: MUST be listed last (Reanimated requirement).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets-core/plugin',
      'react-native-reanimated/plugin',
    ],
  };
};
