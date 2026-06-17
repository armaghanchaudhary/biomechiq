// app/(tabs)/index.tsx
// Live Biomechanics Analyzer — Phase 1 Main Screen
//
// Architecture:
//   VisionCamera → Frame Processor (native thread)
//     ├── MediaPipe BlazePose → 33 landmarks
//     └── TFLite YOLOv8n → object bbox
//   Skia Canvas (GPU, UI thread) → skeleton + trails + labels
//   Reanimated Shared Values → bridge between frame processor and Skia

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from 'react-native-vision-camera';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import {
  Canvas,
  Path,
  Circle,
  Line,
  Text as SkiaText,
  useFont,
  Paint,
  Group,
} from '@shopify/react-native-skia';
import { usePoseDetection } from '../../src/hooks/usePoseDetection';
import { useObjectTracking } from '../../src/hooks/useObjectTracking';
import { useSessionStore } from '../../src/store/sessionStore';
import { MetricsPanel } from '../../src/components/camera/MetricsPanel';
import { SportSelector } from '../../src/components/ui/SportSelector';
import { COLORS } from '../../src/utils/colors';
import { POSE_CONNECTIONS } from '@/domain';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function AnalyzerScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [showSportSelector, setShowSportSelector] = useState(false);

  const session = useSessionStore((s) => s.session);
  const metrics = useSessionStore((s) => s.metrics);
  const startSession = useSessionStore((s) => s.startSession);
  const stopSession = useSessionStore((s) => s.stopSession);

  // Reanimated Shared Values for Skia overlay
  // These update on the UI thread without going through JS
  const landmarksSV = useSharedValue<number[][]>([]);
  const objectPosSV = useSharedValue<{ x: number; y: number; w: number; h: number } | null>(null);
  const objectTrailSV = useSharedValue<Array<{ x: number; y: number }>>([]);
  const speedSV = useSharedValue(0);

  // Hooks that process detection results and update the store
  const { processLandmarks } = usePoseDetection();
  const { processObject } = useObjectTracking();

  // ── Frame Processor ──────────────────────────────────
  // This runs on the native thread every frame
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';

    runAtTargetFps(30, () => {
      'worklet';

      // NOTE: In the actual implementation, you call the native modules here:
      //
      // const poseResult = poseDetection.detect(frame);
      // if (poseResult?.landmarks) {
      //   landmarksSV.value = poseResult.landmarks.map(l => [l.x, l.y, l.z, l.visibility]);
      //   runOnJS(processLandmarks)(poseResult.landmarks);
      // }
      //
      // const yoloResult = objectDetector.detect(frame);
      // if (yoloResult?.detections?.[0]) {
      //   const d = yoloResult.detections[0];
      //   const pos = { x: d.boundingBox.left + d.boundingBox.width/2,
      //                  y: d.boundingBox.top + d.boundingBox.height/2,
      //                  w: d.boundingBox.width, h: d.boundingBox.height };
      //   objectPosSV.value = pos;
      //   const trail = [...objectTrailSV.value, { x: pos.x, y: pos.y }].slice(-20);
      //   objectTrailSV.value = trail;
      //   runOnJS(processObject)(pos, frame.timestamp);
      // } else {
      //   objectPosSV.value = null;
      //   runOnJS(processObject)(null, frame.timestamp);
      // }
    });
  }, []);

  // ── Permission Gate ──────────────────────────────────
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          BiomechIQ needs your camera to analyze movement and track objects in real time.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>No Camera Found</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ── CAMERA ── */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        onInitialized={() => setCameraReady(true)}
        fps={60}
        videoStabilizationMode="cinematic"
      />

      {/* ── SKIA OVERLAY ── */}
      {cameraReady && (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Skeleton connections */}
          <SkeletonOverlay
            landmarks={landmarksSV}
            canvasWidth={SCREEN_W}
            canvasHeight={SCREEN_H}
          />

          {/* Object trail */}
          <ObjectTrailOverlay
            trail={objectTrailSV}
            position={objectPosSV}
            speed={speedSV}
            canvasWidth={SCREEN_W}
            canvasHeight={SCREEN_H}
          />
        </Canvas>
      )}

      {/* ── HUD TOP ── */}
      <View style={styles.hudTop}>
        <View style={styles.statusPill}>
          <View style={[
            styles.statusDot,
            metrics.poseDetected && styles.statusDotLive
          ]} />
          <Text style={styles.statusText}>
            {metrics.poseDetected ? `POSE • ${metrics.fps} FPS` : 'SEARCHING'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.sportBtn}
          onPress={() => setShowSportSelector(true)}
        >
          <Text style={styles.sportBtnText}>{session.sport.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* ── METRICS SIDE PANEL ── */}
      <MetricsPanel />

      {/* ── RECORD BUTTON ── */}
      <View style={styles.recordBar}>
        {session.status === 'idle' || session.status === 'complete' ? (
          <TouchableOpacity
            style={styles.recordBtn}
            onPress={() => startSession(session.sport)}
          >
            <View style={styles.recordBtnInner} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.recordBtn, styles.recordBtnActive]}
            onPress={stopSession}
          >
            <View style={styles.stopBtnInner} />
          </TouchableOpacity>
        )}
        {session.status === 'recording' && (
          <Text style={styles.durationText}>
            {formatDuration(session.duration)}
          </Text>
        )}
      </View>

      {/* ── SPORT SELECTOR MODAL ── */}
      {showSportSelector && (
        <SportSelector onClose={() => setShowSportSelector(false)} />
      )}

    </View>
  );
}

