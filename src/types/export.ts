export interface ExportFileSummary {
  path: string;
  bytes: number;
}

export interface LeakageFinding {
  path: string;
  reason: string;
}

export interface ExportCheckResult {
  ok: boolean;
  files: ExportFileSummary[];
  findings: LeakageFinding[];
}
