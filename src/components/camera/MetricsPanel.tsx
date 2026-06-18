// src/components/camera/MetricsPanel.tsx
// Live metrics side panel on the analyzer screen. Reads the session store and
// renders speed / peak / form / reps. Purely presentational (no detection logic).

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSessionStore } from '../../store/sessionStore';
import { COLORS } from '../../utils/colors';

export function MetricsPanel() {
  const metrics = useSessionStore((s) => s.metrics);

  return (
    <View style={styles.panel} pointerEvents="none">
      <Metric label="SPEED" value={metrics.currentSpeed.toFixed(0)} unit="km/h" accent={COLORS.volt} />
      <Metric label="PEAK" value={metrics.peakSpeed.toFixed(0)} unit="km/h" accent={COLORS.plasma} />
      <Metric label="FORM" value={metrics.formScore.toFixed(0)} unit="/100" accent={COLORS.plasma} />
      <Metric label="REPS" value={String(metrics.throwCount)} unit="" accent={COLORS.volt} />
    </View>
  );
}

function Metric({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const mono = Platform.OS === 'ios' ? 'Courier' : 'monospace';

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: 16,
    top: '28%',
    gap: 14,
    backgroundColor: 'rgba(8,11,15,0.6)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 96,
  },
  metric: {
    gap: 2,
  },
  metricLabel: {
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: COLORS.textMid,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  metricValue: {
    fontFamily: mono,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 28,
  },
  metricUnit: {
    fontFamily: mono,
    fontSize: 10,
    color: COLORS.textLo,
    marginBottom: 3,
  },
});