// ── Sub-components (inline for Phase 1) ──────────────────

function SkeletonOverlay({
  landmarks,
  canvasWidth,
  canvasHeight,
}: {
  landmarks: ReturnType<typeof useSharedValue<number[][]>>;
  canvasWidth: number;
  canvasHeight: number;
}) {
  // This would be driven by Reanimated shared values in actual impl
  // For now showing the pattern
  return (
    <Group>
      {POSE_CONNECTIONS.map(([from, to], idx) => {
        const lms = landmarks.value;
        if (!lms[from] || !lms[to]) return null;
        const [x1, y1] = lms[from];
        const [x2, y2] = lms[to];
        return (
          <Line
            key={idx}
            p1={{ x: x1 * canvasWidth, y: y1 * canvasHeight }}
            p2={{ x: x2 * canvasWidth, y: y2 * canvasHeight }}
            color={COLORS.plasma}
            strokeWidth={2}
            style="stroke"
          />
        );
      })}
      {landmarks.value.map((lm, idx) => {
        if (!lm) return null;
        return (
          <Circle
            key={idx}
            cx={lm[0] * canvasWidth}
            cy={lm[1] * canvasHeight}
            r={4}
            color={COLORS.volt}
          />
        );
      })}
    </Group>
  );
}

function ObjectTrailOverlay({
  trail,
  position,
  speed,
  canvasWidth,
  canvasHeight,
}: {
  trail: ReturnType<typeof useSharedValue<Array<{ x: number; y: number }>>>;
  position: ReturnType<typeof useSharedValue<{ x: number; y: number; w: number; h: number } | null>>;
  speed: ReturnType<typeof useSharedValue<number>>;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const pos = position.value;
  const trailPts = trail.value;

  return (
    <Group>
      {/* Trail lines */}
      {trailPts.slice(1).map((pt, i) => {
        const prev = trailPts[i];
        const alpha = (i + 1) / trailPts.length;
        return (
          <Line
            key={i}
            p1={{ x: prev.x * canvasWidth, y: prev.y * canvasHeight }}
            p2={{ x: pt.x * canvasWidth, y: pt.y * canvasHeight }}
            color={`rgba(200,255,0,${alpha * 0.8})`}
            strokeWidth={alpha * 5}
            style="stroke"
          />
        );
      })}

      {/* Object circle */}
      {pos && (
        <>
          <Circle
            cx={pos.x * canvasWidth}
            cy={pos.y * canvasHeight}
            r={16}
            color={COLORS.voltDim}
          />
          <Circle
            cx={pos.x * canvasWidth}
            cy={pos.y * canvasHeight}
            r={16}
            color={COLORS.volt}
            style="stroke"
            strokeWidth={2}
          />
        </>
      )}
    </Group>
  );
}

// ── Utilities ──────────────────────────────────────────────

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  hudTop: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(8,11,15,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(28,37,48,1)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3D5060',
  },
  statusDotLive: {
    backgroundColor: '#C8FF00',
  },
  statusText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    color: '#7A8FA0',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sportBtn: {
    backgroundColor: 'rgba(0,229,255,0.15)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
  },
  sportBtnText: {
    color: '#00E5FF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  recordBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 56 : 32,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  recordBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnActive: {
    borderColor: '#FF4444',
  },
  recordBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF4444',
  },
  stopBtnInner: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#FF4444',
  },
  durationText: {
    color: 'white',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    letterSpacing: 2,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#080B0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  permissionTitle: {
    color: '#E8EDF2',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionBody: {
    color: '#7A8FA0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: '#00E5FF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 4,
    marginTop: 8,
  },
  permissionBtnText: {
    color: '#080B0F',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
  },
});
