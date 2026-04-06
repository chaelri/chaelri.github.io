import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useStore } from '../store/useStore';
import { BIBLE_META, BOOK_ORDER } from '../constants/bible-meta';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import GradientView from './GradientView';

const OT_BOOKS = BOOK_ORDER.slice(0, 39);
const NT_BOOKS = BOOK_ORDER.slice(39);

interface Props {
  onSelect: (bookCode: string) => void;
  onClose: () => void;
}

import * as H from '../utils/haptics';

export default function BookPicker({ onSelect, onClose }: Props) {
  const theme = useTheme();
  const currentBook = useStore((s) => s.currentBook);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'OT' | 'NT'>(
    OT_BOOKS.includes(currentBook) ? 'OT' : 'NT'
  );

  // When searching, search ALL books regardless of tab
  const books = tab === 'OT' ? OT_BOOKS : NT_BOOKS;
  const filtered = search
    ? BOOK_ORDER.filter((code) =>
        BIBLE_META[code].name.toLowerCase().includes(search.toLowerCase())
      )
    : books;

  const handleSearch = (text: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearch(text);
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Select Book</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={24} color={theme.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: theme.background }]}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search books..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={handleSearch}
            autoCorrect={false}
          />
        </View>

        {/* OT / NT toggle — styled like NASB/EASY pill */}
        <View style={[styles.tabRow, { backgroundColor: theme.glassBackground, borderColor: theme.glassBorder }]}>
          {(['OT', 'NT'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={styles.tabTouchable}
              onPress={() => { H.tick(); setTab(t); setSearch(''); }}
              activeOpacity={0.7}
            >
              {tab === t ? (
                <GradientView borderRadius={BorderRadius.sm} style={styles.tabActive}>
                  <Text style={styles.tabTextActive}>
                    {t === 'OT' ? 'Old Testament' : 'New Testament'}
                  </Text>
                </GradientView>
              ) : (
                <View style={styles.tabInactive}>
                  <Text style={[styles.tabText, { color: theme.textMuted }]}>
                    {t === 'OT' ? 'Old Testament' : 'New Testament'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Book list */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item: code }) => {
            const active = code === currentBook;
            return (
              <TouchableOpacity
                style={[
                  styles.bookRow,
                  active && { backgroundColor: theme.accentLight },
                ]}
                onPress={() => { H.tap(); onSelect(code); }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.bookName,
                    { color: theme.text },
                    active && { color: theme.accent, fontWeight: '700' },
                  ]}
                >
                  {BIBLE_META[code].name}
                </Text>
                <Text style={[styles.bookChapters, { color: theme.textMuted }]}>
                  {BIBLE_META[code].chapters.length} chapters
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '85%',
    // Force fully opaque — override the theme.surface rgba
    backgroundColor: '#1a2240',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  closeBtn: { padding: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    paddingVertical: 2,
    outlineStyle: 'none',
  } as any,
  tabRow: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  tabTouchable: {
    flex: 1,
  },
  tabActive: {
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInactive: {
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  tabTextActive: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  bookRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
  },
  bookName: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  bookChapters: {
    fontSize: FontSize.sm,
  },
});
