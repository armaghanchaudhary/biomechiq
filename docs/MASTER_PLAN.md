# BiomechIQ — Full Product Master Plan
> Cross-platform sports biomechanics analyzer: Web · iOS · Android

---

## TECH STACK DECISIONS (Research-Backed)

### Framework: React Native + Expo SDK 55 (New Architecture)
- Single codebase → Web, iOS, Android
- Expo Router v7 for file-based navigation
- New Architecture (Fabric + JSI + TurboModules) — no legacy bridge
- React Native 0.83 / React 19.2

### Pose Detection: MediaPipe BlazePose via react-native-mediapipe-posedetection
- 33 landmarks, 2D + 3D world coordinates
- GPU-accelerated (Metal on iOS, OpenGL ES on Android)
- Web: MediaPipe JS Tasks API via @mediapipe/tasks-vision
- 88.7% detection rate, 714KB model footprint, 30+ FPS on mid-range devices

### Object Tracking: TFLite + react-native-fast-tflite + Vision Camera v4
- YOLOv8n.tflite for ball/object detection (smallest YOLO model, <6MB)
- VisionCamera frame processors run at native thread speed
- Speed computation: pixel displacement × calibration factor ÷ frame delta

### Camera: react-native-vision-camera v4
- Frame processors run in C++ worklets (no JS bridge on hot path)
- Up to 240 FPS on supported devices
- Supports both front + rear cameras

### Rendering Overlay: @shopify/react-native-skia
- GPU-backed canvas, identical rendering iOS/Android
- Runs on UI thread via Reanimated Shared Values
- Draws skeleton lines, joint dots, speed labels, object trails
- 60+ FPS sustained, 120Hz screen support

### State Management: Zustand + React Query
- Zustand for local real-time state (landmarks, speed, session)
- React Query for server data (history, profiles, leaderboards)

### Backend: Supabase
- PostgreSQL for structured session analytics (joins, complex queries)
- Supabase Realtime for live coaching sessions
- Supabase Storage (S3-compatible) for video clips
- Row Level Security for multi-user data isolation
- Self-hostable if needed (open source)
- Works natively with Expo managed workflow (no custom native modules)

### Charts & Analytics: Victory Native XL + Recharts (web)
- Victory Native XL uses Skia rendering — 60fps charts on mobile

### Auth: Supabase Auth
- Email, Google, Apple Sign-In
- Built into Supabase, no extra service needed

---

## PHASE 1 — Core Engine (Weeks 1–2)
**Goal: Real-time pose tracking + object detection in one unified view**

Deliverables:
- [ ] Expo project scaffold with New Architecture
- [ ] VisionCamera integration with permissions
- [ ] MediaPipe BlazePose pose detection (33 landmarks)
- [ ] Skia overlay for skeleton + joint angle labels
- [ ] Color-based object tracker (fallback for non-ML detection)
- [ ] YOLOv8n TFLite frame processor for object detection
- [ ] Speed computation engine with calibration
- [ ] Live metrics panel (joint angles, object speed)
- [ ] Web version with MediaPipe JS Tasks

---

## PHASE 2 — Session Recording & Playback (Weeks 3–4)
**Goal: Record, save, review sessions with frame-by-frame analysis**

Deliverables:
- [ ] Session recording (video + landmark timeseries data)
- [ ] Playback scrubber with pose replay
- [ ] Speed history chart (Victory Native XL)
- [ ] Per-session summary report (peak speed, avg angles, throw count)
- [ ] Supabase integration — save sessions to PostgreSQL
- [ ] Video clip storage to Supabase Storage
- [ ] Session list screen with thumbnails

---

## PHASE 3 — AI Coaching Engine (Weeks 5–6)
**Goal: Sport-specific form analysis and personalized feedback**

Deliverables:
- [ ] Sport selector (Tennis, Cricket, Baseball, Basketball, Golf, Soccer)
- [ ] Reference biomechanics model per sport (ideal joint angle ranges)
- [ ] Form scoring algorithm (0–100 score per session)
- [ ] Claude API integration for natural language coaching feedback
- [ ] Real-time voice feedback (Expo Speech)
- [ ] Highlight detection: auto-clip peak-speed moments
- [ ] Comparison view: your form vs ideal form overlay

---

## PHASE 4 — Progress Tracking & Social (Weeks 7–9)
**Goal: Long-term improvement visibility + motivation layer**

Deliverables:
- [ ] Progress dashboard (weekly/monthly trend charts)
- [ ] Personal bests tracking (speed, form score, consistency)
- [ ] Goal setting and milestone notifications
- [ ] User profiles with sport focus
- [ ] Athlete leaderboards (speed, form score) — opt-in
- [ ] Share clip feature (export annotated video with skeleton overlay)
- [ ] Push notifications via Expo Notifications + Supabase Edge Functions

---

## PHASE 5 — Production & Deployment (Weeks 10–12)
**Goal: Ship to App Store, Play Store, and web**

Deliverables:
- [ ] EAS Build for iOS (.ipa) and Android (.apk/.aab)
- [ ] App Store Connect submission + review
- [ ] Google Play Console submission
- [ ] Web deployment (Expo for Web → Vercel)
- [ ] Supabase production project (paid tier)
- [ ] Performance profiling + optimization (60fps target on iPhone 12+)
- [ ] Error tracking (Sentry)
- [ ] Analytics (PostHog — open source, self-hostable)
- [ ] Onboarding flow + tutorial overlay
- [ ] Subscription paywall (RevenueCat for IAP)

