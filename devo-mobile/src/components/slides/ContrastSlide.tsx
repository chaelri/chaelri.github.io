import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { StorySegment } from '../../services/ai';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  segment: StorySegment;
  theme: any;
}

function renderBold(text: string, boldColor: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '800', color: boldColor }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

export default function ContrastSlide({ segment, theme }: Props) {
  const { left, right } = segment.content;

  const topAnim = useRef(new Animated.Value(0)).current;
  const vsAnim = useRef(new Animated.Value(0)).current;
  const botAnim = useRef(new Animated.Value(0)).current;
  const reflectAnim = useRef(new Animated.Value(0)).current;
  // Circle float animations
  const pinkFloat = useRef(new Animated.Value(0)).current;
  const blueFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    topAnim.setValue(0);
    vsAnim.setValue(0);
    botAnim.setValue(0);
    reflectAnim.setValue(0);

    Animated.stagger(200, [
      Animated.timing(topAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(vsAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(botAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(reflectAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Gentle floating motion for circles
    Animated.loop(
      Animated.sequence([
        Animated.timing(pinkFloat, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pinkFloat, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(blueFloat, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(blueFloat, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [segment.verses]);

  return (
    <View style={{ flex: 1 }}>
      {/* Subtle background glow circles — with float animation */}
      <Animated.View style={[styles.glowCircle, styles.glowPink, {
        backgroundColor: theme.accent,
        transform: [
          { translateY: pinkFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
          { translateX: pinkFloat.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
        ],
      }]} />
      <Animated.View style={[styles.glowCircle, styles.glowBlue, {
        backgroundColor: theme.primary,
        transform: [
          { translateY: blueFloat.interpolate({ inputRange: [0, 1], outputRange: [0, 15] }) },
          { translateX: blueFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
        ],
      }]} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Text style={[styles.verseLabel, { color: theme.textMuted }]}>VERSES {segment.verses}</Text>
        <Text style={[styles.title, { color: theme.text }]}>{segment.title}</Text>

        {/* Top section — label in EditorsNote + description */}
        <Animated.View style={[
          styles.section,
          { opacity: topAnim, transform: [{ translateY: topAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>{left?.label || 'Before'}</Text>
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            {renderBold(left?.text || '', theme.accent)}
          </Text>
        </Animated.View>

        {/* VS divider */}
        <Animated.View style={[styles.vsWrap, { opacity: vsAnim, transform: [{ scale: vsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
          <View style={[styles.vsLine, { backgroundColor: theme.glassBorder }]} />
          <Text style={[styles.vsText, { color: theme.textMuted }]}>VS</Text>
          <View style={[styles.vsLine, { backgroundColor: theme.glassBorder }]} />
        </Animated.View>

        {/* Bottom section */}
        <Animated.View style={[
          styles.section,
          { opacity: botAnim, transform: [{ translateY: botAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>{right?.label || 'After'}</Text>
          <Text style={[styles.sectionText, { color: theme.textSecondary }]}>
            {renderBold(right?.text || '', theme.primary)}
          </Text>
        </Animated.View>

        {/* Reflection */}
        {segment.content.reflection && (
          <Animated.View style={[styles.reflectionWrap, { opacity: reflectAnim, transform: [{ translateY: reflectAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
            <MaterialIcons name="lightbulb" size={16} color={theme.accent} style={{ marginTop: 2 }} />
            <Text style={[styles.reflectionText, { color: theme.textSecondary }]}>
              {renderBold(segment.content.reflection, theme.accent)}
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Background glow circles
  glowCircle: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: SCREEN_WIDTH * 0.35,
    opacity: 0.06,
  },
  glowPink: {
    top: 40,
    right: -SCREEN_WIDTH * 0.2,
  },
  glowBlue: {
    bottom: 60,
    left: -SCREEN_WIDTH * 0.2,
  },
  container: {
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 80,
    flexGrow: 1,
    justifyContent: 'center',
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
    marginBottom: 32,
  },
  // Section — no card, just label + text
  section: {
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontFamily: 'EditorsNote-Italic',
    fontSize: 42,
    lineHeight: 50,
    marginBottom: 8,
    paddingTop: 4,
  },
  sectionText: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '500',
    paddingLeft: 4,
  },
  vsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 20,
  },
  vsLine: {
    height: 1,
    flex: 1,
  },
  vsText: {
    fontFamily: 'EditorsNote-Italic',
    fontSize: 32,
    letterSpacing: 4,
  },
  reflectionWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 32,
    paddingHorizontal: 4,
  },
  reflectionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 23,
    fontStyle: 'italic',
  },
});
