// src/application/recordSession.ts
// Use case: RecordSession. Thin orchestration over the Recorder port.

import type { Recorder, RecordingResult } from '@/ports';

export function makeRecordSession(recorder: Recorder) {
  return {
    start: (): Promise<void> => recorder.start(),
    stop: (): Promise<RecordingResult> => recorder.stop(),
    isRecording: (): boolean => recorder.isRecording(),
  };
}
