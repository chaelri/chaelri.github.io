import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Gradient, BorderRadius, FontSize, Spacing } from '../constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: any;
}

// Simulated gradient using two half-colored views overlapping
// This gives the blue-to-pink gradient feel without expo-linear-gradient
export default function GradientButton({ label, onPress, icon, size = 'md', disabled, style }: Props) {
  const height = size === 'sm' ? 36 : size === 'lg' ? 52 : 44;
  const fontSize = size === 'sm' ? FontSize.xs : size === 'lg' ? FontSize.lg : FontSize.md;
  const px = size === 'sm' ? Spacing.md : size === 'lg' ? Spacing.xl : Spacing.lg;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
      style={[
        styles.container,
        { height, paddingHorizontal: px, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      {/* Gradient simulation: left half blue, right half pink, with overlap */}
      <View style={[StyleSheet.absoluteFill, styles.gradientLeft]} />
      <View style={[StyleSheet.absoluteFill, styles.gradientRight]} />
      <View style={[StyleSheet.absoluteFill, styles.gradientGlow]} />

      {icon && (
        <MaterialIcons name={icon as any} size={fontSize + 2} color="#fff" style={{ marginRight: 6 }} />
      )}
      <Text style={[styles.label, { fontSize }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    // Shadow for depth (like PWA's box-shadow)
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 8,
  },
  gradientLeft: {
    backgroundColor: Gradient.primary[0],
    right: '30%',
    borderRadius: BorderRadius.lg,
  },
  gradientRight: {
    backgroundColor: Gradient.primary[1],
    left: '30%',
    borderRadius: BorderRadius.lg,
    opacity: 0.85,
  },
  gradientGlow: {
    // Blend layer
    backgroundColor: 'rgba(72, 107, 236, 0.2)',
    borderRadius: BorderRadius.lg,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    zIndex: 1,
  },
});
