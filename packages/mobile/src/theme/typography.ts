/**
 * Operational typography.
 *
 * Monospace primary — terminal aesthetic. System mono on each platform.
 * Hierarchy is established through size and tracking, not weight variation.
 */
import { Platform } from 'react-native';

const monoFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'Menlo',
});

const sansFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

export const typography = {
  fonts: {
    mono: monoFamily as string,
    sans: sansFamily as string,
  },
  sizes: {
    micro: 10,
    caption: 11,
    body: 13,
    bodyLg: 15,
    label: 12,
    heading: 18,
    title: 24,
    display: 48,
    chrono: 64,
  },
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 1,
    wider: 2,
    widest: 3,
  },
  lineHeights: {
    tight: 1.1,
    normal: 1.35,
    relaxed: 1.6,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    bold: '700' as const,
  },
} as const;

export type Typography = typeof typography;
