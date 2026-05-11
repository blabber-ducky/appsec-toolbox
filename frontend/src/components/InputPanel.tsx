import { useState, useRef, useCallback } from "react";
import { Upload, Link, Image, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InputType } from "@/types";

interface InputPanelProps {
  isImageScan: boolean;
  onSubmit: (formData: FormData) => void;
  isLoading: boolean;
}

export default function InputPanel({ isImageScan, onSubmit, isLoading }: InputPanelProps) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [textValue, setTextValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileAccept = isImageScan ? ".tar.gz,.tgz" : ".zip";
  const fileLabel = isImageScan ? "Docker Image (.tar.gz)" : "Source Code (.zip)";
  const textLabel = isImageScan ? "Image Reference" : "Git Repository URL";
  const textPlaceholder = isImageScan
    ? "e.g. nginx:latest, python:3.12-slim, ghcr.io/org/image:tag"
    : "e.g. https://github.com/org/repo.git";
  const inputType: InputType = mode === "file"
    ? isImageScan ? "image_tar" : "zip"
    : isImageScan ? "image_ref" : "git";

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleSubmit = () => {
    const fd = new FormData();
    fd.append("input_type", inputType);
    if (mode === "file" && file) {
      fd.append("file", file);
    } else if (mode === "text" && textValue.trim()) {
      if (isImageScan) {
        fd.append("image_ref", textValue.trim());
      } else {
        fd.append("git_url", textValue.trim());
      }
    }
    onSubmit(fd);
  };

  const canSubmit =
    !isLoading &&
    (mode === "file" ? file !== null : textValue.trim().length > 0);

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-input bg-muted p-1 gap-1">
        <button
          onClick={() => { setMode("file"); setFile(null); }}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            mode === "file" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {isImageScan ? <Image className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          Upload {fileLabel}
        </button>
        <button
          onClick={() => { setMode("text"); setFile(null); }}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
            mode === "text" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link className="h-4 w-4" />
          {textLabel}
        </button>
      </div>

      {mode === "file" ? (
        <div>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : file
                ? "border-green-400 bg-green-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <Upload className={`h-8 w-8 ${file ? "text-green-500" : "text-gray-400"}`} />
            {file ? (
              <div className="text-center">
                <p className="font-medium text-sm text-green-700">{file.name}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(1)} MB — click to replace
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-medium text-sm">Drop {fileLabel} here</p>
                <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={fileAccept}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="text-input">{textLabel}</Label>
          <Input
            id="text-input"
            placeholder={textPlaceholder}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
            className="font-mono text-sm"
          />
          {!isImageScan && (
            <p className="text-xs text-muted-foreground">
              Public repos are cloned with <code className="font-mono">--depth 1</code>. For private
              repos, use SSH URLs or upload a ZIP instead.
            </p>
          )}
          {isImageScan && (
            <p className="text-xs text-muted-foreground">
              The image will be pulled from its registry and saved locally before scanning — no
              network access is given to the scanner itself.
            </p>
          )}
        </div>
      )}

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full" size="lg">
        {isLoading ? "Starting scan..." : "Run Scan"}
      </Button>
    </div>
  );
}
