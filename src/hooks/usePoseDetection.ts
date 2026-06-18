// src/hooks/usePoseDetection.ts
// Bridges pose landmarks coming off the camera frame processor into the live
// session store, and scores form against the active sport's ideal joint angles.
//
// `processLandmarks` is invoked via `runOnJS` from the VisionCamera frame
// processor worklet (see app/(tabs)/index.tsx). It must be cheap and stateless
// beyond the store — all heavy math is the pure domain `scoreForm` use case.

import { useCallback } from 'react';
import { Landmark } from '@/domain';
import { scoreForm } from '@/application';
import { useSessionStore } from '../store/sessionStore';

export function usePoseDetection() {
  const processLandmarks = useCallback((landmarks: Landmark[] | null) => {
    const store = useSessionStore.getState();

    if (!landmarks || landmarks.length === 0) {
      store.setPoseDetected(false);
      store.updateLandmarks(null);
      return;
    }

    store.updateLandmarks(landmarks);
    store.setPoseDetected(true);

    // Score the current frame against the active sport's ideal ranges.
    const { formScore, tips } = scoreForm(store.session.sport, landmarks);
    store.updateFormScore(formScore);
    store.updateCoachingTips(tips);
  }, []);

  return { processLandmarks };
}
