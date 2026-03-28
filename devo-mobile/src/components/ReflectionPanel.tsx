import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import GradientView from './GradientView';
import { getJSON, setJSON } from '../services/storage';
import { getVerses } from '../data/bibleLoader';
import { BIBLE_META, BOOK_ORDER } from '../constants/bible-meta';

interface Props {
  visible: boolean;
  onClose: () => void;
  bookName: string;
  chapter: number;
  versesText: string;
  onVersePress?: (verseNum: number) => void;
}

interface ReflectionQuestion {
  text: string;       // The question text (with verse refs stripped)
  verseRefs: number[]; // verse numbers referenced
}

const GEMINI_PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app';

export default function ReflectionPanel({ visible, onClose, bookName, chapter, versesText, onVersePress }: Props) {
  const theme = useTheme();
  const [questions, setQuestions] = useState<ReflectionQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sparkle animation
  const sparkles = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  // Verse preview modal
  const [versePreview, setVersePreview] = useState<{ num: number; text: string } | null>(null);

  const showVersePreview = (verseNum: number) => {
    // Look up the book code from bookName
    let bookCode = '';
    for (const code of BOOK_ORDER) {
      if (BIBLE_META[code].name === bookName) { bookCode = code; break; }
    }
    if (!bookCode) return;
    const verses = getVerses('NASB', bookName, chapter);
    const text = verses[String(verseNum)] || 'Verse not found';
    setVersePreview({ num: verseNum, text });
  };

  const storageKey = `reflection-${bookName}-${chapter}`;

  useEffect(() => {
    if (visible && questions.length === 0) {
      loadSaved();
      fetchQuestions();
    }
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

  const loadSaved = async () => {
    const saved = await getJSON<Record<number, string>>(storageKey + '-answers');
    if (saved) setAnswers(saved);
  };

  const saveAnswer = (index: number, text: string) => {
    const updated = { ...answers, [index]: text };
    setAnswers(updated);
    setJSON(storageKey + '-answers', updated);
  };

  const fetchQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const prompt = `You generate REFLECTION QUESTIONS for Bible study.

RULES:
- Generate EXACTLY 3 numbered questions
- Each question should be personally directed (use "you", "your")
- Reference specific verses using the format [v.X] where X is the verse number
- At least one question should ask about practical steps
- Do NOT provide answers or preach
- Keep questions concise (1-2 sentences each)

FORMAT (follow exactly):
1. [question text with [v.X] references]
2. [question text with [v.X] references]
3. [question text with [v.X] references]

PASSAGE:
${bookName} ${chapter}

${versesText}`;

      const res = await fetch(GEMINI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'summary',
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse numbered questions
      const parsed = parseQuestions(rawText);
      setQuestions(parsed);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const parseQuestions = (text: string): ReflectionQuestion[] => {
    const result: ReflectionQuestion[] = [];
    // Match lines starting with 1., 2., 3. etc
    const lines = text.split('\n').filter((l) => l.trim());
    let current = '';

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.*)/);
      if (match) {
        if (current) {
          result.push(parseOneQuestion(current));
        }
        current = match[1];
      } else if (current) {
        current += ' ' + line.trim();
      }
    }
    if (current) result.push(parseOneQuestion(current));

    return result.slice(0, 5); // max 5
  };

  const parseOneQuestion = (text: string): ReflectionQuestion => {
    // Extract verse refs like [v.1], [v. 1], v. 1, (v. 1), v.1-2
    const refs: number[] = [];
    const refRegex = /\[?v\.?\s*(\d+)(?:-\d+)?\]?/gi;
    let match;
    while ((match = refRegex.exec(text)) !== null) {
      refs.push(parseInt(match[1], 10));
    }
    // Clean the text — remove the [v.X] markers, they'll be rendered as badges
    const cleanText = text.replace(/\[?v\.?\s*\d+(?:-\d+)?\]?/gi, '{{VERSE_REF}}');
    return { text: cleanText, verseRefs: refs };
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIcon, { backgroundColor: theme.accentLight }]}>
              <MaterialIcons name="lightbulb-outline" size={18} color={theme.accent} />
            </View>
            <View>
              <Text style={[styles.headerLabel, { color: theme.textMuted }]}>AI STUDY TOOL</Text>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Reflection Questions</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={22} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <View style={styles.sparkleRow}>
                {sparkles.map((anim, i) => (
                  <Animated.Text
                    key={i}
                    style={[
                      styles.sparkle,
                      {
                        opacity: anim,
                        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
                      },
                    ]}
                  >
                    ✦
                  </Animated.Text>
                ))}
              </View>
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>Generating questions...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
              <TouchableOpacity onPress={fetchQuestions} style={[styles.retryBtn, { backgroundColor: theme.primary }]}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            questions.map((q, idx) => {
              let refIdx = 0;
              const parts = q.text.split('{{VERSE_REF}}');

              return (
                <View key={idx} style={styles.questionBlock}>
                  {/* Question as single Text block with inline verse badges */}
                  <Text style={[styles.questionText, { color: theme.text }]}>
                    <Text style={[styles.questionNum, { color: theme.accent }]}>{idx + 1}. </Text>
                    {parts.map((part, pi) => {
                      const vNum = q.verseRefs[refIdx];
                      if (pi < parts.length - 1 && vNum != null) {
                        refIdx++;
                        return (
                          <React.Fragment key={pi}>
                            <Text style={{ fontWeight: '700' }}>{part}</Text>
                            <Text
                              style={styles.verseBadgeText}
                              onPress={() => showVersePreview(vNum)}
                            >
                              {' v. '}{vNum}{' '}
                            </Text>
                          </React.Fragment>
                        );
                      }
                      return <Text key={pi} style={{ fontWeight: '700' }}>{part}</Text>;
                    })}
                  </Text>

                  {/* Journal textarea */}
                  <TextInput
                    style={[styles.journalInput, {
                      color: theme.text,
                      borderColor: theme.glassBorder,
                      backgroundColor: theme.glassBackground,
                    }]}
                    placeholder="Write your thoughts..."
                    placeholderTextColor={theme.textMuted}
                    value={answers[idx] || ''}
                    onChangeText={(text) => saveAnswer(idx, text)}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              );
            })
          )}
        </ScrollView>
        {/* Verse Preview Modal */}
        {versePreview && (
          <Modal visible={!!versePreview} transparent animationType="fade" onRequestClose={() => setVersePreview(null)}>
            <TouchableOpacity
              style={styles.verseModalBackdrop}
              activeOpacity={1}
              onPress={() => setVersePreview(null)}
            >
              <View style={styles.verseModalCard}>
                <GradientView borderRadius={16} style={styles.verseModalGradient}>
                  <View style={styles.verseModalInner}>
                    <View style={styles.verseModalHeader}>
                      <Text style={styles.verseModalRef}>
                        {bookName} {chapter}:{versePreview.num}
                      </Text>
                      <TouchableOpacity onPress={() => setVersePreview(null)}>
                        <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.6)" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.verseModalText}>{versePreview.text}</Text>
                  </View>
                </GradientView>
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

// Verse badge component — inline tappable pill
function VerseBadge({ verseNum, onPress }: { verseNum: number; onPress?: (v: number) => void }) {
  return (
    <Text
      onPress={() => onPress?.(verseNum)}
      style={styles.verseBadgeText}
    >
      {' v. '}{verseNum}{' '}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: { padding: 4 },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  sparkleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sparkle: {
    fontSize: 22,
    color: '#fbbf24',
  },
  loadingText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  // Error
  errorContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: Spacing.md,
  },
  errorText: { fontSize: FontSize.md, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  retryText: { color: '#fff', fontWeight: '600' },

  // Question block
  questionBlock: {
    marginBottom: Spacing.xl + 8,
  },
  questionNum: {
    fontSize: 20,
    fontWeight: '800',
  },
  questionText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: Spacing.md,
  },

  // Question content wraps text + badges in a flow layout
  questionContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  // Verse badge — gradient pill
  verseBadgeWrap: {
    marginHorizontal: 3,
    marginVertical: 2,
  },
  verseBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verseBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#db2777',
    borderRadius: 5,
    overflow: 'hidden',
    paddingHorizontal: 3,
    paddingVertical: 2,
    letterSpacing: 0.3,
  },

  // Journal input
  journalInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 100,
    fontSize: FontSize.md,
    lineHeight: 22,
  },

  // Verse preview modal
  verseModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  verseModalCard: {
    width: '100%',
    maxWidth: 360,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  verseModalGradient: {
    width: '100%',
  },
  verseModalInner: {
    padding: Spacing.lg,
  },
  verseModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  verseModalRef: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  verseModalText: {
    fontSize: 17,
    lineHeight: 26,
    color: '#fff',
    fontWeight: '500',
  },
});
