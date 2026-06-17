// src/models/SportProfiles.ts
// Ideal biomechanical joint angle ranges per sport
// Based on sports science literature

import { PoseLandmark, SportProfile } from './types';

export const SPORT_PROFILES: Record<string, SportProfile> = {

  tennis: {
    sport: 'tennis',
    targetObjectLabels: ['sports ball', 'tennis ball'],
    speedCalibrationMeters: 2.0,
    joints: [
      {
        name: 'Serving Elbow',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_ELBOW,
        c: PoseLandmark.RIGHT_WRIST,
        idealMin: 100, idealMax: 170,
        side: 'right',
      },
      {
        name: 'Lead Knee',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.LEFT_KNEE,
        c: PoseLandmark.LEFT_ANKLE,
        idealMin: 130, idealMax: 165,
        side: 'left',
      },
      {
        name: 'Shoulder Rotation',
        a: PoseLandmark.LEFT_SHOULDER,
        b: PoseLandmark.RIGHT_SHOULDER,
        c: PoseLandmark.RIGHT_HIP,
        idealMin: 30, idealMax: 80,
        side: 'right',
      },
      {
        name: 'Hip Hinge',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_HIP,
        c: PoseLandmark.RIGHT_KNEE,
        idealMin: 140, idealMax: 175,
        side: 'right',
      },
    ],
  },

  cricket: {
    sport: 'cricket',
    targetObjectLabels: ['sports ball', 'cricket ball'],
    speedCalibrationMeters: 2.5,
    joints: [
      {
        name: 'Bowling Elbow',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_ELBOW,
        c: PoseLandmark.RIGHT_WRIST,
        idealMin: 160, idealMax: 180, // must be straight (chucking rule)
        side: 'right',
      },
      {
        name: 'Front Knee',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.LEFT_KNEE,
        c: PoseLandmark.LEFT_ANKLE,
        idealMin: 155, idealMax: 180,
        side: 'left',
      },
      {
        name: 'Back Knee Drive',
        a: PoseLandmark.RIGHT_HIP,
        b: PoseLandmark.RIGHT_KNEE,
        c: PoseLandmark.RIGHT_ANKLE,
        idealMin: 100, idealMax: 145,
        side: 'right',
      },
      {
        name: 'Shoulder Tilt',
        a: PoseLandmark.LEFT_SHOULDER,
        b: PoseLandmark.RIGHT_SHOULDER,
        c: PoseLandmark.RIGHT_HIP,
        idealMin: 15, idealMax: 45,
        side: 'right',
      },
    ],
  },

  baseball: {
    sport: 'baseball',
    targetObjectLabels: ['sports ball', 'baseball'],
    speedCalibrationMeters: 2.0,
    joints: [
      {
        name: 'Throwing Elbow',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_ELBOW,
        c: PoseLandmark.RIGHT_WRIST,
        idealMin: 85, idealMax: 105, // 90° L-shape at max external rotation
        side: 'right',
      },
      {
        name: 'Stride Knee',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.LEFT_KNEE,
        c: PoseLandmark.LEFT_ANKLE,
        idealMin: 140, idealMax: 175,
        side: 'left',
      },
      {
        name: 'Hip-Shoulder Separation',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.RIGHT_HIP,
        c: PoseLandmark.RIGHT_SHOULDER,
        idealMin: 25, idealMax: 55,
        side: 'right',
      },
      {
        name: 'Trunk Tilt',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_HIP,
        c: PoseLandmark.RIGHT_KNEE,
        idealMin: 130, idealMax: 170,
        side: 'right',
      },
    ],
  },

  basketball: {
    sport: 'basketball',
    targetObjectLabels: ['sports ball', 'basketball'],
    speedCalibrationMeters: 1.8,
    joints: [
      {
        name: 'Shooting Elbow',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_ELBOW,
        c: PoseLandmark.RIGHT_WRIST,
        idealMin: 85, idealMax: 100, // close to 90°
        side: 'right',
      },
      {
        name: 'Release Wrist',
        a: PoseLandmark.RIGHT_ELBOW,
        b: PoseLandmark.RIGHT_WRIST,
        c: PoseLandmark.RIGHT_INDEX,
        idealMin: 140, idealMax: 175,
        side: 'right',
      },
      {
        name: 'Jump Knee Bend',
        a: PoseLandmark.RIGHT_HIP,
        b: PoseLandmark.RIGHT_KNEE,
        c: PoseLandmark.RIGHT_ANKLE,
        idealMin: 100, idealMax: 140,
        side: 'right',
      },
    ],
  },

  golf: {
    sport: 'golf',
    targetObjectLabels: ['sports ball', 'golf ball'],
    speedCalibrationMeters: 1.5,
    joints: [
      {
        name: 'Lead Arm',
        a: PoseLandmark.LEFT_SHOULDER,
        b: PoseLandmark.LEFT_ELBOW,
        c: PoseLandmark.LEFT_WRIST,
        idealMin: 160, idealMax: 180, // straight lead arm at impact
        side: 'left',
      },
      {
        name: 'Hip Turn',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.RIGHT_HIP,
        c: PoseLandmark.RIGHT_SHOULDER,
        idealMin: 30, idealMax: 65,
        side: 'right',
      },
      {
        name: 'Spine Angle',
        a: PoseLandmark.NOSE,
        b: PoseLandmark.LEFT_HIP,
        c: PoseLandmark.LEFT_KNEE,
        idealMin: 130, idealMax: 160,
        side: 'center',
      },
    ],
  },

  soccer: {
    sport: 'soccer',
    targetObjectLabels: ['sports ball', 'soccer ball'],
    speedCalibrationMeters: 2.0,
    joints: [
      {
        name: 'Kicking Knee',
        a: PoseLandmark.RIGHT_HIP,
        b: PoseLandmark.RIGHT_KNEE,
        c: PoseLandmark.RIGHT_ANKLE,
        idealMin: 80, idealMax: 130, // backswing then extension
        side: 'right',
      },
      {
        name: 'Support Knee',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.LEFT_KNEE,
        c: PoseLandmark.LEFT_ANKLE,
        idealMin: 140, idealMax: 165,
        side: 'left',
      },
      {
        name: 'Trunk Lean',
        a: PoseLandmark.LEFT_SHOULDER,
        b: PoseLandmark.LEFT_HIP,
        c: PoseLandmark.LEFT_KNEE,
        idealMin: 140, idealMax: 175,
        side: 'left',
      },
    ],
  },

  generic: {
    sport: 'generic',
    targetObjectLabels: ['sports ball', 'frisbee', 'bottle'],
    speedCalibrationMeters: 2.0,
    joints: [
      {
        name: 'R. Elbow',
        a: PoseLandmark.RIGHT_SHOULDER,
        b: PoseLandmark.RIGHT_ELBOW,
        c: PoseLandmark.RIGHT_WRIST,
        idealMin: 80, idealMax: 170,
        side: 'right',
      },
      {
        name: 'L. Elbow',
        a: PoseLandmark.LEFT_SHOULDER,
        b: PoseLandmark.LEFT_ELBOW,
        c: PoseLandmark.LEFT_WRIST,
        idealMin: 80, idealMax: 170,
        side: 'left',
      },
      {
        name: 'R. Knee',
        a: PoseLandmark.RIGHT_HIP,
        b: PoseLandmark.RIGHT_KNEE,
        c: PoseLandmark.RIGHT_ANKLE,
        idealMin: 90, idealMax: 175,
        side: 'right',
      },
      {
        name: 'L. Knee',
        a: PoseLandmark.LEFT_HIP,
        b: PoseLandmark.LEFT_KNEE,
        c: PoseLandmark.LEFT_ANKLE,
        idealMin: 90, idealMax: 175,
        side: 'left',
      },
      {
        name: 'R. Shoulder',
        a: PoseLandmark.RIGHT_ELBOW,
        b: PoseLandmark.RIGHT_SHOULDER,
        c: PoseLandmark.RIGHT_HIP,
        idealMin: 30, idealMax: 160,
        side: 'right',
      },
      {
        name: 'L. Shoulder',
        a: PoseLandmark.LEFT_ELBOW,
        b: PoseLandmark.LEFT_SHOULDER,
        c: PoseLandmark.LEFT_HIP,
        idealMin: 30, idealMax: 160,
        side: 'left',
      },
    ],
  },
};
