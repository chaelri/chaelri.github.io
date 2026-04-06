import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import GradientView from '../src/components/GradientView';
import { createChapterPlayer, type TTSChapterState } from '../src/services/tts';
import { BIBLE_META } from '../src/constants/bible-meta';
import { getVerses } from '../src/data/bibleLoader';

export default function ImmersiveTTSScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    bookCode: string;
    chapter: string;
    version: string;
  }>();

  const bookCode = params.bookCode || 'JHN';
  const chapter = Number(params.chapter) || 1;
  const version = (params.version || 'NASB') as 'NASB' | 'EASY';
  const bookName = BIBLE_META[bookCode]?.name || bookCode;

  const [ttsState, setTtsState] = useState<TTSChapterState | null>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const playerRef = useRef<ReturnType<typeof createChapterPlayer> | null>(null);
  const prevIndexRef = useRef(-1);

  // Animated values for verse transition
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Loading screen fade
  const loadingFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let player: ReturnType<typeof createChapterPlayer> | null = null;

    const versesData = getVerses(version, bookName, chapter);
    const verses = Object.entries(versesData)
      .filter(([k]) => !k.includes('-'))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([num, text]) => ({ num, text }));

    if (verses.length === 0) return;

    player = createChapterPlayer(verses, (state) => {
      setTtsState(state);
      if (!readyRef.current && state.isPlaying) {
        readyRef.current = true;
        setReady(true);
        Animated.timing(loadingFade, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    });

    playerRef.current = player;
    player.play();

    return () => {
      player?.destroy();
    };
  }, [bookCode, chapter, version]);

  // Animate on verse change
  useEffect(() => {
    if (!ttsState) return;
    if (prevIndexRef.current === ttsState.currentIndex) return;
    prevIndexRef.current = ttsState.currentIndex;

    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [ttsState?.currentIndex]);

  const currentVerse = ttsState?.verses[ttsState.currentIndex];
  const prevVerse = ttsState && ttsState.currentIndex > 0
    ? ttsState.verses[ttsState.currentIndex - 1]
    : null;
  const nextVerse = ttsState && ttsState.currentIndex < (ttsState.verses.length ?? 0) - 1
    ? ttsState.verses[ttsState.currentIndex + 1]
    : null;

  const progress = ttsState
    ? (ttsState.currentIndex + 1) / ttsState.verses.length
    : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Loading overlay */}
      <Animated.View
        style={[styles.loadingOverlay, { backgroundColor: theme.background, opacity: loadingFade }]}
        pointerEvents={ready ? 'none' : 'auto'}
      >
        <GradientView style={styles.loadingIcon} borderRadius={20}>
          <MaterialIcons name="headphones" size={28} color="#fff" />
        </GradientView>
        <Text style={[styles.loadingTitle, { color: theme.text }]}>Preparing Audio</Text>
        <Text style={[styles.loadingSubtitle, { color: theme.textMuted }]}>
          {bookName} {chapter}
        </Text>
        <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
      </Animated.View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            playerRef.current?.destroy();
            router.back();
          }}
          style={styles.closeBtn}
        >
          <MaterialIcons name="close" size={22} color={theme.textMuted} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: theme.textMuted }]}>IMMERSIVE READING</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {bookName} {chapter}
          </Text>
        </View>
        <View style={{ width: 30 }} />
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: theme.glassBackground }]}>
        <View
          style={[styles.progressFill, { width: `${progress * 100}%` }]}
        />
      </View>

      {/* Verse display — animated */}
      <View style={styles.content}>
        <Animated.View style={[styles.contentInner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {prevVerse && (
            <View style={styles.contextVerse}>
              <Text style={[styles.contextNum, { color: theme.textMuted }]}>
                {prevVerse.num}
              </Text>
              <Text style={[styles.contextText, { color: theme.textMuted }]}>
                {prevVerse.text}
              </Text>
            </View>
          )}

          {currentVerse && (
            <View style={[styles.currentVerse, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.currentNum, { color: theme.accent }]}>
                {currentVerse.num}
              </Text>
              <Text style={[styles.currentText, { color: theme.text }]}>
                {currentVerse.text}
              </Text>
            </View>
          )}

          {nextVerse && (
            <View style={styles.contextVerse}>
              <Text style={[styles.contextNum, { color: theme.textMuted }]}>
                {nextVerse.num}
              </Text>
              <Text style={[styles.contextText, { color: theme.textMuted }]}>
                {nextVerse.text}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Verse counter */}
      <Text style={[styles.verseCounter, { color: theme.textMuted }]}>
        Verse {ttsState ? ttsState.currentIndex + 1 : 0} of {ttsState?.verses.length || 0}
      </Text>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => playerRef.current?.skipPrev()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="skip-previous" size={30} color={theme.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (ttsState?.isPlaying) {
              playerRef.current?.pause();
            } else {
              playerRef.current?.resume();
            }
          }}
          activeOpacity={0.85}
        >
          <GradientView style={styles.playBtn} borderRadius={32}>
            <View style={styles.playBtnInner}>
              <MaterialIcons
                name={ttsState?.isPlaying ? 'pause' : 'play-arrow'}
                size={34}
                color="#fff"
              />
            </View>
          </GradientView>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => playerRef.current?.skipNext()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="skip-next" size={30} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={{ height: 20 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingIcon: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  loadingTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  loadingSubtitle: {
    fontSize: FontSize.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  closeBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', letterSpacing: -0.5 },
  progressBar: {
    height: 3,
    marginHorizontal: Spacing.lg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    // Gradient-like: accent colored
    backgroundColor: '#db2777',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  contentInner: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  contextVerse: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    gap: 10,
    opacity: 0.35,
  },
  contextNum: {
    fontSize: FontSize.md,
    fontWeight: '800',
    width: 24,
    marginTop: 3,
  },
  contextText: {
    fontSize: FontSize.lg,
    lineHeight: 28,
    flex: 1,
  },
  currentVerse: {
    flexDirection: 'row',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 10,
    marginVertical: Spacing.sm,
  },
  currentNum: {
    fontSize: 26,
    fontWeight: '800',
    width: 34,
    marginTop: 3,
  },
  currentText: {
    fontSize: 22,
    lineHeight: 34,
    flex: 1,
  },
  verseCounter: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  controlBtn: {
    padding: Spacing.md,
  },
  playBtn: {
    width: 64,
    height: 64,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  playBtnInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
