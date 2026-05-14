import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Terminal, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { MultiScanEntry, ScanStatus, StageInfo, WsMessage } from "@/types";

function useScanSocket(scanId: string, onDone: (status: ScanStatus) => void) {
  const [logs, setLogs] = useState<string[]>([]);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [status, setStatus] = useState<ScanStatus>("running");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const ws = new WebSocket(api.scanWsUrl(scanId));
    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        if (msg.type === "log" && msg.message) {
          setLogs((p) => [...p, msg.message!]);
        } else if (msg.type === "stage" && msg.label) {
          setStages((p) => {
            const idx = p.findIndex((s) => s.label === msg.label);
            const info: StageInfo = { label: msg.label!, status: (msg.status as StageInfo["status"]) ?? "running" };
            if (idx >= 0) { const n = [...p]; n[idx] = info; return n; }
            return [...p, info];
          });
        } else if (msg.type === "done") {
          const s = (msg.status as ScanStatus) ?? "complete";
          setStatus(s);
          ws.close();
          onDoneRef.current(s);
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { setStatus("failed"); onDoneRef.current("failed"); };
    return () => ws.close();
  }, [scanId]);

  return { logs, stages, status };
}

const TYPE_COLOR: Record<string, string> = {
  SAST: "bg-blue-100 text-blue-800",
  SCA: "bg-purple-100 text-purple-800",
  IaC: "bg-orange-100 text-orange-800",
  Secrets: "bg-red-100 text-red-800",
  Build: "bg-green-100 text-green-800",
  Mobile: "bg-cyan-100 text-cyan-800",
};

interface ScanPanelProps {
  entry: MultiScanEntry;
  toolName: string;
  onDone: (scanId: string, status: ScanStatus) => void;
}

function ScanPanel({ entry, toolName, onDone }: ScanPanelProps) {
  const { logs, stages, status } = useScanSocket(entry.scan_id, (s) => onDone(entry.scan_id, s));
  const [logsOpen, setLogsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsOpen) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, logsOpen]);

  const isRunning = status === "running" || status === "pending";

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-gray-50">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${TYPE_COLOR[entry.scan_type] ?? "bg-gray-100 text-gray-700"}`}>
          {entry.scan_type}
        </span>
        <span className="text-sm font-medium flex-1">{toolName}</span>
        <Badge
          variant={status === "complete" ? "default" : status === "failed" ? "destructive" : "secondary"}
          className="font-mono text-xs"
        >
          {isRunning ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> running</span>
          ) : status}
        </Badge>
      </div>

      {/* Stage list */}
      <div className="divide-y">
        {stages.length === 0 && isRunning && (
          <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Initialising…
          </div>
        )}
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-3 px-4 py-2.5">
            {s.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
            {s.status === "running" && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />}
            {s.status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            <span className={`text-xs ${s.status === "done" ? "text-muted-foreground" : s.status === "error" ? "text-destructive font-medium" : "font-medium"}`}>
              {s.label}
            </span>
            {s.status === "running" && <span className="ml-auto text-xs text-muted-foreground animate-pulse">in progress…</span>}
          </div>
        ))}
      </div>

      {/* Collapsible log */}
      <div className="border-t">
        <button
          className="w-full flex items-center justify-between px-4 py-2 bg-gray-950 text-green-400 text-xs font-mono hover:bg-gray-900 transition-colors"
          onClick={() => setLogsOpen((o) => !o)}
        >
          <span className="flex items-center gap-2">
            <Terminal className="h-3 w-3" />
            Output {logs.length > 0 && <span className="text-gray-500">({logs.length})</span>}
          </span>
          {logsOpen ? <ChevronDown className="h-3 w-3 text-gray-500" /> : <ChevronRight className="h-3 w-3 text-gray-500" />}
        </button>
        {logsOpen && (
          <ScrollArea className="h-40">
            <div className="bg-gray-950 p-3 min-h-full font-mono text-xs">
              {logs.length === 0
                ? <span className="text-gray-600">No output yet…</span>
                : logs.map((line, i) => (
                  <div key={i} className="leading-5">
                    <span className="text-gray-600 select-none mr-2">›</span>
                    <span className={
                      line.startsWith("ERROR") ? "text-red-400"
                        : line.startsWith("WARNING") ? "text-yellow-400"
                        : line.startsWith("[docker]") ? "text-blue-400"
                        : "text-green-400"
                    }>{line}</span>
                  </div>
                ))
              }
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

interface Props {
  scans: MultiScanEntry[];
  toolNameFor: (entry: MultiScanEntry) => string;
  onAllComplete: () => void;
}

export default function MultiScanProgress({ scans, toolNameFor, onAllComplete }: Props) {
  const [statuses, setStatuses] = useState<Record<string, ScanStatus>>({});

  const handleDone = (scanId: string, status: ScanStatus) => {
    setStatuses((prev) => {
      const next = { ...prev, [scanId]: status };
      if (scans.every((s) => next[s.scan_id] !== undefined)) {
        setTimeout(onAllComplete, 600);
      }
      return next;
    });
  };

  const doneCount = Object.keys(statuses).length;
  const failedCount = Object.values(statuses).filter((s) => s === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Scanning in parallel…</h2>
        <span className="text-sm text-muted-foreground">
          {doneCount}/{scans.length} complete
          {failedCount > 0 && <span className="text-destructive ml-2">({failedCount} failed)</span>}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {scans.map((entry) => (
          <ScanPanel
            key={entry.scan_id}
            entry={entry}
            toolName={toolNameFor(entry)}
            onDone={handleDone}
          />
        ))}
      </div>
    </div>
  );
}
