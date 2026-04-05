import { LOG_EVENTS } from './types';

type LogEvent = typeof LOG_EVENTS[keyof typeof LOG_EVENTS];

interface LogEntry {
  event: LogEvent;
  purchase_id?: string;
  line_user_id?: string;
  timestamp: string;
  duration_ms?: number;
  details?: Record<string, unknown>;
}

export function logEvent(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}
