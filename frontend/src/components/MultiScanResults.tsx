import { useEffect, useState } from "react";
import { Shield, Package, Server, Box, KeyRound, Smartphone, Download, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ResultsTable from "@/components/ResultsTable";
import ColumnSelector from "@/components/ColumnSelector";
import ScanLogsDialog from "@/components/ScanLogsDialog";
import { api } from "@/lib/api";
import type { MultiScanEntry, ResultsResponse, ScanType } from "@/types";

const TYPE_META: Record<ScanType, { icon: React.ReactNode; color: string; tab: string }> = {
  SAST:    { icon: <Shield className="h-4 w-4" />,     color: "text-blue-700",   tab: "blue"   },
  SCA:     { icon: <Package className="h-4 w-4" />,    color: "text-purple-700", tab: "purple" },
  IaC:     { icon: <Server className="h-4 w-4" />,     color: "text-orange-700", tab: "orange" },
  Secrets: { icon: <KeyRound className="h-4 w-4" />,   color: "text-red-700",    tab: "red"    },
  Build:   { icon: <Box className="h-4 w-4" />,        color: "text-green-700",  tab: "green"  },
  Mobile:  { icon: <Smartphone className="h-4 w-4" />, color: "text-cyan-700",   tab: "cyan"   },
};

const TAB_ACTIVE: Record<string, string> = {
  blue:   "border-blue-500 text-blue-700",
  purple: "border-purple-500 text-purple-700",
  orange: "border-orange-500 text-orange-700",
  red:    "border-red-500 text-red-700",
  green:  "border-green-500 text-green-700",
  cyan:   "border-cyan-500 text-cyan-700",
};

interface TabData {
  entry: MultiScanEntry;
  toolName: string;
  results: ResultsResponse | null;
  loading: boolean;
  selectedColumns: string[];
}

interface Props {
  scans: MultiScanEntry[];
  toolNameFor: (entry: MultiScanEntry) => string;
}

export default function MultiScanResults({ scans, toolNameFor }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [tabs, setTabs] = useState<TabData[]>(() =>
    scans.map((entry) => ({
      entry,
      toolName: toolNameFor(entry),
      results: null,
      loading: true,
      selectedColumns: [],
    }))
  );

  useEffect(() => {
    scans.forEach((entry, i) => {
      api.getResults(entry.scan_id).then((results) => {
        setTabs((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            results,
            loading: false,
            selectedColumns: results.columns.filter((c) => c.default).map((c) => c.key),
          };
          return next;
        });
      }).catch(() => {
        setTabs((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], loading: false };
          return next;
        });
      });
    });
  }, []);

  const setColumns = (i: number, cols: string[]) => {
    setTabs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], selectedColumns: cols };
      return next;
    });
  };

  const totalFindings = tabs.reduce((sum, t) => sum + (t.results?.total ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">
          {scans.length} scans · {totalFindings} total findings
        </span>
      </div>

      {/* Tab strip */}
      <div className="flex border-b overflow-x-auto">
        {tabs.map((tab, i) => {
          const meta = TYPE_META[tab.entry.scan_type];
          const isActive = i === activeIdx;
          const total = tab.results?.total ?? null;
          const failed = tab.results?.status === "failed";
          return (
            <button
              key={tab.entry.scan_id}
              onClick={() => setActiveIdx(i)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                isActive
                  ? `${TAB_ACTIVE[meta.tab]} bg-white`
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={isActive ? meta.color : ""}>{meta.icon}</span>
              <span>{tab.entry.scan_type}</span>
              <span className="font-mono text-xs text-muted-foreground">·</span>
              <span className="font-mono text-xs">{tab.toolName}</span>
              {tab.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {!tab.loading && total !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  failed ? "bg-destructive/10 text-destructive"
                    : total === 0 ? "bg-gray-100 text-gray-500"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {failed ? "failed" : total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab body */}
      {tabs.map((tab, i) => {
        if (i !== activeIdx) return null;
        const { entry, results, loading, selectedColumns, toolName } = tab;

        return (
          <div key={entry.scan_id} className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* CSV download */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={!results || results.total === 0}
                onClick={() => {
                  const url = api.csvExportUrl(entry.scan_id, selectedColumns);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `appsec-${entry.scan_type.toLowerCase()}-${entry.tool_id}-${entry.scan_id.slice(0, 8)}.csv`;
                  a.click();
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>

              {/* SPDX download */}
              {results?.has_spdx && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    const url = api.spdxExportUrl(entry.scan_id);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `sbom-${entry.tool_id}-${entry.scan_id.slice(0, 8)}.spdx.json`;
                    a.click();
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Export SPDX
                </Button>
              )}

              {results && results.columns.length > 0 && (
                <ColumnSelector
                  columns={results.columns}
                  selected={selectedColumns}
                  onChange={(cols) => setColumns(i, cols)}
                />
              )}

              <ScanLogsDialog scanId={entry.scan_id} toolName={toolName} />
            </div>

            {/* Content */}
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading results…
              </div>
            )}

            {!loading && results?.status === "failed" && results.error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <strong>Scan failed:</strong> {results.error}
              </div>
            )}

            {!loading && results && results.status !== "failed" && (
              <ResultsTable
                findings={results.findings}
                availableColumns={results.columns}
                visibleColumns={selectedColumns}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
