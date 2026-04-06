import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { StorySegment } from '../../services/ai';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_SIZE = 22;
const ROTATIONS = [-0.8, 1.3, -1.5, 0.6, -1.0, 1.7, -0.5, 1.1];

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

export default function ListSlide({ segment, theme }: Props) {
  const headers = segment.content.headers || [];
  const rows = segment.content.rows || [];
  const isDark = theme.background === '#0b1220';
  const cardBg = isDark ? '#181f33' : '#faf8f4';
  const cardText = isDark ? '#d4dce8' : '#2a2a3e';
  const cardMuted = isDark ? '#7a8599' : '#8a8a9e';
  const verseStart = parseVerseStart(segment.verses);

  return (
    <View style={{ flex: 1 }}>
      <GridPaper theme={theme} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <View style={[styles.iconBadge, { backgroundColor: theme.primaryLight, zIndex: 2 }]}>
          <MaterialIcons name={segment.materialIcon as any} size={24} color={theme.primary} />
        </View>
        <Text style={[styles.verseLabel, { color: theme.textMuted }]}>VERSES {segment.verses}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{segment.title}</Text>
        <View style={styles.board}>
          {rows.map((row, ri) => (
            <ListCard key={`${segment.verses}-${ri}`} index={ri} headers={headers} cells={row} verseNum={verseStart + ri} theme={theme} cardBg={cardBg} cardText={cardText} cardMuted={cardMuted} segmentKey={segment.verses} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ListCard({ index, headers, cells, verseNum, theme, cardBg, cardText, cardMuted, segmentKey }: {
  index: number; headers: string[]; cells: string[]; verseNum: number; theme: any; cardBg: string; cardText: string; cardMuted: string; segmentKey: string;
}) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    scaleAnim.setValue(0.85);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 80, delay: index * 80, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, delay: index * 80, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [segmentKey]);
  const rot = ROTATIONS[index % ROTATIONS.length];
  return (
    <Animated.View style={[styles.card, { backgroundColor: cardBg, transform: [{ rotate: `${rot}deg` }, { scale: scaleAnim }], opacity: opacityAnim }]}>
      <TapeStrip theme={theme} rotation={rot * 0.4} />
      <Text style={[styles.cardVerseRef, { color: theme.primary }]}>v{verseNum}</Text>
      {cells.map((cell, ci) => (
        <View key={ci} style={styles.cellRow}>
          {headers[ci] && <Text style={[styles.cellLabel, { color: cardMuted }]}>{headers[ci]}</Text>}
          <Text style={[styles.cellValue, { color: cardText }]}>{cell}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  iconBadge: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  verseLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6, zIndex: 2 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -1, marginBottom: 24, zIndex: 2 },
  board: { gap: 12, zIndex: 2 },
  card: { padding: 14, paddingTop: 18, borderRadius: 4, shadowColor: '#000', shadowOffset: { width: 1, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  cardVerseRef: { position: 'absolute', top: 8, right: 12, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cellRow: { marginBottom: 3 },
  cellLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 1 },
  cellValue: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
