// src/domain/index.ts
// Barrel for the framework-free domain core. Import domain code via "@/domain".

export * from './types';
export * from './sportProfiles';
export * from './services/angleCalc';
export * from './services/speedEngine';

// Pure domain services (BIOM-23/24/25/33/47/48/51/52)
export * from './services/speedConfidence';
export * from './services/relativeSpeed';
export * from './services/repDetector';
export * from './services/personalBests';
export * from './services/goals';
export * from './services/streaks';
export * from './services/achievements';
export * from './services/compareToIdeal';
export * from './services/bestRep';
export * from './services/leaderboard';
