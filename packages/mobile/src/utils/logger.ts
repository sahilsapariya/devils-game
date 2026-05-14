/**
 * Structured logger. Outputs operational-style key=value lines via console.*
 * so the mobile runtime keeps a uniform log shape across services. Never
 * logs tokens or secrets; consumers must redact before passing fields.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

function serializeFields(fields: LogFields | undefined): string {
  if (!fields) return '';
  const parts: string[] = [];
  for (const key of Object.keys(fields)) {
    const raw = fields[key];
    let value: string;
    if (raw === undefined) {
      value = 'undefined';
    } else if (raw === null) {
      value = 'null';
    } else if (typeof raw === 'string') {
      value = raw.includes(' ') ? `"${raw.replace(/"/g, '\\"')}"` : raw;
    } else if (typeof raw === 'number' || typeof raw === 'boolean') {
      value = String(raw);
    } else {
      try {
        value = JSON.stringify(raw);
      } catch {
        value = '[unserializable]';
      }
    }
    parts.push(`${key}=${value}`);
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields): void {
  const line = `[${level.toUpperCase()}] ${scope} :: ${message}${serializeFields(fields)}`;
  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console
      console.debug(line);
      return;
    case 'info':
      // eslint-disable-next-line no-console
      console.info(line);
      return;
    case 'warn':
      // eslint-disable-next-line no-console
      console.warn(line);
      return;
    case 'error':
      // eslint-disable-next-line no-console
      console.error(line);
      return;
    default:
      // eslint-disable-next-line no-console
      console.log(line);
  }
}

export interface Logger {
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  child: (childScope: string) => Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, f) => emit('debug', scope, m, f),
    info: (m, f) => emit('info', scope, m, f),
    warn: (m, f) => emit('warn', scope, m, f),
    error: (m, f) => emit('error', scope, m, f),
    child: (childScope: string) => createLogger(`${scope}.${childScope}`),
  };
}

export const log = createLogger('mobile');
