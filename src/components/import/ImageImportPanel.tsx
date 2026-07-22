"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectWallSegments, type DetectedSegment } from "@/lib/import/imageWallDetection";
import { pairParallelWallLines } from "@/lib/import/wallPairing";
import { cleanImportedWalls } from "@/lib/import/weldWalls";
import type { Wall } from "@/lib/types";

/** Tolerância para unir cantos próximos vindos da detecção (imprecisão típica de imagem). */
const ENDPOINT_WELD_TOLERANCE_M = 0.12;

interface ImageImportPanelProps {
  onImport: (walls: Omit<Wall, "id">[], mode: "append" | "replace") => void;
}

interface CandidateSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  enabled: boolean;
  manual: boolean;
  /** Espessura medida (m), quando o segmento veio de um par de linhas paralelas fundidas. */
  thicknessM?: number;
}

type ClickMode = "none" | "calibrate" | "manual";

const MAX_DETECTION_DIM = 1100;
/**
 * Comprimento mínimo (m) para manter um segmento detectado que não formou par.
 * Junções de linhas duplas em cantos/cruzamentos costumam gerar fragmentos curtos
 * e espúrios; um segmento sem par e muito curto quase sempre é ruído, não parede.
 */
const MIN_UNMATCHED_LENGTH_M = 0.4;

