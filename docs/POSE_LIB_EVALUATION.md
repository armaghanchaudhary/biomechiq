# Pose-Library Evaluation — On-Device Pose Estimation for BiomechIQ

> BIOM-18 (research). Decision document — no production code.
> Goal: pick a primary + fallback on-device pose-estimation library for the
> current stack and document the trade-offs so the decision is not re-litigated.

---

## 1. Context & constraints

BiomechIQ needs **real-time, on-device** body-pose tracking that runs inside a
**VisionCamera v4 frame processor** so pixels never cross the JS bridge. The
form-scoring and joint-angle math in `@/domain` consumes:

- **33 landmarks** with normalized image coords (x, y), depth (z), visibility.
- Ideally **3D world coordinates** for angle accuracy independent of camera tilt
  (`computeJointAngle` / `angleBetweenPoints` are happiest with metric 3D points).
- Live-stream mode (not just single image).

Stack the library must fit (from `package.json`):

| Component | Version |
|---|---|
| Expo | SDK 53 |
| React Native | 0.79.6 |
| React | 19.0.0 |
| react-native-vision-camera | ~4.7.0 |
| react-native-worklets-core | ^1.3.3 |
| New Architecture | **ON** (required) |
| react-native-fast-tflite | ^3.0.1 (already installed) |
| vision-camera-resize-plugin | ^3.1.0 (already installed) |
| @shopify/react-native-skia | 2.0.0-next.4 (overlay) |

Current pick in the tree: **react-native-mediapipe-posedetection ^0.4.0**.
The concern that triggered this review: it is a **single-maintainer v0.x**
package with 22 stars — bus-factor and longevity risk for a core dependency.

---

## 2. Candidates evaluated

1. **react-native-mediapipe-posedetection** (EndLess728) — current pick
2. **react-native-fast-tflite + BlazePose `.tflite`** (mrousavy DIY approach)
3. **cdiddy77/react-native-mediapipe** (the upstream this fork descends from)
4. **QuickPose** (commercial SDK)
5. **@scottjgilroy/react-native-vision-camera-v4-pose-detection** (ML Kit plugin)
6. **@gymbrosinc/react-native-mediapipe-pose** (alternative MediaPipe fork — found during search)

---

## 3. Comparison table

| Library | Latest / last publish | ML backend | Landmarks | World coords | VC v4 + worklets-core | New Arch | License / cost | On-device perf | Maturity / risk |
|---|---|---|---|---|---|---|---|---|---|
| **react-native-mediapipe-posedetection** (EndLess728) | **v0.4.0 — 2026‑01‑20** | MediaPipe BlazePose (`pose_landmarker`) | **33** | **Yes** | **VC `^4.0.0`, worklets `^1.0.0`** — native fit | **Required** | MIT, free | GPU-accelerated; self-throttles to **~15 FPS** for memory stability | ⚠️ **Single maintainer, 22★, v0.x.** Purpose-built for our exact stack but immature/bus-factor risk |
| **fast-tflite + BlazePose .tflite** (mrousavy DIY) | fast-tflite **v3.0.1 — 2026‑04‑21** | TFLite (BlazePose or MoveNet model you ship) | **33** (BlazePose) / 17 (MoveNet) | Model-dependent; BlazePose GHUM gives 3D, but you wire decoding yourself | **First-class** — fast-tflite is built *for* VC frame processors; resize-plugin already installed | Yes | MIT (lib) + model license | GPU delegate (CoreML/Metal/NNAPI); fastest path, zero bridge copies | ✅ **Most maintained core (mrousavy).** ⚠️ But *you* own the pre/post-processing (anchors, NMS, landmark decode, smoothing) — real engineering cost |
| **cdiddy77/react-native-mediapipe** | **v0.6.0 — 2024‑12‑12** | MediaPipe (Tasks) | **33** | Yes | Depends on VC + worklets-core (peer `*`); built around VC v3-era API, **v4 support not confirmed** | Partial | MIT, free | GPU; LIVE_STREAM mode | ⚠️ **75★ but stale (~18 mo no release).** The upstream EndLess728 forked & modernized for New Arch / v4 |
| **QuickPose** | Active commercial | MediaPipe BlazePose (managed) | **33** | Yes | RN plugin exists; iOS-first, VC integration not its native model | N/A (own camera) | **Commercial.** Free ≤100 devices/mo, then paid (Personal/Launch/Scale/Agency tiers) | Production-grade, optimized; includes rep-counting / ROM helpers | ✅ Most "productized." ❌ **Per-device cost, vendor lock-in, brings own camera pipeline** — fights our VC+Skia architecture |
| **@scottjgilroy/react-native-vision-camera-v4-pose-detection** | **v1.2.2 — 2024‑07‑08** | **Google ML Kit** (not MediaPipe) | 33 (ML Kit skeleton) | ❌ ML Kit lacks true 3D world coords; **less depth/accuracy** than BlazePose | Named for VC v4; peer deps loose (`*`) | Unknown | MIT, free | Fast on-device ML Kit | ⚠️ **No publish since Jul 2024, near-zero adoption.** ML Kit accuracy/depth is weaker for biomechanics |
| **@gymbrosinc/react-native-mediapipe-pose** | **v1.0.8 — 2026‑01‑08** | MediaPipe BlazePose, GPU | 33 | Yes (claimed) | MediaPipe-based; VC compatibility not documented | Likely | MIT, free | GPU; ships jump-detection helpers | ⚠️ Very new, undocumented adoption; another single-vendor fork |

