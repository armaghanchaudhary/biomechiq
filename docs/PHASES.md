# BiomechIQ — Phase Tracker

> Update checkboxes as tasks are completed.
> One source of truth for what's done and what's next.

---

## PHASE 1 — Core Engine
**Goal:** Real-time pose + object detection in one live view
**Timeline:** Weeks 1–2
**Status:** 🟡 In Progress

### Scaffold
- [ ] `npx create-expo-app biomechiq --template blank-typescript`
- [ ] Enable New Architecture in app.json (`"newArchEnabled": true`)
- [ ] Install all dependencies from package.json
- [ ] Configure metro.config.js for .tflite assets
- [ ] Set up .env with Supabase keys

### Camera
- [ ] Install + configure react-native-vision-camera v4
- [ ] iOS permissions (NSCameraUsageDescription in app.json ✅)
- [ ] Android permissions (CAMERA in app.json ✅)
- [ ] Camera permission request screen
- [ ] Front/rear camera toggle

### Pose Detection
- [ ] Install react-native-mediapipe-posedetection
- [ ] Download pose_landmarker_lite.task → assets/models/
- [ ] Wire up frame processor → pose hook
- [ ] Verify 33 landmarks outputting on device
- [ ] Connect landmarks to Zustand store

### Object Detection
- [ ] Install react-native-fast-tflite
- [ ] Download YOLOv8n.tflite → assets/models/
- [ ] Configure metro for .tflite extension
- [ ] Frame processor: resize frame → run inference → parse bbox
- [ ] Fallback: color-based pixel sampler (for web)

### Skia Overlay
- [ ] Install @shopify/react-native-skia
- [ ] Canvas covering full camera view
- [ ] Draw skeleton connections (POSE_CONNECTIONS)
- [ ] Draw joint landmark dots
- [ ] Draw object bounding circle
- [ ] Draw object motion trail (last 20 positions)
- [ ] Speed label next to object

### Speed Engine
- [ ] speedEngine.ts wired to frame processor output ✅ (built)
- [ ] ThrowDetector counting releases ✅ (built)
- [ ] Calibration screen (Phase 2 — skip for now)
- [ ] Speed feeding into Zustand store

### Metrics Panel
- [ ] Live speed display (large number)
- [ ] Peak speed tracker
- [ ] 6 joint angle rows with color bars
- [ ] Live coaching tips (3 max)
- [ ] FPS counter in HUD

### Web Version
- [ ] Swap VisionCamera → getUserMedia for web
- [ ] Swap TFLite → @mediapipe/tasks-vision for web
- [ ] Verify Skia canvas works on web
- [ ] Test in Chrome

---

## PHASE 2 — Session Recording & Playback
**Goal:** Record, save, review sessions
**Timeline:** Weeks 3–4
**Status:** ⬜ Not Started

- [ ] Start/stop recording button (UI exists ✅, logic needed)
- [ ] Record video to local file (expo-av or expo-camera)
- [ ] Capture landmark timeseries to memory during recording
- [ ] Session summary screen (peak speed, avg, form score, throw count)
- [ ] Supabase project created + schema applied (docs/SUPABASE_SCHEMA.sql)
- [ ] Save session to Supabase on stop
- [ ] Upload video to Supabase Storage
- [ ] Sessions list screen (app/(tabs)/sessions.tsx)
- [ ] Session detail screen (app/session/[id].tsx)
- [ ] Playback scrubber with pose replay
- [ ] Speed history chart (Victory Native XL)

---

## PHASE 3 — AI Coaching Engine
**Goal:** Sport-specific form analysis + AI feedback
**Timeline:** Weeks 5–6
**Status:** ⬜ Not Started

- [ ] Sport selector UI (modal or bottom sheet)
- [ ] SportProfiles.ts wired to live angle analysis ✅ (built)
- [ ] Form score 0–100 algorithm ✅ (built in angleCalc.ts)
- [ ] coachingEngine.ts — generates structured feedback
- [ ] claudeCoach.ts — Claude API call with session context
- [ ] Real-time voice feedback (expo-speech)
- [ ] Highlight detection: auto-clip moments > 80% peak speed
- [ ] Side-by-side comparison: your form vs ideal skeleton overlay

---

## PHASE 4 — Progress & Social
**Goal:** Long-term improvement tracking + sharing
**Timeline:** Weeks 7–9
**Status:** ⬜ Not Started

- [ ] Progress dashboard screen (app/(tabs)/progress.tsx)
- [ ] Weekly/monthly speed trend charts
- [ ] Form score trend over time
- [ ] Personal bests display per sport
- [ ] Goal setting UI
- [ ] Push notification on new personal best
- [ ] Share clip: export video with skeleton overlay burned in
- [ ] Opt-in leaderboard per sport

---

## PHASE 5 — Production Deployment
**Goal:** Ship to App Store, Play Store, web
**Timeline:** Weeks 10–12
**Status:** ⬜ Not Started

- [ ] EAS project linked (`eas init`)
- [ ] iOS provisioning profile + certificates
- [ ] Android keystore generated
- [ ] TestFlight internal build
- [ ] Google Play internal test track
- [ ] Performance pass: 60fps on iPhone 12 + Pixel 6
- [ ] Sentry error tracking integrated
- [ ] PostHog analytics integrated
- [ ] Onboarding flow (3-screen tutorial)
- [ ] RevenueCat paywall (free: 1 sport, pro: all sports + AI coaching)
- [ ] App Store listing (screenshots, description, keywords)
- [ ] Google Play listing
- [ ] Vercel web deployment
- [ ] Supabase production project (paid tier)
- [ ] Launch 🚀

---

## Completed Items Log

| Date | Item | Notes |
|------|------|-------|
| 2026-06-17 | Deep research on all libraries | MediaPipe vs MoveNet, RN ecosystem, Supabase vs Firebase |
| 2026-06-17 | MASTER_PLAN.md | Full architecture documented |
| 2026-06-17 | types.ts | All TypeScript types, PoseLandmark enum, POSE_CONNECTIONS |
| 2026-06-17 | SportProfiles.ts | 6 sports with biomechanics-based ideal angle ranges |
| 2026-06-17 | speedEngine.ts | Speed computation, smoothing, throw detection |
| 2026-06-17 | angleCalc.ts | Joint angle math, form score, coaching tip generator |
| 2026-06-17 | sessionStore.ts | Zustand store for full session lifecycle |
| 2026-06-17 | supabase.ts | DB client, session/PB queries, video storage, SQL schema |
| 2026-06-17 | app/(tabs)/index.tsx | Main camera screen architecture |
| 2026-06-17 | app.json | iOS/Android/web config, permissions, EAS |
| 2026-06-17 | eas.json | Dev/preview/production build profiles |
| 2026-06-17 | package.json | Full dependency manifest |
