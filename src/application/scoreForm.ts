// src/application/scoreForm.ts
// Use case: score a pose against a sport's ideal joint angles. Pure (domain only).

import {
  Landmark,
  Sport,
  CoachingTip,
  SPORT_PROFILES,
  computeFormScore,
  generateJointFeedback,
} from '@/domain';

export interface FormResult {
  formScore: number; // 0-100
  tips: CoachingTip[];
}

export function scoreForm(sport: Sport, landmarks: Landmark[]): FormResult {
  const profile = SPORT_PROFILES[sport] ?? SPORT_PROFILES.generic;
  return {
    formScore: computeFormScore(landmarks, profile.joints),
    tips: generateJointFeedback(landmarks, profile.joints),
  };
}