Sources for each cell are listed in §7.

---

## 4. Analysis

### Why the current pick is reasonable but risky
`react-native-mediapipe-posedetection` is, on paper, the **best architectural
fit**: it targets VisionCamera `^4.0.0` + worklets-core `^1.0.0`, is New-Arch
only (which we require), and delivers exactly what `@/domain` wants — 33
landmarks **with world coordinates** and optional segmentation. Its most recent
release (v0.4.0, Jan 2026) is current. The problem is **sustainability**: 22
stars, one maintainer, v0.x semantics (breaking changes likely), and an
internal **~15 FPS self-throttle** that we don't control. For a dependency this
central, a single abandonment would block the whole pose pipeline.

### Why fast-tflite is the strongest fallback
We **already ship** `react-native-fast-tflite ^3.0.1` and
`vision-camera-resize-plugin ^3.1.0`. mrousavy's documented BlazePose-in-a-frame-
processor pattern (resize → tflite → decode landmarks → Skia overlay) runs
entirely on the worklet thread with GPU delegates and zero buffer copies. It is
the **most actively maintained** option (mrousavy also maintains VisionCamera
itself, so version drift is least likely). The cost is real engineering: BlazePose's
`.tflite` output is raw — we must implement anchor decoding, the detector→landmark
two-stage pipeline (or use the single-stage landmark model with an ROI heuristic),
and temporal smoothing. But it gives us **full control over FPS, model swap
(BlazePose ↔ MoveNet), and longevity** with no single-purpose dependency.

### Why the others are not selected
- **cdiddy77/react-native-mediapipe** — the respected upstream (75★), but ~18
  months without a release and built for the VC v3-era API; EndLess728's fork
  exists *precisely because* this one wasn't modernized for New Arch / v4.
- **QuickPose** — most polished, but **commercial per-device pricing**, vendor
  lock-in, and it wants to own the camera pipeline, which collides with our
  VisionCamera + Skia + worklets architecture. Reconsider only if we need
  turnkey rep-counting/ROM and accept the cost.
- **@scottjgilroy ...v4-pose-detection** — uses **ML Kit**, which is weaker on
  depth/3D world coordinates than BlazePose and therefore worse for joint-angle
  biomechanics; also no publish since Jul 2024.
- **@gymbrosinc/...** — recent and MediaPipe-based but undocumented adoption and
  another single-vendor fork; no advantage over the EndLess728 pick.

