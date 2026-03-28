import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSize, BorderRadius, LabelStyle } from '../constants/theme';
import GradientView from './GradientView';

interface ActionButton {
  label: string;
  icon: string;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  fetchContent: () => Promise<string>;
  actions?: ActionButton[];
  onVersePress?: (verseNum: number) => void;
}

export default function AIPanel({ visible, onClose, title, icon, fetchContent, actions }: Props) {
  const theme = useTheme();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && !content) {
      load();
    }
  }, [visible]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchContent();
      setContent(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setContent('');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIcon, { backgroundColor: theme.accentLight }]}>
              <MaterialIcons name={icon as any} size={18} color={theme.accent} />
            </View>
            <View>
              <Text style={[styles.headerLabel, { color: theme.textMuted }]}>AI STUDY TOOL</Text>
              <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={22} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingCard}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.loadingText}>Generating...</Text>
              </View>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={28} color="#ef4444" />
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <MarkdownLite text={content} theme={theme} />
              {actions && actions.length > 0 && (
                <View style={styles.actionRow}>
                  {actions.map((a) => (
                    <TouchableOpacity
                      key={a.label}
                      onPress={() => {
                        handleClose();
                        a.onPress();
                      }}
                      activeOpacity={0.8}
                    >
                      <GradientView style={styles.actionBtn} borderRadius={12}>
                        <View style={styles.actionBtnInner}>
                          <MaterialIcons name={a.icon as any} size={16} color="#fff" />
                          <Text style={styles.actionBtnText}>{a.label}</Text>
                        </View>
                      </GradientView>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function MarkdownLite({ text, theme }: { text: string; theme: any }) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  if (!text) return null;

  const toggleRef = (ref: string) => {
    setExpanded((prev) => ({ ...prev, [ref]: !prev[ref] }));
  };

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      elements.push(
        <Text key={i} style={[styles.mdH3, { color: theme.text }]}>
          {trimmed.slice(4)}
        </Text>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <Text key={i} style={[styles.mdH2, { color: theme.text }]}>
          {trimmed.slice(3)}
        </Text>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <Text key={i} style={[styles.mdH1, { color: theme.text }]}>
          {trimmed.slice(2)}
        </Text>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <View key={i}>
          <View style={styles.mdBullet}>
            <Text style={[styles.mdBulletDot, { color: theme.accent }]}>•</Text>
            <Text style={[styles.mdBody, { color: theme.textSecondary }]}>
              {renderInlineWithRefs(trimmed.slice(2), theme, expanded, toggleRef)}
            </Text>
          </View>
          {renderExpandedVerses(trimmed.slice(2), theme, expanded)}
        </View>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <View key={i}>
            <View style={styles.mdBullet}>
              <Text style={[styles.mdNum, { color: theme.accent }]}>{match[1]}.</Text>
              <Text style={[styles.mdBody, { color: theme.textSecondary }]}>
                {renderInlineWithRefs(match[2], theme, expanded, toggleRef)}
              </Text>
            </View>
            {renderExpandedVerses(match[2], theme, expanded)}
          </View>
        );
      }
    } else if (trimmed === '') {
      elements.push(<View key={i} style={{ height: 8 }} />);
    } else {
      elements.push(
        <View key={i}>
          <Text style={[styles.mdBody, { color: theme.textSecondary }]}>
            {renderInlineWithRefs(trimmed, theme, expanded, toggleRef)}
          </Text>
          {renderExpandedVerses(trimmed, theme, expanded)}
        </View>
      );
    }
  });

  return <View>{elements}</View>;
}

// Regex to detect verse references like (John 1:14), Romans 8:28, Genesis 1:1-3, John 3:16
const VERSE_REF_REGEX = /\(?\b(\d?\s?[A-Z][a-z]+(?:\s[a-z]+)?)\s+(\d+):(\d+(?:-\d+)?)\)?/g;

function lookupVerseText(bookName: string, chapter: number, verseRange: string): string | null {
  try {
    const { getVerses } = require('../data/bibleLoader');
    const { BIBLE_META, BOOK_ORDER } = require('../constants/bible-meta');
    // Find the book code from name
    const normalizedName = bookName.trim().replace(/^\d\s/, (m: string) => m.trim());
    let foundCode: string | null = null;
    for (const code of BOOK_ORDER) {
      if (BIBLE_META[code].name.toLowerCase() === bookName.toLowerCase().trim()) {
        foundCode = code;
        break;
      }
    }
    if (!foundCode) return null;

    // Try both versions
    const verses = getVerses('NASB', BIBLE_META[foundCode].name, chapter);
    if (!verses) return null;

    // Handle ranges like "1-3"
    if (verseRange.includes('-')) {
      const [start, end] = verseRange.split('-').map(Number);
      const texts: string[] = [];
      for (let v = start; v <= end; v++) {
        if (verses[String(v)]) texts.push(`${v} ${verses[String(v)]}`);
      }
      return texts.join(' ') || null;
    }

    return verses[verseRange] || null;
  } catch {
    return null;
  }
}