---

## LIBRARY MANIFEST

| Purpose | Library | Why |
|---|---|---|
| Framework | expo SDK 55 + react-native 0.83 | New Architecture mandatory |
| Navigation | expo-router v7 | File-based, works web+native |
| Camera | react-native-vision-camera v4 | Frame processors, 240fps |
| Pose (mobile) | react-native-mediapipe-posedetection | GPU, 33 landmarks, iOS+Android |
| Pose (web) | @mediapipe/tasks-vision | Official Google JS library |
| Object ML | react-native-fast-tflite | Optimized C++ TFLite runtime |
| Object model | YOLOv8n.tflite | 6MB, fastest YOLO variant |
| Rendering | @shopify/react-native-skia | GPU canvas, UI thread, 60fps |
| Animation | react-native-reanimated v3 | Worklets on UI thread |
| Gestures | react-native-gesture-handler | Pairs with Reanimated |
| State | zustand | Minimal, fast, no boilerplate |
| Server state | @tanstack/react-query | Caching, sync, offline |
| Backend | supabase-js | Auth + DB + Storage + Realtime |
| Charts | victory-native-xl | Skia-based, 60fps mobile charts |
| Voice | expo-speech | Cross-platform TTS feedback |
| Notifications | expo-notifications | iOS + Android push |
| Build | eas-cli | Cloud builds, OTA updates |
| IAP | react-native-purchases (RevenueCat) | Cross-platform subscriptions |
| Errors | @sentry/react-native | Crash reporting |

---

## SPEED CALCULATION ALGORITHM

```
Speed (km/h) = (pixel_displacement × meters_per_pixel × 3.6) / frame_delta_seconds

Where:
  pixel_displacement = √((x2-x1)² + (y2-y1)²)  in normalized coords × canvas_width
  meters_per_pixel = known_real_world_width / canvas_width_in_pixels
  frame_delta = timestamp_now - timestamp_prev  (in seconds)
  × 3.6 = convert m/s to km/h

Calibration: User sets a reference object of known size in frame,
or accepts default assumption (2m scene width).
For Phase 3, we add ARKit/ARCore for precise depth estimation.
```

---

## DATABASE SCHEMA (Supabase PostgreSQL)

```sql
-- Users
users (id, email, display_name, sport_focus, created_at)

-- Sessions
sessions (id, user_id, sport, duration_secs, created_at,
          peak_speed_kmh, avg_speed_kmh, form_score,
          throw_count, video_url, thumbnail_url)

-- Landmarks (timeseries — one row per frame saved)
session_landmarks (id, session_id, frame_ts, landmarks_json)

-- Speed Events (only non-zero speed moments)
speed_events (id, session_id, timestamp_ms, speed_kmh, object_x, object_y)

-- Personal Bests
personal_bests (user_id, sport, metric, value, achieved_at, session_id)

-- Goals
goals (id, user_id, sport, metric, target_value, created_at, achieved_at)
```

---

## FOLDER STRUCTURE

```
biomechiq/
├── app/                        ← Expo Router pages
│   ├── (tabs)/
│   │   ├── index.tsx           ← Live camera analyzer
│   │   ├── sessions.tsx        ← Session history
│   │   ├── progress.tsx        ← Progress dashboard
│   │   └── profile.tsx         ← User profile
│   ├── session/[id].tsx        ← Session detail/replay
│   └── _layout.tsx
├── src/
│   ├── components/
│   │   ├── camera/
│   │   │   ├── CameraView.tsx          ← VisionCamera setup
│   │   │   ├── SkiaOverlay.tsx         ← Skeleton + trails drawing
│   │   │   └── MetricsHUD.tsx          ← Live metrics overlay
│   │   ├── charts/
│   │   │   ├── SpeedChart.tsx
│   │   │   └── AngleChart.tsx
│   │   └── ui/                         ← Design system components
│   ├── hooks/
│   │   ├── usePoseDetection.ts         ← MediaPipe hook
│   │   ├── useObjectTracking.ts        ← YOLO + speed computation
│   │   ├── useSession.ts               ← Recording management
│   │   └── useCalibration.ts           ← Speed calibration
│   ├── services/
│   │   ├── supabase.ts                 ← DB client + queries
│   │   ├── speedEngine.ts              ← Speed calculation
│   │   ├── coachingEngine.ts           ← Form analysis + feedback
│   │   └── claudeCoach.ts             ← Claude API integration
│   ├── store/
│   │   ├── sessionStore.ts             ← Zustand session state
│   │   └── userStore.ts
│   ├── models/
│   │   ├── SportProfiles.ts            ← Ideal angle ranges per sport
│   │   └── types.ts
│   └── utils/
│       ├── angleCalc.ts
│       ├── smoothing.ts
│       └── calibration.ts
├── assets/
│   └── models/
│       ├── pose_landmarker_lite.task   ← MediaPipe model
│       └── yolov8n.tflite             ← Object detection model
├── docs/
│   └── MASTER_PLAN.md
└── package.json
```
