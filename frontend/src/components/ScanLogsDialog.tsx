import { useState, useRef, useEffect } from "react";
import { Terminal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { ScanLogMessage } from "@/types";

interface ScanLogsDialogProps {
  scanId: string;
  toolName: string;
}

function renderLine(msg: ScanLogMessage, idx: number) {
  if (msg.type === "stage") {
    const icon =
      msg.status === "done" ? "✓" : msg.status === "error" ? "✗" : "▶";
    const color =
      msg.status === "done"
        ? "text-green-400"
        : msg.status === "error"
        ? "text-red-400"
        : "text-yellow-400";
    return (
      <div key={idx} className={`leading-5 mt-2 mb-1 font-semibold ${color}`}>
        <span className="mr-2">{icon}</span>
        {msg.label}
        {msg.status && msg.status !== "running" && (
          <span className="ml-2 text-xs font-normal opacity-60">[{msg.status}]</span>
        )}
      </div>
    );
  }
  if (msg.type === "done") {
    return (
      <div key={idx} className="leading-5 mt-3 text-blue-400 font-semibold">
        ── scan {msg.status} ──
      </div>
    );
  }
  const line = msg.message ?? "";
  const color = line.startsWith("ERROR")
    ? "text-red-400"
    : line.startsWith("WARNING")
    ? "text-yellow-400"
    : line.startsWith("[docker]")
    ? "text-blue-300"
    : "text-green-300";
  return (
    <div key={idx} className="leading-5">
      <span className="text-gray-600 select-none mr-2">›</span>
      <span className={color}>{line}</span>
    </div>
  );
}

export default function ScanLogsDialog({ scanId, toolName }: ScanLogsDialogProps) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<ScanLogMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getScanLogs(scanId)
      .then((res) => setLogs(res.logs))
      .catch(() => setLogs([{ type: "log", message: "ERROR: Failed to load scan logs." }]))
      .finally(() => setLoading(false));
  }, [open, scanId]);

  useEffect(() => {
    if (open && !loading) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, loading, logs]);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Terminal className="h-4 w-4" />
        Scan Logs
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <Terminal className="h-4 w-4" />
              Scan logs — {toolName}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border overflow-hidden bg-gray-950">
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-green-400 font-mono text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <ScrollArea className="h-[28rem]">
                <div className="p-4 font-mono text-xs">
                  {logs.length === 0 ? (
                    <span className="text-gray-500">No log output recorded.</span>
                  ) : (
                    logs.map((msg, i) => renderLine(msg, i))
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
