import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BorderRadius } from '../../constants/theme';
import type { StorySegment } from '../../services/ai';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  segment: StorySegment;
  theme: any;
}

function renderBold(text: string, boldColor: string, baseColor: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '800', color: boldColor }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

export default function TeachingSlide({ segment, theme }: Props) {
  const { quote, speaker, explanation } = segment.content;
  const verseRef = segment.content.verseRef || segment.verses;

  const quoteAnim = useRef(new Animated.Value(0)).current;
  const explainAnim = useRef(new Animated.Value(0)).current;
  const wmPulse1 = useRef(new Animated.Value(0.1)).current;
  const wmPulse2 = useRef(new Animated.Value(0.08)).current;
  const wmDrift1X = useRef(new Animated.Value(0)).current;
  const wmDrift1Y = useRef(new Animated.Value(0)).current;
  const wmDrift2X = useRef(new Animated.Value(0)).current;
  const wmDrift2Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    quoteAnim.setValue(0);
    explainAnim.setValue(0);

    Animated.stagger(200, [
      Animated.timing(quoteAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(explainAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Pulse — more visible
    Animated.loop(Animated.sequence([
      Animated.timing(wmPulse1, { toValue: 0.18, duration: 2500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wmPulse1, { toValue: 0.08, duration: 2500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(1000),
      Animated.timing(wmPulse2, { toValue: 0.15, duration: 3000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wmPulse2, { toValue: 0.06, duration: 3000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();

    // Drift motion
    const loopDrift = (anim: Animated.Value, range: number, dur: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: range, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: -range, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
    loopDrift(wmDrift1X, 10, 3500, 0);
    loopDrift(wmDrift1Y, 8, 4000, 500);
    loopDrift(wmDrift2X, -8, 3000, 300);
    loopDrift(wmDrift2Y, 6, 3500, 800);
  }, [segment.verses]);

  return (
    <View style={{ flex: 1 }}>
      {/* Animated background apostrophes */}
      <Animated.Text style={[styles.watermarkOpen, { color: theme.accent, opacity: wmPulse1, transform: [{ translateX: wmDrift1X }, { translateY: wmDrift1Y }] }]}>"</Animated.Text>
      <Animated.Text style={[styles.watermarkClose, { color: theme.accent, opacity: wmPulse2, transform: [{ translateX: wmDrift2X }, { translateY: wmDrift2Y }] }]}>"</Animated.Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Text style={[styles.verseLabel, { color: theme.textMuted }]}>VERSES {segment.verses}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{segment.title}</Text>

        {/* Quote card */}
        <Animated.View style={[
          styles.quoteCard,
          { backgroundColor: theme.glassBackground, borderColor: theme.glassBorder },
          { opacity: quoteAnim, transform: [{ translateY: quoteAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
        ]}>
          <MaterialIcons name="format-quote" size={24} color={theme.accent} style={{ marginBottom: 10, opacity: 0.5 }} />
          <Text style={[styles.quoteText, { color: theme.text }]}>
            {quote || ''}
          </Text>
          {speaker ? (
            <View style={styles.attribution}>
              <Text style={[styles.speaker, { color: theme.accent }]}>— {speaker}</Text>
              <Text style={[styles.verseRefText, { color: theme.textMuted }]}>v. {verseRef}</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Explanation */}
        {explanation ? (
          <Animated.Text style={[
            styles.explanation,
            { color: theme.textSecondary },
            { opacity: explainAnim, transform: [{ translateY: explainAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
          ]}>
            {renderBold(explanation, theme.text, theme.textSecondary)}
          </Animated.Text>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  watermarkOpen: {
    position: 'absolute',
    top: 20,
    left: -15,
    fontSize: 180,
    fontFamily: 'EditorsNote-Italic',
    zIndex: 0,
  },
  watermarkClose: {
    position: 'absolute',
    bottom: 60,
    right: -10,
    fontSize: 180,
    fontFamily: 'EditorsNote-Italic',
    zIndex: 0,
    transform: [{ rotate: '180deg' }],
  },
  container: {
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 80,
    flexGrow: 1,
    justifyContent: 'center',
  },
  verseLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 24,
  },
  quoteCard: {
    padding: 22,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    marginBottom: 22,
  },
  quoteText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 14,
  },
  attribution: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  speaker: {
    fontSize: 15,
    fontWeight: '700',
  },
  verseRefText: {
    fontSize: 13,
    fontWeight: '600',
  },
  explanation: {
    fontSize: 17,
    lineHeight: 28,
  },
});
