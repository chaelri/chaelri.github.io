import React, { useState, useRef, useEffect } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { sendVerseChat, getSuggestedQuestions, type ChatMessage } from '../src/services/ai';

function renderBoldText(text: string, color: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '800', color }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [remainingSuggestions, setRemainingSuggestions] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    getSuggestedQuestions(bookName, Number(chapter), Number(verseNum), verseText)
      .then(setSuggestions)
      .catch(() => setSuggestions([
        'What does this verse mean?',
        'How can I apply this today?',
        'What is the historical context?',
      ]))
      .finally(() => setSuggestionsLoading(false));
  }, []);

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
        <Text style={[styles.verseTextPreview, { color: theme.textSecondary }]}>
          {verseText}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Top fade — messages fade out as they scroll up */}
        <LinearGradient
          colors={[theme.background, 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, zIndex: 1 }}
          pointerEvents="none"
        />
        <FlatList
          ref={flatListRef}
          data={messages}
          showsVerticalScrollIndicator={false}
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
              {item.role === 'user' ? (
                <Text style={[styles.bubbleText, { color: '#fff' }]}>{item.text}</Text>
              ) : (
                <Text style={[styles.bubbleText, { color: theme.text }]}>
                  {renderBoldText(item.text, theme.text)}
                </Text>
              )}
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
                {suggestionsLoading ? (
                  <ActivityIndicator size="small" color={theme.textMuted} style={{ marginTop: 12 }} />
                ) : suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.suggestion, { borderColor: theme.glassBorder }]}
                    onPress={() => {
                      // Save remaining as follow-ups
                      setRemainingSuggestions(suggestions.filter(q => q !== s));
                      const userMsg: ChatMessage = { role: 'user', text: s };
                      setMessages([userMsg]);
                      setInput('');
                      setLoading(true);
                      sendVerseChat(bookName, Number(chapter), Number(verseNum), verseText, [], s)
                        .then((reply) => setMessages((prev) => [...prev, { role: 'model', text: reply }]))
                        .catch((err) => setMessages((prev) => [...prev, { role: 'model', text: `Sorry: ${err.message}` }]))
                        .finally(() => setLoading(false));
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
            ) : remainingSuggestions.length > 0 ? (
              <View style={styles.followUps}>
                {remainingSuggestions.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={[styles.followUpChip, { borderColor: theme.glassBorder }]}
                    onPress={() => {
                      setRemainingSuggestions(remainingSuggestions.filter(s => s !== q));
                      const userMsg: ChatMessage = { role: 'user', text: q };
                      setMessages((prev) => [...prev, userMsg]);
                      setInput('');
                      setLoading(true);
                      sendVerseChat(bookName, Number(chapter), Number(verseNum), verseText, messages, q)
                        .then((reply) => setMessages((prev) => [...prev, { role: 'model', text: reply }]))
                        .catch((err) => setMessages((prev) => [...prev, { role: 'model', text: `Sorry: ${err.message}` }]))
                        .finally(() => setLoading(false));
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.followUpText, { color: theme.textSecondary }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.md,
    gap: 8,
  },
  suggestion: {
    borderWidth: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 1,
  },
  suggestionText: {
    fontSize: FontSize.sm,
  },
  followUps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.sm,
  },
  followUpChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 1,
  },
  followUpText: {
    fontSize: FontSize.xs,
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
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 0.5,
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: FontSize.md,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
