// Metro configuration for BiomechIQ
// Extends the Expo default and registers ML model binaries (.tflite/.task) as assets
// so react-native-fast-tflite and MediaPipe can load them via require().
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ML model formats shipped in assets/models/ must be treated as assets, not source.
config.resolver.assetExts.push('tflite', 'task', 'bin', 'onnx');

module.exports = config;
