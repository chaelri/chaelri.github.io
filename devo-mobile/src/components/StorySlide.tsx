import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BorderRadius } from '../constants/theme';
import type { StorySegment, AtAGlance } from '../services/ai';
import { getDigDeeperForSegment } from '../services/ai';
import * as H from '../utils/haptics';

import AtAGlanceSlide from './slides/AtAGlanceSlide';
import ChapterMapSlide from './slides/ChapterMapSlide';
import ConversationSlide from './slides/ConversationSlide';
import NarrationSlide from './slides/NarrationSlide';
import TeachingSlide from './slides/TeachingSlide';
import ListSlide from './slides/ListSlide';
import ContrastSlide from './slides/ContrastSlide';
import SequenceSlide from './slides/SequenceSlide';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SegmentSlideProps {
  segment: StorySegment;
  theme: any;
  bookName: string;
  chapter: number;
}

function renderBold(text: string, boldColor: string, baseColor: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={i} style={{ fontWeight: '800', color: boldColor }}>{part.slice(2, -2)}</Text>;
    }
    return part;
  });
}

export function SegmentSlideRouter({ segment, theme, bookName, chapter }: SegmentSlideProps) {
  const [digDeeperContent, setDigDeeperContent] = useState<string | null>(null);
  const [digDeeperLoading, setDigDeeperLoading] = useState(false);
  const [showDigDeeper, setShowDigDeeper] = useState(false);

  const loadDigDeeper = async () => {
    if (digDeeperContent) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      H.tap();
      setShowDigDeeper(!showDigDeeper);
      return;
    }
    H.sparkleRhythm();
    setDigDeeperLoading(true);
    setShowDigDeeper(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      const result = await getDigDeeperForSegment(bookName, chapter, segment.verses, segment.title);
      H.stopSparkle();
      H.success();
      setDigDeeperContent(result);
    } catch {
      H.stopSparkle();
      H.error();
      setDigDeeperContent('Failed to load. Tap to retry.');
    } finally {
      setDigDeeperLoading(false);
    }
  };

  const renderContent = () => {
    switch (segment.displayType) {
      case 'conversation':
        return <ConversationSlide segment={segment} theme={theme} />;
      case 'teaching':
        return <TeachingSlide segment={segment} theme={theme} />;
      case 'list':
        return <ListSlide segment={segment} theme={theme} />;
      case 'contrast':
        return <ContrastSlide segment={segment} theme={theme} />;
      case 'sequence':
        return <SequenceSlide segment={segment} theme={theme} />;
      case 'narration':
      default:
        return <NarrationSlide segment={segment} theme={theme} />;
    }
  };

  return (
    <View style={styles.segmentWrap}>
      {renderContent()}

      {/* Dig Deeper */}
      <View style={styles.digDeeperWrap}>
          <TouchableOpacity
            style={[styles.digDeeperBtn, { borderColor: theme.glassBorder }]}
            onPress={loadDigDeeper}
            activeOpacity={0.7}
          >
            <MaterialIcons name="school" size={16} color={theme.textMuted} />
            <Text style={[styles.digDeeperLabel, { color: theme.textMuted }]}>
              {showDigDeeper ? 'Hide Details' : 'Dig Deeper'}
            </Text>
            {digDeeperLoading ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <MaterialIcons name={showDigDeeper ? 'expand-less' : 'expand-more'} size={18} color={theme.textMuted} />
            )}
          </TouchableOpacity>
          {showDigDeeper && digDeeperContent && (
            <Text style={[styles.digDeeperText, { color: theme.textSecondary }]}>
              {renderBold(digDeeperContent, theme.text, theme.textSecondary)}
            </Text>
          )}
          {showDigDeeper && digDeeperLoading && (
            <Text style={[styles.digDeeperText, { color: theme.textMuted }]}>Generating deeper insights...</Text>
          )}
        </View>
    </View>
  );
}

export { AtAGlanceSlide, ChapterMapSlide };

const styles = StyleSheet.create({
  segmentWrap: {
    flex: 1,
  },
  digDeeperWrap: {
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  digDeeperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  digDeeperLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  digDeeperText: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 26,
  },
});