function renderExpandedVerses(
  text: string,
  theme: any,
  expanded: Record<string, boolean>
): React.ReactNode {
  const refs: React.ReactNode[] = [];
  const regex = new RegExp(VERSE_REF_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    const bookName = match[1];
    const chapter = parseInt(match[2], 10);
    const verseRange = match[3];
    const refKey = `${bookName} ${chapter}:${verseRange}`;

    if (expanded[refKey]) {
      const verseText = lookupVerseText(bookName, chapter, verseRange);
      if (verseText) {
        refs.push(
          <View
            key={refKey}
            style={[styles.versePreview, { backgroundColor: theme.primaryLight, borderColor: theme.glassBorder }]}
          >
            <Text style={[styles.versePreviewRef, { color: theme.accent }]}>
              {refKey}
            </Text>
            <Text style={[styles.versePreviewText, { color: theme.text }]}>
              {verseText}
            </Text>
          </View>
        );
      }
    }
  }
  return refs.length > 0 ? <View>{refs}</View> : null;
}

function renderInlineWithRefs(
  text: string,
  theme: any,
  expanded: Record<string, boolean>,
  toggleRef: (ref: string) => void
): React.ReactNode {
  // Split text by verse references and bold markers
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(VERSE_REF_REGEX.source, 'g');
  let match;

  // First pass: collect all verse ref positions
  const refPositions: { start: number; end: number; refKey: string; fullMatch: string }[] = [];
  while ((match = regex.exec(text)) !== null) {
    refPositions.push({
      start: match.index,
      end: match.index + match[0].length,
      refKey: `${match[1]} ${match[2]}:${match[3]}`,
      fullMatch: match[0],
    });
  }

  if (refPositions.length === 0) {
    // No refs, just render with bold
    return renderBold(text, theme);
  }

  for (const ref of refPositions) {
    // Text before the ref
    if (ref.start > lastIndex) {
      const before = text.slice(lastIndex, ref.start);
      parts.push(<Text key={`t${lastIndex}`}>{renderBold(before, theme)}</Text>);
    }
    // The ref itself — make it tappable
    const isExpanded = expanded[ref.refKey];
    parts.push(
      <Text
        key={`r${ref.start}`}
        style={[
          styles.verseRef,
          { color: theme.primary },
          isExpanded && { color: theme.accent },
        ]}
        onPress={() => toggleRef(ref.refKey)}
      >
        {ref.fullMatch}
      </Text>
    );
    lastIndex = ref.end;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<Text key={`t${lastIndex}`}>{renderBold(text.slice(lastIndex), theme)}</Text>);
  }

  return <>{parts}</>;
}

function renderBold(text: string, theme: any): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={i} style={{ fontWeight: '700', color: theme.text }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
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
    gap: Spacing.sm + 2,
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
  closeBtn: {
    padding: 4,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Loading — accent colored card like PWA
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#db2777',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 6,
  },
  loadingText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },

  errorContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: '#486bec',
    marginTop: Spacing.sm,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: FontSize.sm,
  },

  // Action buttons (e.g. Dig Deeper inside Quick Context)
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.lg,
  },
  actionBtn: {
    height: 42,
    minWidth: 120,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  actionBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Markdown
  mdH1: { fontSize: FontSize.xl, fontWeight: '800', marginBottom: 8, marginTop: 12, letterSpacing: -1 },
  mdH2: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: 6, marginTop: 10, letterSpacing: -0.5 },
  mdH3: { fontSize: FontSize.md, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  mdBody: { fontSize: FontSize.md, lineHeight: 24, marginBottom: 4 },
  mdBullet: { flexDirection: 'row', marginBottom: 4, paddingRight: 16 },
  mdBulletDot: { width: 16, fontSize: FontSize.md, lineHeight: 24, fontWeight: '700' },
  mdNum: { width: 22, fontSize: FontSize.md, lineHeight: 24, fontWeight: '700' },

  // Verse references
  verseRef: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  versePreview: {
    marginTop: 6,
    marginBottom: 6,
    marginLeft: 16,
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  versePreviewRef: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginBottom: 2,
  },
  versePreviewText: {
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
