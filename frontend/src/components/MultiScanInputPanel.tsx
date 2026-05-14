import { useState, useRef, useCallback } from "react";
import { Upload, Link, Image, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ScanType } from "@/types";

const SOURCE_TYPES: Set<ScanType> = new Set(["SAST", "SCA", "IaC", "Secrets", "Mobile"]);

export interface MultiScanInputValues {
  sourceInputType: "zip" | "git";
  sourceFile: File | null;
  gitUrl: string;
  imageInputType: "image_tar" | "image_ref";
  imageFile: File | null;
  imageRef: string;
}

interface Props {
  selectedTypes: ScanType[];
  values: MultiScanInputValues;
  onChange: (v: MultiScanInputValues) => void;
  onContinue: () => void;
}

export default function MultiScanInputPanel({ selectedTypes, values, onChange, onContinue }: Props) {
  const needsSource = selectedTypes.some((t) => SOURCE_TYPES.has(t));
  const needsImage = selectedTypes.some((t) => !SOURCE_TYPES.has(t));

  const [srcDrag, setSrcDrag] = useState(false);
  const [imgDrag, setImgDrag] = useState(false);
  const srcRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<MultiScanInputValues>) => onChange({ ...values, ...patch });

  const handleSrcDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setSrcDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) set({ sourceFile: f });
  }, [values]);

  const handleImgDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setImgDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) set({ imageFile: f });
  }, [values]);

  const sourceReady = !needsSource || (
    values.sourceInputType === "zip" ? values.sourceFile !== null : values.gitUrl.trim().length > 0
  );
  const imageReady = !needsImage || (
    values.imageInputType === "image_tar" ? values.imageFile !== null : values.imageRef.trim().length > 0
  );
  const canContinue = sourceReady && imageReady;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Provide input</h2>
        <p className="text-sm text-muted-foreground">
          {needsSource && needsImage
            ? "Source code for code scans + a container image for the Build scan."
            : needsImage
            ? "A container image for the Build scan."
            : "Source code for all selected scans."}
        </p>
      </div>

      {/* ── Source input ─────────────────────────────────────────────────── */}
      {needsSource && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              Source Code
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex rounded-lg border border-input bg-muted p-1 gap-1">
            <button
              onClick={() => set({ sourceInputType: "zip", sourceFile: null })}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                values.sourceInputType === "zip" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-4 w-4" /> Upload ZIP
            </button>
            <button
              onClick={() => set({ sourceInputType: "git", sourceFile: null })}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                values.sourceInputType === "git" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link className="h-4 w-4" /> Git URL
            </button>
          </div>

          {values.sourceInputType === "zip" ? (
            <div
              onClick={() => srcRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setSrcDrag(true); }}
              onDragLeave={() => setSrcDrag(false)}
              onDrop={handleSrcDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                srcDrag ? "border-primary bg-primary/5"
                  : values.sourceFile ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className={`h-7 w-7 ${values.sourceFile ? "text-green-500" : "text-gray-400"}`} />
              {values.sourceFile ? (
                <div className="text-center">
                  <p className="font-medium text-sm text-green-700">{values.sourceFile.name}</p>
                  <p className="text-xs text-green-600">{(values.sourceFile.size / 1024 / 1024).toFixed(1)} MB — click to replace</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-sm">Drop source ZIP here</p>
                  <p className="text-xs text-muted-foreground">or click to browse</p>
                </div>
              )}
              <input ref={srcRef} type="file" accept=".zip" className="hidden" onChange={(e) => set({ sourceFile: e.target.files?.[0] ?? null })} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Git Repository URL</Label>
              <Input
                placeholder="https://github.com/org/repo.git"
                value={values.gitUrl}
                onChange={(e) => set({ gitUrl: e.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Public repositories only. Cloned with --depth 1.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Image input ──────────────────────────────────────────────────── */}
      {needsImage && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              Container Image (Build scan)
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex rounded-lg border border-input bg-muted p-1 gap-1">
            <button
              onClick={() => set({ imageInputType: "image_tar", imageFile: null })}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                values.imageInputType === "image_tar" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Image className="h-4 w-4" /> Upload .tar.gz
            </button>
            <button
              onClick={() => set({ imageInputType: "image_ref", imageFile: null })}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                values.imageInputType === "image_ref" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link className="h-4 w-4" /> Registry Reference
            </button>
          </div>

          {values.imageInputType === "image_tar" ? (
            <div
              onClick={() => imgRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setImgDrag(true); }}
              onDragLeave={() => setImgDrag(false)}
              onDrop={handleImgDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                imgDrag ? "border-primary bg-primary/5"
                  : values.imageFile ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <Upload className={`h-7 w-7 ${values.imageFile ? "text-green-500" : "text-gray-400"}`} />
              {values.imageFile ? (
                <div className="text-center">
                  <p className="font-medium text-sm text-green-700">{values.imageFile.name}</p>
                  <p className="text-xs text-green-600">{(values.imageFile.size / 1024 / 1024).toFixed(1)} MB — click to replace</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-sm">Drop Docker image .tar.gz here</p>
                  <p className="text-xs text-muted-foreground">Export with: docker save myimage | gzip &gt; image.tar.gz</p>
                </div>
              )}
              <input ref={imgRef} type="file" accept=".tar.gz,.tgz" className="hidden" onChange={(e) => set({ imageFile: e.target.files?.[0] ?? null })} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Image Reference</Label>
              <Input
                placeholder="nginx:latest, python:3.12-slim, ghcr.io/org/image:tag"
                value={values.imageRef}
                onChange={(e) => set({ imageRef: e.target.value })}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">The image will be pulled from its registry before scanning.</p>
            </div>
          )}
        </div>
      )}

      <Button className="w-full" disabled={!canContinue} onClick={onContinue}>
        Continue → Select tools
      </Button>
    </div>
  );
}
