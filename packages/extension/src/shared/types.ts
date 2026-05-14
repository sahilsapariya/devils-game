// Shared type definitions for the extension subsystem.

export type DomainType = 'distraction' | 'productive' | 'neutral';

export interface DomainClassification {
  isDistraction: boolean;
  isProductive: boolean;
  type: DomainType;
}

export type OperationalStatus =
  | 'DORMANT'
  | 'MONITORING'
  | 'OPERATIONAL'
  | 'CRITICAL'
  | 'RECOVERY'
  | 'EXTRACTION'
  | 'SILENCE';

export interface RoundState {
  status: OperationalStatus;
  roundId: string | null;
  startedAt: number | null;
  // Cached server timestamp for staleness checks (epoch ms).
  cachedAt: number;
}

export type TelemetryEventType =
  | 'tab_activated'
  | 'tab_updated'
  | 'distraction_detected'
  | 'overlay_shown'
  | 'overlay_dismissed'
  | 'domain_dwell';

export interface TelemetryEvent {
  // Random UUID-ish id (crypto.randomUUID when available).
  id: string;
  type: TelemetryEventType;
  // Epoch ms when the event was produced on-device.
  timestamp: number;
  // Domain only — never a full URL.
  domain: string;
  classification: DomainType;
  // Optional ms-of-dwell for domain_dwell events.
  dwellMs?: number;
  // Tab id for correlating events from the same tab.
  tabId?: number;
  // Operational round id at time of capture.
  roundId?: string | null;
}

export interface TelemetryBatch {
  // Random batch id; clients can use this for idempotency on the server.
  batchId: string;
  // Browser fingerprint kept intentionally minimal: just an opaque device id.
  deviceId: string;
  // 'chrome' | 'firefox' | 'edge' — non-identifying.
  browser: string;
  events: TelemetryEvent[];
}

// Messages exchanged between background <-> content scripts.
export type ExtensionMessage =
  | {
      type: 'distraction-warning';
      domain: string;
      operational: boolean;
    }
  | {
      type: 'dismiss-overlay';
    };
