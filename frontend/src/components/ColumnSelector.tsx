import { Columns3, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import type { ColumnMeta } from "@/types";

interface ColumnSelectorProps {
  columns: ColumnMeta[];
  selected: string[];
  onChange: (keys: string[]) => void;
}

export default function ColumnSelector({ columns, selected, onChange }: ColumnSelectorProps) {
  const toggle = (key: string) => {
    onChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  };

  const selectAll = () => onChange(columns.map((c) => c.key));
  const selectDefaults = () => onChange(columns.filter((c) => c.default).map((c) => c.key));

  return (
    <TooltipProvider delayDuration={200}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Columns3 className="h-4 w-4" />
            Columns
            <span className="font-mono text-xs text-muted-foreground">
              {selected.length}/{columns.length}
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-64 p-0">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Visible columns
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectDefaults}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Defaults
              </button>
              <button
                onClick={selectAll}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                All
              </button>
            </div>
          </div>

          <Separator />

          <div className="p-2 space-y-0.5">
            {columns.map((col) => (
              <div
                key={col.key}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                onClick={() => toggle(col.key)}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${col.key}`}
                    checked={selected.includes(col.key)}
                    onCheckedChange={() => toggle(col.key)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Label
                    htmlFor={`col-${col.key}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {col.label}
                  </Label>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-48 text-xs leading-relaxed">
                    {col.description}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
