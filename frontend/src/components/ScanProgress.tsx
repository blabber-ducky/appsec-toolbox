import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Circle, ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScanSocket } from "@/hooks/useScanSocket";
import type { ScanStatus, StageInfo } from "@/types";

interface ScanProgressProps {
  scanId: string;
  toolName: string;
  onComplete: (status: ScanStatus) => void;
}

function StageRow({ stage }: { stage: StageInfo }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 border-b last:border-b-0">
      <span className="shrink-0">
        {stage.status === "done" && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        {stage.status === "running" && (
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
        )}
        {stage.status === "error" && (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
      </span>
      <span
        className={`text-sm ${
          stage.status === "done"
            ? "text-muted-foreground"
            : stage.status === "error"
            ? "text-destructive font-medium"
            : "text-foreground font-medium"
        }`}
      >
        {stage.label}
      </span>
      {stage.status === "running" && (
        <span className="ml-auto text-xs text-muted-foreground animate-pulse">
          in progress...
        </span>
      )}
    </div>
  );
}

export default function ScanProgress({ scanId, toolName, onComplete }: ScanProgressProps) {
  const { logs, stages, status } = useScanSocket(scanId, onComplete);
  const [logsOpen, setLogsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-expand logs only when scan tool is actually running (3rd stage onward)
  useEffect(() => {
    if (stages.some((s) => s.label.toLowerCase().startsWith("running") && s.status === "running")) {
      setLogsOpen(true);
    }
  }, [stages]);

  useEffect(() => {
    if (logsOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsOpen]);

  const isRunning = status === "running" || status === "pending";
  const pendingStages = stages.length === 0 && isRunning;

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {status === "complete" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
          <span className="text-sm font-medium">
            {isRunning
              ? `Scanning with ${toolName}...`
              : status === "complete"
              ? "Scan complete"
              : "Scan failed"}
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

      {/* Stage list */}
      <div className="rounded-lg border bg-white overflow-hidden">
        {pendingStages ? (
          <div className="flex items-center gap-3 py-3 px-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Initialising...
          </div>
        ) : (
          stages.map((s) => <StageRow key={s.label} stage={s} />)
        )}

        {/* Pending placeholders when scan is still early */}
        {isRunning && stages.length > 0 && stages.every((s) => s.status === "done") && (
          <div className="flex items-center gap-3 py-2.5 px-4 text-sm text-muted-foreground">
            <Circle className="h-4 w-4 opacity-30" />
            Waiting for next step...
          </div>
        )}
      </div>

      {/* Collapsible scanner output */}
      <div className="rounded-lg border overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-950 text-green-400 text-xs font-mono hover:bg-gray-900 transition-colors"
          onClick={() => setLogsOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5" />
            Scanner output
            {logs.length > 0 && (
              <span className="text-gray-500">({logs.length} lines)</span>
            )}
          </span>
          {logsOpen
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
          }
        </button>

        {logsOpen && (
          <ScrollArea className="h-64">
            <div className="log-terminal p-4 min-h-full">
              {logs.length === 0 ? (
                <span className="text-gray-600">No output yet...</span>
              ) : (
                logs.map((line, i) => (
                  <div key={i} className="leading-5">
                    <span className="text-gray-600 select-none mr-2">›</span>
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
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
