import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import type { StorySegment } from '../../services/ai';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_SIZE = 22;
const PAD_H = 20;
const CARD_MAX_W = Math.floor(SCREEN_WIDTH / 2) + 10;
// Center-x of left card and right card (approximate)
const LEFT_CX = PAD_H + CARD_MAX_W / 2;
const RIGHT_CX = SCREEN_WIDTH - PAD_H - CARD_MAX_W / 2;

const ROTATIONS = [-2.0, 1.8, -1.2, 2.2, -1.6, 1.4, -2.4, 1.0];
const CONNECTOR_GAP = 36; // vertical space for the connector

interface Props {
  segment: StorySegment;
  theme: any;
}

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}
/** Returns the emoji only if it's actually an emoji character, not a plain text word */
function validEmoji(emoji?: string): string | null {
  if (!emoji || emoji.length > 4) return null; // real emojis are 1-4 chars max
  return EMOJI_RE.test(emoji) ? emoji : null;
}

function parseVerseStart(verses: string): number {
  const match = verses.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

function GridPaper({ theme }: { theme: any }) {
  const isDark = theme.background === '#0b1220';
  const hColor = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
  const vColor = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
  const hCount = Math.ceil(SCREEN_HEIGHT / GRID_SIZE) + 5;
  const vCount = Math.ceil(SCREEN_WIDTH / GRID_SIZE);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: hCount }).map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', top: i * GRID_SIZE, left: 0, right: 0, height: 1, backgroundColor: hColor }} />
      ))}
      {Array.from({ length: vCount }).map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', left: i * GRID_SIZE, top: 0, bottom: 0, width: 1, backgroundColor: vColor }} />
      ))}
    </View>
  );
}

function TapeStrip({ theme, rotation }: { theme: any; rotation: number }) {
  const isDark = theme.background === '#0b1220';
  return (
    <View style={[tapeStyles.strip, {
      backgroundColor: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.07)',
      transform: [{ rotate: `${rotation}deg` }],
    }]} />
  );
}
const tapeStyles = StyleSheet.create({
  strip: { position: 'absolute', top: -5, alignSelf: 'center', width: 38, height: 13, borderRadius: 1, zIndex: 10 },
});

