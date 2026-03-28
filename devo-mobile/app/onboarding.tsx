import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { Spacing, FontSize, BorderRadius, LabelStyle } from '../src/constants/theme';
import GradientView from '../src/components/GradientView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    type: 'welcome' as const,
  },
  {
    icon: 'menu-book',
    iconType: 'material' as const,
    title: 'Read the Bible',
    subtitle: '2 translations — NASB 2020 & EASY 2024',
    desc: 'Select any book, chapter, and verse.\nSwitch translations with one tap.\nLong-press any verse to favorite it.',
    badge: 'FREE',
  },
  {
    icon: 'auto-awesome',
    iconType: 'material' as const,
    title: 'AI Context Summary',
    subtitle: 'Understand before you read',
    desc: "Every chapter gets a brief AI overview —\nwhat's happening, key themes,\nand what to watch for.",
    badge: 'UNLIMITED',
  },
  {
    icon: 'chat-bubble-outline',
    iconType: 'material' as const,
    title: 'Verse Chat',
    subtitle: 'Ask anything about any verse',
    desc: 'Tap "Ask" on any verse to start\na conversation. Ask follow-ups —\nthe AI remembers the context.',
    badge: '3 / day free',
  },
  {
    icon: 'translate',
    iconType: 'material' as const,
    title: 'Dig Deeper',
    subtitle: 'Greek & Hebrew word study',
    desc: "Explore original language meanings.\nTap any word to see cross-references\nacross the Bible.",
    badge: '1 / day free',
  },
  {
    icon: 'headphones',
    iconType: 'material' as const,
    title: 'Immersive TTS',
    subtitle: 'Listen to Scripture read aloud',
    desc: 'Premium voice with word-by-word\nhighlighting. Pause anytime to\ntake notes or ask questions.',
    badge: '1 chapter / day free',
  },
  {
    icon: 'lightbulb',
    iconType: 'material' as const,
    title: 'Guided Reflection',
    subtitle: 'Go deeper after every reading',
    desc: 'AI generates reflection questions\npersonalized to each passage.\nJournal your thoughts right in the app.',
    badge: 'UNLIMITED',
  },
  {
    type: 'final' as const,
  },
];

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(0);
  const { completeOnboarding, setUserName } = useStore();
  const router = useRouter();
  const [name, setName] = useState('');

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, SLIDES.length - 1));
    scrollRef.current?.scrollTo({ x: clamped * SCREEN_WIDTH, animated: true });
    setCurrent(clamped);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (page !== current) setCurrent(page);
  };

  const finish = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (name.trim()) setUserName(name.trim());
    completeOnboarding();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            {'type' in slide && slide.type === 'welcome' ? (
              // ─── WELCOME SLIDE — "devo." branding + name input ───
              <View style={styles.welcomeSlide}>
                {/* Branding: "devo." in italic serif style */}
                <Text style={styles.brandText}>devo.</Text>
                <Text style={styles.brandSub}>DRAW NEAR TO GOD</Text>

                <Text style={styles.welcomeTitle}>Hey there! 👋</Text>
                <Text style={styles.welcomeSub}>What should we call you?</Text>

                {/* Name input with gradient border */}
                <GradientView style={styles.nameInputBorder} borderRadius={18}>
                  <View style={styles.nameInputInner}>
                    <TextInput
                      style={styles.nameInput}
                      placeholder="Your name"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      value={name}
                      onChangeText={setName}
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                  </View>
                </GradientView>

                {/* Gradient-style CTA button */}
                <TouchableOpacity onPress={() => goTo(1)} activeOpacity={0.85} style={{ width: '100%' }}>
                  <GradientView style={styles.gradientBtn} borderRadius={16}>
                    <View style={styles.gradientBtnInner}>
                      <Text style={styles.gradientBtnText}>Let's go →</Text>
                    </View>
                  </GradientView>
                </TouchableOpacity>
              </View>
            ) : 'type' in slide && slide.type === 'final' ? (
              // ─── FINAL SLIDE ───
              <View style={styles.finalSlide}>
                <Text style={styles.brandTextSmall}>devo.</Text>
                <Text style={[styles.welcomeTitle, { marginTop: 8 }]}>Start Your Devotion</Text>
                <Text style={[styles.welcomeSub, { marginBottom: 20 }]}>
                  Every feature has a generous free tier.{'\n'}Upgrade anytime for unlimited access.
                </Text>

                <TouchableOpacity onPress={finish} activeOpacity={0.85} style={{ width: '100%' }}>
                  <GradientView style={styles.gradientBtn} borderRadius={16}>
                    <View style={styles.gradientBtnInner}>
                      <Text style={styles.gradientBtnText}>Let's Go</Text>
                    </View>
                  </GradientView>
                </TouchableOpacity>

                <View style={styles.freeList}>
                  {[
                    'Full Bible — unlimited',
                    'Context Summary — unlimited',
                    'Quick Context — unlimited',
                    'Reflections — unlimited',
                    'Verse Chat — 3 / day',
                    'Dig Deeper — 1 / day',
                    'Immersive TTS — 1 chapter / day',
                  ].map((item) => (
                    <View key={item} style={styles.freeItem}>
                      <MaterialIcons name="check-circle" size={16} color="#486bec" />
                      <Text style={styles.freeItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              // ─── FEATURE SLIDES ───
              <View style={styles.featureSlide}>
                {'badge' in slide && slide.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{slide.badge}</Text>
                  </View>
                )}

                <View style={styles.iconBox}>
                  {'iconType' in slide && slide.iconType === 'material' && (
                    <MaterialIcons name={slide.icon as any} size={36} color="#486bec" />
                  )}
                </View>

                <Text style={styles.featureTitle}>{'title' in slide ? slide.title : ''}</Text>
                {'subtitle' in slide && slide.subtitle ? (
                  <Text style={styles.featureSub}>{slide.subtitle}</Text>
                ) : null}
                <Text style={styles.featureDesc}>{'desc' in slide ? slide.desc : ''}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Footer: dots + nav */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === current && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {current > 0 && current < SLIDES.length - 1 ? (
          <View style={styles.navRow}>
            <TouchableOpacity onPress={finish} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goTo(current + 1)} style={styles.nextBtn}>
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          </View>
        ) : current === 0 ? (
          <View style={{ height: 48 }} />
        ) : (
          <View style={{ height: 48 }} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // ─── Welcome slide ───
  welcomeSlide: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  brandText: {
    fontSize: 56,
    fontFamily: 'EditorsNote-Italic',
    color: '#db2777',
    letterSpacing: -1,
    marginBottom: 4,
  },
  brandSub: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#6b7a94',
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  brandTextSmall: {
    fontSize: 36,
    fontFamily: 'EditorsNote-Italic',
    color: '#db2777',
    letterSpacing: -1,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e6edf7',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -1,
  },
  welcomeSub: {
    fontSize: 16,
    color: '#6b7a94',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 24,
  },
  nameInputBorder: {
    width: '100%',
    padding: 2,
    marginBottom: 16,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  nameInputInner: {
    backgroundColor: '#0b1220',
    borderRadius: 16,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e6edf7',
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  gradientBtn: {
    width: '100%',
    paddingVertical: 16,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 6,
  },
  gradientBtnInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },

  // ─── Feature slides ───
  featureSlide: {
    alignItems: 'center',
  },
  badge: {
    backgroundColor: 'rgba(72, 107, 236, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  badgeText: {
    color: '#8fa4e6',
    fontSize: LabelStyle.fontSize,
    fontWeight: LabelStyle.fontWeight,
    letterSpacing: 1,
  },
  iconBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: 'rgba(72, 107, 236, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  featureTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#e6edf7',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -1,
  },
  featureSub: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8fa4e6',
    textAlign: 'center',
    marginBottom: 16,
  },
  featureDesc: {
    fontSize: 15,
    color: '#9aa5b8',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },

  // ─── Final slide ───
  finalSlide: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  freeList: {
    marginTop: 24,
    alignSelf: 'flex-start',
    gap: 8,
  },
  freeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freeItemText: {
    color: '#9aa5b8',
    fontSize: 13,
  },

  // ─── Footer ───
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dotActive: {
    backgroundColor: '#db2777',
    width: 24,
    borderRadius: 4,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: '#6b7a94',
    fontSize: 15,
  },
  nextBtn: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: 'rgba(72, 107, 236, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(72, 107, 236, 0.3)',
  },
  nextText: {
    color: '#8fa4e6',
    fontSize: 15,
    fontWeight: '600',
  },
});
