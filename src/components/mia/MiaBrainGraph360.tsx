import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Minus, Plus, Rotate3d } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MiaBrainConversation } from "@/hooks/useMiaBrainData";
import type { MiaOpenConversationAssessment } from "@/hooks/useMiaOpenConversationsReport";

interface Props {
  conversations: MiaBrainConversation[];
  assessments: Map<string, MiaOpenConversationAssessment>;
  loading: boolean;
  live: boolean;
  error: string | null;
  onOpenConversation: (conversationId: string) => void;
}

type NodeKind = "core" | "owner" | "conversation";
type Temperature = "hot" | "warm" | "cold" | "unknown";

interface GraphNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  label: string;
  conversationId?: string;
  temperature?: Temperature;
}

interface GraphEdge {
  from: string;
  to: string;
  color: string;
}

const TEMPERATURE_COLOR: Record<Temperature, string> = {
  hot: "#fb6b57",
  warm: "#f6c453",
  cold: "#54c8e8",
  unknown: "#718096",
};

function temperatureOf(assessment?: MiaOpenConversationAssessment): Temperature {
  if (!assessment) return "unknown";
  if (assessment.close_probability >= 70) return "hot";
  if (assessment.close_probability >= 40) return "warm";
  return "cold";
}

function hash(value: string): number {
  let output = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    output ^= value.charCodeAt(index);
    output = Math.imul(output, 16777619);
  }
  return Math.abs(output >>> 0);
}

function makeGraph(
  conversations: MiaBrainConversation[],
  assessments: Map<string, MiaOpenConversationAssessment>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [{
    id: "mia-core",
    kind: "core",
    x: 0,
    y: 0,
    z: 0,
    radius: 18,
    color: "#f6c453",
    label: "Mia",
  }];
  const edges: GraphEdge[] = [];
  const groups = new Map<string, MiaBrainConversation[]>();

  conversations.forEach((conversation) => {
    const key = conversation.ownerId ?? "unassigned";
    groups.set(key, [...(groups.get(key) ?? []), conversation]);
  });

  [...groups.entries()].forEach(([ownerId, owned], ownerIndex) => {
    const ownerAngle = (ownerIndex / Math.max(groups.size, 1)) * Math.PI * 2;
    const ownerRadius = 112 + (ownerIndex % 2) * 28;
    const ownerNodeId = `owner-${ownerId}`;
    nodes.push({
      id: ownerNodeId,
      kind: "owner",
      x: Math.cos(ownerAngle) * ownerRadius,
      y: ((ownerIndex % 3) - 1) * 34,
      z: Math.sin(ownerAngle) * ownerRadius,
      radius: 9,
      color: ownerId === "unassigned" ? "#64748b" : "#d5a72d",
      label: owned[0]?.ownerName ?? "Sem responsável",
    });
    edges.push({ from: "mia-core", to: ownerNodeId, color: "#f6c453" });

    owned.forEach((conversation, conversationIndex) => {
      const seed = hash(conversation.id);
      const angle = ownerAngle + (conversationIndex / Math.max(owned.length, 1)) * Math.PI * 1.45 - 0.7;
      const distance = 58 + (seed % 44);
      const assessment = assessments.get(conversation.id);
      const temperature = temperatureOf(assessment);
      const color = TEMPERATURE_COLOR[temperature];
      const nodeId = `conversation-${conversation.id}`;
      nodes.push({
        id: nodeId,
        kind: "conversation",
        x: Math.cos(angle) * distance + Math.cos(ownerAngle) * ownerRadius,
        y: ((seed % 91) - 45) * 1.15,
        z: Math.sin(angle) * distance + Math.sin(ownerAngle) * ownerRadius,
        radius: 4 + ((assessment?.close_probability ?? 0) / 100) * 3,
        color,
        label: conversation.visitorName,
        conversationId: conversation.id,
        temperature,
      });
      edges.push({ from: ownerNodeId, to: nodeId, color });
    });
  });

  return { nodes, edges };
}

