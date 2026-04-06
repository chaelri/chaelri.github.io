import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const REFLECT_CLOSING_LINES = [
  "Take a moment to sit with this.",
  "Let this settle in your heart.",
  "No rush — just be here for a sec.",
  "Breathe. You're exactly where you need to be.",
  "Let these words stay with you today.",
  "Sit with this before you move on.",
  "Take this with you into your day.",
  "You don't have to figure it all out right now.",
  "Just let it land.",
  "Carry this truth with you today.",
];

interface Props {
  reflectionP1: string;
  reflectionP2: string;
  bookName: string;
  chapter: number;
  theme: any;
}

// Bottom-right → upper-left
const FLOATERS_BR = [
  { startX: 0.9, startY: 1.05, endX: -0.1, endY: -0.1, dur: 14000, delay: 0, size: 28 },
  { startX: 0.75, startY: 1.1, endX: -0.05, endY: -0.1, dur: 16000, delay: 3000, size: 20 },
  { startX: 0.95, startY: 1.15, endX: -0.1, endY: -0.15, dur: 18000, delay: 6000, size: 24 },
  { startX: 0.85, startY: 1.12, endX: -0.05, endY: -0.1, dur: 17000, delay: 12000, size: 22 },
];
// Upper-left → bottom-right
const FLOATERS_TL = [
  { startX: 0.05, startY: -0.05, endX: 1.05, endY: 1.1, dur: 15000, delay: 1500, size: 22 },
  { startX: 0.15, startY: -0.1, endX: 1.1, endY: 1.05, dur: 17000, delay: 5000, size: 18 },
  { startX: 0.1, startY: -0.08, endX: 1.0, endY: 1.15, dur: 16000, delay: 8000, size: 26 },
  { startX: 0.2, startY: -0.05, endX: 1.05, endY: 1.08, dur: 14500, delay: 11000, size: 16 },
];

function FloatingHeart({ startX, startY, endX, endY, dur, delay, size, theme }: {
  startX: number; startY: number; endX: number; endY: number; dur: number; delay: number; size: number; theme: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        opacity: anim.interpolate({
          inputRange: [0, 0.05, 0.7, 1],
          outputRange: [0, 0.12, 0.08, 0],
        }),
        transform: [
          { translateX: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [startX * SCREEN_WIDTH, endX * SCREEN_WIDTH],
          })},
          { translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [startY * SCREEN_HEIGHT, endY * SCREEN_HEIGHT],
          })},
        ],
      }}
      pointerEvents="none"
    >
      <MaterialIcons name="favorite" size={size} color={theme.accent} />
    </Animated.View>
  );
}

export default function ReflectionSlide({ reflectionP1, reflectionP2, bookName, chapter, theme }: Props) {
  const iconAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    iconAnim.setValue(0);
    textAnim.setValue(0);

    Animated.sequence([
      Animated.timing(iconAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(textAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Floating hearts — both directions, meeting in the middle */}
      {FLOATERS_BR.map((f, i) => (
        <FloatingHeart key={`br${i}`} {...f} theme={theme} />
      ))}
      {FLOATERS_TL.map((f, i) => (
        <FloatingHeart key={`tl${i}`} {...f} theme={theme} />
      ))}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Animated.View style={[styles.iconWrap, { opacity: iconAnim, transform: [{ scale: pulseAnim }] }]}>
          <MaterialIcons name="favorite" size={32} color={theme.accent} />
        </Animated.View>

        <Animated.View style={{ opacity: textAnim, transform: [{ translateY: textAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <Text style={[styles.label, { color: theme.textMuted }]}>REFLECT</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {bookName} {chapter}
          </Text>

          <View style={styles.reflectionCard}>
            <Text style={[styles.reflectionText, { color: theme.text }]}>
              {reflectionP1}
            </Text>
            <Text style={[styles.reflectionText, { color: theme.text, marginTop: 16 }]}>
              {reflectionP2}
            </Text>
          </View>

          <View style={styles.closingRow}>
            <MaterialIcons name="auto-awesome" size={14} color={theme.accent} />
            <Text style={[styles.closingText, { color: theme.textMuted }]}>
              {REFLECT_CLOSING_LINES[Math.floor(Math.random() * REFLECT_CLOSING_LINES.length)]}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 80,
    justifyContent: 'center',
    flexGrow: 1,
  },
  iconWrap: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginBottom: 28,
    textAlign: 'center',
  },
  reflectionCard: {
    paddingHorizontal: 4,
  },
  reflectionText: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 30,
    textAlign: 'center',
  },
  closingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  closingText: {
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});
