"use client";

import { useMemo, useState } from "react";
import type { IDxf } from "dxf-parser";
import { extractWallsFromDxf, parseDxfText, type DxfLayerInfo } from "@/lib/import/dxfImport";
import type { Wall } from "@/lib/types";

interface DxfImportPanelProps {
  onImport: (walls: Omit<Wall, "id">[], mode: "append" | "replace") => void;
}

const UNIT_OPTIONS = [
  { label: "Milímetros (mm)", scale: 0.001 },
  { label: "Centímetros (cm)", scale: 0.01 },
  { label: "Metros (m)", scale: 1 },
];

export function DxfImportPanel({ onImport }: DxfImportPanelProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dxf, setDxf] = useState<IDxf | null>(null);
  const [layers, setLayers] = useState<DxfLayerInfo[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [unitScale, setUnitScale] = useState(1);
  const [thicknessCm, setThicknessCm] = useState("15");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseDxfText(text);
      setFileName(file.name);
      setDxf(parsed.dxf);
      setLayers(parsed.layers);
      setUnitScale(parsed.suggestedUnitScale);
      setSelectedLayers(new Set(parsed.layers.filter((l) => l.likelyWall).map((l) => l.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler o arquivo DXF.");
      setDxf(null);
      setLayers([]);
    }
  }

  const previewWalls = useMemo(() => {
    if (!dxf || selectedLayers.size === 0) return [];
    return extractWallsFromDxf(dxf, {
      selectedLayers,
      unitScale,
      defaultThickness: Number(thicknessCm) / 100 || 0.15,
    });
  }, [dxf, selectedLayers, unitScale, thicknessCm]);

  function toggleLayer(name: string) {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleImport(mode: "append" | "replace") {
    if (previewWalls.length === 0) return;
    onImport(
      previewWalls.map((w) => ({
        start: w.start,
        end: w.end,
        thickness: w.thickness,
        kind: w.kind,
        source: w.source,
      })),
      mode
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Importa paredes de um arquivo DXF (AutoCAD). Escolha as camadas que representam
        paredes e a unidade de desenho do arquivo original.
      </p>

      <div>
        <input
          type="file"
          accept=".dxf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="block text-xs text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
        {fileName && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Arquivo: {fileName}</p>}
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {dxf && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Unidade do arquivo
              </label>
              <select
                value={unitScale}
                onChange={(e) => setUnitScale(Number(e.target.value))}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.label} value={u.scale}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Espessura padrão (cm)
              </label>
              <input
                value={thicknessCm}
                onChange={(e) => setThicknessCm(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Camadas ({layers.length}) — marque as que representam paredes
            </label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              {layers.map((l) => (
                <label
                  key={l.name}
                  className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5 text-xs last:border-b-0 dark:border-zinc-800"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedLayers.has(l.name)}
                      onChange={() => toggleLayer(l.name)}
                    />
                    {l.name}
                    {l.likelyWall && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        provável parede
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-400">{l.entityCount} linha(s)</span>
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <strong>{previewWalls.length}</strong> parede(s) serão importadas.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => handleImport("append")}
              disabled={previewWalls.length === 0}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Adicionar às paredes atuais
            </button>
            <button
              onClick={() => handleImport("replace")}
              disabled={previewWalls.length === 0}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Substituir paredes atuais
            </button>
          </div>
        </>
      )}
    </div>
  );
}
