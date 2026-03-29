import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useStore, FREE_LIMITS } from '../../src/store/useStore';
import { Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    isPremium, setPremium, colorScheme, toggleTheme, dailyLimits,
    clearAllData, userName, setUserName, notes, favorites,
  } = useStore();

  const settingsRows = [
    {
      icon: 'palette' as const,
      label: 'Appearance',
      value: colorScheme === 'dark' ? 'Dark' : 'Light',
      onPress: toggleTheme,
    },
    {
      icon: 'person-outline' as const,
      label: 'Your Name',
      value: userName || 'Not set',
      onPress: () => {
        Alert.prompt?.(
          'Your Name',
          'Enter your name for a personalized experience',
          (name: string) => { if (name.trim()) setUserName(name.trim()); },
          'plain-text',
          userName
        ) ?? Alert.alert('Name', 'Edit name from onboarding settings');
      },
    },
    {
      icon: 'star' as const,
      label: isPremium ? 'Premium Active' : 'Upgrade to Premium',
      value: isPremium ? '✦' : '',
      onPress: () => router.push('/paywall'),
      accent: !isPremium,
    },
    {
      icon: 'replay' as const,
      label: 'Restore Purchase',
      value: '',
      onPress: () => Alert.alert('Restore', 'Restore will be available once connected to App Store.'),
    },
    {
      icon: 'delete-outline' as const,
      label: 'Delete All My Data',
      value: '',
      onPress: () => {
        Alert.alert(
          'Delete All Data',
          `This will remove all your favorites (${Object.keys(favorites).length}), notes (${notes.length}), highlights, comments, and preferences. This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await clearAllData();
                Alert.alert('Done', 'All data has been deleted.');
              },
            },
          ]
        );
      },
      destructive: true,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.header, { color: theme.text }]}>Settings</Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats card */}
        <View style={[styles.statsCard, { backgroundColor: theme.surface }]}>
          <Text style={[styles.statsTitle, { color: theme.text }]}>Your Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: theme.accent }]}>
                {Object.keys(favorites).length}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Favorites</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: theme.accent }]}>{notes.length}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>Notes</Text>
            </View>
          </View>
        </View>

        {/* Usage card */}
        {!isPremium && (
          <View style={[styles.usageCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.usageTitle, { color: theme.text }]}>Today's Free Usage</Text>
            <View style={styles.usageRows}>
              <UsageRow
                label="Verse Chat"
                used={dailyLimits.verseChat}
                max={FREE_LIMITS.verseChat}
                theme={theme}
              />
              <UsageRow
                label="Dig Deeper"
                used={dailyLimits.digDeeper}
                max={FREE_LIMITS.digDeeper}
                theme={theme}
              />
              <UsageRow
                label="Cross-References"
                used={dailyLimits.crossRef}
                max={FREE_LIMITS.crossRef}
                theme={theme}
              />
              <UsageRow
                label="Immersive TTS"
                used={dailyLimits.immersiveTts}
                max={FREE_LIMITS.immersiveTts}
                theme={theme}
              />
            </View>
            <Text style={[styles.usageNote, { color: theme.textMuted }]}>
              Resets daily. Context Summary, Quick Context, and Reflections are always free.
            </Text>
          </View>
        )}

        {/* Settings rows */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {settingsRows.map((row, i) => (
            <TouchableOpacity
              key={row.label}
              style={[
                styles.row,
                i < settingsRows.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
              ]}
              onPress={row.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <MaterialIcons
                  name={row.icon}
                  size={22}
                  color={row.destructive ? '#ef4444' : row.accent ? theme.accent : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.rowLabel,
                    { color: row.destructive ? '#ef4444' : theme.text },
                    row.accent && { color: theme.accent, fontWeight: '700' },
                  ]}
                >
                  {row.label}
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: theme.textMuted }]}>{row.value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.brand}>devo.</Text>
        <Text style={[styles.footer, { color: theme.textMuted }]}>
          v1.0.0 • Made with ♥ by chaelri
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageRow({ label, used, max, theme }: any) {
  const remaining = Math.max(0, max - used);
  const pct = Math.min(1, used / max);

  return (
    <View style={styles.usageRow}>
      <View style={styles.usageRowTop}>
        <Text style={[styles.usageLabel, { color: theme.textSecondary }]}>{label}</Text>
        <Text style={[styles.usageCount, { color: remaining === 0 ? theme.accent : theme.text }]}>
          {remaining} / {max}
        </Text>
      </View>
      <View style={[styles.usageBar, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.usageBarFill,
            {
              width: `${pct * 100}%`,
              backgroundColor: pct >= 1 ? theme.accent : theme.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -2.5,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statsCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  statsTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
  },
  stat: { alignItems: 'center' },
  statNum: { fontSize: FontSize.xxl, fontWeight: '700' },
  statLabel: { fontSize: FontSize.xs, marginTop: 2 },
  usageCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  usageTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  usageRows: { gap: Spacing.md },
  usageRow: { gap: 4 },
  usageRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageLabel: { fontSize: FontSize.sm },
  usageCount: { fontSize: FontSize.sm, fontWeight: '600' },
  usageBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  usageNote: {
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
    lineHeight: 16,
  },
  section: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: FontSize.md,
  },
  footer: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
  // devo. brand in footer
  brand: {
    fontSize: 28,
    fontFamily: 'EditorsNote-Italic',
    color: '#db2777',
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 4,
  },
});
