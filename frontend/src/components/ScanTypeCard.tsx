import { Shield, Package, Server, Box, KeyRound, Smartphone, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ScanType } from "@/types";

interface ScanTypeDefinition {
  id: ScanType;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  tools: string[];
  accentClass: string;
  badgeClass: string;
}

const SCAN_TYPES: ScanTypeDefinition[] = [
  {
    id: "SAST",
    title: "SAST",
    subtitle: "Static Application Security Testing",
    description:
      "Find security bugs, logic flaws, and dangerous code patterns in your source code before they ever reach production.",
    icon: <Shield className="h-8 w-8" />,
    tools: ["Semgrep"],
    accentClass: "border-blue-200 hover:border-blue-400 hover:bg-blue-50",
    badgeClass: "bg-blue-100 text-blue-800",
  },
  {
    id: "SCA",
    title: "SCA",
    subtitle: "Software Composition Analysis",
    description:
      "Identify known CVEs in your open-source dependencies before they make it into a release or container image.",
    icon: <Package className="h-8 w-8" />,
    tools: ["Trivy", "OWASP Dependency Check"],
    accentClass: "border-purple-200 hover:border-purple-400 hover:bg-purple-50",
    badgeClass: "bg-purple-100 text-purple-800",
  },
  {
    id: "IaC",
    title: "IaC Scan",
    subtitle: "Infrastructure as Code",
    description:
      "Detect misconfigurations in Terraform, Helm charts, Dockerfiles, and Kubernetes YAML before they hit your cloud.",
    icon: <Server className="h-8 w-8" />,
    tools: ["KICS"],
    accentClass: "border-orange-200 hover:border-orange-400 hover:bg-orange-50",
    badgeClass: "bg-orange-100 text-orange-800",
  },
  {
    id: "Build",
    title: "Build Scan",
    subtitle: "Container Image Scanning",
    description:
      "Scan Docker images layer by layer for OS-level CVEs and application vulnerabilities without running the image.",
    icon: <Box className="h-8 w-8" />,
    tools: ["Trivy"],
    accentClass: "border-green-200 hover:border-green-400 hover:bg-green-50",
    badgeClass: "bg-green-100 text-green-800",
  },
  {
    id: "Secrets",
    title: "Secrets",
    subtitle: "Secret & Credential Exposure",
    description:
      "Detect hardcoded API keys, passwords, tokens, and credentials committed to your source code before they are exploited.",
    icon: <KeyRound className="h-8 w-8" />,
    tools: ["Gitleaks", "TruffleHog"],
    accentClass: "border-red-200 hover:border-red-400 hover:bg-red-50",
    badgeClass: "bg-red-100 text-red-800",
  },
  {
    id: "Mobile",
    title: "Mobile",
    subtitle: "Mobile App Security Testing",
    description:
      "Detect insecure code patterns in Android and iOS source code — maps findings to OWASP Mobile Top 10 and MASVS.",
    icon: <Smartphone className="h-8 w-8" />,
    tools: ["MobSF"],
    accentClass: "border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50",
    badgeClass: "bg-cyan-100 text-cyan-800",
  },
];

interface ScanTypeCardProps {
  onSelect: (type: ScanType) => void;
}

export default function ScanTypeCards({ onSelect }: ScanTypeCardProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Shield className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">AppSec Toolbox</h1>
            <p className="text-xs text-muted-foreground">
              Containerized security scanning — runs tools on demand, nothing persists
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="max-w-5xl w-full">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-2">
              What do you want to scan?
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Pick a scan type. Each tool runs as an ephemeral container — results are shown
              inline and can be exported as CSV.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {SCAN_TYPES.map((type) => (
              <Card
                key={type.id}
                className={`cursor-pointer border-2 transition-all duration-150 ${type.accentClass}`}
                onClick={() => onSelect(type.id)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded-lg ${type.badgeClass}`}>{type.icon}</div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
                  </div>
                  <h3 className="text-xl font-bold mb-0.5">{type.title}</h3>
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    {type.subtitle}
                  </p>
                  <p className="text-sm text-foreground/80 mb-4 leading-relaxed">
                    {type.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {type.tools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono border border-gray-200 bg-white text-gray-600"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
