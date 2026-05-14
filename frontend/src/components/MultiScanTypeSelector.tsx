import { Shield, Package, Server, Box, KeyRound, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScanType } from "@/types";

interface TypeDef {
  id: ScanType;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  accentClass: string;
  checkClass: string;
  inputKind: "source" | "image";
}

const TYPES: TypeDef[] = [
  { id: "SAST",    label: "SAST",    subtitle: "Source code patterns",       icon: <Shield className="h-5 w-5" />,     accentClass: "border-blue-200 bg-blue-50 text-blue-800",   checkClass: "bg-blue-600",   inputKind: "source" },
  { id: "SCA",     label: "SCA",     subtitle: "Dependency CVEs",             icon: <Package className="h-5 w-5" />,    accentClass: "border-purple-200 bg-purple-50 text-purple-800", checkClass: "bg-purple-600", inputKind: "source" },
  { id: "IaC",     label: "IaC",     subtitle: "Cloud misconfigurations",     icon: <Server className="h-5 w-5" />,     accentClass: "border-orange-200 bg-orange-50 text-orange-800", checkClass: "bg-orange-600", inputKind: "source" },
  { id: "Secrets", label: "Secrets", subtitle: "Hardcoded credentials",       icon: <KeyRound className="h-5 w-5" />,   accentClass: "border-red-200 bg-red-50 text-red-800",      checkClass: "bg-red-600",    inputKind: "source" },
  { id: "Build",   label: "Build",   subtitle: "Container image CVEs",        icon: <Box className="h-5 w-5" />,        accentClass: "border-green-200 bg-green-50 text-green-800", checkClass: "bg-green-600",  inputKind: "image"  },
  { id: "Mobile",  label: "Mobile",  subtitle: "Android / iOS source",        icon: <Smartphone className="h-5 w-5" />, accentClass: "border-cyan-200 bg-cyan-50 text-cyan-800",   checkClass: "bg-cyan-600",   inputKind: "source" },
];

interface Props {
  selected: ScanType[];
  onChange: (types: ScanType[]) => void;
  onContinue: () => void;
}

export default function MultiScanTypeSelector({ selected, onChange, onContinue }: Props) {
  const toggle = (id: ScanType) => {
    onChange(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Select scan types</h2>
        <p className="text-sm text-muted-foreground">
          Choose two or more. All selected scanners will run in parallel.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TYPES.map((t) => {
          const active = selected.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-100 ${
                active
                  ? `${t.accentClass} border-current`
                  : "border-border bg-white hover:border-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  active ? `${t.checkClass} border-transparent` : "border-gray-300"
                }`}
              >
                {active && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className={`shrink-0 ${active ? "" : "text-muted-foreground"}`}>
                {t.icon}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">{t.label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{t.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      <Button
        className="w-full"
        disabled={selected.length < 2}
        onClick={onContinue}
      >
        Continue with {selected.length > 0 ? `${selected.length} scan${selected.length > 1 ? "s" : ""}` : "…"} →
      </Button>

      {selected.length === 1 && (
        <p className="text-xs text-center text-muted-foreground">
          Select at least one more scan type to continue.
        </p>
      )}
    </div>
  );
}
