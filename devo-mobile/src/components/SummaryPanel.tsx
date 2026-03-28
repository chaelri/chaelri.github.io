import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
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

const GEMINI_PROXY = 'https://gemini-proxy-668755364170.asia-southeast1.run.app';

interface Props {
  visible: boolean;
  onClose: () => void;
  bookName: string;
  chapter: number;
  versesText: string;
}

interface QuickSummary {
  context: string;
  whatHappens: string;
  watchFor: string;
}

export default function SummaryPanel({ visible, onClose, bookName, chapter, versesText }: Props) {
  const theme = useTheme();
  const [quickSummary, setQuickSummary] = useState<QuickSummary | null>(null);
  const [fullSummary, setFullSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sparkle animation
  const sparkles = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && !quickSummary && !fullSummary) {
      fetchSummary();
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

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    fadeIn.setValue(0);

    try {
      // Fetch both: quick structured summary + full detailed summary
      const quickPrompt = `You are a Bible study assistant. Give a brief structured summary for ${bookName} Chapter ${chapter}.

FORMAT (follow exactly — 3 sections, each 1-2 sentences max):
CONTEXT: [Brief background — what's happening at this point in the book]
WHAT_HAPPENS: [What occurs in this chapter]
WATCH_FOR: [One key thing the reader should pay attention to]

Keep it concise and clear. No bullet points, no numbering.

PASSAGE:
${versesText}`;

      const fullPrompt = `You are a Bible study assistant. Give a detailed context summary for ${bookName} Chapter ${chapter}.

RULES:
- Do NOT start with greetings or intro sentences. Start directly with the content.
- Use these exact section headers with ## markdown: ## Background, ## Key Themes, ## Watch For
- Use bullet points with bold key terms using **double asterisks**
- Reference specific verse numbers
- Be thorough but readable
- Friendly English tone, casual yet respectful

Here are the verses:
${versesText}`;

      // Fire both requests in parallel
      const [quickRes, fullRes] = await Promise.all([
        fetch(GEMINI_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'summary', contents: [{ parts: [{ text: quickPrompt }] }] }),
        }),
        fetch(GEMINI_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'summary', contents: [{ parts: [{ text: fullPrompt }] }] }),
        }),
      ]);

      if (!quickRes.ok || !fullRes.ok) throw new Error('API error');

      const [quickData, fullData] = await Promise.all([quickRes.json(), fullRes.json()]);

      const quickText = quickData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const fullText = fullData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse quick summary
      const parsed = parseQuickSummary(quickText);
      setQuickSummary(parsed);
      setFullSummary(fullText);

      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const parseQuickSummary = (text: string): QuickSummary => {
    let context = '';
    let whatHappens = '';
    let watchFor = '';

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^CONTEXT:/i)) {
        context = trimmed.replace(/^CONTEXT:\s*/i, '');
      } else if (trimmed.match(/^WHAT.?HAPPENS:/i)) {
        whatHappens = trimmed.replace(/^WHAT.?HAPPENS:\s*/i, '');
      } else if (trimmed.match(/^WATCH.?FOR:/i)) {
        watchFor = trimmed.replace(/^WATCH.?FOR:\s*/i, '');
      }
    }

    // Fallback: if parsing failed, split by sentences
    if (!context && !whatHappens && !watchFor) {
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      context = sentences[0] || text;
      whatHappens = sentences[1] || '';
      watchFor = sentences[2] || '';
    }

    return { context, whatHappens, watchFor };
  };

  const handleClose = () => {
    setQuickSummary(null);
    setFullSummary('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIcon, { backgroundColor: theme.accentLight }]}>
              <MaterialIcons name="auto-awesome" size={18} color={theme.accent} />
            </View>
            <View>
              <Text style={[styles.headerLabel, { color: theme.textMuted }]}>AI STUDY TOOL</Text>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Context Summary</Text>
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
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>Generating summary...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
              <TouchableOpacity onPress={fetchSummary} style={[styles.retryBtn, { backgroundColor: theme.primary }]}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Animated.View style={{ opacity: fadeIn }}>
              {/* ─── Quick Glance Card (gradient) ─── */}
              {quickSummary && (
                <GradientView style={styles.quickCard} borderRadius={20}>
                  <View style={styles.quickCardInner}>
                    <Text style={styles.quickLabel}>BEFORE YOU READ</Text>
                    <Text style={styles.quickTitle}>
                      {bookName.toUpperCase()} {chapter}
                    </Text>

                    {quickSummary.context ? (
                      <View style={styles.quickSection}>
                        <Text style={styles.quickSectionTitle}>Context</Text>
                        <Text style={styles.quickSectionText}>{quickSummary.context}</Text>
                      </View>
                    ) : null}

                    {quickSummary.whatHappens ? (
                      <View style={styles.quickSection}>
                        <Text style={styles.quickSectionTitle}>What Happens</Text>
                        <Text style={styles.quickSectionText}>{quickSummary.whatHappens}</Text>
                      </View>
                    ) : null}

                    {quickSummary.watchFor ? (
                      <View style={styles.quickSection}>
                        <Text style={styles.quickSectionTitle}>Watch For</Text>
                        <Text style={styles.quickSectionText}>{quickSummary.watchFor}</Text>
                      </View>
                    ) : null}
                  </View>
                </GradientView>
              )}

              {/* ─── Full Detailed Summary ─── */}
              {fullSummary ? (
                <View style={styles.fullSection}>
                  <MarkdownLite text={fullSummary} theme={theme} />
                </View>
              ) : null}
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// Simple markdown renderer for the full summary
function MarkdownLite({ text, theme }: { text: string; theme: any }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#### ')) {
      elements.push(<Text key={i} style={[mdStyles.h3, { color: theme.text }]}>{trimmed.slice(5)}</Text>);
    } else if (trimmed.startsWith('### ')) {
      elements.push(<Text key={i} style={[mdStyles.h3, { color: theme.text }]}>{trimmed.slice(4)}</Text>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<Text key={i} style={[mdStyles.h2, { color: theme.text }]}>{trimmed.slice(3)}</Text>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<Text key={i} style={[mdStyles.h1, { color: theme.text }]}>{trimmed.slice(2)}</Text>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <View key={i} style={mdStyles.bullet}>
          <Text style={[mdStyles.bulletDot, { color: theme.accent }]}>•</Text>
          <Text style={[mdStyles.body, { color: theme.textSecondary }]}>{renderBold(trimmed.slice(2), theme)}</Text>
        </View>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <View key={i} style={mdStyles.bullet}>
            <Text style={[mdStyles.num, { color: theme.accent }]}>{match[1]}.</Text>
            <Text style={[mdStyles.body, { color: theme.textSecondary }]}>{renderBold(match[2], theme)}</Text>
          </View>
        );
      }
    } else if (trimmed === '') {
      elements.push(<View key={i} style={{ height: 8 }} />);
    } else {
      elements.push(<Text key={i} style={[mdStyles.body, { color: theme.textSecondary }]}>{renderBold(trimmed, theme)}</Text>);
    }
  });

  return <View>{elements}</View>;
}