### Web parity note
For the **web** target we already depend on `@mediapipe/tasks-vision ^0.10.18`
(Google's official JS BlazePose). Keeping a **BlazePose family** model on native
(either via EndLess728 or a BlazePose `.tflite`) means landmark indices, world
coords, and `POSE_CONNECTIONS` stay **identical across web and native** — a
strong reason to avoid the ML Kit / MoveNet (17-point) options, whose landmark
topology differs from the domain's 33-point `PoseLandmark` enum.

---

## 5. Recommendation

> **Primary: keep `react-native-mediapipe-posedetection` (EndLess728) for Phase 1.**
> It is the lowest-effort path that satisfies all hard requirements (VC v4 +
> worklets-core, New Arch, 33 landmarks + world coords) and keeps BlazePose
> parity with the web `@mediapipe/tasks-vision` pipeline. Pin the exact version,
> wrap it behind our `PoseDetector` port/adapter so the rest of the app never
> imports it directly, and treat the ~15 FPS throttle as a known constraint.
>
> **Fallback (de-risk): `react-native-fast-tflite` + a BlazePose `.tflite`.**
> We already own both deps. If EndLess728 stalls, breaks on an Expo/RN bump, or
> the 15 FPS cap proves limiting, swap the adapter implementation — **no domain
> or UI changes** because everything sits behind the port. This is also the
> long-term-safest owner (mrousavy maintains VisionCamera itself).

**Action items**
1. Define a `PoseDetector` port (`src/ports/`) returning the domain `Landmark[]`
   (33-point, world coords) so both implementations are interchangeable.
2. Implement the EndLess728-backed adapter under `src/adapters/pose/`.
3. Keep a `fast-tflite` BlazePose adapter as a spike/backup behind the same port.
4. Pin `react-native-mediapipe-posedetection` to an exact version; watch the repo
   for releases and breaking changes.
5. Validate the **real measured FPS** on a mid-tier Android device early — if the
   15 FPS throttle starves the speed engine's frame-delta math, trigger the
   fallback.

---

## 6. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026‑06‑17 | Primary = EndLess728 `react-native-mediapipe-posedetection`; Fallback = fast-tflite + BlazePose `.tflite`; both behind a `PoseDetector` port | Best stack fit + BlazePose web parity now; fast-tflite gives an in-tree, well-maintained escape hatch with zero new vendor lock-in |

---

## 7. Sources

- react-native-mediapipe-posedetection (EndLess728): https://github.com/EndLess728/react-native-mediapipe-posedetection
- npm metadata (libraries.io): https://libraries.io/npm/react-native-mediapipe-posedetection
- mrousavy — Pose Detection with VisionCamera + TFLite + Skia: https://mrousavy.com/blog/VisionCamera-Pose-Detection-TFLite
- react-native-fast-tflite (GitHub): https://github.com/mrousavy/react-native-fast-tflite
- react-native-fast-tflite (npm): https://www.npmjs.com/package/react-native-fast-tflite
- VisionCameraSkiaDemo (BlazePose, no native code): https://github.com/mrousavy/VisionCameraSkiaDemo
- VisionCamera — Native Frame Processor Plugins: https://react-native-vision-camera.com/docs/guides/frame-processor-plugins-community
- cdiddy77/react-native-mediapipe (GitHub): https://github.com/cdiddy77/react-native-mediapipe
- cdiddy77 Pose Landmark Detection docs: https://cdiddy77.github.io/react-native-mediapipe/docs/api_pages/pose-landmark-detection/
- cdiddy77 releases: https://github.com/cdiddy77/react-native-mediapipe/releases
- QuickPose iOS SDK: https://quickpose.ai/products/ios-sdk/
- QuickPose React Native: https://quickpose.ai/lp/human-pose-estimation-react-native/
- QuickPose pricing: https://quickpose.ai/products/ios-sdk/pricing/
- QuickPose RN repo: https://github.com/quickpose/quickpose-react-native-pose-estimation
- @scottjgilroy/react-native-vision-camera-v4-pose-detection (npm): https://www.npmjs.com/package/@scottjgilroy/react-native-vision-camera-v4-pose-detection
- react-native-vision-camera-mlkit (ML Kit pose plugin): https://github.com/pedrol2b/react-native-vision-camera-mlkit
- @gymbrosinc/react-native-mediapipe-pose (npm): https://www.npmjs.com/package/@gymbrosinc/react-native-mediapipe-pose
- MediaPipe BlazePose (Google Research): https://research.google/blog/on-device-real-time-body-pose-tracking-with-mediapipe-blazepose/
- MediaPipe Pose Landmarker guide (33 landmarks + world coords): https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- ML Kit Pose Detection: https://developers.google.com/ml-kit/vision/pose-detection
- MediaPipe vs ML Kit (QuickPose): https://quickpose.ai/faqs/mediapipe-vs-ml-kit/
- MoveNet / best mobile pose models: https://blog.roboflow.com/best-pose-estimation-models/
- VisionCamera pose-detection plugin PR (#3480, MoveNet): https://github.com/mrousavy/react-native-vision-camera/pull/3480
