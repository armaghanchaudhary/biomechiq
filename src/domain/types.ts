// src/domain/types.ts
// Core domain entities & value objects for BiomechIQ.
// PURE: no React, no Expo, no vendor SDK imports may appear in this layer.

export type Sport =
  | 'tennis'
  | 'cricket'
  | 'baseball'
  | 'basketball'
  | 'golf'
  | 'soccer'
  | 'generic';

// ── POSE ──────────────────────────────────────────────

export interface Landmark {
  x: number;       // normalized 0-1
  y: number;       // normalized 0-1
  z: number;       // depth (relative)
  visibility: number; // 0-1 confidence
}

// MediaPipe BlazePose 33 keypoints
export enum PoseLandmark {
  NOSE = 0,
  LEFT_EYE_INNER = 1,
  LEFT_EYE = 2,
  LEFT_EYE_OUTER = 3,
  RIGHT_EYE_INNER = 4,
  RIGHT_EYE = 5,
  RIGHT_EYE_OUTER = 6,
  LEFT_EAR = 7,
  RIGHT_EAR = 8,
  MOUTH_LEFT = 9,
  MOUTH_RIGHT = 10,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14,
  LEFT_WRIST = 15,
  RIGHT_WRIST = 16,
  LEFT_PINKY = 17,
  RIGHT_PINKY = 18,
  LEFT_INDEX = 19,
  RIGHT_INDEX = 20,
  LEFT_THUMB = 21,
  RIGHT_THUMB = 22,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
  LEFT_HEEL = 29,
  RIGHT_HEEL = 30,
  LEFT_FOOT_INDEX = 31,
  RIGHT_FOOT_INDEX = 32,
}

export const POSE_CONNECTIONS: [PoseLandmark, PoseLandmark][] = [
  // Face
  [PoseLandmark.LEFT_EAR, PoseLandmark.LEFT_EYE],
  [PoseLandmark.RIGHT_EAR, PoseLandmark.RIGHT_EYE],
  // Torso
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.RIGHT_SHOULDER],
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_HIP],
  [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_HIP],
  [PoseLandmark.LEFT_HIP, PoseLandmark.RIGHT_HIP],
  // Left arm
  [PoseLandmark.LEFT_SHOULDER, PoseLandmark.LEFT_ELBOW],
  [PoseLandmark.LEFT_ELBOW, PoseLandmark.LEFT_WRIST],
  [PoseLandmark.LEFT_WRIST, PoseLandmark.LEFT_INDEX],
  // Right arm
  [PoseLandmark.RIGHT_SHOULDER, PoseLandmark.RIGHT_ELBOW],
  [PoseLandmark.RIGHT_ELBOW, PoseLandmark.RIGHT_WRIST],
  [PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_INDEX],
  // Left leg
  [PoseLandmark.LEFT_HIP, PoseLandmark.LEFT_KNEE],
  [PoseLandmark.LEFT_KNEE, PoseLandmark.LEFT_ANKLE],
  [PoseLandmark.LEFT_ANKLE, PoseLandmark.LEFT_HEEL],
  [PoseLandmark.LEFT_HEEL, PoseLandmark.LEFT_FOOT_INDEX],
  // Right leg
  [PoseLandmark.RIGHT_HIP, PoseLandmark.RIGHT_KNEE],
  [PoseLandmark.RIGHT_KNEE, PoseLandmark.RIGHT_ANKLE],
  [PoseLandmark.RIGHT_ANKLE, PoseLandmark.RIGHT_HEEL],
  [PoseLandmark.RIGHT_HEEL, PoseLandmark.RIGHT_FOOT_INDEX],
];

// ── JOINT DEFINITIONS ─────────────────────────────────

export interface JointDef {
  name: string;
  a: PoseLandmark;   // first point
  b: PoseLandmark;   // vertex (the joint)
  c: PoseLandmark;   // third point
  idealMin: number;  // degrees
  idealMax: number;
  side: 'left' | 'right' | 'center';
}

// ── OBJECT TRACKING ───────────────────────────────────

export interface TrackedObject {
  x: number;          // normalized 0-1
  y: number;          // normalized 0-1
  width: number;      // normalized
  height: number;     // normalized
  confidence: number; // 0-1
  label: string;      // 'sports ball', 'frisbee', etc
}

export interface SpeedSample {
  timestamp: number;  // ms
  speedKmh: number;
  objectX: number;
  objectY: number;
}

// ── SESSION ───────────────────────────────────────────

export type SessionStatus = 'idle' | 'recording' | 'paused' | 'complete';

export interface SessionState {
  id: string;
  status: SessionStatus;
  sport: Sport;
  startedAt: number | null;
  duration: number;             // seconds elapsed
  peakSpeed: number;            // km/h
  avgSpeed: number;
  throwCount: number;
  formScore: number;            // 0-100
  speedSamples: SpeedSample[];
  landmarks: Landmark[] | null; // current frame
}

export interface SessionSummary {
  id: string;
  userId: string;
  sport: Sport;
  createdAt: string;
  durationSecs: number;
  peakSpeedKmh: number;
  avgSpeedKmh: number;
  formScore: number;
  throwCount: number;
  videoUrl?: string;
  thumbnailUrl?: string;
}

// ── COACHING ──────────────────────────────────────────

export type FeedbackSeverity = 'good' | 'info' | 'warn';

export interface CoachingTip {
  severity: FeedbackSeverity;
  message: string;
  joint?: string;
}

export interface SportProfile {
  sport: Sport;
  joints: JointDef[];
  targetObjectLabels: string[];  // YOLO classes to track
  speedCalibrationMeters: number; // typical scene width
}

// ── CALIBRATION ───────────────────────────────────────

export interface CalibrationData {
  referencePixelWidth: number;   // pixels
  referenceRealMeters: number;   // meters
  frameWidth: number;
  frameHeight: number;
  metersPerPixel: number;
}
