// src/store/sessionStore.ts
// Zustand store for live session state

import { create } from 'zustand';
import {
  SessionState,
  SessionStatus,
  Sport,
  Landmark,
  SpeedSample,
  CoachingTip,
} from '../models/types';

interface LiveMetrics {
  currentSpeed: number;
  peakSpeed: number;
  formScore: number;
  throwCount: number;
  poseDetected: boolean;
  objectDetected: boolean;
  fps: number;
  coachingTips: CoachingTip[];
  speedHistory: SpeedSample[];
}

interface SessionStore {
  // Session
  session: SessionState;
  metrics: LiveMetrics;

  // Actions
  startSession: (sport: Sport) => void;
  stopSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  resetSession: () => void;
  setSport: (sport: Sport) => void;

  // Real-time updates (called every frame from camera)
  updateLandmarks: (landmarks: Landmark[] | null) => void;
  updateSpeed: (speed: number, x: number, y: number) => void;
  updateFormScore: (score: number) => void;
  updateThrowCount: (count: number) => void;
  updateFPS: (fps: number) => void;
  updateCoachingTips: (tips: CoachingTip[]) => void;
  setPoseDetected: (detected: boolean) => void;
  setObjectDetected: (detected: boolean) => void;
}

const initialSession: SessionState = {
  id: '',
  status: 'idle',
  sport: 'generic',
  startedAt: null,
  duration: 0,
  peakSpeed: 0,
  avgSpeed: 0,
  throwCount: 0,
  formScore: 0,
  speedSamples: [],
  landmarks: null,
};

const initialMetrics: LiveMetrics = {
  currentSpeed: 0,
  peakSpeed: 0,
  formScore: 0,
  throwCount: 0,
  poseDetected: false,
  objectDetected: false,
  fps: 0,
  coachingTips: [],
  speedHistory: [],
};

let durationInterval: ReturnType<typeof setInterval> | null = null;

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: { ...initialSession },
  metrics: { ...initialMetrics },

  startSession: (sport) => {
    const id = `session_${Date.now()}`;
    set({
      session: {
        ...initialSession,
        id,
        sport,
        status: 'recording',
        startedAt: Date.now(),
      },
      metrics: { ...initialMetrics },
    });

    // Tick duration every second
    if (durationInterval) clearInterval(durationInterval);
    durationInterval = setInterval(() => {
      const { session } = get();
      if (session.status === 'recording' && session.startedAt) {
        set((state) => ({
          session: {
            ...state.session,
            duration: Math.floor((Date.now() - session.startedAt!) / 1000),
          },
        }));
      }
    }, 1000);
  },

  stopSession: () => {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    set((state) => ({
      session: { ...state.session, status: 'complete' },
    }));
  },

  pauseSession: () => {
    set((state) => ({
      session: { ...state.session, status: 'paused' },
    }));
  },

  resumeSession: () => {
    set((state) => ({
      session: { ...state.session, status: 'recording' },
    }));
  },

  resetSession: () => {
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }
    set({
      session: { ...initialSession },
      metrics: { ...initialMetrics },
    });
  },

  setSport: (sport) => {
    set((state) => ({
      session: { ...state.session, sport },
    }));
  },

  updateLandmarks: (landmarks) => {
    set((state) => ({
      session: { ...state.session, landmarks },
    }));
  },

  updateSpeed: (speed, x, y) => {
    const now = Date.now();
    set((state) => {
      const peak = Math.max(state.metrics.peakSpeed, speed);
      const history = [
        ...state.metrics.speedHistory,
        { timestamp: now, speedKmh: speed, objectX: x, objectY: y },
      ].slice(-300); // keep last 300 samples (~30s at 10fps)

      const avgSpeed =
        history.length > 0
          ? Math.round(
              history.reduce((a, s) => a + s.speedKmh, 0) / history.length
            )
          : 0;

      return {
        metrics: {
          ...state.metrics,
          currentSpeed: speed,
          peakSpeed: peak,
          speedHistory: history,
        },
        session: {
          ...state.session,
          peakSpeed: peak,
          avgSpeed,
          speedSamples: [
            ...state.session.speedSamples,
            { timestamp: now, speedKmh: speed, objectX: x, objectY: y },
          ].slice(-1000),
        },
      };
    });
  },

  updateFormScore: (score) => {
    set((state) => ({
      metrics: { ...state.metrics, formScore: score },
      session: { ...state.session, formScore: score },
    }));
  },

  updateThrowCount: (count) => {
    set((state) => ({
      metrics: { ...state.metrics, throwCount: count },
      session: { ...state.session, throwCount: count },
    }));
  },

  updateFPS: (fps) => {
    set((state) => ({
      metrics: { ...state.metrics, fps },
    }));
  },

  updateCoachingTips: (tips) => {
    set((state) => ({
      metrics: { ...state.metrics, coachingTips: tips },
    }));
  },

  setPoseDetected: (detected) => {
    set((state) => ({
      metrics: { ...state.metrics, poseDetected: detected },
    }));
  },

  setObjectDetected: (detected) => {
    set((state) => ({
      metrics: { ...state.metrics, objectDetected: detected },
    }));
  },
}));
