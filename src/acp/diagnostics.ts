import type { DiagnosticsLevel, DiagnosticsReport } from '../types/diagnostics';

export async function getDiagnosticsReport(
  _sessionId: string,
  _level: DiagnosticsLevel
): Promise<DiagnosticsReport> {
  return { entries: [] } as unknown as DiagnosticsReport;
}
