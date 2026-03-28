import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import GradientView from './GradientView';

interface Props {
  fetchContent: () => Promise<string>;
  onClose: () => void;
  onDigDeeper?: () => void;
  onCrossRefs?: () => void;
  label?: string;
}

// ─── Sparkle loading animation ──────────────────────────────────────────────
function SparkleLoader() {
  const sparkles = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered sparkle pulse
    sparkles.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 300),
          Animated.timing(anim, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.2, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    });

    // Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={sparkleStyles.container}>
      <View style={sparkleStyles.sparkleRow}>
        {sparkles.map((anim, i) => (
          <Animated.Text
            key={i}
            style={[
              sparkleStyles.sparkle,
              {
                opacity: anim,
                transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
              },
            ]}
          >
            ✦
          </Animated.Text>
        ))}
      </View>
      <Animated.Text style={[sparkleStyles.text, { opacity: glow }]}>
        Generating...
      </Animated.Text>
    </View>
  );
}

const sparkleStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  sparkleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sparkle: {
    fontSize: 18,
    color: '#fbbf24', // yellow/gold
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },
});

// ─── InlineAI Component ─────────────────────────────────────────────────────
export default function InlineAI({ fetchContent, onClose, onDigDeeper, onCrossRefs, label }: Props) {
  const theme = useTheme();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fade-in animation when content loads
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    fadeAnim.setValue(0);
    try {
      const result = await fetchContent();
      setContent(result);
      // Animate content in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientView style={styles.container} borderRadius={14}>
      <View style={styles.innerPad}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel}>{label || 'Quick Context'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <SparkleLoader />
        ) : error ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
            <InlineMarkdown text={content} />

            {/* Action buttons: Dig Deeper */}
            {(onDigDeeper || onCrossRefs) && (
              <View style={styles.actionRow}>
                {onDigDeeper && (
                  <TouchableOpacity
                    onPress={onDigDeeper}
                    activeOpacity={0.8}
                    style={styles.actionBtn}
                  >
                    <MaterialIcons name="search" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Dig Deeper</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </GradientView>
  );
}

// White-on-gradient markdown renderer
function InlineMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 4 }} />;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <View key={i} style={styles.mdBulletRow}>
              <Text style={styles.mdBulletDot}>•</Text>
              <Text style={styles.mdText}>{renderBold(trimmed.slice(2))}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={styles.mdText}>{renderBold(trimmed)}</Text>
        );
      })}
    </View>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={styles.mdBold}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      return <Text key={i} style={{ fontStyle: 'italic', color: '#fff' }}>{part.slice(1, -1)}</Text>;
    }
    return part;
  });
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginLeft: 0,
    marginRight: 0,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 5,
  },
  innerPad: {
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)' },
  retryText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm + 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'EditorsNote-Italic',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Markdown — white text on gradient (high contrast)
  mdBold: { fontSize: 15, fontWeight: '800', color: '#fff' },
  mdText: { fontSize: 15, lineHeight: 19, color: '#fff', marginBottom: 2 },
  mdBulletRow: { flexDirection: 'row', marginBottom: 2 },
  mdBulletDot: { width: 14, fontSize: 15, lineHeight: 23, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
});
