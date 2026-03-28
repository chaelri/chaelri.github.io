import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore, FREE_LIMITS } from '../../src/store/useStore';
import { BIBLE_META, BOOK_ORDER } from '../../src/constants/bible-meta';
import { Spacing, FontSize, BorderRadius, LabelStyle } from '../../src/constants/theme';
import BookPicker from '../../src/components/BookPicker';
import VersionToggle from '../../src/components/VersionToggle';
import AIPanel from '../../src/components/AIPanel';
import InlineAI from '../../src/components/InlineAI';
import GradientView from '../../src/components/GradientView';
import { LinearGradient } from 'expo-linear-gradient';
// CommentInput no longer used — notes are inline now
import SearchModal from '../../src/components/SearchModal';
import ReflectionPanel from '../../src/components/ReflectionPanel';
import SummaryPanel from '../../src/components/SummaryPanel';
import LimitReachedModal from '../../src/components/LimitReachedModal';
import { getVerses } from '../../src/data/bibleLoader';
import {
  getContextSummary,
  getQuickContext,
  getReflectionQuestions,
  getDigDeeper,
  getCrossReferences,
} from '../../src/services/ai';

type VerseData = Record<string, string>;

export default function ReadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    currentBook, currentChapter, currentVersion,
    setBook, setChapter, setVersion,
    favorites, toggleFavorite, isFavorite,
    highlights, toggleHighlight, isHighlighted,
    notes, deleteNote,
    colorScheme, toggleTheme,
    isPremium, canUseFeature, incrementLimit, dailyLimits,
  } = useStore();

  const [verses, setVerses] = useState<VerseData>({});
  const [loading, setLoading] = useState(true);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [showContextSummary, setShowContextSummary] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [aiPanelConfig, setAiPanelConfig] = useState<{
    visible: boolean;
    title: string;
    icon: string;
    fetch: () => Promise<string>;
    actions?: { label: string; icon: string; onPress: () => void }[];
  }>({ visible: false, title: '', icon: '', fetch: async () => '' });

  // Limit reached modal
  const [limitModal, setLimitModal] = useState<{
    visible: boolean;
    feature: string;
    used: number;
    max: number;
  }>({ visible: false, feature: '', used: 0, max: 0 });

  // Inline AI state — shows below the verse instead of a modal
  const [inlineAI, setInlineAI] = useState<{
    verseNum: string;
    type: 'context' | 'digDeeper' | 'crossRefs';
  } | null>(null);

  // Inline note input — which verse has the note field open
  const [noteInputVerse, setNoteInputVerse] = useState<string | null>(null);
  const [noteInputText, setNoteInputText] = useState('');

  const bookMeta = BIBLE_META[currentBook];
  const totalChapters = bookMeta?.chapters?.length || 1;

  const loadPassage = useCallback(() => {
    setLoading(true);
    try {
      const chapterData = getVerses(currentVersion, bookMeta.name, currentChapter);
      setVerses(chapterData);
    } catch (err) {
      console.error('Failed to load passage:', err);
      setVerses({});
    } finally {
      setLoading(false);
    }
  }, [currentBook, currentChapter, currentVersion]);

  useEffect(() => {
    loadPassage();
  }, [loadPassage]);

  const haptic = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const verseEntries = Object.entries(verses)
    .filter(([key]) => !key.includes('-'))
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const getVersesText = () =>
    verseEntries.map(([num, text]) => `${num}. ${text}`).join('\n');

  const prevChapter = () => {
    if (currentChapter > 1) {
      setChapter(currentChapter - 1);
    } else {
      const idx = BOOK_ORDER.indexOf(currentBook);
      if (idx > 0) {
        const prevBook = BOOK_ORDER[idx - 1];
        setBook(prevBook);
        setChapter(BIBLE_META[prevBook].chapters.length);
      }
    }
  };

  const nextChapter = () => {
    if (currentChapter < totalChapters) {
      setChapter(currentChapter + 1);
    } else {
      const idx = BOOK_ORDER.indexOf(currentBook);
      if (idx < BOOK_ORDER.length - 1) {
        setBook(BOOK_ORDER[idx + 1]);
        setChapter(1);
      }
    }
  };

  const FEATURE_NAMES: Record<string, string> = {
    crossRef: 'Cross-References',
    verseChat: 'Verse Chats',
    digDeeper: 'Dig Deeper',
    immersiveTts: 'Immersive TTS',
  };

  const checkLimit = (feature: 'crossRef' | 'verseChat' | 'digDeeper' | 'immersiveTts'): boolean => {
    if (canUseFeature(feature)) return true;
    const used = dailyLimits[feature] as number;
    const max = FREE_LIMITS[feature];
    setLimitModal({
      visible: true,
      feature: FEATURE_NAMES[feature] || feature,
      used,
      max,
    });
    return false;
  };

  // Per-verse inline actions — shows below the verse, not a modal
  const toggleInlineContext = (verseNum: string) => {
    if (inlineAI?.verseNum === verseNum && inlineAI.type === 'context') {
      setInlineAI(null); // close if same verse
    } else {
      setInlineAI({ verseNum, type: 'context' });
    }
  };

  const openInlineDigDeeper = (verseNum: string) => {
    if (!checkLimit('digDeeper')) return;
    incrementLimit('digDeeper');
    setInlineAI({ verseNum, type: 'digDeeper' });
  };

  const openInlineCrossRefs = (verseNum: string) => {
    if (!checkLimit('crossRef')) return;
    incrementLimit('crossRef');
    setInlineAI({ verseNum, type: 'crossRefs' });
  };

  const openVerseChat = (verseNum: string, text: string) => {
    if (!checkLimit('verseChat')) return;
    incrementLimit('verseChat');
    router.push({
      pathname: '/verse-chat',
      params: {
        bookName: bookMeta.name,
        chapter: String(currentChapter),
        verseNum,
        verseText: text,
      },
    });
  };

  const toggleNoteInput = (verseNum: string) => {
    if (noteInputVerse === verseNum) {
      setNoteInputVerse(null);
      setNoteInputText('');
    } else {
      setNoteInputVerse(verseNum);
      setNoteInputText('');
    }
  };

  const { addNote } = useStore();

  const saveInlineNote = (verseNum: string) => {
    if (!noteInputText.trim()) return;
    const key = `${currentBook}-${currentChapter}-${verseNum}`;
    addNote({
      title: `${bookMeta.name} ${currentChapter}:${verseNum}`,
      body: noteInputText.trim(),
      verseKey: key,
      bookName: bookMeta.name,
      chapter: currentChapter,
      verseNum: Number(verseNum),
    });
    setNoteInputText('');
    setNoteInputVerse(null);
  };

  return (
    <View style={styles.container}>
    {colorScheme === 'dark' ? (
      <LinearGradient
        colors={['#121b33', '#0b1220']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    ) : (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#faf9f6' }]} />
        <ImageBackground
          source={{ uri: 'https://www.transparenttextures.com/patterns/paper-fibers.png' }}
          style={StyleSheet.absoluteFill}
          resizeMode="repeat"
        />
      </>
    )}
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.bookButton, { backgroundColor: theme.surface, borderColor: theme.glassBorder, borderWidth: 1 }]}
          onPress={() => setShowBookPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.bookButtonText, { color: theme.text }]}>
            {bookMeta.name} {currentChapter}
          </Text>
          <MaterialIcons name="expand-more" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.iconBtn}>
            <MaterialIcons name="search" size={22} color={theme.textMuted} />
          </TouchableOpacity>
          <VersionToggle />
          <TouchableOpacity onPress={toggleTheme} style={styles.iconBtn}>
            <MaterialIcons
              name={colorScheme === 'dark' ? 'light-mode' : 'dark-mode'}
              size={20}
              color={theme.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Chapter title with inline nav */}
          <View style={styles.titleRow}>
            <TouchableOpacity onPress={prevChapter} style={styles.titleNav} activeOpacity={0.6}>
              <MaterialIcons name="chevron-left" size={28} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowChapterPicker(true)} activeOpacity={0.7} style={styles.titleCenter}>
              <Text style={[styles.passageTitle, { color: theme.text }]}>
                {bookMeta.name.toUpperCase()} {currentChapter}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={nextChapter} style={styles.titleNav} activeOpacity={0.6}>
              <MaterialIcons name="chevron-right" size={28} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Chapter-level AI toolbar — subtle glass, full width */}
          <View style={styles.chapterTools}>
            <TouchableOpacity
              style={[styles.chapterChip, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}
              onPress={() => setShowContextSummary(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="auto-awesome" size={14} color={theme.accent} />
              <Text style={[styles.chapterChipText, { color: theme.textSecondary }]}>Summary</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chapterChip, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}
              onPress={() => setShowReflection(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="lightbulb-outline" size={14} color={theme.accent} />
              <Text style={[styles.chapterChipText, { color: theme.textSecondary }]}>Reflect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chapterChip, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}
              onPress={() => {
                if (!checkLimit('immersiveTts')) return;
                incrementLimit('immersiveTts');
                router.push({
                  pathname: '/immersive-tts',
                  params: {
                    bookCode: currentBook,
                    chapter: String(currentChapter),
                    version: currentVersion,
                  },
                });
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="headphones" size={14} color={theme.accent} />
              <Text style={[styles.chapterChipText, { color: theme.textSecondary }]}>Listen</Text>
            </TouchableOpacity>
          </View>

          {/* Verse list */}
          {verseEntries.map(([verseNum, text]) => {
            const key = `${currentBook}-${currentChapter}-${verseNum}`;
            const fav = isFavorite(key);
            const hl = isHighlighted(key);
            const verseNotes = notes.filter((n) => n.verseKey === key);

            return (
              <View key={verseNum} style={styles.verseBlock}>
                {/* Verse content row */}
                <TouchableOpacity
                  style={[
                    styles.verseRow,
                    fav && { backgroundColor: theme.accentLight, borderRadius: BorderRadius.sm, paddingHorizontal: 8 },
                    hl && !fav && { backgroundColor: theme.primaryLight, borderRadius: BorderRadius.sm, paddingHorizontal: 8 },
                  ]}
                  onLongPress={() => {
                    haptic();
                    toggleFavorite(key);
                  }}
                  delayLongPress={300}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.verseText, { color: theme.text }]}>
                    <Text style={[styles.verseNum, { color: theme.accent }]}>{verseNum}  </Text>
                    {text}
                  </Text>
                  {fav && (
                    <TouchableOpacity
                      onPress={() => { haptic(); toggleFavorite(key); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="favorite" size={16} color={theme.favorite} style={{ marginTop: 2 }} />
                    </TouchableOpacity>
                  )}
                  {!fav && (
                    <TouchableOpacity
                      onPress={() => { haptic(); toggleFavorite(key); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="favorite-border" size={16} color={theme.textMuted} style={{ marginTop: 2, opacity: 0.4 }} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* Per-verse action chips — Context, Ask, Note */}
                <View style={styles.verseActions}>
                  <TouchableOpacity
                    style={[styles.verseChip, { borderColor: theme.glassBorder }]}
                    onPress={() => toggleInlineContext(verseNum)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="auto-awesome" size={12} color={theme.textMuted} />
                    <Text style={[styles.verseChipText, { color: theme.textSecondary }]}>Context</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.verseChip, { borderColor: theme.glassBorder }]}
                    onPress={() => openVerseChat(verseNum, text)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="chat-bubble-outline" size={12} color={theme.textMuted} />
                    <Text style={[styles.verseChipText, { color: theme.textSecondary }]}>Ask</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.verseChip, { borderColor: theme.glassBorder }]}
                    onPress={() => toggleNoteInput(verseNum)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="edit-note" size={13} color={theme.textMuted} />
                    <Text style={[styles.verseChipText, { color: theme.textSecondary }]}>Note</Text>
                  </TouchableOpacity>
                </View>

                {/* Saved notes — pill chips */}
                {verseNotes.length > 0 && (
                  <View style={styles.notesSection}>
                    {verseNotes.map((note) => (
                      <View key={note.id} style={[styles.notePill, { borderColor: theme.glassBorder, backgroundColor: theme.glassBackground }]}>
                        <Text style={[styles.notePillText, { color: theme.textSecondary }]} numberOfLines={1}>{note.body}</Text>
                        <TouchableOpacity
                          onPress={() => deleteNote(note.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="close" size={11} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Inline note input — appears when "Note" is tapped, hides after save */}
                {noteInputVerse === verseNum && (
                  <View style={[styles.noteInputRow, { borderColor: theme.glassBorder }]}>
                    <TextInput
                      style={[styles.noteInput, { color: theme.text }]}
                      placeholder="Add a note..."
                      placeholderTextColor={theme.textMuted}
                      value={noteInputText}
                      onChangeText={setNoteInputText}
                      autoFocus
                      onSubmitEditing={() => saveInlineNote(verseNum)}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      onPress={() => saveInlineNote(verseNum)}
                      disabled={!noteInputText.trim()}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="send" size={18} color={noteInputText.trim() ? theme.accent : theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Inline AI result — shows below this verse */}
                {inlineAI?.verseNum === verseNum && (
                  <InlineAI
                    key={`${verseNum}-${inlineAI.type}`}
                    label={inlineAI.type === 'digDeeper' ? 'Dig Deeper' : inlineAI.type === 'crossRefs' ? 'Cross-References' : 'Quick Context'}
                    fetchContent={() => {
                      if (inlineAI.type === 'digDeeper') {
                        return getDigDeeper(bookMeta.name, currentChapter, Number(verseNum), text);
                      }
                      if (inlineAI.type === 'crossRefs') {
                        return getCrossReferences(bookMeta.name, currentChapter, Number(verseNum), text);
                      }
                      return getQuickContext(bookMeta.name, currentChapter, Number(verseNum), text);
                    }}
                    onClose={() => setInlineAI(null)}
                    onDigDeeper={inlineAI.type === 'context' ? () => openInlineDigDeeper(verseNum) : undefined}
                    onCrossRefs={inlineAI.type === 'context' ? () => openInlineCrossRefs(verseNum) : undefined}
                  />
                )}
              </View>
            );
          })}

          {/* Chapter navigation */}
          <View style={styles.chapterNav}>
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}
              onPress={prevChapter}
              activeOpacity={0.7}
            >
              <MaterialIcons name="chevron-left" size={20} color={theme.textMuted} />
              <Text style={[styles.navBtnText, { color: theme.textSecondary }]}>Prev</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnCenter, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}
              onPress={() => setShowChapterPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.navLabel, { color: theme.textMuted }]}>CHAPTER</Text>
              <Text style={[styles.navBtnText, { color: theme.accent }]}>
                {currentChapter} / {totalChapters}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}
              onPress={nextChapter}
              activeOpacity={0.7}
            >
              <Text style={[styles.navBtnText, { color: theme.textSecondary }]}>Next</Text>
              <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Modals */}
      {showBookPicker && (
        <BookPicker
          onSelect={(bookCode) => {
            setBook(bookCode);
            setShowBookPicker(false);
            setShowChapterPicker(true);
          }}
          onClose={() => setShowBookPicker(false)}
        />
      )}

      {showChapterPicker && (
        <ChapterPicker
          totalChapters={totalChapters}
          currentChapter={currentChapter}
          onSelect={(ch) => {
            setChapter(ch);
            setShowChapterPicker(false);
          }}
          onClose={() => setShowChapterPicker(false)}
        />
      )}

      <SearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={(bookCode, chapter) => {
          setBook(bookCode);
          setChapter(chapter);
        }}
        version={currentVersion}
      />

      <SummaryPanel
        visible={showContextSummary}
        onClose={() => setShowContextSummary(false)}
        bookName={bookMeta.name}
        chapter={currentChapter}
        versesText={getVersesText()}
      />

      <ReflectionPanel
        visible={showReflection}
        onClose={() => setShowReflection(false)}
        bookName={bookMeta.name}
        chapter={currentChapter}
        versesText={getVersesText()}
      />

      <AIPanel
        visible={aiPanelConfig.visible}
        onClose={() => setAiPanelConfig((p) => ({ ...p, visible: false }))}
        title={aiPanelConfig.title}
        icon={aiPanelConfig.icon}
        fetchContent={aiPanelConfig.fetch}
        actions={aiPanelConfig.actions}
      />

      <LimitReachedModal
        visible={limitModal.visible}
        onClose={() => setLimitModal((p) => ({ ...p, visible: false }))}
        onUpgrade={() => router.push('/paywall')}
        feature={limitModal.feature}
        used={limitModal.used}
        max={limitModal.max}
      />
    </SafeAreaView>
    </View>
  );
}

function ChapterPicker({
  totalChapters, currentChapter, onSelect, onClose,
}: {
  totalChapters: number;
  currentChapter: number;
  onSelect: (ch: number) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const chapters = Array.from({ length: totalChapters }, (_, i) => i + 1);

  return (
    <View style={[styles.pickerOverlay]}>
      <TouchableOpacity style={styles.pickerBackdrop} onPress={onClose} activeOpacity={1} />
      <View style={[styles.pickerSheet, { backgroundColor: '#1a2240' }]}>
        <Text style={[styles.pickerLabel, { color: theme.textMuted }]}>SELECT CHAPTER</Text>
        <ScrollView contentContainerStyle={styles.chapterGrid} showsVerticalScrollIndicator={false}>
          {chapters.map((ch) => {
            const active = ch === currentChapter;
            return (
              <TouchableOpacity
                key={ch}
                style={[
                  styles.chapterCell,
                  { backgroundColor: theme.glassBackground, borderColor: theme.glassBorder, borderWidth: 1 },
                  active && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={() => onSelect(ch)}
              >
                <Text
                  style={[
                    styles.chapterCellText,
                    { color: theme.text },
                    active && { color: '#fff', fontWeight: '700' },
                  ]}
                >
                  {ch}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  bookButtonText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },

  // Chapter title row with nav arrows
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  titleNav: {
    padding: 4,
  },
  titleCenter: {
    flex: 1,
    alignItems: 'center',
  },
  passageTitle: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -2.5,
    textTransform: 'uppercase',
  },

  // Chapter-level tools — full width, flex:1 each
  chapterTools: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  chapterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
  },
  chapterChipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Verse block
  verseBlock: {
    marginBottom: 22,
  },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  verseNum: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  verseText: {
    fontSize: 16,
    lineHeight: 26,
    flex: 1,
  },
  // Saved inline notes — pills
  notesSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  notePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    gap: 6,
    maxWidth: '80%',
  },
  notePillText: {
    fontSize: 12,
    flexShrink: 1,
    flex: 1,
    fontStyle: 'italic',
  },

  // Note input — minimal inline field
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  noteInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
    outlineStyle: 'none',
  } as any,

  // Per-verse action chips — matches PWA: Context, Ask, Note
  verseActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  verseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    gap: 4,
  },
  verseChipText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Chapter nav
  chapterNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 2,
  },
  navBtnCenter: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    paddingHorizontal: Spacing.lg,
  },
  navLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  navBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Picker
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  pickerLabel: {
    fontSize: LabelStyle.fontSize,
    fontWeight: LabelStyle.fontWeight,
    textTransform: LabelStyle.textTransform,
    letterSpacing: LabelStyle.letterSpacing,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingBottom: Spacing.xl,
  },
  chapterCell: {
    width: 50,
    height: 42,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chapterCellText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