export default function NarrationSlide({ segment, theme }: Props) {
  const points = segment.content.points || [];
  const isDark = theme.background === '#0b1220';
  const cardBg = isDark ? '#181f33' : '#faf8f4';
  const cardText = isDark ? '#d4dce8' : '#2a2a3e';
  const verseStart = parseVerseStart(segment.verses);

  // Label + ambient animations fade in after last card
  const labelAnim = useRef(new Animated.Value(0)).current;
  const ambientPulse = useRef(new Animated.Value(0)).current;
  const ambientDriftX = useRef(new Animated.Value(0)).current;
  const ambientDriftY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    labelAnim.setValue(0);
    ambientPulse.setValue(0);
    const delay = (points.length - 1) * 600 + 800;
    Animated.timing(labelAnim, { toValue: 1, duration: 400, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();

    // Start ambient sparkle loop after all cards loaded
    const timer = setTimeout(() => {
      Animated.loop(Animated.sequence([
        Animated.timing(ambientPulse, { toValue: 0.25, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(ambientPulse, { toValue: 0.08, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(ambientDriftX, { toValue: 12, duration: 3500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(ambientDriftX, { toValue: -12, duration: 3500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(ambientDriftY, { toValue: -10, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(ambientDriftY, { toValue: 10, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [points.length, segment.verses]);

  return (
    <View style={{ flex: 1 }}>
      <GridPaper theme={theme} />

      {/* Ambient floating sparkles — appear after all cards */}
      <Animated.Text style={{
        position: 'absolute', top: '30%', right: 20, fontSize: 40, color: '#fbbf24', zIndex: 0,
        opacity: ambientPulse,
        transform: [{ translateX: ambientDriftX }, { translateY: ambientDriftY }, { rotate: '-20deg' }],
      }} pointerEvents="none">✦</Animated.Text>
      <Animated.Text style={{
        position: 'absolute', bottom: '25%', left: 15, fontSize: 28, color: '#fbbf24', zIndex: 0,
        opacity: ambientPulse.interpolate({ inputRange: [0, 0.25], outputRange: [0, 0.18] }),
        transform: [{ translateX: Animated.multiply(ambientDriftX, -1) }, { translateY: Animated.multiply(ambientDriftY, -1) }, { rotate: '25deg' }],
      }} pointerEvents="none">✦</Animated.Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, points.length <= 3 && styles.containerCentered]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Text style={[styles.title, { color: theme.text }]}>{segment.title}</Text>

        <View style={styles.board}>
          {points.map((pt, i) => {
            const isLeft = i % 2 === 0;
            const isLast = i === points.length - 1;
            return (
              <View key={`${segment.verses}-${i}`}>
                <ScrapCard
                  index={i}
                  text={pt.text}
                  emoji={pt.emoji}
                  verseNum={verseStart + i}
                  isLeft={isLeft}
                  theme={theme}
                  cardBg={cardBg}
                  cardText={cardText}
                  segmentKey={segment.verses}
                />
                {!isLast && (
                  <DiagonalConnector
                    fromLeft={isLeft}
                    accentColor={theme.accent}
                    index={i}
                    segmentKey={segment.verses}
                  />
                )}
              </View>
            );
          })}
        </View>

        {/* Footer — fades in after last card */}
        <Animated.View style={[styles.footer, { opacity: labelAnim, transform: [{ translateY: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <View style={[styles.footerLine, { backgroundColor: theme.glassBorder }]} />
          <Text style={[styles.footerVerses, { color: theme.accent }]}>Verses {segment.verses}</Text>
          <Text style={[styles.footerTitle, { color: theme.textMuted }]}>{segment.title}</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/**
 * Diagonal connector: a rotated thin line that goes from the bottom of one card
 * to the top of the next card on the opposite side, with a dot at each end.
 */
function DiagonalConnector({ fromLeft, accentColor, index, segmentKey }: {
  fromLeft: boolean; accentColor: string; index: number; segmentKey: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    anim.setValue(0);
    dotPulse.setValue(1);
    const enterDelay = index * 600 + 350;
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay: enterDelay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // After entering, start looping pulse on dots
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotPulse, { toValue: 1.8, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(dotPulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    });
  }, [segmentKey]);

  // Calculate the diagonal: from center of current card side to center of opposite side
  const startX = fromLeft ? LEFT_CX : RIGHT_CX;
  const endX = fromLeft ? RIGHT_CX : LEFT_CX;
  const dx = endX - startX;
  const dy = CONNECTOR_GAP;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <View style={{ height: CONNECTOR_GAP, zIndex: 1 }}>
      {/* The diagonal line — positioned at start point, rotated */}
      <Animated.View
        style={{
          position: 'absolute',
          left: startX - PAD_H,
          top: 0,
          width: length,
          height: 1.5,
          backgroundColor: accentColor,
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
          transform: [
            { rotate: `${angle}deg` },
          ],
          transformOrigin: '0 0',
        }}
      />
      {/* Dot at the start — pulses */}
      <Animated.View style={{
        position: 'absolute',
        left: startX - PAD_H - 3,
        top: -3,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: accentColor,
        opacity: anim,
        transform: [{ scale: dotPulse }],
      }} />
      {/* Dot at the end — pulses */}
      <Animated.View style={{
        position: 'absolute',
        left: endX - PAD_H - 3,
        bottom: -3,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: accentColor,
        opacity: anim,
        transform: [{ scale: dotPulse }],
      }} />
    </View>
  );
}

function ScrapCard({ index, text, emoji, verseNum, isLeft, theme, cardBg, cardText, segmentKey }: {
  index: number; text: string; emoji?: string; verseNum: number; isLeft: boolean; theme: any; cardBg: string; cardText: string; segmentKey: string;
}) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scaleAnim.setValue(0.8);
    opacityAnim.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 80, delay: index * 600, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 350, delay: index * 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [segmentKey]);

  const rot = ROTATIONS[index % ROTATIONS.length];

  return (
    <Animated.View style={[
      styles.card,
      {
        maxWidth: CARD_MAX_W,
        backgroundColor: cardBg,
        alignSelf: isLeft ? 'flex-start' : 'flex-end',
        transform: [{ rotate: `${rot}deg` }, { scale: scaleAnim }],
        opacity: opacityAnim,
      },
    ]}>
      <TapeStrip theme={theme} rotation={rot * 0.4} />
      <Text style={[styles.cardVerseRef, { color: theme.accent }]}>v{verseNum}</Text>
      <Text style={[styles.cardText, { color: cardText }]}>{stripEmoji(text)}</Text>
      {validEmoji(emoji) ? <Text style={styles.cardEmoji}>{validEmoji(emoji)}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: PAD_H,
    paddingTop: 32,
    paddingBottom: 24,
  },
  containerCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginBottom: 20,
    zIndex: 2,
  },
  board: {
    zIndex: 2,
  },
  card: {
    padding: 14,
    paddingTop: 18,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  cardVerseRef: {
    position: 'absolute',
    top: 8,
    right: 12,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  cardEmoji: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 18,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    paddingBottom: 8,
  },
  footerLine: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginBottom: 12,
  },
  footerVerses: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.5,
  },
});
