export type ScanType = "SAST" | "SCA" | "IaC" | "Build" | "Secrets" | "Mobile";
export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "UNKNOWN";
export type ScanStatus = "pending" | "running" | "complete" | "failed";
export type InputType = "zip" | "git" | "image_tar" | "image_ref";

export interface ToolConfig {
  id: string;
  name: string;
  image: string;
  tooltip: string;
  hint: string;
  supports_spdx: boolean;
  input_type: "source" | "image";
}

export interface ToolsRegistry {
  tools: {
    sast: ToolConfig[];
    sca: ToolConfig[];
    iac: ToolConfig[];
    build: ToolConfig[];
    secrets: ToolConfig[];
    mobile: ToolConfig[];
  };
}

export interface ScanLogMessage {
  type: "log" | "stage" | "done" | "ping";
  message?: string;
  label?: string;
  status?: string;
}

export interface ScanLogsResponse {
  scan_id: string;
  logs: ScanLogMessage[];
}

export interface ColumnMeta {
  key: string;
  label: string;
  description: string;
  default: boolean;
}

export interface Finding {
  id: string;
  tool: string;
  scan_type: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  location: string;
  rule_id: string;
  cve: string | null;
  fix_version: string | null;
  references: string[];
  raw: Record<string, unknown>;
}

export interface ResultsResponse {
  scan_id: string;
  status: ScanStatus;
  error: string | null;
  tool_id: string;
  scan_type: string;
  total: number;
  findings: Finding[];
  columns: ColumnMeta[];
  has_spdx: boolean;
}

export interface StartScanResponse {
  scan_id: string;
  session_id: string;
}

export type StageStatus = "running" | "done" | "error";

export interface StageInfo {
  label: string;
  status: StageStatus;
}

export interface WsMessage {
  type: "log" | "stage" | "done" | "ping";
  message?: string;
  status?: ScanStatus | StageStatus;
  label?: string;
}
