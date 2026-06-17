// src/ports/vision.ts
// Ports for the camera / vision pipeline. Interfaces only — no vendor SDKs here.
// Concrete adapters (VisionCamera, MediaPipe, YOLO/TFLite, Skia) live in src/adapters/*.

import { Landmark, TrackedObject } from '@/domain';

/** Vendor-agnostic camera frame reference handed to detectors (opaque native handle). */
export interface CameraFrame {
  readonly width: number;
  readonly height: number;
  readonly timestamp: number;
}

export interface PoseResult {
  landmarks: Landmark[];
  timestampMs: number;
}

/** Detects body pose (33 landmarks) from a frame. Adapter: MediaPipe (native) / tasks-vision (web). */
export interface PoseProvider {
  initialize(): Promise<void>;
  detect(frame: CameraFrame): PoseResult | null;
  dispose(): void;
}

/** Detects the sports object from a frame. Adapter: YOLOv8n TFLite (native) / color sampler (web). */
export interface ObjectDetector {
  initialize(targetLabels: string[]): Promise<void>;
  detect(frame: CameraFrame): TrackedObject[];
  dispose(): void;
}

export type CameraFacing = 'front' | 'back';

/** Camera lifecycle + configuration. Adapter: VisionCamera (native) / getUserMedia (web). */
export interface CameraSource {
  requestPermission(): Promise<boolean>;
  hasPermission(): boolean;
  setFacing(facing: CameraFacing): void;
}

export interface RecordingResult {
  uri: string;
  durationMs: number;
}

/** Records the session video. Adapter: VisionCamera recording (native) / MediaRecorder (web). */
export interface Recorder {
  start(): Promise<void>;
  stop(): Promise<RecordingResult>;
  isRecording(): boolean;
}

/** Per-frame data the overlay draws (normalized coords). */
export interface OverlayFrame {
  landmarks: number[][];                                  // [x, y, z, visibility][]
  object: { x: number; y: number; w: number; h: number } | null;
  trail: { x: number; y: number }[];
  speedKmh: number;
}

/** Marker for the overlay implementation; concrete renderers are platform components. */
export interface OverlayRenderer {
  readonly kind: 'skia' | 'canvas' | 'native';
}
