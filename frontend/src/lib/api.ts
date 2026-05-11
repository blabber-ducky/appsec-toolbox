import type {
  ResultsResponse,
  ScanLogsResponse,
  StartScanResponse,
  ToolsRegistry,
} from "@/types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  getTools: () => request<ToolsRegistry>("/tools"),

  startScan: (formData: FormData) =>
    request<StartScanResponse>("/scan/start", { method: "POST", body: formData }),

  getResults: (scanId: string) =>
    request<ResultsResponse>(`/results/${scanId}`),

  getScanLogs: (scanId: string) =>
    request<ScanLogsResponse>(`/results/${scanId}/logs`),

  csvExportUrl: (scanId: string, columnKeys: string[]) => {
    const params = columnKeys.length ? `?columns=${columnKeys.join(",")}` : "";
    return `${BASE}/results/${scanId}/export/csv${params}`;
  },

  spdxExportUrl: (scanId: string) =>
    `${BASE}/results/${scanId}/export/spdx`,

  scanWsUrl: (scanId: string): string => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/scan/logs/${scanId}`;
  },
};