export function ImageImportPanel({ onImport }: ImageImportPanelProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const [clickMode, setClickMode] = useState<ClickMode>("none");
  const [calibP1, setCalibP1] = useState<{ x: number; y: number } | null>(null);
  const [calibP2, setCalibP2] = useState<{ x: number; y: number } | null>(null);
  const [realDistanceM, setRealDistanceM] = useState("");
  const [pixelsPerMeter, setPixelsPerMeter] = useState<number | null>(null);

  const [manualStart, setManualStart] = useState<{ x: number; y: number } | null>(null);
  const [segments, setSegments] = useState<CandidateSegment[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [sensitivity, setSensitivity] = useState(50); // 0-100, maior = mais sensível

  const [thicknessCm, setThicknessCm] = useState("15");
  const [kind, setKind] = useState<Wall["kind"]>("internal");

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function resetAll() {
    setSegments([]);
    setCalibP1(null);
    setCalibP2(null);
    setPixelsPerMeter(null);
    setRealDistanceM("");
    setClickMode("none");
    setManualStart(null);
  }

  function handleFile(file: File) {
    resetAll();
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => {
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);
      imgElRef.current = img;
    };
    img.src = url;
  }

  function pointFromEvent(e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    const p = pointFromEvent(e);
    if (!p) return;

    if (clickMode === "calibrate") {
      if (!calibP1) {
        setCalibP1(p);
      } else {
        setCalibP2(p);
        setClickMode("none");
      }
      return;
    }

    if (clickMode === "manual") {
      if (!manualStart) {
        setManualStart(p);
      } else {
        const id = `manual-${Date.now()}-${Math.round(Math.random() * 1000)}`;
        setSegments((prev) => [
          ...prev,
          { id, x1: manualStart.x, y1: manualStart.y, x2: p.x, y2: p.y, enabled: true, manual: true },
        ]);
        setManualStart(null);
        setClickMode("none");
      }
    }
  }

  function applyCalibration() {
    if (!calibP1 || !calibP2) return;
    const dist = Number(realDistanceM.replace(",", "."));
    const pxDist = Math.hypot(calibP2.x - calibP1.x, calibP2.y - calibP1.y);
    if (!Number.isFinite(dist) || dist <= 0 || pxDist === 0) return;
    setPixelsPerMeter(pxDist / dist);
  }

  async function runDetection() {
    const img = imgElRef.current;
    if (!img || naturalWidth === 0 || !pixelsPerMeter) return;
    setDetecting(true);
    try {
      const scale = Math.min(1, MAX_DETECTION_DIM / Math.max(naturalWidth, naturalHeight));
      const detWidth = Math.round(naturalWidth * scale);
      const detHeight = Math.round(naturalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = detWidth;
      canvas.height = detHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, detWidth, detHeight);
      const imageData = ctx.getImageData(0, 0, detWidth, detHeight);

      // sensibilidade 0-100 -> limiar de borda ~ 220 (pouco sensível) a 40 (muito sensível)
      const edgeThreshold = 220 - (sensitivity / 100) * 180;

      const detected: DetectedSegment[] = detectWallSegments(
        { data: imageData.data, width: detWidth, height: detHeight },
        { edgeThreshold }
      );

      const backScale = 1 / scale;
      const detectedNatural = detected.map((s) => ({
        id: s.id,
        x1: s.x1 * backScale,
        y1: s.y1 * backScale,
        x2: s.x2 * backScale,
        y2: s.y2 * backScale,
      }));

      // Em plantas reais cada parede costuma ser desenhada como duas linhas paralelas
      // (as duas faces). Reconhece esses pares e funde em uma única parede com a
      // espessura real medida, em vez de importar duas paredes finas coladas.
      const { paired, unmatched } = pairParallelWallLines(detectedNatural, pixelsPerMeter);

      const pairedSegments: CandidateSegment[] = paired.map((p, i) => ({
        id: `pair-${i}`,
        x1: p.x1,
        y1: p.y1,
        x2: p.x2,
        y2: p.y2,
        enabled: true,
        manual: false,
        thicknessM: p.thicknessM,
      }));
      const unmatchedSegments: CandidateSegment[] = unmatched
        .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / pixelsPerMeter >= MIN_UNMATCHED_LENGTH_M)
        .map((s) => ({
          id: s.id,
          x1: s.x1,
          y1: s.y1,
          x2: s.x2,
          y2: s.y2,
          enabled: true,
          manual: false,
        }));

      // Mantém segmentos manuais já adicionados, substitui apenas os detectados automaticamente.
      setSegments((prev) => [...prev.filter((s) => s.manual), ...pairedSegments, ...unmatchedSegments]);
    } finally {
      setDetecting(false);
    }
  }

  function toggleSegment(id: string) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  function removeSegment(id: string) {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }

  const enabledCount = segments.filter((s) => s.enabled).length;

  const wallsToImport = useMemo(() => {
    if (!pixelsPerMeter) return [];
    const defaultThickness = Number(thicknessCm) / 100 || 0.15;
    const raw = segments
      .filter((s) => s.enabled)
      .map((s, i) => ({
        id: `raw-${i}`,
        start: { x: s.x1 / pixelsPerMeter, y: (naturalHeight - s.y1) / pixelsPerMeter },
        end: { x: s.x2 / pixelsPerMeter, y: (naturalHeight - s.y2) / pixelsPerMeter },
        thickness: s.thicknessM ?? defaultThickness,
        kind,
        source: "image" as const,
      }));
    // Cantos e junções detectados raramente coincidem no pixel exato: normalizamos
    // para que o motor estrutural reconheça as interseções corretamente.
    return cleanImportedWalls(raw, ENDPOINT_WELD_TOLERANCE_M).map((w) => ({
      start: w.start,
      end: w.end,
      thickness: w.thickness,
      kind: w.kind,
      source: w.source,
    }));
  }, [segments, pixelsPerMeter, naturalHeight, thicknessCm, kind]);

  function handleImport(mode: "append" | "replace") {
    if (wallsToImport.length === 0) return;
    onImport(wallsToImport, mode);
  }

  const strokeWidth = Math.max(naturalWidth, naturalHeight) / 400 || 1;
  const pointRadius = strokeWidth * 3;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Envie uma foto ou imagem escaneada da planta. Calibre a escala clicando em dois
        pontos com distância real conhecida, detecte as paredes automaticamente e
        ajuste manualmente o que for necessário antes de importar.
      </p>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="block text-xs text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
      />

      {imageUrl && naturalWidth > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setClickMode(clickMode === "calibrate" ? "none" : "calibrate");
                  setCalibP1(null);
                  setCalibP2(null);
                  setPixelsPerMeter(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  clickMode === "calibrate"
                    ? "bg-amber-500 text-white"
                    : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {clickMode === "calibrate" ? "Clique 2 pontos na imagem…" : "1. Calibrar escala"}
              </button>
              <button
                onClick={() => {
                  setClickMode(clickMode === "manual" ? "none" : "manual");
                  setManualStart(null);
                }}
                disabled={!pixelsPerMeter}
                className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  clickMode === "manual"
                    ? "bg-emerald-600 text-white"
                    : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {clickMode === "manual" ? "Clique início e fim da parede…" : "Adicionar parede manualmente"}
              </button>
            </div>

            <div className="relative w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Planta enviada" className="block w-full select-none" draggable={false} />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
                className="absolute inset-0 h-full w-full"
                style={{ cursor: clickMode === "none" ? "default" : "crosshair" }}
                onClick={handleSvgClick}
              >
                {segments.map((s) => (
                  <g key={s.id}>
                    <line
                      x1={s.x1}
                      y1={s.y1}
                      x2={s.x2}
                      y2={s.y2}
                      stroke={s.enabled ? (s.manual ? "#059669" : "#f59e0b") : "#9ca3af"}
                      strokeWidth={strokeWidth}
                      strokeDasharray={s.enabled ? undefined : `${strokeWidth * 2} ${strokeWidth * 2}`}
                      strokeLinecap="round"
                    />
                  </g>
                ))}

                {calibP1 && calibP2 && (
                  <line
                    x1={calibP1.x}
                    y1={calibP1.y}
                    x2={calibP2.x}
                    y2={calibP2.y}
                    stroke="#2563eb"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${strokeWidth * 2} ${strokeWidth * 2}`}
                  />
                )}
                {calibP1 && (
                  <circle cx={calibP1.x} cy={calibP1.y} r={pointRadius} fill="#2563eb" />
                )}
                {calibP2 && (
                  <circle cx={calibP2.x} cy={calibP2.y} r={pointRadius} fill="#2563eb" />
                )}
                {manualStart && (
                  <circle cx={manualStart.x} cy={manualStart.y} r={pointRadius} fill="#059669" />
                )}
              </svg>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 lg:w-80">
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Escala</h3>
              {calibP1 && calibP2 ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">
                    Distância real entre os 2 pontos (m)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={realDistanceM}
                      onChange={(e) => setRealDistanceM(e.target.value)}
                      placeholder="ex.: 3.20"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <button
                      onClick={applyCalibration}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      Definir
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Clique em &quot;Calibrar escala&quot; e marque 2 pontos na imagem cuja
                  distância real você conhece (ex.: as duas extremidades de uma parede).
                </p>
              )}
              {pixelsPerMeter && (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                  Escala definida: {pixelsPerMeter.toFixed(1)} px/m
                </p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Detecção automática
              </h3>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                Sensibilidade
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="w-full"
              />
              <button
                onClick={runDetection}
                disabled={detecting || !pixelsPerMeter}
                className="mt-2 w-full rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {detecting ? "Detectando…" : "Detectar paredes automaticamente"}
              </button>
              {!pixelsPerMeter && (
                <p className="mt-1 text-xs text-zinc-400">Calibre a escala primeiro.</p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                Segmentos ({segments.length}) — {enabledCount} habilitados
              </div>
              <div className="max-h-48 overflow-y-auto p-2">
                {segments.length === 0 ? (
                  <p className="p-2 text-xs text-zinc-400">Nenhum segmento ainda.</p>
                ) : (
                  segments.map((s, i) => {
                    const lengthM = pixelsPerMeter ? Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / pixelsPerMeter : 0;
                    const kindLabel = s.manual ? "Manual" : s.thicknessM ? "Parede" : "Linha";
                    return (
                      <div key={s.id} className="flex items-center justify-between py-1 text-xs">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={s.enabled}
                            onChange={() => toggleSegment(s.id)}
                          />
                          {kindLabel} #{i + 1} · {lengthM.toFixed(2)} m
                          {s.thicknessM && ` · esp. ${Math.round(s.thicknessM * 100)}cm`}
                        </label>
                        <button
                          onClick={() => removeSegment(s.id)}
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          remover
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              Pares de linhas paralelas entre 8 e 22 cm de distância são reconhecidos
              automaticamente como as duas faces de uma parede (rotulados
              &quot;Parede&quot;, com espessura medida). Linhas sem par usam a espessura
              padrão abaixo.
            </p>

            <div className="grid grid-cols-2 gap-2">
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
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Tipo
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Wall["kind"])}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="external">Externa</option>
                  <option value="internal">Interna</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleImport("append")}
                disabled={wallsToImport.length === 0}
                className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Adicionar às paredes atuais
              </button>
              <button
                onClick={() => handleImport("replace")}
                disabled={wallsToImport.length === 0}
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Substituir paredes atuais
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
