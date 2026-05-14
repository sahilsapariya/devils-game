/**
 * Operational spacing grid. 4px base unit.
 * Standardized values avoid arbitrary padding decisions.
 */

export const spacing = {
  xxs: 2,
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  none: 0,
  sharp: 2,
  soft: 4,
  card: 6,
  pill: 999,
} as const;

export const hairline = 1;

export type Spacing = typeof spacing;
