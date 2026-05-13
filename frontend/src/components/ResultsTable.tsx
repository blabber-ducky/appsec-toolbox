import React, { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Finding, SeverityLevel, ColumnMeta } from "@/types";

const SEV_VARIANT: Record<SeverityLevel, "critical" | "high" | "medium" | "low" | "info" | "unknown"> = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info",
  UNKNOWN: "unknown",
};

const SEV_ORDER: Record<SeverityLevel, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4, UNKNOWN: 5,
};

const ALL_COLUMN_DEFS: Record<string, ColumnDef<Finding>> = {
  severity: {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ getValue }) => {
      const v = getValue() as SeverityLevel;
      return <Badge variant={SEV_VARIANT[v] ?? "secondary"}>{v}</Badge>;
    },
    sortingFn: (a, b) =>
      SEV_ORDER[a.original.severity] - SEV_ORDER[b.original.severity],
    size: 110,
  },
  title: {
    accessorKey: "title",
    header: "Title",
    cell: ({ getValue }) => (
      <span className="font-medium text-sm leading-tight line-clamp-2">{getValue() as string}</span>
    ),
  },
  location: {
    accessorKey: "location",
    header: "Location",
    cell: ({ getValue }) => (
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{getValue() as string}</code>
    ),
  },
  rule_id: {
    accessorKey: "rule_id",
    header: "Rule / Check",
    cell: ({ getValue }) => (
      <code className="text-xs text-muted-foreground">{getValue() as string}</code>
    ),
    size: 160,
  },
  cve: {
    accessorKey: "cve",
    header: "CVE ID",
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <code className="text-xs font-mono">{v}</code> : <span className="text-muted-foreground">—</span>;
    },
    size: 150,
  },
  fix_version: {
    accessorKey: "fix_version",
    header: "Fix Version",
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? (
        <span className="text-xs font-mono text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
          {v}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      );
    },
    size: 130,
  },
  description: {
    accessorKey: "description",
    header: "Description",
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground line-clamp-3">{getValue() as string}</span>
    ),
  },
  references: {
    accessorKey: "references",
    header: "References",
    cell: ({ getValue }) => {
      const refs = getValue() as string[];
      if (!refs?.length) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <div className="flex flex-col gap-0.5">
          {refs.slice(0, 2).map((ref, i) => (
            <a
              key={i}
              href={ref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline truncate max-w-48"
            >
              {ref}
            </a>
          ))}
          {refs.length > 2 && (
            <span className="text-xs text-muted-foreground">+{refs.length - 2} more</span>
          )}
        </div>
      );
    },
  },
  tool: {
    accessorKey: "tool",
    header: "Tool",
    cell: ({ getValue }) => (
      <span className="text-xs font-mono text-muted-foreground">{getValue() as string}</span>
    ),
    size: 120,
  },
};

const SEVERITY_FILTERS: (SeverityLevel | "ALL")[] = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

interface ResultsTableProps {
  findings: Finding[];
  availableColumns: ColumnMeta[];
  visibleColumns: string[];
}

export default function ResultsTable({
  findings,
  availableColumns,
  visibleColumns,
}: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "severity", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sevFilter, setSevFilter] = useState<SeverityLevel | "ALL">("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const filteredFindings =
    sevFilter === "ALL" ? findings : findings.filter((f) => f.severity === sevFilter);

  const columns: ColumnDef<Finding>[] = availableColumns
    .filter((c) => visibleColumns.includes(c.key))
    .map((c) => ALL_COLUMN_DEFS[c.key])
    .filter(Boolean);

  const table = useReactTable({
    data: filteredFindings,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search findings..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {SEVERITY_FILTERS.map((sev) => (
            <Button
              key={sev}
              variant={sevFilter === sev ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs"
              onClick={() => setSevFilter(sev)}
            >
              {sev === "ALL" ? "All" : sev.charAt(0) + sev.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  <th className="w-8 px-3 py-2" />
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-left font-medium text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                      style={{ width: header.column.getSize() !== 150 ? header.column.getSize() : undefined }}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          className={`flex items-center gap-1 hover:text-foreground transition-colors ${
                            header.column.getCanSort() ? "cursor-pointer select-none" : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" && <ArrowUp className="h-3 w-3" />}
                          {header.column.getIsSorted() === "desc" && <ArrowDown className="h-3 w-3" />}
                          {!header.column.getIsSorted() && header.column.getCanSort() && (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground text-sm">
                    No findings match the current filter.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isExpanded = expandedRows.has(row.id);
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => toggleRow(row.id)}
                      >
                        <td className="px-3 py-2 w-8">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </td>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-3 py-2.5 align-top">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={columns.length} className="px-3 pb-3 pt-1">
                            <div className="space-y-2 text-xs">
                              {row.original.description && (
                                <div>
                                  <span className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                                    Description
                                  </span>
                                  <p className="mt-0.5 text-foreground/80 leading-relaxed">
                                    {row.original.description}
                                  </p>
                                </div>
                              )}
                              {row.original.references?.length > 0 && (
                                <div>
                                  <span className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                                    References
                                  </span>
                                  <div className="mt-0.5 flex flex-col gap-0.5">
                                    {row.original.references.map((ref, i) => (
                                      <a
                                        key={i}
                                        href={ref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline break-all"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {ref}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Showing {table.getRowModel().rows.length} of {filteredFindings.length} findings
        {sevFilter !== "ALL" && ` (filtered to ${sevFilter})`}
      </p>
    </div>
  );
}
