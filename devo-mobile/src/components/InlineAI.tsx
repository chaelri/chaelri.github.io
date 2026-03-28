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
import { LinearGradient } from 'expo-linear-gradient';
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

  const isDigDeeper = label === 'Dig Deeper';
  const isCrossRefs = label === 'Cross-References';
  const gradientColors = isDigDeeper
    ? ['#0f0a2e', '#2a1252', '#0f0a2e'] as [string, string, ...string[]]
    : isCrossRefs
    ? ['#0a1e2e', '#0d2a3d', '#0a1e2e'] as [string, string, ...string[]]
    : undefined;

  const shadowColor = isDigDeeper ? '#7c3aed' : isCrossRefs ? '#0ea5e9' : '#486bec';

  const showFooter = !loading && !error && onDigDeeper;

  return (
    <View style={[styles.container, { shadowColor, borderRadius: 14, overflow: 'hidden' }]}>
      <GradientView
        style={{ borderRadius: showFooter ? 0 : 14 }}
        borderRadius={showFooter ? 0 : 14}
        colors={gradientColors}
      >
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
            </Animated.View>
          )}
        </View>
      </GradientView>

      {/* White footer — Dig Deeper CTA */}
      {showFooter && (
        <DigDeeperFooter onPress={onDigDeeper!} />
      )}
    </View>
  );
}

// White-on-gradient markdown renderer
// ─── Dig Deeper CTA — theme-aware footer ────────────────────────────────────
function DigDeeperFooter({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const isDark = theme.background === '#0b1220';
  const bg = isDark ? 'rgb(19, 27, 48)' : '#fff';
  const textColor = isDark ? '#fff' : '#1a1a2e';
  const iconColor = isDark ? 'rgba(255,255,255,0.5)' : '#6b21a8';
  const chevronColor = isDark ? 'rgba(255,255,255,0.3)' : '#9ca3af';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.digDeeperFooter, { backgroundColor: bg }]}
    >
      <MaterialIcons name="auto-awesome" size={14} color={iconColor} />
      <Text style={[styles.digDeeperText, { color: textColor }]}>Dig Deeper</Text>
      <MaterialIcons name="chevron-right" size={16} color={chevronColor} />
    </TouchableOpacity>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');

  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 6 }} />;

        // Headings — check #### first, then ### / ##
        const h4Match = trimmed.match(/^#{4,}\s+(.+)/);
        if (h4Match) {
          return (
            <Text key={i} style={styles.mdH4}>{renderInline(h4Match[1])}</Text>
          );
        }
        const h2Match = trimmed.match(/^#{1,3}\s+(.+)/);
        if (h2Match) {
          return (
            <Text key={i} style={styles.mdH2}>{renderInline(h2Match[1])}</Text>
          );
        }

        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <View key={i} style={styles.mdBulletRow}>
              <Text style={styles.mdBulletDot}>•</Text>
              <Text style={[styles.mdText, { flex: 1 }]}>{renderInline(trimmed.slice(2))}</Text>
            </View>
          );
        }

        // Regular paragraph
        return (
          <Text key={i} style={styles.mdText}>{renderInline(trimmed)}</Text>
        );
      })}
    </View>
  );
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold**, *italic*, and "quoted" text
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|"[^""]+")/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={styles.mdBold}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <Text key={i} style={styles.mdItalic}>{part.slice(1, -1)}</Text>;
    }
    if (part.startsWith('"') && part.endsWith('"')) {
      return <Text key={i} style={styles.mdQuote}>"{part.slice(1, -1)}"</Text>;
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

  // Dig Deeper footer
  digDeeperFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  digDeeperText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Markdown — white text on gradient
  mdH2: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginTop: 10,
    marginBottom: 4,
  },
  mdH4: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c084fc',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  mdBold: { fontSize: 15, fontWeight: '800', color: '#fff' },
  mdItalic: { fontSize: 15, fontStyle: 'italic', color: 'rgba(255,255,255,0.9)' },
  mdQuote: { fontSize: 15, fontStyle: 'italic', color: 'rgba(255,255,255,0.85)' },
  mdText: { fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.92)', marginBottom: 4 },
  mdBulletRow: { flexDirection: 'row', marginBottom: 6, paddingLeft: 4 } as any,
  mdBulletDot: { width: 16, fontSize: 15, lineHeight: 22, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
});
