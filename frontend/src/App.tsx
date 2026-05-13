import { useState, useEffect, useCallback } from "react";
import { Shield, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import ScanTypeCards from "@/components/ScanTypeCard";
import ToolPicker from "@/components/ToolPicker";
import InputPanel from "@/components/InputPanel";
import ScanProgress from "@/components/ScanProgress";
import ResultsTable from "@/components/ResultsTable";
import ColumnSelector from "@/components/ColumnSelector";
import ExportBar from "@/components/ExportBar";
import ScanLogsDialog from "@/components/ScanLogsDialog";
import { useResults } from "@/hooks/useResults";
import { api } from "@/lib/api";
import type { ScanType, ScanStatus, ToolConfig, ToolsRegistry } from "@/types";

type Step = "home" | "tool" | "input" | "running" | "results";

function getSessionId(): string {
  const key = "appsec-session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getToolsForType(registry: ToolsRegistry | null, scanType: ScanType): ToolConfig[] {
  if (!registry) return [];
  const map: Record<ScanType, keyof ToolsRegistry["tools"]> = {
    SAST: "sast",
    SCA: "sca",
    IaC: "iac",
    Build: "build",
    Secrets: "secrets",
    Mobile: "mobile",
  };
  return registry.tools[map[scanType]] ?? [];
}

export default function App() {
  const [step, setStep] = useState<Step>("home");
  const [scanType, setScanType] = useState<ScanType | null>(null);
  const [toolId, setToolId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [sessionId] = useState(getSessionId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toolRegistry, setToolRegistry] = useState<ToolsRegistry | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const { data: results } = useResults(step === "results" ? scanId : null);

  useEffect(() => {
    api.getTools().then(setToolRegistry).catch(console.error);
  }, []);

  // Initialise column selection from API data
  useEffect(() => {
    if (results?.columns) {
      setSelectedColumns(results.columns.filter((c) => c.default).map((c) => c.key));
    }
  }, [results?.columns]);

  const tools = scanType ? getToolsForType(toolRegistry, scanType) : [];
  const selectedTool = tools.find((t) => t.id === toolId) ?? null;

  const confirmOrPurge = useCallback(
    (action: () => void) => {
      if (step === "results") {
        setPendingAction(() => action);
        setShowPurgeDialog(true);
      } else {
        action();
      }
    },
    [step]
  );

  const handleSelectType = (type: ScanType) => {
    const doIt = () => {
      setScanType(type);
      setToolId(null);
      setScanId(null);
      setSelectedColumns([]);
      setStep("tool");
    };
    confirmOrPurge(doIt);
  };

  const handleSelectTool = (id: string) => {
    const doIt = () => {
      setToolId(id);
      setScanId(null);
      setSelectedColumns([]);
      setStep("input");
    };
    if (step === "results") {
      confirmOrPurge(doIt);
    } else {
      doIt();
    }
  };

  const handleNewScan = () => {
    confirmOrPurge(() => {
      setScanType(null);
      setToolId(null);
      setScanId(null);
      setSelectedColumns([]);
      setStep("home");
    });
  };

  const handleStartScan = async (formData: FormData) => {
    if (!scanType || !toolId) return;
    formData.append("scan_type", scanType);
    formData.append("tool_id", toolId);
    formData.append("session_id", sessionId);

    setIsSubmitting(true);
    try {
      const res = await api.startScan(formData);
      setScanId(res.scan_id);
      setStep("running");
    } catch (e) {
      alert(`Failed to start scan: ${(e as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScanComplete = (status: ScanStatus) => {
    if (status === "complete" || status === "failed") {
      setStep("results");
    }
  };

  const purgeAndContinue = () => {
    setShowPurgeDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const isImageScan = selectedTool?.input_type === "image";

  // Results view — full-page layout
  if (step === "results") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
          <Shield className="h-5 w-5 text-blue-600" />
          <span className="font-bold text-sm tracking-tight">AppSec Toolbox</span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm text-muted-foreground">{scanType}</span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-mono">{selectedTool?.name ?? toolId}</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-2" onClick={handleNewScan}>
            <RotateCcw className="h-3.5 w-3.5" />
            New Scan
          </Button>
        </header>

        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            {results ? (
              <>
                {results.status === "failed" && results.error && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                    <strong>Scan failed:</strong> {results.error}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <ExportBar
                    scanId={scanId!}
                    hasSpdx={results.has_spdx}
                    selectedColumns={selectedColumns}
                    findings={results.findings}
                    toolName={selectedTool?.name ?? toolId ?? ""}
                  />
                  {results.columns.length > 0 && (
                    <ColumnSelector
                      columns={results.columns}
                      selected={selectedColumns}
                      onChange={setSelectedColumns}
                    />
                  )}
                  <ScanLogsDialog
                    scanId={scanId!}
                    toolName={selectedTool?.name ?? toolId ?? ""}
                  />
                </div>

                <ResultsTable
                  findings={results.findings}
                  availableColumns={results.columns}
                  visibleColumns={selectedColumns}
                />
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">Loading results...</div>
            )}
          </div>
        </main>

        {/* Purge confirmation dialog */}
        <Dialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clear current results?</DialogTitle>
              <DialogDescription>
                Starting a new scan will permanently remove the current results from memory. Export
                any data you need before continuing.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPurgeDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={purgeAndContinue}>
                Clear & Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Wizard layout for home / tool / input / running steps
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {step === "home" ? (
        <ScanTypeCards onSelect={handleSelectType} />
      ) : (
        <>
          <header className="bg-white border-b px-8 py-4 flex items-center gap-3">
            <Shield className="h-6 w-6 text-blue-600" />
            <span className="font-bold tracking-tight">AppSec Toolbox</span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleNewScan}>
              <RotateCcw className="h-3.5 w-3.5" />
              Start Over
            </Button>
          </header>

          <main className="flex-1 flex items-start justify-center px-8 py-10">
            <div className="w-full max-w-xl space-y-6">
              {/* Step breadcrumbs */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <button
                  className="hover:text-foreground transition-colors"
                  onClick={() => confirmOrPurge(() => setStep("home"))}
                >
                  Scan type
                </button>
                {scanType && (
                  <>
                    <span>›</span>
                    <button
                      className={`hover:text-foreground transition-colors ${step === "tool" ? "text-foreground font-medium" : ""}`}
                      onClick={() => step !== "tool" && confirmOrPurge(() => setStep("tool"))}
                    >
                      {scanType}
                    </button>
                  </>
                )}
                {(step === "input" || step === "running") && selectedTool && (
                  <>
                    <span>›</span>
                    <button
                      className={`hover:text-foreground transition-colors ${step === "input" ? "text-foreground font-medium" : ""}`}
                      onClick={() => step !== "input" && setStep("input")}
                    >
                      {selectedTool.name}
                    </button>
                  </>
                )}
                {step === "running" && (
                  <>
                    <span>›</span>
                    <span className="text-foreground font-medium">Scanning</span>
                  </>
                )}
              </div>

              {/* Step content */}
              {step === "tool" && (
                <div>
                  <h2 className="text-2xl font-bold mb-1">Choose a tool</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Each tool runs as an ephemeral Docker container pulled on demand.
                  </p>
                  <ToolPicker tools={tools} selectedId={toolId} onChange={handleSelectTool} />
                  {toolId && (
                    <Button className="w-full mt-4" onClick={() => setStep("input")}>
                      Continue →
                    </Button>
                  )}
                </div>
              )}

              {step === "input" && selectedTool && (
                <div>
                  <button
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
                    onClick={() => setStep("tool")}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h2 className="text-2xl font-bold mb-1">Provide source</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Upload a{isImageScan ? "n image" : " ZIP"} or provide a{" "}
                    {isImageScan ? "registry reference" : "Git URL"} for{" "}
                    <strong>{selectedTool.name}</strong> to scan.
                  </p>
                  <InputPanel
                    isImageScan={isImageScan}
                    onSubmit={handleStartScan}
                    isLoading={isSubmitting}
                  />
                </div>
              )}

              {step === "running" && scanId && selectedTool && (
                <div>
                  <h2 className="text-2xl font-bold mb-1">Scanning...</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Live output from{" "}
                    <span className="font-mono font-medium">{selectedTool.name}</span> container.
                  </p>
                  <ScanProgress
                    scanId={scanId}
                    toolName={selectedTool.name}
                    onComplete={handleScanComplete}
                  />
                </div>
              )}
            </div>
          </main>
        </>
      )}

      {/* Purge confirmation for mid-wizard navigation */}
      <Dialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear current results?</DialogTitle>
            <DialogDescription>
              Starting a new scan will permanently remove the current results from memory. Export
              any data you need before continuing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurgeDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={purgeAndContinue}>
              Clear & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
