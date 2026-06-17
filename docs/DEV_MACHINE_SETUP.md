# Dev Machine Setup

How to get BiomechIQ running on a real device for development.

## Two things to know first

1. **You cannot use Expo Go.** The app depends on native modules that aren't in Expo Go (VisionCamera, MediaPipe pose, `react-native-fast-tflite`, Skia, worklets). You must build a **development build** (a custom dev client).
2. **The live engine needs a physical device.** Camera → pose → object → speed runs through native frame processors; iOS Simulator / Android emulator do not provide a usable camera feed for this. Use a real phone for anything touching the camera/ML pipeline.

The stack is intentionally pinned to **Expo SDK 53 + VisionCamera v4 + Reanimated 3 + worklets-core** (see `docs/POSE_LIB_EVALUATION.md` and the Confluence "Platform Stack Decision" — do not bump to the latest SDK without reading why).

---

## iOS — MacBook + iPhone (complete setup)

A MacBook + iPhone is everything you need for iOS. The iPhone is the real-camera test device (the Simulator won't do camera/pose).

You need **one** of:
- **Xcode** (free, Mac App Store, ~15 GB) + CocoaPods — for local builds via `npx expo run:ios`.
- …or just **EAS Build** (cloud, recommended below) — then you don't need the local Xcode toolchain.

Apple account:
- A **free Apple ID** can install a dev build on your own iPhone, but it **expires every 7 days** and must be re-signed.
- The **Apple Developer Program ($99/yr)** removes that friction and unlocks TestFlight + the App Store. Fine to start free; you'll want paid before long.

---

## Android — what you need

The MacBook can build Android too (no second computer needed). For the live engine you need a **physical Android phone** (camera + on-device ML) — that's the one piece to acquire.

You need **one** of:
- **Android Studio** (free, ~8 GB) for the Android SDK + platform tools + a JDK — for local builds via `npx expo run:android`.
- …or just **EAS Build** (cloud) — then you only need the phone to sideload the APK onto.

Android installs an APK directly (enable "install unknown apps") — none of Apple's signing dance. Android costs nothing for development; the **$25 one-time** Play fee is only for publishing.

---

## Recommended path: EAS Build (cloud) — skip the heavy local toolchains

`eas.json` is already committed (dev / preview / production profiles).

```bash
npm i -g eas-cli && eas login            # free Expo account
eas device:create                        # register your iPhone (iOS dev builds only)
eas build --profile development -p ios     # cloud build -> install link / TestFlight
eas build --profile development -p android # cloud build -> installable APK
npx expo start --dev-client                # run the JS; loads into the dev build
```

Install the dev build **once per device**, then iterate on JS over Wi-Fi — no rebuilds for ordinary code changes (only when native deps change). EAS free tier has monthly build limits but is plenty to start.

## Alternative: local builds

```bash
# requires Xcode (iOS) / Android Studio (Android) installed locally
npx expo run:ios        # builds + installs to a connected iPhone (or Simulator, no camera)
npx expo run:android    # builds + installs to a connected Android device/emulator
```

---

## Costs at a glance

| Platform | Have it (MacBook + iPhone) | Need |
|---|---|---|
| **iOS** | ✅ MacBook + iPhone | Xcode *or* EAS · free Apple ID (or $99/yr for TestFlight/App Store) |
| **Android** | MacBook ✅ | **A physical Android phone** + Android Studio *or* EAS |

## First milestone on hardware

Once a dev build is installed, the first integration is **BIOM-17** — wire the live camera engine (VisionCamera frame processor → MediaPipe pose → YOLO/TFLite object → Skia overlay → metrics) into the ports already defined in `src/ports` and registered in `src/platform/bootstrap.*`. The domain/adapter/logic layer it consumes is already built and tested.
