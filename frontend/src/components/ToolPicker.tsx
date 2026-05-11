import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ToolConfig } from "@/types";

interface ToolPickerProps {
  tools: ToolConfig[];
  selectedId: string | null;
  onChange: (id: string) => void;
}

export default function ToolPicker({ tools, selectedId, onChange }: ToolPickerProps) {
  const selected = tools.find((t) => t.id === selectedId);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Choose a scanner</p>

        <div className="flex flex-col gap-2">
          {tools.map((tool) => {
            const isSelected = tool.id === selectedId;
            return (
              <button
                key={tool.id}
                onClick={() => onChange(tool.id)}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 text-left transition-all duration-100 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "border-primary" : "border-gray-300"
                    }`}
                  >
                    {isSelected && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="font-medium text-sm">{tool.name}</span>
                  {tool.supports_spdx && (
                    <span className="text-[10px] font-mono border border-green-300 text-green-700 bg-green-50 rounded px-1.5 py-0.5">
                      SPDX
                    </span>
                  )}
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                    {tool.tooltip}
                  </TooltipContent>
                </Tooltip>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">Tip: </span>
            {selected.hint}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
