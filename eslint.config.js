// eslint.config.js (ESLint 9 flat config)
// Enforces the Hexagonal / Ports-and-Adapters boundaries (BIOM-13):
//   - The pure layers (domain, application, ports, platform) must NOT import
//     React/Expo or any vendor SDK. Vendor code lives only in src/adapters/*.
//   - The domain must not depend on outer layers (dependencies point inward).
//
// Implemented with the core `no-restricted-imports` rule (no extra plugins).

const tsParser = require('@typescript-eslint/parser');

// Framework + vendor packages that may only appear inside src/adapters/*.
const VENDOR = [
  'react',
  'react-dom',
  'react-native',
  'react-native-*',
  'expo',
  'expo-*',
  '@expo/*',
  '@shopify/*',
  '@supabase/*',
  '@mediapipe/*',
  '@tanstack/*',
  '@sentry/*',
  'zustand',
  'victory-native',
  'react-native-purchases',
];

const VENDOR_MESSAGE =
  'Vendor/framework imports are not allowed in this layer. Put the integration in src/adapters/* behind a port (see Confluence "03 · Layered Architecture").';

// Outer layers the domain must never import (dependencies point inward).
const INWARD_VIOLATIONS = ['@/ports', '@/platform', '@/adapters', '@/application'];

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'web-build/**',
      'assets/**',
      'babel.config.js',
      'metro.config.js',
      'eslint.config.js',
      'vitest.config.ts',
    ],
  },

  // Base: parse all TypeScript (no rules applied here beyond parsing).
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Domain: framework-free AND inward-only (depends on nothing else in the app).
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: VENDOR, message: VENDOR_MESSAGE },
            {
              group: INWARD_VIOLATIONS,
              message:
                'The domain layer must not import outer layers (dependencies point inward).',
            },
          ],
        },
      ],
    },
  },

  // Application + ports + platform: framework/vendor-free (only domain + ports types).
  {
    files: [
      'src/application/**/*.{ts,tsx}',
      'src/ports/**/*.{ts,tsx}',
      'src/platform/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: VENDOR, message: VENDOR_MESSAGE }] },
      ],
    },
  },
];
