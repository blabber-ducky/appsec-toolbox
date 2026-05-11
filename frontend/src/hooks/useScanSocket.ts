import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ScanStatus, StageInfo, WsMessage } from "@/types";

interface UseScanSocketResult {
  logs: string[];
  stages: StageInfo[];
  status: ScanStatus;
}

export function useScanSocket(
  scanId: string,
  onComplete: (status: ScanStatus) => void
): UseScanSocketResult {
  const [logs, setLogs] = useState<string[]>([]);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [status, setStatus] = useState<ScanStatus>("running");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!scanId) return;

    const ws = new WebSocket(api.scanWsUrl(scanId));

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;

        if (msg.type === "log" && msg.message) {
          setLogs((prev) => [...prev, msg.message!]);

        } else if (msg.type === "stage" && msg.label) {
          const info: StageInfo = {
            label: msg.label,
            status: (msg.status as StageInfo["status"]) ?? "running",
          };
          // Upsert by label — preserves insertion order, updates status in place
          setStages((prev) => {
            const idx = prev.findIndex((s) => s.label === msg.label);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = info;
              return next;
            }
            return [...prev, info];
          });

        } else if (msg.type === "done") {
          const finalStatus = (msg.status as ScanStatus) ?? "complete";
          setStatus(finalStatus);
          ws.close();
          onCompleteRef.current(finalStatus);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      setLogs((prev) => [...prev, "ERROR: WebSocket connection lost."]);
      setStatus("failed");
      onCompleteRef.current("failed");
    };

    return () => ws.close();
  }, [scanId]);

  return { logs, stages, status };
}
