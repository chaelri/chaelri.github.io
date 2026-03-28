import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface Props {
  onFinish: () => void;
}

export default function SplashIntro({ onFinish }: Props) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(12)).current;
  const logoScale = useRef(new Animated.Value(0.95)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo fade in + slide up + scale (after 200ms)
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(logoTranslateY, { toValue: 0, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 1, duration: 800, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Tagline fade in (after 600ms)
    Animated.timing(taglineOpacity, {
      toValue: 1,
      duration: 600,
      delay: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    // Fade out whole screen after 2s
    setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 600,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onFinish());
    }, 2000);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      {/* Logo: "devo." */}
      <Animated.Text
        style={[
          styles.logo,
          {
            opacity: logoOpacity,
            transform: [
              { translateY: logoTranslateY },
              { scale: logoScale },
            ],
          },
        ]}
      >
        devo.
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        draw near to God
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0b1220',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  logo: {
    fontSize: 52,
    fontFamily: 'EditorsNote-Italic',
    color: '#b8c0d8',
    letterSpacing: -1,
    textShadowColor: 'rgba(72, 107, 236, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 5,
    textTransform: 'uppercase',
    color: 'rgba(155, 165, 185, 0.55)',
    marginTop: 12,
  },
});
