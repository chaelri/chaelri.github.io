import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useStore } from '../store/useStore';
import { BIBLE_META } from '../constants/bible-meta';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  verseKey: string;
  verseNum: string;
  bookName: string;
  chapter: number;
}

export default function CommentInput({
  visible,
  onClose,
  verseKey,
  verseNum,
  bookName,
  chapter,
}: Props) {
  const theme = useTheme();
  const { addNote } = useStore();
  const [text, setText] = useState('');

  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed) {
      addNote({
        title: `${bookName} ${chapter}:${verseNum}`,
        body: trimmed,
        verseKey,
        bookName,
        chapter,
        verseNum: Number(verseNum),
      });
    }
    setText('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: '#1a2240' }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>
              Note for {bookName} {chapter}:{verseNum}
            </Text>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <MaterialIcons name="check" size={22} color={text.trim() ? theme.primary : theme.textMuted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.glassBackground, borderColor: theme.glassBorder }]}
            placeholder="Write your note..."
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            textAlignVertical="top"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  saveBtn: {
    padding: 4,
  },
  input: {
    fontSize: FontSize.md,
    lineHeight: 22,
    minHeight: 120,
    maxHeight: 200,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
});
