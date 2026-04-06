// SequenceSlide — reuses the same zigzag scrapbook layout as NarrationSlide
// Just maps steps to the same card format

import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import type { StorySegment } from '../../services/ai';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_SIZE = 22;
const PAD_H = 20;
const CARD_MAX_W = Math.floor(SCREEN_WIDTH / 2) + 10;
const LEFT_CX = PAD_H + CARD_MAX_W / 2;
const RIGHT_CX = SCREEN_WIDTH - PAD_H - CARD_MAX_W / 2;
const CONNECTOR_GAP = 36;

const ROTATIONS = [-2.0, 1.8, -1.2, 2.2, -1.6, 1.4, -2.4, 1.0];

const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}
function validEmoji(emoji?: string): string | null {
  if (!emoji || emoji.length > 4) return null;
  return EMOJI_RE.test(emoji) ? emoji : null;
}

interface Props {
  segment: StorySegment;
  theme: any;
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

export default function SequenceSlide({ segment, theme }: Props) {
  const steps = segment.content.steps || [];
  const isDark = theme.background === '#0b1220';
  const cardBg = isDark ? '#181f33' : '#faf8f4';
  const cardText = isDark ? '#d4dce8' : '#2a2a3e';
  const verseStart = parseVerseStart(segment.verses);

  return (
    <View style={{ flex: 1 }}>
      <GridPaper theme={theme} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <Text style={[styles.title, { color: theme.text }]}>{segment.title}</Text>
        <View style={styles.board}>
          {steps.map((step, i) => {
            const isLeft = i % 2 === 0;
            const isLast = i === steps.length - 1;
            return (
              <View key={`${segment.verses}-${i}`}>
                <ScrapCard index={i} text={step.text} emoji={step.emoji} verseNum={verseStart + i} isLeft={isLeft} theme={theme} cardBg={cardBg} cardText={cardText} segmentKey={segment.verses} />
                {!isLast && (
                  <DiagonalConnector fromLeft={isLeft} accentColor={theme.accent} index={i} segmentKey={segment.verses} />
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function DiagonalConnector({ fromLeft, accentColor, index, segmentKey }: {
  fromLeft: boolean; accentColor: string; index: number; segmentKey: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 500, delay: index * 600 + 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [segmentKey]);

  const startX = fromLeft ? LEFT_CX : RIGHT_CX;
  const endX = fromLeft ? RIGHT_CX : LEFT_CX;
  const dx = endX - startX;
  const dy = CONNECTOR_GAP;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <View style={{ height: CONNECTOR_GAP, zIndex: 1 }}>
      <Animated.View style={{ position: 'absolute', left: startX - PAD_H, top: 0, width: length, height: 1.5, backgroundColor: accentColor, opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }), transform: [{ rotate: `${angle}deg` }], transformOrigin: '0 0' }} />
      <Animated.View style={{ position: 'absolute', left: startX - PAD_H - 3, top: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor, opacity: anim, transform: [{ scale: anim }] }} />
      <Animated.View style={{ position: 'absolute', left: endX - PAD_H - 3, bottom: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor, opacity: anim, transform: [{ scale: anim }] }} />
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
    <Animated.View style={[styles.card, { maxWidth: CARD_MAX_W, backgroundColor: cardBg, alignSelf: isLeft ? 'flex-start' : 'flex-end', transform: [{ rotate: `${rot}deg` }, { scale: scaleAnim }], opacity: opacityAnim }]}>
      <TapeStrip theme={theme} rotation={rot * 0.4} />
      <Text style={[styles.cardVerseRef, { color: theme.accent }]}>v{verseNum}</Text>
      <Text style={[styles.cardText, { color: cardText }]}>{stripEmoji(text)}</Text>
      {validEmoji(emoji) ? <Text style={styles.cardEmoji}>{validEmoji(emoji)}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: PAD_H, paddingTop: 32, paddingBottom: 24 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -1.5, marginBottom: 20, zIndex: 2 },
  board: { zIndex: 2 },
  card: { padding: 14, paddingTop: 18, borderRadius: 4, shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  cardVerseRef: { position: 'absolute', top: 8, right: 12, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, opacity: 0.7 },
  cardText: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  cardEmoji: { position: 'absolute', bottom: 8, right: 12, fontSize: 18 },
});
