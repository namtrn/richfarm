/**
 * Structured detector logging. One JSON object per line on stdout so operators
 * can grep/ship it. Fields are bounded identifiers and counters only — never
 * content bodies, credentials, or user data.
 */
export interface DetectorLogFields {
  event: string;
  runId?: string;
  rootKey?: string;
  mode?: string;
  durationMs?: number;
  pathsInspected?: number;
  metadataComparisons?: number;
  filesHashed?: number;
  eventsProduced?: number;
  deletionsDetected?: number
  quarantined?: number;
  complete?: boolean;
  phase?: string;
  ownerId?: string;
  cursor?: string;
  processed?: number;
  [key: string]: unknown;
}

export type DetectorLogSink = (line: string) => void;

const defaultSink: DetectorLogSink = (line) => {
  // eslint-disable-next-line no-console
  console.log(line);
};

let sink: DetectorLogSink = defaultSink;
let enabled = process.env.CONTENT_SOURCE_LOG !== "false";

export function setDetectorLogSink(next: DetectorLogSink | null): void {
  sink = next ?? defaultSink;
}

export function setDetectorLogEnabled(next: boolean): void {
  enabled = next;
}

export function logDetector(fields: DetectorLogFields): void {
  if (!enabled) return;
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    component: "content-source",
    ...fields,
  };
  try {
    sink(JSON.stringify(payload));
  } catch {
    // Logging must never break detection.
  }
}
