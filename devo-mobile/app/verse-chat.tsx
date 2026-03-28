import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { sendVerseChat, type ChatMessage } from '../src/services/ai';

export default function VerseChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    bookName: string;
    chapter: string;
    verseNum: string;
    verseText: string;
  }>();

  const { bookName = '', chapter = '1', verseNum = '1', verseText = '' } = params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const reply = await sendVerseChat(
        bookName,
        Number(chapter),
        Number(verseNum),
        verseText,
        newMessages.slice(0, -1),
        text
      );
      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: `Sorry, something went wrong: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'What does this verse mean?',
    'How can I apply this today?',
    'What is the historical context?',
    'Explain the key words',
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerLabel, { color: theme.textMuted }]}>VERSE CHAT</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {bookName} {chapter}:{verseNum}
          </Text>
        </View>
        <View style={{ width: 30 }} />
      </View>

      {/* Verse context card */}
      <View style={[styles.verseCard, { backgroundColor: theme.surface, borderColor: theme.glassBorder }]}>
        <Text style={[styles.verseRef, { color: theme.accent }]}>
          {verseNum}
        </Text>
        <Text style={[styles.verseTextPreview, { color: theme.textSecondary }]} numberOfLines={3}>
          {verseText}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'user'
                  ? styles.userBubble
                  : [styles.aiBubble, { backgroundColor: theme.surface, borderColor: theme.glassBorder }],
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  { color: item.role === 'user' ? '#fff' : theme.text },
                ]}
              >
                {item.text}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <MaterialIcons name="chat-bubble-outline" size={36} color={theme.textMuted} />
              <Text style={[styles.emptyChatText, { color: theme.textMuted }]}>
                Ask anything about this verse
              </Text>
              <View style={styles.suggestions}>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.suggestion, { borderColor: theme.glassBorder }]}
                    onPress={() => {
                      setInput(s);
                      // Auto-send after a tick so state updates
                      setTimeout(() => {
                        const userMsg: ChatMessage = { role: 'user', text: s };
                        setMessages((prev) => [...prev, userMsg]);
                        setLoading(true);
                        sendVerseChat(bookName, Number(chapter), Number(verseNum), verseText, [], s)
                          .then((reply) => setMessages((prev) => [...prev, { role: 'model', text: reply }]))
                          .catch((err) => setMessages((prev) => [...prev, { role: 'model', text: `Sorry: ${err.message}` }]))
                          .finally(() => { setLoading(false); setInput(''); });
                      }, 50);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.suggestionText, { color: theme.textSecondary }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            loading ? (
              <View style={styles.typingRow}>
                <View style={styles.typingDots}>
                  <ActivityIndicator size="small" color={theme.accent} />
                </View>
                <Text style={[styles.typingText, { color: theme.textMuted }]}>Thinking...</Text>
              </View>
            ) : null
          }
        />

        {/* Input */}
        <View style={[styles.inputRow, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TextInput
            style={[styles.textInput, { color: theme.text, backgroundColor: theme.glassBackground, borderColor: theme.glassBorder }]}
            placeholder="Ask about this verse..."
            placeholderTextColor={theme.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              input.trim() ? styles.sendBtnActive : { backgroundColor: theme.glassBackground },
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="send"
              size={18}
              color={input.trim() ? '#fff' : theme.textMuted}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1, marginLeft: 10 },
  headerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700', letterSpacing: -0.3 },
  verseCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 10,
  },
  verseRef: { fontSize: 18, fontWeight: '800' },
  verseTextPreview: { fontSize: FontSize.sm, lineHeight: 20, flex: 1 },
  chatArea: { flex: 1 },
  messageList: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  bubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 18,
    marginBottom: Spacing.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    backgroundColor: '#db2777',
    shadowColor: '#db2777',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  bubbleText: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  emptyChat: {
    alignItems: 'center',
    paddingTop: 32,
    gap: Spacing.sm,
  },
  emptyChatText: {
    fontSize: FontSize.md,
  },
  suggestions: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
    width: '100%',
  },
  suggestion: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  suggestionText: {
    fontSize: FontSize.sm,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  typingDots: {},
  typingText: { fontSize: FontSize.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 0.5,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: FontSize.md,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    minHeight: 40,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#db2777',
    shadowColor: '#db2777',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
});
