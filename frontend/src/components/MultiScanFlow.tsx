import { useState } from "react";
import { Shield, Layers, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import MultiScanTypeSelector from "@/components/MultiScanTypeSelector";
import MultiScanInputPanel, { type MultiScanInputValues } from "@/components/MultiScanInputPanel";
import MultiScanToolSelector from "@/components/MultiScanToolSelector";
import MultiScanProgress from "@/components/MultiScanProgress";
import MultiScanResults from "@/components/MultiScanResults";
import { api } from "@/lib/api";
import type { MultiScanEntry, ScanType, ToolConfig, ToolsRegistry } from "@/types";

type Step = "types" | "input" | "tools" | "running" | "results";

const DEFAULT_INPUT: MultiScanInputValues = {
  sourceInputType: "zip",
  sourceFile: null,
  gitUrl: "",
  imageInputType: "image_ref",
  imageFile: null,
  imageRef: "",
};

function getToolsForType(registry: ToolsRegistry, type: ScanType): ToolConfig[] {
  const map: Record<ScanType, keyof ToolsRegistry["tools"]> = {
    SAST: "sast", SCA: "sca", IaC: "iac",
    Secrets: "secrets", Build: "build", Mobile: "mobile",
  };
  return registry.tools[map[type]] ?? [];
}

interface Props {
  registry: ToolsRegistry;
  onExit: () => void;
}

export default function MultiScanFlow({ registry, onExit }: Props) {
  const [step, setStep] = useState<Step>("types");
  const [selectedTypes, setSelectedTypes] = useState<ScanType[]>([]);
  const [inputValues, setInputValues] = useState<MultiScanInputValues>(DEFAULT_INPUT);
  const [toolsSelected, setToolsSelected] = useState<Partial<Record<ScanType, string>>>({});
  const [scans, setScans] = useState<MultiScanEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId] = useState(() => {
    const key = "appsec-session-id";
    let id = sessionStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
    return id;
  });

  const toolsByType = Object.fromEntries(
    selectedTypes.map((t) => [t.toLowerCase(), getToolsForType(registry, t)])
  );

  const toolNameFor = (entry: MultiScanEntry): string => {
    const tools = getToolsForType(registry, entry.scan_type);
    return tools.find((t) => t.id === entry.tool_id)?.name ?? entry.tool_id;
  };

  const handleSelectTool = (type: ScanType, toolId: string) => {
    setToolsSelected((prev) => ({ ...prev, [type]: toolId }));
  };

  const handleStartScans = async () => {
    setIsSubmitting(true);
    try {
      const configs = selectedTypes.map((t) => ({
        scan_type: t,
        tool_id: toolsSelected[t]!,
      }));

      const fd = new FormData();
      fd.append("configs", JSON.stringify(configs));
      fd.append("session_id", sessionId);
      fd.append("source_input_type", inputValues.sourceInputType);
      fd.append("image_input_type", inputValues.imageInputType);

      if (inputValues.sourceInputType === "zip" && inputValues.sourceFile) {
        fd.append("source_file", inputValues.sourceFile);
      } else if (inputValues.sourceInputType === "git" && inputValues.gitUrl) {
        fd.append("git_url", inputValues.gitUrl);
      }

      if (inputValues.imageInputType === "image_tar" && inputValues.imageFile) {
        fd.append("image_file", inputValues.imageFile);
      } else if (inputValues.imageInputType === "image_ref" && inputValues.imageRef) {
        fd.append("image_ref", inputValues.imageRef);
      }

      const res = await api.startMultiScan(fd);
      setScans(res.scans);
      setStep("running");
    } catch (e) {
      alert(`Failed to start multi-scan: ${(e as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep("types");
    setSelectedTypes([]);
    setInputValues(DEFAULT_INPUT);
    setToolsSelected({});
    setScans([]);
  };

  const STEP_LABELS: Record<Step, string> = {
    types: "Scan types", input: "Input", tools: "Tools", running: "Running", results: "Results",
  };
  const STEPS: Step[] = ["types", "input", "tools", "running", "results"];
  const stepIdx = STEPS.indexOf(step);

  if (step === "results") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
          <Shield className="h-5 w-5 text-blue-600" />
          <span className="font-bold text-sm tracking-tight">AppSec Toolbox</span>
          <span className="text-muted-foreground text-sm">/</span>
          <Layers className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-medium text-violet-700">Multi-Scan</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-xs text-muted-foreground">{selectedTypes.join(" · ")}</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" /> New Scan
          </Button>
          <Button variant="ghost" size="sm" onClick={onExit}>← Home</Button>
        </header>
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <MultiScanResults scans={scans} toolNameFor={toolNameFor} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-8 py-4 flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-600" />
        <span className="font-bold tracking-tight">AppSec Toolbox</span>
        <span className="text-muted-foreground">/</span>
        <Layers className="h-4 w-4 text-violet-600" />
        <span className="font-medium text-violet-700">Multi-Scan</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onExit}>← Home</Button>
      </header>

      <main className="flex-1 flex items-start justify-center px-8 py-10">
        <div className="w-full max-w-2xl space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {STEPS.filter((s) => s !== "running" && s !== "results").map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className={stepIdx >= STEPS.indexOf(s) ? "text-foreground font-medium" : ""}>
                  {STEP_LABELS[s]}
                </span>
                {i < arr.length - 1 && <span>›</span>}
              </span>
            ))}
          </div>

          {step === "types" && (
            <MultiScanTypeSelector
              selected={selectedTypes}
              onChange={setSelectedTypes}
              onContinue={() => setStep("input")}
            />
          )}

          {step === "input" && (
            <MultiScanInputPanel
              selectedTypes={selectedTypes}
              values={inputValues}
              onChange={setInputValues}
              onContinue={() => setStep("tools")}
            />
          )}

          {step === "tools" && (
            <MultiScanToolSelector
              selectedTypes={selectedTypes}
              toolsByType={toolsByType}
              selected={toolsSelected}
              onChange={handleSelectTool}
              onContinue={handleStartScans}
              onBack={() => setStep("input")}
            />
          )}

          {step === "running" && scans.length > 0 && (
            <MultiScanProgress
              scans={scans}
              toolNameFor={toolNameFor}
              onAllComplete={() => setStep("results")}
            />
          )}

          {isSubmitting && (
            <div className="text-center text-sm text-muted-foreground">Starting scans…</div>
          )}
        </div>
      </main>
    </div>
  );
}
