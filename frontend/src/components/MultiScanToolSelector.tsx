import { Shield, Package, Server, Box, KeyRound, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import ToolPicker from "@/components/ToolPicker";
import type { ScanType, ToolConfig } from "@/types";

const TYPE_META: Record<ScanType, { label: string; icon: React.ReactNode; color: string }> = {
  SAST:    { label: "SAST",    icon: <Shield className="h-4 w-4" />,     color: "text-blue-700 bg-blue-100" },
  SCA:     { label: "SCA",     icon: <Package className="h-4 w-4" />,    color: "text-purple-700 bg-purple-100" },
  IaC:     { label: "IaC",     icon: <Server className="h-4 w-4" />,     color: "text-orange-700 bg-orange-100" },
  Secrets: { label: "Secrets", icon: <KeyRound className="h-4 w-4" />,   color: "text-red-700 bg-red-100" },
  Build:   { label: "Build",   icon: <Box className="h-4 w-4" />,        color: "text-green-700 bg-green-100" },
  Mobile:  { label: "Mobile",  icon: <Smartphone className="h-4 w-4" />, color: "text-cyan-700 bg-cyan-100" },
};

interface Props {
  selectedTypes: ScanType[];
  toolsByType: Record<string, ToolConfig[]>;
  selected: Partial<Record<ScanType, string>>;
  onChange: (type: ScanType, toolId: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function MultiScanToolSelector({
  selectedTypes,
  toolsByType,
  selected,
  onChange,
  onContinue,
  onBack,
}: Props) {
  const allPicked = selectedTypes.every((t) => selected[t]);

  return (
    <div className="space-y-6">
      <div>
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          onClick={onBack}
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold mb-1">Select tools</h2>
        <p className="text-sm text-muted-foreground">
          Choose one scanner per scan type. All will run in parallel.
        </p>
      </div>

      <div className="space-y-6">
        {selectedTypes.map((type) => {
          const meta = TYPE_META[type];
          const tools = toolsByType[type.toLowerCase()] ?? [];
          return (
            <div key={type} className="rounded-xl border bg-white overflow-hidden">
              <div className={`flex items-center gap-2 px-4 py-3 border-b ${meta.color}`}>
                {meta.icon}
                <span className="font-semibold text-sm">{meta.label}</span>
              </div>
              <div className="p-4">
                <ToolPicker
                  tools={tools}
                  selectedId={selected[type] ?? null}
                  onChange={(id) => onChange(type, id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <Button className="w-full" disabled={!allPicked} onClick={onContinue}>
        Start {selectedTypes.length} parallel scans →
      </Button>
    </div>
  );
}
