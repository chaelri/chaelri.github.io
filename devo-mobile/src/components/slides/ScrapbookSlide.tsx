import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BorderRadius } from '../../constants/theme';
import type { StorySegment } from '../../services/ai';
import * as H from '../../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const COL_WIDTH = (SCREEN_WIDTH - 28 * 2 - CARD_GAP) / 2;

// Deterministic rotation & offset per index for collage feel
const CARD_PRESETS: { rotate: number; offsetX: number; offsetY: number; col: 'left' | 'right' | 'full' }[] = [
  { rotate: -1.8, offsetX: 2,  offsetY: 0,  col: 'left' },
  { rotate: 1.5,  offsetX: -2, offsetY: 8,  col: 'right' },
  { rotate: 0.8,  offsetX: 0,  offsetY: 0,  col: 'full' },
  { rotate: -2.2, offsetX: 4,  offsetY: 4,  col: 'right' },
  { rotate: 1.2,  offsetX: -3, offsetY: 0,  col: 'left' },
  { rotate: -0.5, offsetX: 1,  offsetY: 6,  col: 'full' },
  { rotate: 2.0,  offsetX: -4, offsetY: 0,  col: 'left' },
  { rotate: -1.0, offsetX: 2,  offsetY: 4,  col: 'right' },
  { rotate: 0.6,  offsetX: 0,  offsetY: 0,  col: 'full' },
  { rotate: -1.5, offsetX: 3,  offsetY: 8,  col: 'left' },
];

interface Props {
  segments: StorySegment[];
  bookName: string;
  chapter: number;
  theme: any;
  onAllRevealed: () => void;
}

function getCardSummary(seg: StorySegment): string {
  switch (seg.displayType) {
    case 'conversation': {
      const msgs = seg.content.messages || [];
      if (msgs.length === 0) return '';
      return `"${msgs[0].text}"`;
    }
    case 'narration': {
      const pts = seg.content.points || [];
      return pts.slice(0, 2).map((p) => p.text).join(' · ');
    }
    case 'teaching':
      return seg.content.quote ? `"${seg.content.quote}"` : '';
    case 'contrast':
      return `${seg.content.left?.label || 'Before'} → ${seg.content.right?.label || 'After'}`;
    case 'sequence': {
      const steps = seg.content.steps || [];
      return steps.slice(0, 2).map((s) => s.text).join(' → ');
    }
    case 'list':
      return (seg.content.headers || []).join(' · ');
    default:
      return '';
  }
}

