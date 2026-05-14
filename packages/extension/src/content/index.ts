// Content script. Injects the operational warning overlay when the
// background service worker reports a distraction during an active round.
//
// Security:
//   - All DOM is constructed with document.createElement + textContent.
//   - We never call innerHTML with any value, dynamic or otherwise.
//   - No inline scripts, no eval — CSP-safe.

import type { ExtensionMessage } from '../shared/types';

const OVERLAY_ID = 'extraction-overlay-root';
const OVERLAY_CLASS = 'extraction-overlay';
const AUTO_REMOVE_MS = 5000;

let activeOverlay: HTMLElement | null = null;
let activeTimer: number | null = null;
let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

function removeOverlay(): void {
  if (activeTimer != null) {
    window.clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler, true);
    escapeHandler = null;
  }
  if (activeOverlay && activeOverlay.parentNode) {
    activeOverlay.parentNode.removeChild(activeOverlay);
  }
  activeOverlay = null;
  // Also clean up any stray duplicates.
  const stray = document.getElementById(OVERLAY_ID);
  if (stray && stray.parentNode) {
    stray.parentNode.removeChild(stray);
  }
}

function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  for (const [key, value] of Object.entries(styles)) {
    // CSSStyleDeclaration assignment is intentional here; values are static
    // string literals from this module, never dynamic content.
    (el.style as unknown as Record<string, string>)[key] = value as string;
  }
}

function buildOverlay(domain: string): HTMLElement {
  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.className = OVERLAY_CLASS;
  // Defense-in-depth: also set role so screen readers announce it.
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Distraction detected');

  applyStyles(root, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2147483647',
    fontFamily:
      "ui-monospace, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    letterSpacing: '0.05em',
    textAlign: 'center',
    padding: '32px',
    boxSizing: 'border-box',
    cursor: 'default',
    userSelect: 'none',
  });

  const title = document.createElement('div');
  title.className = `${OVERLAY_CLASS}__title`;
  title.textContent = 'DISTRACTION DETECTED';
  applyStyles(title, {
    color: '#FF3333',
    fontSize: '48px',
    fontWeight: '700',
    marginBottom: '24px',
    textTransform: 'uppercase',
  });

  const subtitle = document.createElement('div');
  subtitle.className = `${OVERLAY_CLASS}__subtitle`;
  subtitle.textContent = domain; // textContent — safe from injection.
  applyStyles(subtitle, {
    color: '#ffffff',
    fontSize: '20px',
    opacity: '0.85',
    marginBottom: '32px',
  });

  const body = document.createElement('div');
  body.className = `${OVERLAY_CLASS}__body`;
  body.textContent = 'Return to operation immediately.';
  applyStyles(body, {
    color: '#ffffff',
    fontSize: '18px',
    marginBottom: '24px',
    maxWidth: '720px',
    lineHeight: '1.5',
  });

  const footer = document.createElement('div');
  footer.className = `${OVERLAY_CLASS}__footer`;
  footer.textContent = 'Operational pressure escalating.';
  applyStyles(footer, {
    color: '#FF3333',
    fontSize: '14px',
    opacity: '0.8',
    marginTop: '16px',
    textTransform: 'uppercase',
  });

  const hint = document.createElement('div');
  hint.className = `${OVERLAY_CLASS}__hint`;
  hint.textContent = 'Press ESC to dismiss';
  applyStyles(hint, {
    color: '#888888',
    fontSize: '12px',
    marginTop: '32px',
    opacity: '0.6',
  });

  root.appendChild(title);
  root.appendChild(subtitle);
  root.appendChild(body);
  root.appendChild(footer);
  root.appendChild(hint);
  return root;
}

function showOverlay(domain: string): void {
  // Avoid duplicate overlays on rapid successive messages.
  removeOverlay();

  // Some pages (e.g. iframes, edge cases) may not have document.body yet.
  if (!document.body) return;

  const overlay = buildOverlay(domain);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  activeTimer = window.setTimeout(() => {
    removeOverlay();
  }, AUTO_REMOVE_MS);

  escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      removeOverlay();
    }
  };
  document.addEventListener('keydown', escapeHandler, true);
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  if (message.type === 'distraction-warning') {
    if (!message.operational) return; // Background already gates this, but double-check.
    if (typeof message.domain !== 'string' || message.domain.length === 0) return;
    showOverlay(message.domain);
  } else if (message.type === 'dismiss-overlay') {
    removeOverlay();
  }
});
