import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore, type Note } from '../../src/store/useStore';
import { BIBLE_META } from '../../src/constants/bible-meta';
import { Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import * as H from '../../src/utils/haptics';

type ViewMode = 'list' | 'detail' | 'edit';

export default function NotesScreen() {
  const theme = useTheme();
  const { notes, addNote, updateNote, deleteNote, favorites, comments } = useStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');

  // Filter notes by search
  const filteredNotes = search
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.body.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  // Build verse-linked items from comments
  const verseNotes = Object.values(comments).map((c) => {
    const parts = c.verseKey.split('-');
    const bookCode = parts[0];
    const ch = parts[1];
    const v = parts[2];
    const bookName = BIBLE_META[bookCode]?.name || bookCode;
    return {
      id: c.verseKey,
      title: `${bookName} ${ch}:${v}`,
      body: c.text,
      verseKey: c.verseKey,
      createdAt: c.updatedAt,
      updatedAt: c.updatedAt,
      isComment: true,
    };
  });

  const allItems = [...filteredNotes, ...(search ? [] : verseNotes)]
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const openNote = (note: Note) => {
    H.tap();
    setSelectedNote(note);
    setViewMode('detail');
  };

  const startNewNote = () => {
    H.press();
    setEditTitle('');
    setEditBody('');
    setSelectedNote(null);
    setViewMode('edit');
  };

  const startEdit = (note: Note) => {
    H.tap();
    setEditTitle(note.title);
    setEditBody(note.body);
    setSelectedNote(note);
    setViewMode('edit');
  };

  const saveNote = () => {
    H.success();
    if (!editTitle.trim() && !editBody.trim()) {
      setViewMode('list');
      return;
    }
    if (selectedNote) {
      updateNote(selectedNote.id, {
        title: editTitle.trim() || 'Untitled',
        body: editBody.trim(),
      });
    } else {
      addNote({
        title: editTitle.trim() || 'Untitled',
        body: editBody.trim(),
      });
    }
    setViewMode('list');
    setSelectedNote(null);
  };

  const handleDelete = (note: Note) => {
    H.warning();
    Alert.alert('Delete Note', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteNote(note.id);
          setViewMode('list');
          setSelectedNote(null);
        },
      },
    ]);
  };

  // ─── LIST VIEW ─────────────────────────────────────────
  if (viewMode === 'list') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.listHeader}>
          <Text style={[styles.title, { color: theme.text }]}>Notes</Text>
          <TouchableOpacity onPress={startNewNote} style={styles.addBtn}>
            <MaterialIcons name="add" size={26} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchBox, { backgroundColor: theme.surface }]}>
          <MaterialIcons name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search notes..."
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {allItems.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="edit-note" size={64} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
              {search ? `No results for "${search}"` : 'No notes yet'}
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
              Tap + to create a note, or long-press any verse while reading to add a note.
            </Text>
          </View>
        ) : (
          <FlatList
            data={allItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.noteCard, { backgroundColor: theme.surface }]}
                onPress={() => {
                  if ('isComment' in item) return;
                  openNote(item as Note);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.noteCardTop}>
                  <Text style={[styles.noteTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {'isComment' in item && (
                    <View style={[styles.verseBadge, { backgroundColor: theme.primaryLight }]}>
                      <Text style={[styles.verseBadgeText, { color: theme.primary }]}>Verse</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.noteBody, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.body}
                </Text>
                <Text style={[styles.noteDate, { color: theme.textMuted }]}>
                  {formatDate(item.updatedAt)}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    );
  }

  // ─── DETAIL VIEW ───────────────────────────────────────
  if (viewMode === 'detail' && selectedNote) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[styles.detailHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setViewMode('list')}>
            <MaterialIcons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <View style={styles.detailActions}>
            <TouchableOpacity onPress={() => startEdit(selectedNote)} style={styles.iconBtn}>
              <MaterialIcons name="edit" size={22} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(selectedNote)} style={styles.iconBtn}>
              <MaterialIcons name="delete-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.detailContent}>
          <Text style={[styles.detailTitle, { color: theme.text }]}>{selectedNote.title}</Text>
          {selectedNote.verseKey && (
            <Text style={[styles.detailVerse, { color: theme.primary }]}>
              {selectedNote.verseKey.replace(/-/g, ' ')}
            </Text>
          )}
          <Text style={[styles.detailDate, { color: theme.textMuted }]}>
            {formatDate(selectedNote.updatedAt)}
          </Text>
          <Text style={[styles.detailBody, { color: theme.textSecondary }]}>
            {selectedNote.body}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── EDIT VIEW ─────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.editHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => {
              setViewMode(selectedNote ? 'detail' : 'list');
            }}
          >
            <Text style={[styles.editCancel, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.editHeaderTitle, { color: theme.text }]}>
            {selectedNote ? 'Edit Note' : 'New Note'}
          </Text>
          <TouchableOpacity onPress={saveNote}>
            <Text style={[styles.editSave, { color: theme.primary }]}>Save</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.editTitleInput, { color: theme.text }]}
          placeholder="Title"
          placeholderTextColor={theme.textMuted}
          value={editTitle}
          onChangeText={setEditTitle}
          autoFocus
        />
        <TextInput
          style={[styles.editBodyInput, { color: theme.text }]}
          placeholder="Write your thoughts..."
          placeholderTextColor={theme.textMuted}
          value={editBody}
          onChangeText={setEditBody}
          multiline
          textAlignVertical="top"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // List
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 40, fontWeight: '900', letterSpacing: -2.5, textTransform: 'uppercase' },
  addBtn: { padding: Spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, paddingVertical: 2 },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  noteCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  noteCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noteTitle: { fontSize: FontSize.md, fontWeight: '600', flex: 1 },
  verseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  verseBadgeText: { fontSize: 10, fontWeight: '600' },
  noteBody: { fontSize: FontSize.sm, lineHeight: 20, marginBottom: 6 },
  noteDate: { fontSize: FontSize.xs },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '600', textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.md, textAlign: 'center', lineHeight: 22 },
  // Detail
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  detailActions: { flexDirection: 'row', gap: Spacing.md },
  iconBtn: { padding: 4 },
  detailContent: { padding: Spacing.lg },
  detailTitle: { fontSize: FontSize.xl, fontWeight: '700', marginBottom: 4 },
  detailVerse: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 8 },
  detailDate: { fontSize: FontSize.xs, marginBottom: Spacing.lg },
  detailBody: { fontSize: FontSize.md, lineHeight: 24 },
  // Edit
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
  },
  editCancel: { fontSize: FontSize.md },
  editHeaderTitle: { fontSize: FontSize.md, fontWeight: '600' },
  editSave: { fontSize: FontSize.md, fontWeight: '700' },
  editTitleInput: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  editBodyInput: {
    flex: 1,
    fontSize: FontSize.md,
    lineHeight: 24,
    paddingHorizontal: Spacing.lg,
  },
});
