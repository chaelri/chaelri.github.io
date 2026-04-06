import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface Props {
  recapPoints: string[];
  bookName: string;
  chapter: number;
  theme: any;
}

export default function RecapSlide({ recapPoints, bookName, chapter, theme }: Props) {
  const headerAnim = useRef(new Animated.Value(0)).current;
  const pointAnims = useRef(recapPoints.map(() => new Animated.Value(0))).current;
  const bgRotate = useRef(new Animated.Value(0)).current;
  const bgPulse = useRef(new Animated.Value(0.06)).current;

  useEffect(() => {
    headerAnim.setValue(0);
    pointAnims.forEach((a) => a.setValue(0));

    Animated.sequence([
      Animated.timing(headerAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(200, pointAnims.map((a) =>
        Animated.timing(a, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      )),
    ]).start();

    // Slow counter-clockwise rotation — infinite loop
    Animated.loop(
      Animated.timing(bgRotate, { toValue: -1, duration: 20000, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Gentle pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgPulse, { toValue: 0.1, duration: 3000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bgPulse, { toValue: 0.05, duration: 3000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const spin = bgRotate.interpolate({ inputRange: [-1, 0], outputRange: ['-360deg', '0deg'] });

  return (
    <View style={{ flex: 1 }}>
      {/* Big background replay icon — lower right */}
      <Animated.View style={[styles.bgIcon, { opacity: bgPulse, transform: [{ rotate: spin }] }]}>
        <MaterialIcons name="replay" size={320} color={theme.accent} />
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Animated.View style={{ opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <View style={[styles.iconWrap, { backgroundColor: theme.glassBackground }]}>
            <MaterialIcons name="replay" size={26} color={theme.textMuted} style={{ opacity: 0.5 }} />
          </View>
          <Text style={[styles.label, { color: theme.textMuted }]}>QUICK RECAP</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {bookName} {chapter}
          </Text>
        </Animated.View>

        <View style={styles.pointsList}>
          {recapPoints.map((point, i) => (
            <Animated.View
              key={i}
              style={[
                styles.pointRow,
                { opacity: pointAnims[i], transform: [{ translateY: pointAnims[i]?.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) || 0 }] },
              ]}
            >
              <Text style={[styles.pointNum, { color: theme.accent }]}>{i + 1}</Text>
              <Text style={[styles.pointText, { color: theme.text }]}>{point}</Text>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bgIcon: {
    position: 'absolute',
    bottom: -40,
    right: -60,
    zIndex: 0,
  },
  container: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 80,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
  pointsList: {
    gap: 28,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  pointNum: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 52,
    width: 50,
  },
  pointText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    paddingTop: 10,
  },
});
