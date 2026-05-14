export { colors } from './colors';
export type { Colors } from './colors';

export { typography } from './typography';
export type { Typography } from './typography';

export { spacing, radius, hairline } from './spacing';
export type { Spacing } from './spacing';

import { colors } from './colors';
import { typography } from './typography';
import { spacing, radius, hairline } from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
  radius,
  hairline,
} as const;

export type Theme = typeof theme;
