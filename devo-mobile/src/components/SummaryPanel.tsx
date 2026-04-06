import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import * as H from '../utils/haptics';
import { BorderRadius } from '../constants/theme';
import {
  getAtAGlance,
  getChapterTimeline,
  getChapterClosing,
  type AtAGlance,
  type StorySegment,
  type ChapterClosing,
} from '../services/ai';
import { SegmentSlideRouter, AtAGlanceSlide, ChapterMapSlide } from './StorySlide';
import RecapSlide from './slides/RecapSlide';
import ReflectionSlide from './slides/ReflectionSlide';


// These display types use scrapbook-style reveal within the slide
const SCRAPBOOK_TYPES = new Set(['narration', 'sequence', 'list']);

interface Props {
  visible: boolean;
  onClose: () => void;
  bookName: string;
  chapter: number;
  versesText: string;
}

export default function SummaryPanel({ visible, onClose, bookName, chapter, versesText }: Props) {
  const theme = useTheme();
  const [atAGlance, setAtAGlance] = useState<AtAGlance | null>(null);
  const [segments, setSegments] = useState<StorySegment[]>([]);
  const [closing, setClosing] = useState<ChapterClosing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const sparkles = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const slideFade = useRef(new Animated.Value(1)).current;
  const slideTranslateY = useRef(new Animated.Value(0)).current;
  // Exit animation
  const exitFade = useRef(new Animated.Value(1)).current;
  const [isExiting, setIsExiting] = useState(false);

  // totalSlides: AtAGlance + ChapterMap + segments + Recap + Reflection
  const totalSlides = atAGlance ? 2 + segments.length + (closing ? 2 : 0) : 0;

  // Per-slide scrapbook reveal tracking: how many items revealed for current slide
  const [revealedCount, setRevealedCount] = useState(1);

  const getItemCount = (seg: StorySegment): number => {
    switch (seg.displayType) {
      case 'narration': return (seg.content.points || []).length;
      case 'sequence': return (seg.content.steps || []).length;
      case 'list': return (seg.content.rows || []).length;
      default: return 0;
    }
  };

  // Auto-reveal scrapbook cards on a timer
  useEffect(() => {
    setRevealedCount(1);
  }, [currentIndex]);

  useEffect(() => {
    const segIdx = currentIndex - 2;
    if (segIdx < 0 || segIdx >= segments.length) return;
    const seg = segments[segIdx];
    if (!SCRAPBOOK_TYPES.has(seg.displayType)) return;

    const total = getItemCount(seg);
    if (revealedCount >= total) return;

    const timer = setTimeout(() => {
      setRevealedCount((c) => c + 1);
    }, 600); // reveal next card every 0.6s

    return () => clearTimeout(timer);
  }, [currentIndex, revealedCount, segments]);

  useEffect(() => {
    if (visible && !atAGlance && segments.length === 0) fetchData();
  }, [visible]);

  useEffect(() => {
    if (loading) {
      sparkles.forEach((anim, i) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 250),
            Animated.timing(anim, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0.2, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ])
        ).start();
      });
    }
  }, [loading]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setCurrentIndex(0);
    H.sparkleRhythm();

    try {
      const [glance, timeline, closingData] = await Promise.all([
        getAtAGlance(bookName, chapter, versesText),
        getChapterTimeline(bookName, chapter, versesText),
        getChapterClosing(bookName, chapter, versesText),
      ]);

      setAtAGlance(glance);
      setSegments(timeline);
      setClosing(closingData);
      H.stopSparkle();
      H.success();
    } catch (err: any) {
      H.stopSparkle();
      H.error();
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const animateTransition = (cb: () => void, direction: 'next' | 'prev' = 'next') => {
    const exitY = direction === 'next' ? -16 : 16;
    const enterY = direction === 'next' ? 24 : -24;

    Animated.parallel([
      Animated.timing(slideFade, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideTranslateY, { toValue: exitY, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideTranslateY.setValue(enterY);
      Animated.parallel([
        Animated.timing(slideFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideTranslateY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  };

  const goNext = () => {
    if (currentIndex >= totalSlides - 1) { H.press(); animateExit(); return; }
    H.tick();
    animateTransition(() => setCurrentIndex((i) => i + 1), 'next');
  };

  const goPrev = () => {
    if (currentIndex <= 0) return;
    H.tick();
    animateTransition(() => setCurrentIndex((i) => i - 1), 'prev');
  };

  const animateExit = () => {
    if (isExiting) return;
    setIsExiting(true);
    H.success();
    // Restart sparkle anims for closing screen
    sparkles.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 250),
          Animated.timing(anim, { toValue: 1, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.2, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    });
    // Fade out current slide, show closing screen, then dismiss
    Animated.timing(slideFade, { toValue: 0, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        resetAndClose();
      }, 1500);
    });
  };

  const handleClose = () => {
    animateExit();
  };

  const resetAndClose = () => {
    H.stopSparkle();
    setAtAGlance(null);
    setSegments([]);
    setClosing(null);
    setCurrentIndex(0);
    setIsExiting(false);
    exitFade.setValue(1);
    slideFade.setValue(1);
    onClose();
  };

  const renderSlide = () => {
    if (!atAGlance) return null;

    if (currentIndex === 0) {
      return <AtAGlanceSlide data={atAGlance} bookName={bookName} chapter={chapter} theme={theme} />;
    }
    if (currentIndex === 1) {
      return <ChapterMapSlide segments={segments} bookName={bookName} chapter={chapter} theme={theme} />;
    }

    const segIndex = currentIndex - 2;

    // Segment slides
    if (segIndex >= 0 && segIndex < segments.length) {
      const seg = segments[segIndex];
      const isScrapType = SCRAPBOOK_TYPES.has(seg.displayType);

      // For scrapbook types, clip the content to revealed count
      const displaySeg = isScrapType ? clipSegment(seg, revealedCount) : seg;
      const totalItems = isScrapType ? getItemCount(seg) : 0;
      const allRevealed = revealedCount >= totalItems;

      return (
        <SegmentSlideRouter
          segment={displaySeg}
          theme={theme}
          bookName={bookName}
          chapter={chapter}
        />
      );
    }

    // Recap slide
    if (closing && segIndex === segments.length) {
      return <RecapSlide recapPoints={closing.recapPoints} bookName={bookName} chapter={chapter} theme={theme} />;
    }

    // Reflection slide
    if (closing && segIndex === segments.length + 1) {
      return <ReflectionSlide reflectionP1={closing.reflectionP1} reflectionP2={closing.reflectionP2} bookName={bookName} chapter={chapter} theme={theme} />;
    }

    return null;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Progress bar + close */}
          <View style={styles.topBar}>
            <View style={styles.progressRow}>
              {totalSlides > 0 && Array.from({ length: totalSlides }).map((_, i) => (
                <View key={i} style={[styles.progressSeg, { backgroundColor: theme.glassBackground }]}>
                  <View style={[
                    styles.progressFill,
                    {
                      backgroundColor: theme.accent,
                      width: i <= currentIndex ? '100%' : '0%',
                      opacity: i <= currentIndex ? 1 : 0.3,
                    },
                  ]} />
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialIcons name="close" size={24} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.center}>
              <View style={styles.sparkleRow}>
                {sparkles.map((anim, i) => (
                  <Animated.Text key={i} style={[styles.sparkle, {
                    opacity: anim,
                    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
                  }]}>✦</Animated.Text>
                ))}
              </View>
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>Generating stories...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <MaterialIcons name="error-outline" size={36} color={theme.textMuted} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{error}</Text>
              <TouchableOpacity onPress={fetchData} style={[styles.retryBtn, { backgroundColor: theme.primary }]}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : isExiting ? (
            <View style={styles.center}>
              <View style={styles.sparkleRow}>
                {sparkles.map((anim, i) => (
                  <Animated.Text key={i} style={[styles.sparkle, {
                    opacity: anim,
                    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
                  }]}>✦</Animated.Text>
                ))}
              </View>
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>Happy reading</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Animated.View style={[styles.slideWrap, { opacity: slideFade, transform: [{ translateY: slideTranslateY }] }]}>
                {renderSlide()}
                {totalSlides > 0 && (
                  <Text style={[styles.counter, { color: theme.textMuted }]}>
                    {currentIndex + 1} / {totalSlides}
                  </Text>
                )}
              </Animated.View>

              {/* Invisible edge tap zones — don't interfere with scroll */}
              <TouchableOpacity
                style={styles.tapZoneLeft}
                onPress={goPrev}
                activeOpacity={1}
              />
              <TouchableOpacity
                style={styles.tapZoneRight}
                onPress={goNext}
                activeOpacity={1}
              />
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Clips a segment's items to show only `count` entries */
function clipSegment(segment: StorySegment, count: number): StorySegment {
  const clipped = { ...segment, content: { ...segment.content } };
  switch (segment.displayType) {
    case 'narration':
      clipped.content.points = (segment.content.points || []).slice(0, count);
      break;
    case 'sequence':
      clipped.content.steps = (segment.content.steps || []).slice(0, count);
      break;
    case 'list':
      clipped.content.rows = (segment.content.rows || []).slice(0, count);
      break;
  }
  return clipped;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  progressRow: { flex: 1, flexDirection: 'row', gap: 3 },
  progressSeg: { flex: 1, height: 3, borderRadius: 1.5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 1.5 },
  closeBtn: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  sparkleRow: { flexDirection: 'row', gap: 6 },
  sparkle: { fontSize: 24, color: '#fbbf24' },
  loadingText: { fontSize: 16, fontWeight: '600' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: BorderRadius.md, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  slideWrap: { flex: 1 },
  counter: {
    position: 'absolute',
    bottom: 12,
    right: 32,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    zIndex: 10,
  },
  tapZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 60,
    width: 32,
    zIndex: 5,
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 60,
    width: 32,
    zIndex: 5,
  },
});
