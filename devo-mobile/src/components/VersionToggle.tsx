import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { useStore } from '../store/useStore';
import { FontSize, BorderRadius } from '../constants/theme';
import GradientView from './GradientView';

export default function VersionToggle() {
  const theme = useTheme();
  const { currentVersion, setVersion } = useStore();

  const toggle = (v: 'NASB' | 'EASY') => {
    if (v === currentVersion) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setVersion(v);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.glassBackground, borderColor: theme.glassBorder }]}>
      {(['NASB', 'EASY'] as const).map((v) => {
        const active = currentVersion === v;
        return (
          <TouchableOpacity key={v} onPress={() => toggle(v)} activeOpacity={0.7}>
            {active ? (
              <GradientView borderRadius={8} style={styles.activePill}>
                <Text style={styles.activeText}>{v}</Text>
              </GradientView>
            ) : (
              <View style={styles.pill}>
                <Text style={[styles.pillText, { color: theme.textMuted }]}>{v}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
    borderWidth: 1,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  activePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#fff',
  },
});
