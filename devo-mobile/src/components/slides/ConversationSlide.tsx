import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { BorderRadius } from '../../constants/theme';
import type { StorySegment } from '../../services/ai';

interface Props {
  segment: StorySegment;
  theme: any;
}

const RADIUS = 20;
const TIGHT = 4; // small radius on grouped/connected edges

export default function ConversationSlide({ segment, theme }: Props) {
  const messages = segment.content.messages || [];

  // Build a speaker→side map: each unique speaker gets a consistent side
  const speakerSideMap = new Map<string, 'left' | 'right'>();
  let lastSide: 'left' | 'right' = 'right'; // first speaker will be left
  messages.forEach((msg) => {
    if (!speakerSideMap.has(msg.speaker)) {
      const newSide = lastSide === 'left' ? 'right' : 'left';
      speakerSideMap.set(msg.speaker, newSide);
      lastSide = newSide;
    }
  });

  // Pre-compute grouping: is this the first/last in a consecutive run by same speaker?
  const grouping = messages.map((msg, i) => {
    const prevSame = i > 0 && messages[i - 1].speaker === msg.speaker;
    const nextSame = i < messages.length - 1 && messages[i + 1].speaker === msg.speaker;
    return {
      isFirst: !prevSame,
      isLast: !nextSame,
      isMiddle: prevSame && nextSame,
      showName: !prevSame, // show name only on first bubble of a group
    };
  });

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <Text style={[styles.verseLabel, { color: theme.textMuted }]}>VERSES {segment.verses}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{segment.title}</Text>

      <View style={styles.chatArea}>
        {messages.map((msg, i) => {
          const side = speakerSideMap.get(msg.speaker) || 'left';
          const isRight = side === 'right';
          const g = grouping[i];

          return (
            <ChatBubble
              key={`${segment.verses}-${i}`}
              speaker={msg.speaker}
              text={msg.text}
              index={i}
              isRight={isRight}
              showName={g.showName}
              isFirst={g.isFirst}
              isLast={g.isLast}
              theme={theme}
              segmentKey={segment.verses}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

function ChatBubble({
  speaker, text, index, isRight, showName, isFirst, isLast, theme, segmentKey,
}: {
  speaker: string; text: string; index: number; isRight: boolean;
  showName: boolean; isFirst: boolean; isLast: boolean; theme: any; segmentKey: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const translateX = useRef(new Animated.Value(isRight ? 20 : -20)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);
    translateX.setValue(isRight ? 20 : -20);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, delay: index * 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 500, delay: index * 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 500, delay: index * 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [segmentKey]);

  // Messenger-style border radius:
  // The "own side" edge gets tight radius on connected edges, full radius on outer edges.
  // The "opposite side" always stays fully round.
  //
  // Left bubble:  own side = left.   Right bubble: own side = right.
  //
  // First in group:  top-own = RADIUS, bottom-own = TIGHT
  // Middle in group: top-own = TIGHT,  bottom-own = TIGHT
  // Last in group:   top-own = TIGHT,  bottom-own = RADIUS
  // Solo (first+last): all RADIUS

  let borderTopLeftRadius = RADIUS;
  let borderTopRightRadius = RADIUS;
  let borderBottomLeftRadius = RADIUS;
  let borderBottomRightRadius = RADIUS;

  if (isRight) {
    // Own side = right
    if (!isFirst) borderTopRightRadius = TIGHT;     // connected to bubble above
    if (!isLast) borderBottomRightRadius = TIGHT;    // connected to bubble below
  } else {
    // Own side = left
    if (!isFirst) borderTopLeftRadius = TIGHT;       // connected to bubble above
    if (!isLast) borderBottomLeftRadius = TIGHT;     // connected to bubble below
  }

  const bubbleRadius = {
    borderTopLeftRadius,
    borderTopRightRadius,
    borderBottomLeftRadius,
    borderBottomRightRadius,
  };

  return (
    <Animated.View style={[
      styles.bubbleWrap,
      isRight ? styles.bubbleRight : styles.bubbleLeft,
      // Tighter gap between grouped bubbles
      !isFirst && { marginTop: 2 },
      isFirst && index > 0 && { marginTop: 10 },
      { opacity, transform: [{ translateY }, { translateX }] },
    ]}>
      {showName && (
        <Text style={[styles.speakerName, { color: theme.textMuted }, isRight && { textAlign: 'right' }]}>
          {speaker}
        </Text>
      )}
      <View style={[
        styles.bubble,
        bubbleRadius,
        isRight
          ? { backgroundColor: theme.accent }
          : { backgroundColor: theme.glassBackground, borderColor: theme.glassBorder, borderWidth: 1 },
      ]}>
        <Text style={[styles.bubbleText, { color: isRight ? '#fff' : theme.text }]}>
          {text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 80,
  },
  verseLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 24,
  },
  chatArea: {
    gap: 0,
  },
  bubbleWrap: {
    maxWidth: '82%',
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
  },
  bubbleRight: {
    alignSelf: 'flex-end',
  },
  speakerName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 23,
  },
});
