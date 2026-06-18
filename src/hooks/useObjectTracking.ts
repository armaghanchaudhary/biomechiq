// src/hooks/useObjectTracking.ts
// Bridges tracked-object positions from the camera frame processor into the
// live session store, computing object velocity via the pure domain SpeedEngine.
//
// `processObject` is invoked via `runOnJS` from the frame processor worklet with
// the object's normalized centre + bbox and the frame timestamp (ms).

import { useCallback, useRef } from 'react';
import { SpeedEngine, TrackedObject } from '@/domain';
import { useSessionStore } from '../store/sessionStore';

// Nominal processing resolution. Because positions arrive normalized (0–1), the
// absolute pixel size cancels against the meters-per-pixel term in the engine's
// calibration — real-world scale comes from the CalibrationStrategy (BIOM-23),
// refined on-device (AR depth, BIOM phase 3). These are just consistent units.
const FRAME_W = 1920;
const FRAME_H = 1080;

export interface ObjectPosition {
  x: number; // normalized centre 0–1
  y: number;
  w: number; // normalized width 0–1
  h: number;
}

export function useObjectTracking() {
  // One engine instance per mounted screen; survives re-renders.
  const engineRef = useRef<SpeedEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new SpeedEngine();
  }

  const processObject = useCallback(
    (pos: ObjectPosition | null, timestampMs: number) => {
      const engine = engineRef.current!;
      const store = useSessionStore.getState();

      if (!pos) {
        engine.objectLost();
        store.setObjectDetected(false);
        return;
      }

      const obj: TrackedObject = {
        x: pos.x,
        y: pos.y,
        width: pos.w,
        height: pos.h,
        confidence: 1,
        label: store.session.sport,
      };

      const speedKmh = engine.update(obj, timestampMs, FRAME_W, FRAME_H);
      store.setObjectDetected(true);
      store.updateSpeed(speedKmh, pos.x, pos.y);
    },
    []
  );

  return { processObject };
}
