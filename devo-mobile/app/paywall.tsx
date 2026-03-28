import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '../src/store/useStore';
import { Spacing, FontSize, BorderRadius } from '../src/constants/theme';
import { useTheme } from '../src/hooks/useTheme';
import GradientView from '../src/components/GradientView';

const FEATURES = [
  { icon: 'auto-awesome' as const, label: 'Unlimited AI study tools' },
  { icon: 'headphones' as const, label: 'Unlimited Immersive TTS' },
  { icon: 'chat-bubble-outline' as const, label: 'Unlimited Verse Chat' },
  { icon: 'translate' as const, label: 'Unlimited Dig Deeper' },
];

export default function PaywallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { setPremium } = useStore();

  const handlePurchase = (plan: string) => {
    Alert.alert(
      'Coming Soon',
      `The ${plan} plan will be available once the app is on the App Store. For now, you can use dev mode to test premium features.`,
      [
        { text: 'OK' },
        {
          text: 'Activate Dev Mode',
          onPress: () => {
            setPremium(true);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={22} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Brand */}
        <Text style={styles.brand}>devo.</Text>

        <Text style={[styles.title, { color: theme.text }]}>Unlock Full Power</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Go deeper into Scripture with{'\n'}unlimited access to every AI study tool.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: theme.primaryLight }]}>
                <MaterialIcons name={f.icon} size={18} color={theme.primary} />
              </View>
              <Text style={[styles.featureText, { color: theme.text }]}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* Annual — primary CTA */}
        <TouchableOpacity
          onPress={() => handlePurchase('annual')}
          activeOpacity={0.85}
          style={{ width: '100%', marginBottom: Spacing.sm }}
        >
          <GradientView style={styles.btnPrimary} borderRadius={BorderRadius.lg}>
            <Text style={styles.btnPrimaryLabel}>Annual — Best Value</Text>
            <Text style={styles.btnPrimaryPrice}>$19.99/year <Text style={styles.btnSub}>($1.67/mo)</Text></Text>
          </GradientView>
        </TouchableOpacity>

        {/* Monthly */}
        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: theme.glassBorder }]}
          onPress={() => handlePurchase('monthly')}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnSecLabel, { color: theme.primary }]}>Monthly</Text>
          <Text style={[styles.btnSecPrice, { color: theme.primary }]}>$2.99/month</Text>
        </TouchableOpacity>

        {/* Lifetime */}
        <TouchableOpacity
          style={[styles.btnLifetime, { borderColor: 'rgba(219,39,119,0.3)' }]}
          onPress={() => handlePurchase('lifetime')}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnSecLabel, { color: theme.accent }]}>Lifetime — One-time</Text>
          <Text style={[styles.btnSecPrice, { color: theme.accent }]}>$49.99 forever</Text>
        </TouchableOpacity>

        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          Your support helps keep Devo free for everyone{'\n'}and funds an indie developer's mission to make{'\n'}Bible study accessible to all.
        </Text>

        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={() => Alert.alert('Restore', 'Will be available on App Store launch.')}
        >
          <Text style={[styles.restoreText, { color: theme.primary }]}>Restore Purchase</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.lg,
    alignItems: 'center',
    paddingTop: Spacing.xxl + 16,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.sm,
  },
  brand: {
    fontSize: 42,
    fontFamily: 'EditorsNote-Italic',
    color: '#db2777',
    letterSpacing: -1,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  features: {
    alignSelf: 'stretch',
    gap: 14,
    marginBottom: Spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  btnPrimary: {
    alignItems: 'center',
    paddingVertical: 16,
    shadowColor: '#486bec',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 6,
  },
  btnPrimaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  btnPrimaryPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  btnSub: {
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.7,
  },
  btnSecondary: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(72, 107, 236, 0.08)',
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  btnLifetime: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(219, 39, 119, 0.06)',
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  btnSecLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  btnSecPrice: {
    fontSize: 17,
    fontWeight: '700',
  },
  footerText: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  restoreBtn: {
    padding: Spacing.sm,
  },
  restoreText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
