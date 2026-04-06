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
import * as H from '../utils/haptics';

interface Action {
  icon: string;
  label: string;
  onPress: () => void;
  premium?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  verseNum: string;
  verseText: string;
  isFavorite: boolean;
  isHighlighted: boolean;
  hasComment: boolean;
  actions: Action[];
}

export default function VerseActionSheet({
  visible,
  onClose,
  verseNum,
  verseText,
  isFavorite,
  isHighlighted,
  hasComment,
  actions,
}: Props) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
        {/* Verse preview */}
        <View style={[styles.preview, { backgroundColor: theme.background }]}>
          <Text style={[styles.previewNum, { color: theme.primary }]}>v{verseNum}</Text>
          <Text style={[styles.previewText, { color: theme.textSecondary }]} numberOfLines={2}>
            {verseText}
          </Text>
        </View>

        {/* Status badges */}
        <View style={styles.badges}>
          {isFavorite && (
            <View style={[styles.badge, { backgroundColor: 'rgba(200,48,134,0.15)' }]}>
              <MaterialIcons name="favorite" size={12} color={theme.favorite} />
              <Text style={[styles.badgeText, { color: theme.favorite }]}>Favorited</Text>
            </View>
          )}
          {isHighlighted && (
            <View style={[styles.badge, { backgroundColor: 'rgba(72,107,236,0.15)' }]}>
              <MaterialIcons name="highlight" size={12} color={theme.primary} />
              <Text style={[styles.badgeText, { color: theme.primary }]}>Highlighted</Text>
            </View>
          )}
          {hasComment && (
            <View style={[styles.badge, { backgroundColor: 'rgba(72,107,236,0.15)' }]}>
              <MaterialIcons name="comment" size={12} color={theme.primary} />
              <Text style={[styles.badgeText, { color: theme.primary }]}>Has Note</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {actions.map((action, i) => (
            <TouchableOpacity
              key={action.label}
              style={[
                styles.actionRow,
                i < actions.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 0.5 },
                action.disabled && { opacity: 0.4 },
              ]}
              onPress={() => {
                if (!action.disabled) {
                  H.tap();
                  onClose();
                  action.onPress();
                }
              }}
              activeOpacity={0.7}
              disabled={action.disabled}
            >
              <MaterialIcons
                name={action.icon as any}
                size={20}
                color={action.destructive ? '#ef4444' : theme.textSecondary}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: action.destructive ? '#ef4444' : theme.text },
                ]}
              >
                {action.label}
              </Text>
              {action.premium && (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumText}>PRO</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel */}
        <TouchableOpacity
          style={[styles.cancelBtn, { backgroundColor: theme.background }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  preview: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  previewNum: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  previewText: {
    fontSize: FontSize.sm,
    flex: 1,
    lineHeight: 20,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    marginBottom: Spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  actionLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
    flex: 1,
  },
  premiumBadge: {
    backgroundColor: 'rgba(72,107,236,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  premiumText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#486bec',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  cancelText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
