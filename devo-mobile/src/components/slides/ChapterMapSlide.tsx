import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BorderRadius } from '../../constants/theme';
import type { StorySegment } from '../../services/ai';
import * as H from '../../utils/haptics';

interface Props {
  segments: StorySegment[];
  bookName: string;
  chapter: number;
  theme: any;
}

function MapNode({
  segment, index, total, theme,
}: {
  segment: StorySegment; index: number; total: number; theme: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const lineHeight = useRef(new Animated.Value(0)).current;

  const isLast = index === total - 1;

  useEffect(() => {
    const nodeDelay = 300 + index * 200;

    // Animate line growing down first, then the node fades in
    if (index > 0) {
      Animated.timing(lineHeight, {
        toValue: 1,
        duration: 300,
        delay: nodeDelay - 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // height animation
      }).start();
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: nodeDelay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay: nodeDelay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => { if (index < 3) H.tick(); });
  }, []);

  return (
    <View style={styles.nodeWrap}>
      {/* Connector line above (animated height) */}
      {index > 0 && (
        <View style={styles.lineContainer}>
          <Animated.View style={[styles.connectorLine, {
            backgroundColor: theme.accent,
            height: lineHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 32] }),
          }]} />
        </View>
      )}

      <Animated.View style={[styles.node, { opacity, transform: [{ translateY }] }]}>
        <View style={styles.nodeRow}>
          {/* Circle with number or flag */}
          <View style={[styles.nodeCircle, { backgroundColor: isLast ? theme.accent : 'transparent', borderColor: theme.accent }]}>
            {isLast ? (
              <MaterialIcons name="flag" size={18} color="#fff" />
            ) : (
              <Text style={[styles.nodeNum, { color: theme.accent }]}>{index + 1}</Text>
            )}
          </View>

          {/* Content */}
          <View style={styles.nodeContent}>
            <Text style={[styles.nodeTitle, { color: theme.text }]} numberOfLines={2}>{segment.title}</Text>
            <Text style={[styles.nodeVerse, { color: theme.textMuted }]}>Verses {segment.verses}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function ChapterMapSlide({ segments, bookName, chapter, theme }: Props) {
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(16)).current;
  // Background icon animations
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;
  const float3 = useRef(new Animated.Value(0)).current;
  const pulse1 = useRef(new Animated.Value(0.06)).current;
  const pulse2 = useRef(new Animated.Value(0.04)).current;
  const pulse3 = useRef(new Animated.Value(0.05)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Looping float animations for bg icons
    const loopFloat = (anim: Animated.Value, dur: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
    const loopPulse = (anim: Animated.Value, min: number, max: number, dur: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: max, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: min, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();

    loopFloat(float1, 3500, 0);
    loopFloat(float2, 4000, 1200);
    loopFloat(float3, 3000, 600);
    loopPulse(pulse1, 0.04, 0.1, 3000, 0);
    loopPulse(pulse2, 0.03, 0.08, 3500, 800);
    loopPulse(pulse3, 0.04, 0.09, 2800, 400);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {/* Background decorative icons */}
      <Animated.View style={[bgStyles.icon, bgStyles.pin, { opacity: pulse1, transform: [{ translateY: float1.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }] }]}>
        <MaterialIcons name="place" size={80} color={theme.accent} />
      </Animated.View>
      <Animated.View style={[bgStyles.icon, bgStyles.flag, { opacity: pulse2, transform: [{ translateY: float2.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) }, { rotate: '15deg' }] }]}>
        <MaterialIcons name="flag" size={60} color={theme.accent} />
      </Animated.View>
      <Animated.View style={[bgStyles.icon, bgStyles.compass, { opacity: pulse3, transform: [{ translateY: float3.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }, { rotate: '-10deg' }] }]}>
        <MaterialIcons name="explore" size={70} color={theme.primary} />
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Animated.View style={{ opacity: headerOpacity, transform: [{ translateY: headerSlide }] }}>
          <Text style={[styles.label, { color: theme.textMuted }]}>CHAPTER MAP</Text>
          <Text style={[styles.title, { color: theme.text }]}>{bookName} {chapter}</Text>
        </Animated.View>

        <View style={styles.mapWrap}>
          {segments.map((seg, i) => (
            <MapNode key={i} segment={seg} index={i} total={segments.length} theme={theme} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const bgStyles = StyleSheet.create({
  icon: {
    position: 'absolute',
    zIndex: 0,
  },
  pin: {
    top: 50,
    right: -10,
  },
  flag: {
    bottom: 120,
    right: 20,
  },
  compass: {
    bottom: 200,
    left: -15,
  },
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 80,
    flexGrow: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginBottom: 32,
  },
  mapWrap: {
    paddingLeft: 4,
  },
  nodeWrap: {
    // no margin — spacing handled by line + node padding
  },
  lineContainer: {
    alignItems: 'center',
    width: 44,
    paddingLeft: 0,
  },
  connectorLine: {
    width: 2.5,
    borderRadius: 1.25,
  },
  node: {
    marginBottom: 4,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  nodeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeNum: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  nodeContent: {
    flex: 1,
    paddingVertical: 6,
  },
  nodeTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  nodeVerse: {
    fontSize: 13,
    fontWeight: '600',
  },
});