export function MiaBrainGraph360({ conversations, assessments, loading, live, error, onOpenConversation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const transformRef = useRef({ yaw: 0.35, pitch: -0.18, zoom: 1 });
  const pointerRef = useRef({ dragging: false, x: 0, y: 0, startX: 0, startY: 0, moved: false });
  const hitTargetsRef = useRef<Array<{ id: string; x: number; y: number; radius: number }>>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const nodeBirthRef = useRef(new Map<string, number>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { nodes, edges } = useMemo(() => makeGraph(conversations, assessments), [assessments, conversations]);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNode = selectedId ? nodeMap.get(selectedId) : null;
  const selectedAssessment = selectedNode?.conversationId ? assessments.get(selectedNode.conversationId) : undefined;

  useEffect(() => {
    if (selectedId && !nodeMap.has(selectedId)) setSelectedId(null);
  }, [nodeMap, selectedId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === sectionRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen || document.fullscreenElement) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mountedAt = performance.now();
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    nodes.forEach((node) => {
      if (!nodeBirthRef.current.has(node.id)) nodeBirthRef.current.set(node.id, mountedAt);
    });
    [...nodeBirthRef.current.keys()].forEach((nodeId) => {
      if (!visibleNodeIds.has(nodeId)) nodeBirthRef.current.delete(nodeId);
    });

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    resize();

    const draw = (now: number) => {
      const delta = Math.min(50, now - last);
      last = now;
      if (!reducedMotion && !pointerRef.current.dragging) transformRef.current.yaw += delta * 0.000055;
      context.clearRect(0, 0, width, height);
      const { yaw, pitch, zoom } = transformRef.current;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosX = Math.cos(pitch);
      const sinX = Math.sin(pitch);
      const scale = Math.min(width / 520, height / 330) * zoom;
      const projected = new Map<string, { x: number; y: number; z: number; scale: number }>();

      nodes.forEach((node) => {
        const rotatedX = node.x * cosY - node.z * sinY;
        const rotatedZ = node.x * sinY + node.z * cosY;
        const rotatedY = node.y * cosX - rotatedZ * sinX;
        const depth = node.y * sinX + rotatedZ * cosX;
        const perspective = 620 / (620 + depth);
        projected.set(node.id, {
          x: width / 2 + rotatedX * scale * perspective,
          y: height / 2 + rotatedY * scale * perspective,
          z: depth,
          scale: perspective,
        });
      });

      edges
        .map((edge) => ({ edge, from: projected.get(edge.from), to: projected.get(edge.to) }))
        .filter((entry): entry is { edge: GraphEdge; from: NonNullable<typeof entry.from>; to: NonNullable<typeof entry.to> } => Boolean(entry.from && entry.to))
        .sort((a, b) => a.to.z - b.to.z)
        .forEach(({ edge, from, to }, edgeIndex) => {
          const reveal = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - (nodeBirthRef.current.get(edge.to) ?? mountedAt)) / 650));
          context.globalAlpha = reveal;
          const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
          gradient.addColorStop(0, `${edge.color}08`);
          gradient.addColorStop(1, `${edge.color}66`);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.strokeStyle = gradient;
          context.lineWidth = Math.max(0.5, to.scale);
          context.stroke();

          if (!reducedMotion) {
            const travel = ((now * 0.00012) + edgeIndex * 0.173) % 1;
            const particleX = from.x + (to.x - from.x) * travel;
            const particleY = from.y + (to.y - from.y) * travel;
            context.beginPath();
            context.arc(particleX, particleY, Math.max(1.2, to.scale * 1.7), 0, Math.PI * 2);
            context.fillStyle = `${edge.color}cc`;
            context.shadowColor = edge.color;
            context.shadowBlur = 10;
            context.fill();
            context.shadowBlur = 0;
          }
          context.globalAlpha = 1;
        });

      const targets: Array<{ id: string; x: number; y: number; radius: number }> = [];
      [...nodes]
        .sort((a, b) => (projected.get(a.id)?.z ?? 0) - (projected.get(b.id)?.z ?? 0))
        .forEach((node) => {
          const point = projected.get(node.id);
          if (!point) return;
          const pulse = node.kind === "core"
            ? 1 + Math.sin(now * 0.0025) * 0.09
            : node.kind === "conversation" ? 1 + Math.sin(now * 0.0018 + hash(node.id)) * 0.035 : 1;
          const reveal = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - (nodeBirthRef.current.get(node.id) ?? mountedAt)) / 650));
          const revealScale = 0.25 + (0.75 * (1 - ((1 - reveal) ** 3)));
          const radius = Math.max(2.5, node.radius * point.scale * pulse * revealScale);
          const active = hoveredIdRef.current === node.id || selectedId === node.id;
          context.globalAlpha = reveal;
          context.beginPath();
          context.arc(point.x, point.y, radius + (active ? 5 : 0), 0, Math.PI * 2);
          context.fillStyle = `${node.color}${active ? "28" : "14"}`;
          context.fill();
          context.beginPath();
          context.arc(point.x, point.y, radius, 0, Math.PI * 2);
          context.fillStyle = node.color;
          context.shadowColor = node.color;
          context.shadowBlur = active || node.kind === "core" ? 22 : 9;
          context.fill();
          context.shadowBlur = 0;

          if (node.kind === "core") {
            const wave = 28 + ((now * 0.025) % 46);
            context.beginPath();
            context.arc(point.x, point.y, wave * point.scale, 0, Math.PI * 2);
            context.strokeStyle = `rgba(246,196,83,${Math.max(0, 0.22 - (wave - 28) / 230)})`;
            context.lineWidth = 1;
            context.stroke();
          }

          if (node.kind !== "conversation" || active) {
            context.font = `${active ? 600 : 500} ${active ? 12 : 10}px ui-sans-serif, system-ui`;
            context.fillStyle = active ? "#f8fafc" : "#cbd5e1";
            context.textAlign = "center";
            context.fillText(node.label.slice(0, 32), point.x, point.y + radius + 15);
          }
          targets.push({ id: node.id, x: point.x, y: point.y, radius: Math.max(10, radius + 5) });
          context.globalAlpha = 1;
        });
      hitTargetsRef.current = targets;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [edges, nodes, selectedId]);

  const findTarget = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return [...hitTargetsRef.current].reverse().find((target) => Math.hypot(target.x - x, target.y - y) <= target.radius) ?? null;
  };

  const zoomBy = (amount: number) => {
    transformRef.current.zoom = Math.min(1.8, Math.max(0.55, transformRef.current.zoom + amount));
  };

  const toggleFullscreen = async () => {
    const section = sectionRef.current;
    if (!section) return;
    if (document.fullscreenElement === section) {
      await document.exitFullscreen();
      return;
    }
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }
    try {
      await section.requestFullscreen();
    } catch {
      setIsFullscreen(true);
    }
  };

  return (
    <section
      ref={sectionRef}
      className={`overflow-hidden bg-[#090b0d] ${isFullscreen ? "fixed inset-0 z-[100] flex h-dvh w-screen flex-col" : ""}`}
    >
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Rotate3d className="h-5 w-5 text-amber-300" />
            <h3 className="font-black text-slate-100">Rede neural de atendimentos</h3>
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-slate-500"}`} />
          </div>
          <p className="mt-1 text-xs text-slate-400">Arraste para girar, use o scroll para aproximar e clique em um lead para ver a leitura da Mia.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10" onClick={() => zoomBy(-0.12)} aria-label="Diminuir zoom" title="Diminuir zoom"><Minus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10" onClick={() => zoomBy(0.12)} aria-label="Aumentar zoom" title="Aumentar zoom"><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="text-slate-300 hover:bg-white/10" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Sair da tela cheia" : "Expandir para tela cheia"} title={isFullscreen ? "Sair da tela cheia" : "Expandir para tela cheia"}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div ref={wrapperRef} className={`relative min-h-[440px] w-full touch-none select-none bg-[radial-gradient(circle_at_center,rgba(246,196,83,.075),transparent_46%),linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] bg-[size:auto,42px_42px,42px_42px] ${isFullscreen ? "min-h-0 flex-1" : "h-[570px]"}`}>
        <canvas
          ref={canvasRef}
          role="img"
          tabIndex={0}
          aria-label={`Mapa tridimensional da Mia com ${conversations.length} conversas abertas. Use as setas para girar, mais e menos para aproximar.`}
          className="h-full w-full cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-amber-300 active:cursor-grabbing"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointerRef.current = { dragging: true, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
          }}
          onPointerMove={(event) => {
            if (pointerRef.current.dragging) {
              const dx = event.clientX - pointerRef.current.x;
              const dy = event.clientY - pointerRef.current.y;
              transformRef.current.yaw += dx * 0.008;
              transformRef.current.pitch = Math.max(-1.2, Math.min(1.2, transformRef.current.pitch + dy * 0.006));
              pointerRef.current.x = event.clientX;
              pointerRef.current.y = event.clientY;
              pointerRef.current.moved = pointerRef.current.moved || Math.hypot(event.clientX - pointerRef.current.startX, event.clientY - pointerRef.current.startY) > 4;
            } else {
              hoveredIdRef.current = findTarget(event.clientX, event.clientY)?.id ?? null;
            }
          }}
          onPointerUp={(event) => {
            const moved = pointerRef.current.moved;
            pointerRef.current.dragging = false;
            if (!moved) setSelectedId(findTarget(event.clientX, event.clientY)?.id ?? null);
          }}
          onPointerLeave={() => { pointerRef.current.dragging = false; hoveredIdRef.current = null; }}
          onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY > 0 ? -0.08 : 0.08); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") transformRef.current.yaw -= 0.12;
            if (event.key === "ArrowRight") transformRef.current.yaw += 0.12;
            if (event.key === "ArrowUp") transformRef.current.pitch -= 0.1;
            if (event.key === "ArrowDown") transformRef.current.pitch += 0.1;
            if (event.key === "+" || event.key === "=") zoomBy(0.1);
            if (event.key === "-") zoomBy(-0.1);
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(246,196,83,.06),transparent_55%)]" />
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-[#090b0d]/65 text-sm text-slate-300">Mapeando conversas…</div>}
        {error && <div className="absolute left-4 top-4 max-w-md rounded-xl border border-red-400/30 bg-red-950/80 p-3 text-xs text-red-200">{error}</div>}
        {!loading && !conversations.length && !error && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-400">
            {live ? "As bolinhas aparecerão aqui, uma a uma, conforme a Mia concluir cada auditoria." : "Nenhuma conversa auditada nesta temperatura."}
          </div>
        )}
        {selectedNode?.conversationId && (
          <div className="absolute bottom-4 left-1/2 w-[min(92%,480px)] -translate-x-1/2 rounded-2xl border border-amber-300/20 bg-[#0d1013]/94 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{selectedNode.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{selectedAssessment?.summary ?? "Conversa ainda sem análise semântica atual."}</p>
              </div>
              {selectedAssessment && (
                <div className="shrink-0 text-right">
                  <p className="text-xl font-black text-amber-200">{selectedAssessment.close_probability}%</p>
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">fechamento</p>
                </div>
              )}
            </div>
            {selectedAssessment?.next_best_action && (
              <p className="mt-3 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[11px] text-slate-300">
                <strong className="text-amber-200">Próxima ação:</strong> {selectedAssessment.next_best_action}
              </p>
            )}
            <Button size="sm" className="mt-3 w-full bg-amber-300 font-bold text-[#15120a] hover:bg-amber-200" onClick={() => onOpenConversation(selectedNode.conversationId!)}>Abrir conversa</Button>
          </div>
        )}
      </div>
    </section>
  );
}
