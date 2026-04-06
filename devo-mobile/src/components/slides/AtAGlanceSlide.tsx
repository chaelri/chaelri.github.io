import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '../../constants/theme';
import type { AtAGlance } from '../../services/ai';

interface Props {
  data: AtAGlance;
  bookName: string;
  chapter: number;
  theme: any;
}

export default function AtAGlanceSlide({ data, bookName, chapter, theme }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const oneLineAnim = useRef(new Animated.Value(0)).current;
  const chipsAnim = useRef(new Animated.Value(0)).current;
  const metaAnim = useRef(new Animated.Value(0)).current;

  // Sparkle pulse + drift animations
  const sparkle1 = useRef(new Animated.Value(0.15)).current;
  const sparkle2 = useRef(new Animated.Value(0.15)).current;
  const drift1X = useRef(new Animated.Value(0)).current;
  const drift1Y = useRef(new Animated.Value(0)).current;
  const drift2X = useRef(new Animated.Value(0)).current;
  const drift2Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    oneLineAnim.setValue(0);
    chipsAnim.setValue(0);
    metaAnim.setValue(0);

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(oneLineAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(chipsAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(metaAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Gentle sparkle pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle1, { toValue: 0.3, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sparkle1, { toValue: 0.12, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(sparkle2, { toValue: 0.25, duration: 2500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sparkle2, { toValue: 0.1, duration: 2500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    // Subtle drifting motion
    const loopDrift = (anim: Animated.Value, range: number, dur: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: range, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: -range, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();

    loopDrift(drift1X, 8, 3000, 0);
    loopDrift(drift1Y, 6, 3500, 500);
    loopDrift(drift2X, -7, 4000, 300);
    loopDrift(drift2Y, 5, 3200, 800);
  }, [data]);

  return (
    <View style={{ flex: 1 }}>
      {/* Background sparkle clusters — pulse + drift */}
      <Animated.View style={[styles.sparkleClusterTL, { transform: [{ translateX: drift1X }, { translateY: drift1Y }] }]} pointerEvents="none">
        <Animated.Text style={[styles.sparkleBig, { opacity: sparkle1, transform: [{ rotate: '-15deg' }] }]}>✦</Animated.Text>
        <Animated.Text style={[styles.sparkleSmall1TL, { opacity: sparkle2 }]}>✦</Animated.Text>
        <Animated.Text style={[styles.sparkleSmall2TL, { opacity: sparkle1 }]}>✦</Animated.Text>
      </Animated.View>
      <Animated.View style={[styles.sparkleClusterBR, { transform: [{ translateX: drift2X }, { translateY: drift2Y }] }]} pointerEvents="none">
        <Animated.Text style={[styles.sparkleBig, { opacity: sparkle2, transform: [{ rotate: '20deg' }] }]}>✦</Animated.Text>
        <Animated.Text style={[styles.sparkleSmall1BR, { opacity: sparkle1 }]}>✦</Animated.Text>
        <Animated.Text style={[styles.sparkleSmall2BR, { opacity: sparkle2 }]}>✦</Animated.Text>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <Text style={[styles.label, { color: theme.textMuted }]}>AT A GLANCE</Text>
        <Text style={[styles.title, { color: theme.text }]}>
          {bookName} {chapter}
        </Text>
      </Animated.View>

      {/* One-liner — editorial split: highlight in white italic, rest in accent */}
      <Animated.View style={[styles.oneLineWrap, { opacity: oneLineAnim, transform: [{ translateY: oneLineAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <Text style={styles.oneLineText}>
          <Text style={[styles.oneLineHighlight, { color: theme.text }]}>{data.oneLineSubject} </Text>
          <Text style={[styles.oneLineRest, { color: theme.accent }]}>{data.oneLineRest}</Text>
        </Text>
      </Animated.View>

      {/* Characters — no icon header, clean chips */}
      {data.characters.length > 0 && (
        <Animated.View style={[styles.section, { opacity: chipsAnim, transform: [{ translateY: chipsAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Characters</Text>
          <View style={styles.chipWrap}>
            {data.characters.map((c, i) => (
              <View key={i} style={[styles.chip, { backgroundColor: theme.glassBackground }]}>
                <Text style={[styles.chipName, { color: theme.text }]}>{c.name}</Text>
                {c.role ? <Text style={[styles.chipRole, { color: theme.textMuted }]}>{c.role}</Text> : null}
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Setting + Timeline — minimal, no card backgrounds */}
      <Animated.View style={[styles.metaCol, { opacity: metaAnim, transform: [{ translateY: metaAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        {data.setting ? (
          <View style={styles.metaRow}>
            <MaterialIcons name="place" size={16} color={theme.accent} style={{ marginTop: 2 }} />
            <View style={styles.metaTextWrap}>
              <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Setting</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{data.setting}</Text>
            </View>
          </View>
        ) : null}
        {data.timeline ? (
          <View style={styles.metaRow}>
            <MaterialIcons name="schedule" size={16} color={theme.accent} style={{ marginTop: 2 }} />
            <View style={styles.metaTextWrap}>
              <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Timeline</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{data.timeline}</Text>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sparkleClusterTL: {
    position: 'absolute',
    top: -15,
    left: -10,
    zIndex: 0,
  },
  sparkleClusterBR: {
    position: 'absolute',
    bottom: 40,
    right: -8,
    zIndex: 0,
  },
  sparkleBig: {
    fontSize: 110,
    color: '#fbbf24',
  },
  sparkleSmall1TL: {
    position: 'absolute',
    top: 10,
    right: -18,
    fontSize: 28,
    color: '#fbbf24',
    transform: [{ rotate: '30deg' }],
  },
  sparkleSmall2TL: {
    position: 'absolute',
    bottom: -8,
    left: 20,
    fontSize: 20,
    color: '#fbbf24',
    transform: [{ rotate: '-25deg' }],
  },
  sparkleSmall1BR: {
    position: 'absolute',
    top: -12,
    left: -16,
    fontSize: 24,
    color: '#fbbf24',
    transform: [{ rotate: '-35deg' }],
  },
  sparkleSmall2BR: {
    position: 'absolute',
    bottom: 10,
    right: 18,
    fontSize: 18,
    color: '#fbbf24',
    transform: [{ rotate: '25deg' }],
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 80,
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -2,
    marginBottom: 20,
  },
  // One-liner — no card, just text
  oneLineWrap: {
    marginBottom: 28,
    paddingTop: 6,
  },
  oneLineText: {
    fontSize: 24,
    lineHeight: 42,
  },
  oneLineHighlight: {
    fontFamily: 'EditorsNote-Italic',
    fontSize: 36,
    lineHeight: 46,
  },
  oneLineRest: {
    fontWeight: '700',
    fontSize: 24,
  },
  // Characters
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  chipName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 1,
  },
  chipRole: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Setting + Timeline — minimal rows, no cards
  metaCol: {
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  metaTextWrap: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 1,
  },
});
