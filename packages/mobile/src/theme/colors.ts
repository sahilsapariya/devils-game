/**
 * Operational color palette for PROJECT EXTRACTION.
 *
 * Monochrome by design. Color is information, not decoration.
 * Operational red signals critical states; cool blue signals recovery.
 * Bone-white text on deep black evokes terminal/surveillance hardware.
 */

export const colors = {
  // Surfaces
  background: '#0A0A0A',
  backgroundElevated: '#101010',
  surface: '#141414',
  surfaceAlt: '#191919',

  // Borders & dividers
  border: '#222222',
  borderStrong: '#2E2E2E',
  borderDim: '#1A1A1A',

  // Text
  text: {
    primary: '#E8E8E8',
    secondary: '#888888',
    tertiary: '#555555',
    inverse: '#0A0A0A',
    operational: '#FF3333',
    recovery: '#3366CC',
  },

  // Accents (state-driven)
  accent: {
    operational: '#FF3333',
    operationalDim: '#A52222',
    critical: '#FF1F1F',
    warning: '#E6A23C',
    recovery: '#3366CC',
    recoveryDim: '#1F3F80',
    nominal: '#E8E8E8',
    extraction: '#888888',
  },

  // Status indicators
  status: {
    online: '#3FA34D',
    offline: '#888888',
    degraded: '#E6A23C',
    severed: '#FF3333',
  },

  // Overlay layers
  overlay: {
    scrim: 'rgba(0,0,0,0.85)',
    scrimSoft: 'rgba(0,0,0,0.55)',
    redWash: 'rgba(255,51,51,0.08)',
    blueWash: 'rgba(51,102,204,0.08)',
  },
} as const;

export type Colors = typeof colors;
