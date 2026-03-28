import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
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
  const playerRef = useRef<ReturnType<typeof createChapterPlayer> | null>(null);

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
    });

    playerRef.current = player;
    player.play();

    return () => {
      player?.destroy();
    };
  }, [bookCode, chapter, version]);

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

      {/* Verse display */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
      >
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
      </ScrollView>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  closeBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: {
    fontSize: 9,
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
  },
  contentInner: {
    justifyContent: 'center',
    flexGrow: 1,
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
    fontSize: 22,
    fontWeight: '800',
    width: 30,
    marginTop: 3,
  },
  currentText: {
    fontSize: 20,
    lineHeight: 32,
    flex: 1,
  },
  verseCounter: {
    textAlign: 'center',
    fontSize: 10,
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
