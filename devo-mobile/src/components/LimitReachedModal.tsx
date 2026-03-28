import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import GradientView from './GradientView';

interface Props {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  feature: string;
  used: number;
  max: number;
}

export default function LimitReachedModal({ visible, onClose, onUpgrade, feature, used, max }: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: '#0f172a' }]}>
          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconCircle}>
            <MaterialIcons name="lock" size={28} color="#db2777" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Daily Limit Reached</Text>
          <Text style={styles.subtitle}>
            You've used all {max} free {feature} for today.
          </Text>

          {/* Usage bar */}
          <View style={styles.usageRow}>
            <View style={styles.usageBarBg}>
              <GradientView style={styles.usageBarFill} borderRadius={4} />
            </View>
            <Text style={styles.usageText}>{used} / {max} used</Text>
          </View>

          {/* Resets info */}
          <Text style={styles.resetText}>
            Free usage resets daily at midnight.
          </Text>

          {/* What Premium gets */}
          <View style={styles.premiumFeatures}>
            <Text style={styles.premiumLabel}>WITH PREMIUM</Text>
            {[
              'Unlimited Verse Chat',
              'Unlimited Dig Deeper',
              'Unlimited Cross-References',
              'Unlimited Immersive TTS',
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <MaterialIcons name="check-circle" size={16} color="#486bec" />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            onPress={() => { onClose(); onUpgrade(); }}
            activeOpacity={0.85}
            style={{ width: '100%' }}
          >
            <GradientView style={styles.ctaBtn} borderRadius={14}>
              <View style={styles.ctaBtnInner}>
                <Text style={styles.ctaBtnText}>Upgrade to Premium</Text>
              </View>
            </GradientView>
          </TouchableOpacity>

          {/* Dismiss */}
          <TouchableOpacity onPress={onClose} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: Spacing.lg + 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: 4,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(219, 39, 119, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e6edf7',
    letterSpacing: -1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: '#9aa5b8',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  usageRow: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  usageBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 4,
  },
  usageBarFill: {
    height: 6,
    width: '100%',
  },
  usageText: {
    fontSize: 11,
    color: '#db2777',
    fontWeight: '600',
    textAlign: 'right',
  },
  resetText: {
    fontSize: FontSize.xs,
    color: '#6b7a94',
    marginBottom: Spacing.lg,
  },
  premiumFeatures: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  premiumLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#6b7a94',
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  featureText: {
    fontSize: FontSize.sm,
    color: '#e6edf7',
  },
  ctaBtn: {
    width: '100%',
    paddingVertical: 15,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 5,
  },
  ctaBtnInner: {
    alignItems: 'center',
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  dismissBtn: {
    paddingVertical: Spacing.md,
  },
  dismissText: {
    fontSize: FontSize.sm,
    color: '#6b7a94',
  },
});
