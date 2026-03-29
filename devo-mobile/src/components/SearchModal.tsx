import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { BIBLE_META, BOOK_ORDER } from '../constants/bible-meta';
import { getVerses } from '../data/bibleLoader';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

interface SearchResult {
  bookCode: string;
  bookName: string;
  chapter: number;
  verse: string;
  text: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (bookCode: string, chapter: number) => void;
  version: 'NASB' | 'EASY';
}

export default function SearchModal({ visible, onClose, onSelect, version }: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Try to parse a verse reference like "John 3:16", "Gen 1", "Psalms 119:1"
  const parseVerseRef = (q: string): { bookCode: string; chapter: number; verse?: number } | null => {
    const match = q.match(/^(\d?\s?[a-zA-Z]+(?:\s[a-zA-Z]+)?)\s+(\d+)(?::(\d+))?$/);
    if (!match) return null;
    const bookQuery = match[1].toLowerCase().trim();
    const chapter = parseInt(match[2], 10);
    const verse = match[3] ? parseInt(match[3], 10) : undefined;

    // Find matching book
    for (const code of BOOK_ORDER) {
      const name = BIBLE_META[code].name.toLowerCase();
      if (name === bookQuery || name.startsWith(bookQuery)) {
        if (chapter >= 1 && chapter <= BIBLE_META[code].chapters.length) {
          return { bookCode: code, chapter, verse };
        }
      }
    }
    return null;
  };

  const search = useCallback((q: string) => {
    setQuery(q);
    if (q.length < 3) {
      setResults([]);
      return;
    }

    // First try verse reference parsing (e.g., "John 3:16")
    const ref = parseVerseRef(q);
    if (ref) {
      const meta = BIBLE_META[ref.bookCode];
      try {
        const verses = getVerses(version, meta.name, ref.chapter);
        const found: SearchResult[] = [];
        if (ref.verse) {
          // Specific verse
          const text = verses[String(ref.verse)];
          if (text) {
            found.push({ bookCode: ref.bookCode, bookName: meta.name, chapter: ref.chapter, verse: String(ref.verse), text });
          }
        } else {
          // Whole chapter — show all verses
          for (const [verseNum, text] of Object.entries(verses)) {
            if (verseNum.includes('-')) continue;
            found.push({ bookCode: ref.bookCode, bookName: meta.name, chapter: ref.chapter, verse: verseNum, text });
          }
        }
        setResults(found);
        setSearching(false);
        return;
      } catch {}
    }

    setSearching(true);
    const lower = q.toLowerCase();
    const found: SearchResult[] = [];

    // 1. PRIORITY: Book name matches — show as a single entry per book
    for (const bookCode of BOOK_ORDER) {
      const meta = BIBLE_META[bookCode];
      if (meta.name.toLowerCase().startsWith(lower) || meta.name.toLowerCase().includes(lower)) {
        // Show first verse of chapter 1 as preview
        try {
          const verses = getVerses(version, meta.name, 1);
          const firstVerse = Object.entries(verses).find(([k]) => !k.includes('-'));
          found.push({
            bookCode,
            bookName: meta.name,
            chapter: 1,
            verse: firstVerse ? firstVerse[0] : '1',
            text: `${meta.name} — ${meta.chapters.length} chapters`,
          });
        } catch {
          found.push({
            bookCode,
            bookName: meta.name,
            chapter: 1,
            verse: '1',
            text: `${meta.name} — ${meta.chapters.length} chapters`,
          });
        }
      }
    }

    // 2. Text search — verse content matches (skip books already matched)
    const matchedBooks = new Set(found.map((r) => r.bookCode));
    for (const bookCode of BOOK_ORDER) {
      if (found.length >= 50) break;
      const meta = BIBLE_META[bookCode];
      for (let ch = 1; ch <= meta.chapters.length; ch++) {
        if (found.length >= 50) break;
        try {
          const verses = getVerses(version, meta.name, ch);
          for (const [verseNum, text] of Object.entries(verses)) {
            if (verseNum.includes('-')) continue;
            if (text.toLowerCase().includes(lower)) {
              found.push({
                bookCode,
                bookName: meta.name,
                chapter: ch,
                verse: verseNum,
                text,
              });
              if (found.length >= 50) break;
            }
          }
        } catch {}
      }
    }

    setResults(found);
    setSearching(false);
  }, [version]);

  const highlightText = (text: string, q: string) => {
    if (!q || q.length < 3) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <Text>
        {before}
        <Text style={{ fontWeight: '700', color: theme.accent }}>{match}</Text>
        {after}
      </Text>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.surface }]}>
          <View style={[styles.searchBox, { backgroundColor: theme.background }]}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search the Bible..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={search}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => search('')}>
                <MaterialIcons name="close" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: theme.accent }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        {query.length < 3 ? (
          <View style={styles.empty}>
            <MaterialIcons name="search" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              Type at least 3 characters to search
            </Text>
          </View>
        ) : results.length === 0 && !searching ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              No results found for "{query}"
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.bookCode}-${item.chapter}-${item.verse}-${i}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.resultRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  onSelect(item.bookCode, item.chapter);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.resultRef, { color: theme.accent }]}>
                  {item.bookName} {item.chapter}:{item.verse}
                </Text>
                <Text
                  style={[styles.resultText, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {highlightText(item.text, query)}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <Text style={[styles.resultCount, { color: theme.textMuted }]}>
                {results.length} result{results.length !== 1 ? 's' : ''}{results.length >= 50 ? ' (showing first 50)' : ''}
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    paddingVertical: 2,
    outlineStyle: 'none',
  } as any,
  cancelBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  cancelText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  emptyText: {
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  resultCount: {
    fontSize: FontSize.sm,
    paddingVertical: Spacing.sm,
  },
  resultRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  resultRef: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultText: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
});
