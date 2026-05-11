import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ScanStatus, WsMessage } from "@/types";

interface UseScanSocketResult {
  logs: string[];
  status: ScanStatus;
}

export function useScanSocket(
  scanId: string,
  onComplete: (status: ScanStatus) => void
): UseScanSocketResult {
  const [logs, setLogs] = useState<string[]>([]);
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
        } else if (msg.type === "done") {
          const finalStatus = msg.status ?? "complete";
          setStatus(finalStatus);
          ws.close();
          onCompleteRef.current(finalStatus);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      setLogs((prev) => [...prev, "ERROR: WebSocket connection lost."]);
      setStatus("failed");
      onCompleteRef.current("failed");
    };

    return () => {
      ws.close();
    };
  }, [scanId]);

  return { logs, status };
}
