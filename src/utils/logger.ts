const ts = () => new Date().toISOString().replace("T", " ").substring(0, 19);

export interface LogEvent {
  type: "step" | "info" | "warn" | "error";
  timestamp: string;
  stepNumber?: number;
  totalSteps?: number;
  message: string;
}

type LogListener = (event: LogEvent) => void;
const listeners = new Set<LogListener>();

export function addLogListener(listener: LogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(event: LogEvent) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {}
  }
}

export const log = {
  step: (n: number, total: number, msg: string) => {
    const timestamp = ts();
    console.log(`[${timestamp}] [${n}/${total}] ${msg}`);
    notify({ type: "step", timestamp, stepNumber: n, totalSteps: total, message: msg });
  },
  info: (msg: string) => {
    const timestamp = ts();
    console.log(`[${timestamp}] ${msg}`);
    notify({ type: "info", timestamp, message: msg });
  },
  warn: (msg: string) => {
    const timestamp = ts();
    console.warn(`[${timestamp}] WARN ${msg}`);
    notify({ type: "warn", timestamp, message: msg });
  },
  error: (msg: string, err?: unknown) => {
    const timestamp = ts();
    console.error(`[${timestamp}] ERROR ${msg}`);
    if (err instanceof Error) console.error(err.stack);
    else if (err) console.error(err);
    const errText = err instanceof Error ? err.message : String(err || "");
    notify({ type: "error", timestamp, message: `${msg} ${errText}`.trim() });
  },
};