function renderBold(text: string, theme: any): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '700', color: theme.text }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

const mdStyles = StyleSheet.create({
  h1: { fontSize: 28, fontFamily: 'EditorsNote-Italic', marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  h2: { fontSize: 24, fontFamily: 'EditorsNote-Italic', marginBottom: 8, marginTop: 20, textTransform: 'uppercase' },
  h3: { fontSize: 20, fontFamily: 'EditorsNote-Italic', marginBottom: 6, marginTop: 14, textTransform: 'uppercase' },
  body: { fontSize: FontSize.md, lineHeight: 24, marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 4, paddingRight: 16 },
  bulletDot: { width: 16, fontSize: FontSize.md, lineHeight: 24, fontWeight: '700' },
  num: { width: 22, fontSize: FontSize.md, lineHeight: 24, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  headerLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 1 },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', letterSpacing: -0.3 },
  closeBtn: { padding: 4 },
  scrollView: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },

  // Loading
  loadingContainer: { alignItems: 'center', paddingTop: 80, gap: 12 },
  sparkleRow: { flexDirection: 'row', gap: 6 },
  sparkle: { fontSize: 22, color: '#fbbf24' },
  loadingText: { fontSize: FontSize.sm, fontWeight: '600' },

  // Error
  errorContainer: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  errorText: { fontSize: FontSize.md, textAlign: 'center' },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  // Quick glance card
  quickCard: {
    marginBottom: Spacing.xl,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 25,
    elevation: 8,
  },
  quickCardInner: {
    padding: Spacing.lg + 4,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  quickTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -2,
    marginBottom: Spacing.lg,
    textTransform: 'uppercase',
  },
  quickSection: {
    marginBottom: Spacing.lg,
  },
  quickSectionTitle: {
    fontSize: 30,
    fontFamily: 'EditorsNote-Italic',
    color: '#fff',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  quickSectionText: {
    fontSize: FontSize.md,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.85)',
  },

  // Full summary section
  fullSection: {
    paddingTop: Spacing.sm,
  },
});
