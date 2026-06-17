# BiomechIQ

> Real-time sports biomechanics analyzer — Web · iOS · Android

Built with React Native + Expo. Uses your camera to track body movement (33 joint landmarks), detect sports objects, and measure how fast they travel — all in one live view.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npx expo start

# iOS simulator
npx expo run:ios

# Android emulator
npx expo run:android

# Web
npx expo start --web
```

> **Requires:** Node 20+, Expo CLI, Xcode (iOS), Android Studio (Android)

---

## What it does

- **Body tracking** — MediaPipe BlazePose, 33 landmarks, GPU-accelerated, 30fps+
- **Object speed** — YOLOv8n TFLite detects balls/objects, computes velocity in km/h
- **Joint angles** — Real-time angle calculation with sport-specific ideal ranges
- **Form scoring** — 0–100 score per session based on biomechanics data
- **AI coaching** — Claude API generates natural language feedback
- **Session history** — Supabase backend, video storage, personal bests

See [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) for full architecture and phase plan.

---

## Environment Variables

Create a `.env` file in the root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_CLAUDE_API_KEY=your_anthropic_api_key
```

---

## Project Structure

```
biomechiq/
├── app/                    ← Expo Router screens
│   └── (tabs)/
│       ├── index.tsx       ← Live camera analyzer (main screen)
│       ├── sessions.tsx    ← Session history
│       ├── progress.tsx    ← Progress dashboard
│       └── profile.tsx     ← User profile
├── src/
│   ├── models/             ← Types + sport angle profiles
│   ├── services/           ← Supabase, speed engine, coaching
│   ├── store/              ← Zustand state
│   ├── hooks/              ← Camera, pose, object tracking
│   ├── components/         ← UI + camera overlay components
│   └── utils/              ← Angle math, colors, calibration
├── assets/
│   └── models/             ← .tflite + .task ML model files
├── docs/
│   ├── MASTER_PLAN.md      ← Full 5-phase plan + library decisions
│   ├── PHASES.md           ← Phase-by-phase task tracker
│   └── SUPABASE_SCHEMA.sql ← Database setup script
└── CLAUDE.md               ← AI session context (read this first)
```

---

## Deployment

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Deploy web
expo export --platform web
# then: vercel deploy ./dist
```
