import { useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScanSocket } from "@/hooks/useScanSocket";
import type { ScanStatus } from "@/types";

interface ScanProgressProps {
  scanId: string;
  toolName: string;
  onComplete: (status: ScanStatus) => void;
}

export default function ScanProgress({ scanId, toolName, onComplete }: ScanProgressProps) {
  const { logs, status } = useScanSocket(scanId, onComplete);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const isRunning = status === "running" || status === "pending";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {status === "complete" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
          <span className="text-sm font-medium">
            {isRunning ? `Running ${toolName}...` : status === "complete" ? "Scan complete" : "Scan failed"}
          </span>
        </div>
        <Badge
          variant={
            status === "complete" ? "default" : status === "failed" ? "destructive" : "secondary"
          }
          className="font-mono text-xs"
        >
          {status}
        </Badge>
      </div>

      <ScrollArea className="h-80 rounded-lg border">
        <div className="log-terminal p-4 min-h-full">
          {logs.length === 0 && (
            <span className="text-gray-500">Waiting for scanner output...</span>
          )}
          {logs.map((line, i) => (
            <div key={i} className="leading-5">
              <span className="text-gray-500 select-none mr-2">›</span>
              <span
                className={
                  line.startsWith("ERROR")
                    ? "text-red-400"
                    : line.startsWith("WARNING")
                    ? "text-yellow-400"
                    : line.startsWith("[docker]")
                    ? "text-blue-400"
                    : "text-green-400"
                }
              >
                {line}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
