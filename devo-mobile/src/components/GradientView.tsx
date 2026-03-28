import React from 'react';
import { ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Real gradient using expo-linear-gradient.
 * Default: linear-gradient(135deg, #486bec, #db2777) — the PWA's signature gradient.
 */
interface Props {
  style?: ViewStyle;
  children?: React.ReactNode;
  colors?: [string, string, ...string[]];
  borderRadius?: number;
  /** Angle in degrees. 135 = top-left to bottom-right (default). */
  angle?: number;
}

// Convert angle to start/end points
function angleToPoints(angle: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  return {
    start: { x: 0.5 - x / 2, y: 0.5 - y / 2 },
    end: { x: 0.5 + x / 2, y: 0.5 + y / 2 },
  };
}

export default function GradientView({ style, children, colors, borderRadius = 16, angle = 135 }: Props) {
  const gradientColors = colors || ['#486bec', '#db2777'];
  const { start, end } = angleToPoints(angle);

  return (
    <LinearGradient
      colors={gradientColors}
      start={start}
      end={end}
      style={[{ borderRadius, overflow: 'hidden' }, style]}
    >
      {children}
    </LinearGradient>
  );
}