function getDisplayIcon(seg: StorySegment): string {
  switch (seg.displayType) {
    case 'conversation': return 'chat-bubble-outline';
    case 'teaching': return 'format-quote';
    case 'contrast': return 'compare-arrows';
    case 'list': return 'list';
    case 'sequence': return 'timeline';
    default: return 'article';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Grid Paper Background
// ────────────────────────────────────────────────────────────────────────────
function GridPaper({ theme, height }: { theme: any; height: number }) {
  const lineColor = theme.background === '#0b1220'
    ? 'rgba(255,255,255,0.04)'
    : 'rgba(0,0,0,0.04)';
  const step = 24;
  const hLines = Math.ceil(height / step);
  const vLines = Math.ceil(SCREEN_WIDTH / step);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      {Array.from({ length: hLines }).map((_, i) => (
        <View
          key={`h${i}`}
          style={{
            position: 'absolute',
            top: i * step,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: lineColor,
          }}
        />
      ))}
      {Array.from({ length: vLines }).map((_, i) => (
        <View
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: i * step,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: lineColor,
          }}
        />
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tape Strip decoration
// ────────────────────────────────────────────────────────────────────────────
function TapeStrip({ theme, rotation }: { theme: any; rotation: number }) {
  const isDark = theme.background === '#0b1220';
  return (
    <View style={[
      tapeStyles.strip,
      {
        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        transform: [{ rotate: `${rotation}deg` }],
      },
    ]} />
  );
}

const tapeStyles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    width: 40,
    height: 14,
    borderRadius: 1,
    zIndex: 10,
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Scrapbook Card
// ────────────────────────────────────────────────────────────────────────────
function ScrapbookCard({
  segment, index, total, theme, visible,
}: {
  segment: StorySegment; index: number; total: number; theme: any; visible: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (visible && !hasAnimated.current) {
      hasAnimated.current = true;
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const preset = CARD_PRESETS[index % CARD_PRESETS.length];
  const summary = getCardSummary(segment);
  const icon = getDisplayIcon(segment);
  const isLast = index === total - 1;

  const isDark = theme.background === '#0b1220';
  const cardBg = isDark ? '#1a2236' : '#faf8f5';
  const cardText = isDark ? '#d4dce8' : '#2a2a3e';
  const cardMuted = isDark ? '#7a8599' : '#8a8a9e';
  const tapeRotation = preset.rotate * 0.5;

  const isFullWidth = preset.col === 'full';

  return (
    <Animated.View style={[
      cardStyles.card,
      {
        width: isFullWidth ? '100%' : COL_WIDTH,
        backgroundColor: cardBg,
        transform: [
          { rotate: `${preset.rotate}deg` },
          { translateX: preset.offsetX },
          { scale: scaleAnim },
        ],
        opacity: opacityAnim,
        marginTop: preset.offsetY,
      },
    ]}>
      <TapeStrip theme={theme} rotation={tapeRotation} />

      {/* Number badge */}
      <View style={[cardStyles.numBadge, { backgroundColor: theme.accent + '20' }]}>
        {isLast ? (
          <MaterialIcons name="flag" size={14} color={theme.accent} />
        ) : (
          <Text style={[cardStyles.numText, { color: theme.accent }]}>{index + 1}</Text>
        )}
      </View>

      {/* Icon */}
      <MaterialIcons name={icon as any} size={16} color={cardMuted} style={{ marginBottom: 6, opacity: 0.6 }} />

      {/* Title */}
      <Text style={[cardStyles.title, { color: cardText }]} numberOfLines={2}>
        {segment.title}
      </Text>

      {/* Verse ref */}
      <Text style={[cardStyles.verseRef, { color: cardMuted }]}>
        v. {segment.verses}
      </Text>

      {/* Summary snippet */}
      {summary ? (
        <Text style={[cardStyles.summary, { color: cardMuted }]} numberOfLines={isFullWidth ? 3 : 2}>
          {summary}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    padding: 16,
    paddingTop: 20,
    borderRadius: 4,
    // Paper shadow
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 8,
  },
  numBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numText: {
    fontSize: 13,
    fontWeight: '900',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  verseRef: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summary: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});

// ────────────────────────────────────────────────────────────────────────────
// Main Scrapbook Slide
// ────────────────────────────────────────────────────────────────────────────
export default function ScrapbookSlide({ segments, bookName, chapter, theme, onAllRevealed }: Props) {
  const [revealedCount, setRevealedCount] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const allRevealed = revealedCount >= segments.length;

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (allRevealed) {
      H.success();
      onAllRevealed();
    }
  }, [allRevealed]);

  const handleNext = () => {
    H.tap();
    setRevealedCount((c) => Math.min(c + 1, segments.length));
    // Scroll down a bit to show new card
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 200);
  };

  // Layout cards in rows: pair left+right, or full-width
  const rows: { type: 'pair'; left: number; right: number }[] | { type: 'full'; idx: number }[] = [];
  let i = 0;
  while (i < segments.length) {
    const preset = CARD_PRESETS[i % CARD_PRESETS.length];
    if (preset.col === 'full') {
      (rows as any[]).push({ type: 'full', idx: i });
      i++;
    } else {
      const nextPreset = i + 1 < segments.length ? CARD_PRESETS[(i + 1) % CARD_PRESETS.length] : null;
      if (nextPreset && nextPreset.col !== 'full') {
        (rows as any[]).push({ type: 'pair', left: i, right: i + 1 });
        i += 2;
      } else {
        (rows as any[]).push({ type: 'full', idx: i });
        i++;
      }
    }
  }

  // Estimated content height for grid
  const estHeight = 200 + rows.length * 180;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={scrapStyles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <GridPaper theme={theme} height={Math.max(estHeight, 1200)} />

        {/* Header */}
        <Animated.View style={[scrapStyles.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
          <Text style={[scrapStyles.label, { color: theme.textMuted }]}>THE STORY</Text>
          <Text style={[scrapStyles.title, { color: theme.text }]}>
            {bookName} {chapter}
          </Text>
        </Animated.View>

        {/* Cards in collage layout */}
        <View style={scrapStyles.board}>
          {(rows as any[]).map((row: any, ri: number) => {
            if (row.type === 'full') {
              return (
                <ScrapbookCard
                  key={row.idx}
                  segment={segments[row.idx]}
                  index={row.idx}
                  total={segments.length}
                  theme={theme}
                  visible={row.idx < revealedCount}
                />
              );
            }
            // pair row
            return (
              <View key={`pair-${ri}`} style={scrapStyles.pairRow}>
                <ScrapbookCard
                  segment={segments[row.left]}
                  index={row.left}
                  total={segments.length}
                  theme={theme}
                  visible={row.left < revealedCount}
                />
                {row.right < segments.length && (
                  <ScrapbookCard
                    segment={segments[row.right]}
                    index={row.right}
                    total={segments.length}
                    theme={theme}
                    visible={row.right < revealedCount}
                  />
                )}
              </View>
            );
          })}
        </View>

        {/* Bottom spacer for button */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Next story button — fixed bottom right */}
      {!allRevealed && (
        <View style={scrapStyles.nextWrap}>
          <TouchableOpacity
            style={[scrapStyles.nextBtn, { backgroundColor: theme.accent }]}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={scrapStyles.nextText}>Next Story</Text>
            <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const scrapStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    zIndex: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  board: {
    gap: CARD_GAP,
  },
  pairRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    alignItems: 'flex-start',
  },
  nextWrap: {
    position: 'absolute',
    bottom: 20,
    right: 28,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.pill,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
