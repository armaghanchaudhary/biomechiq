# CLAUDE.md — BiomechIQ AI Session Context

> Read this first at the start of every Claude session on this project.
> This file preserves context so research and decisions are never lost.

---

## What this project is

**BiomechIQ** is a cross-platform sports biomechanics analyzer built with React Native + Expo.
It uses a phone/webcam to:
1. Track body pose (33 joint landmarks via MediaPipe BlazePose)
2. Detect and track a sports object (ball etc) via YOLOv8n TFLite
3. Compute object velocity in km/h from pixel displacement
4. Score athletic form against sport-specific ideal joint angle ranges
5. Deliver AI coaching feedback via Claude API

Targets: **iOS app, Android app, Web app** — single codebase.

---

## Current phase: PHASE 1 (in progress)

See `docs/PHASES.md` for the full checklist. Phase 1 goal:
- Expo project scaffolded with New Architecture
- VisionCamera + MediaPipe pose running live
- YOLOv8n object detection in frame processor
- Skia overlay drawing skeleton + object trail
- Speed engine computing velocity per frame
- Live metrics panel on screen

---

## Key architectural decisions (do not revisit without good reason)

| Decision | Choice | Why |
|---|---|---|
| Framework | Expo SDK 56 + RN 0.85 New Architecture | Single codebase iOS/Android/Web, JSI performance |
| Pose detection | react-native-mediapipe-posedetection | GPU, 33 landmarks, works iOS+Android, no bridge |
| Pose web | @mediapipe/tasks-vision | Official Google JS library |
| Object ML | react-native-fast-tflite + YOLOv8n.tflite | C++ runtime, no bridge, 6MB model |
| Camera | react-native-vision-camera v4 | Frame processors run natively, 240fps capable |
| Overlay | @shopify/react-native-skia | GPU canvas, UI thread, 60fps guaranteed |
| State (live) | zustand | Zero boilerplate, works in worklets |
| State (server) | @tanstack/react-query | Caching + sync |
| Backend | Supabase | Postgres SQL, works with Expo managed, open source |
| Charts | victory-native-xl | Skia-based, 60fps on mobile |
| Build/deploy | EAS (eas-cli) | Cloud builds, OTA updates, App Store submission |
| IAP | RevenueCat (react-native-purchases) | Cross-platform subscriptions |

---

## Speed calculation algorithm

```
Speed (km/h) = (pixel_displacement × meters_per_pixel × 3.6) / frame_delta_seconds

pixel_displacement = √((x2−x1)² + (y2−y1)²)  [pixels]
meters_per_pixel   = real_world_scene_width_meters / frame_width_pixels
frame_delta        = (timestamp_now − timestamp_prev) / 1000  [seconds]

Default calibration: 2.0m scene width
Phase 3 upgrade: ARKit/ARCore depth for precise calibration
```

---

## Sport profiles (joint angle ranges)

Defined in `src/models/SportProfiles.ts`. Each sport has:
- List of joints to track (a, b, c landmark indices)
- idealMin / idealMax in degrees
- YOLO object labels to detect

Sports: `tennis` | `cricket` | `baseball` | `basketball` | `golf` | `soccer` | `generic`

---

## Database (Supabase)

Full SQL schema in `docs/SUPABASE_SCHEMA.sql`.

Tables:
- `sessions` — one row per recorded session
- `speed_events` — timeseries of object speed readings
- `session_landmarks` — per-frame landmark data
- `personal_bests` — best speed/form per user per sport
- `goals` — user-defined targets

All tables have Row Level Security — users only see their own data.

---

## File map (what lives where)

```
src/models/types.ts          ← All TypeScript types + PoseLandmark enum
src/models/SportProfiles.ts  ← Ideal joint angles per sport
src/services/speedEngine.ts  ← Speed computation + throw detection
src/services/supabase.ts     ← DB client + all queries
src/services/coachingEngine.ts ← Form score + feedback (Phase 3)
src/services/claudeCoach.ts  ← Claude API integration (Phase 3)
src/store/sessionStore.ts    ← Zustand live session state
src/utils/angleCalc.ts       ← Joint angle math + form scoring
src/utils/colors.ts          ← Design system color tokens
app/(tabs)/index.tsx         ← Main camera screen
app/(tabs)/sessions.tsx      ← Session history (Phase 2)
app/(tabs)/progress.tsx      ← Charts dashboard (Phase 4)
```

---

## Environment variables needed

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_CLAUDE_API_KEY
```

---

## Things NOT to change without discussion

- New Architecture must stay on (required by mediapipe-posedetection)
- VisionCamera frame processors must stay on native thread (no JS bridge)
- Skia overlay must stay on UI thread (shared values, not setState)
- Supabase RLS must stay on for all tables

---

## Next steps for the current session

Check `docs/PHASES.md` Phase 1 checklist and pick up from the first unchecked item.
