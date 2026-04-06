export const Colors = {
  dark: {
    background: '#0b1220',
    backgroundSecondary: '#10172b',
    surface: 'rgba(17, 26, 47, 0.9)',
    surfaceHighlight: '#222c4a',
    surfaceGlass: 'rgba(15, 23, 42, 0.6)',
    text: '#e6edf7',
    textSecondary: '#9aa5b8',
    textMuted: '#6b7a94',
    primary: '#486bec',
    primaryLight: 'rgba(72, 107, 236, 0.15)',
    accent: '#db2777',
    accentLight: 'rgba(219, 39, 119, 0.12)',
    accentGlow: 'rgba(236, 72, 153, 0.45)',
    border: 'rgba(255, 255, 255, 0.08)',
    borderFocus: 'rgba(124, 195, 255, 0.5)',
    verseNumber: '#486bec',
    favorite: '#c83086',
    tabBar: '#0d1628',
    tabBarBorder: 'rgba(255, 255, 255, 0.06)',
    // Glass elements
    glassBackground: 'rgba(255, 255, 255, 0.07)',
    glassBorder: 'rgba(255, 255, 255, 0.08)',
    glassHighlight: 'rgba(255, 255, 255, 0.14)',
    // Gradient (used as start/end for LinearGradient or styled buttons)
    gradientStart: '#486bec',
    gradientEnd: '#db2777',
    // Quote/highlight
    quoteText: '#a5b4fc',
  },
  light: {
    background: '#f5f5fa',
    backgroundSecondary: '#ecedf2',
    surface: '#ffffff',
    surfaceHighlight: '#f0f0f5',
    surfaceGlass: 'rgba(255, 255, 255, 0.85)',
    text: '#1a1a2e',
    textSecondary: '#5a6478',
    textMuted: '#8a95a8',
    primary: '#486bec',
    primaryLight: 'rgba(72, 107, 236, 0.08)',
    accent: '#db2777',
    accentLight: 'rgba(219, 39, 119, 0.08)',
    accentGlow: 'rgba(236, 72, 153, 0.2)',
    border: 'rgba(0, 0, 0, 0.08)',
    borderFocus: 'rgba(72, 107, 236, 0.5)',
    verseNumber: '#486bec',
    favorite: '#c83086',
    tabBar: '#ffffff',
    tabBarBorder: 'rgba(0, 0, 0, 0.06)',
    glassBackground: 'rgba(0, 0, 0, 0.03)',
    glassBorder: 'rgba(0, 0, 0, 0.06)',
    glassHighlight: 'rgba(0, 0, 0, 0.05)',
    gradientStart: '#486bec',
    gradientEnd: '#db2777',
    quoteText: '#6366f1',
  },
};

export const Spacing = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 30,
  xl: 40,
  xxl: 56,
};

export const FontSize = {
  xs: 15,
  sm: 17,
  md: 19,
  lg: 21,
  xl: 28,
  xxl: 34,
  title: 38,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

// PWA-style label typography mixin values
export const LabelStyle = {
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: 1.5,
  fontWeight: '700' as const,
};

// Gradient colors for inline styles (since RN doesn't support CSS gradients natively)
export const Gradient = {
  primary: ['#486bec', '#db2777'] as [string, string],
  dark: ['#0b1220', '#10172b'] as [string, string],
  accent: ['#ec4899', '#db2777'] as [string, string],
};
