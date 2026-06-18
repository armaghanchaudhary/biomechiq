// src/components/ui/SportSelector.tsx
// Modal sheet for choosing the active sport. Writes the choice to the session
// store (which drives ideal joint ranges + object labels) and closes.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Sport } from '@/domain';
import { useSessionStore } from '../../store/sessionStore';
import { COLORS } from '../../utils/colors';

const SPORTS: Sport[] = [
  'tennis',
  'cricket',
  'baseball',
  'basketball',
  'golf',
  'soccer',
  'generic',
];

export function SportSelector({ onClose }: { onClose: () => void }) {
  const setSport = useSessionStore((s) => s.setSport);
  const current = useSessionStore((s) => s.session.sport);

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.title}>SELECT SPORT</Text>

        {SPORTS.map((sport) => {
          const active = sport === current;
          return (
            <TouchableOpacity
              key={sport}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => {
                setSport(sport);
                onClose();
              }}
            >
              <Text style={[styles.rowText, active && styles.rowTextActive]}>
                {sport.toUpperCase()}
              </Text>
              {active ? <Text style={styles.check}>●</Text> : null}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.cancel} onPress={onClose}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sans = Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif';

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,11,15,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  title: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.textMid,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowActive: {
    borderColor: COLORS.plasma,
    backgroundColor: COLORS.plasmaDim,
  },
  rowText: {
    fontFamily: sans,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.textHi,
  },
  rowTextActive: {
    color: COLORS.plasma,
  },
  check: {
    color: COLORS.plasma,
    fontSize: 10,
  },
  cancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: sans,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: COLORS.textMid,
  },
});
