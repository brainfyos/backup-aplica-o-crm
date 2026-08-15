import { useState, useRef, useCallback, useEffect } from 'react';
import { useHaptics } from './useHaptics';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
  /** Quando true, desativa todo o gesto (sem listeners). */
  disabled?: boolean;
}

/**
 * Verifica se o gesto começou dentro de um elemento que tem scroll próprio
 * com `scrollTop > 0`. Se sim, NÃO devemos sequestrar o gesto.
 * Também respeita o opt-out via atributo `data-no-pull-to-refresh` em qualquer ancestral.
 */
function shouldIgnoreGesture(target: EventTarget | null, container: HTMLElement): boolean {
  let node = target as HTMLElement | null;
  while (node && node !== container) {
    if (node.dataset?.noPullToRefresh !== undefined) return true;
    // Elemento com scroll próprio que não está no topo → libera scroll nativo.
    if (node.scrollHeight > node.clientHeight) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollTop > 0) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canRefresh, setCanRefresh] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const hasPrevented = useRef(false);
  const haptics = useHaptics();

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const container = containerRef.current;
    if (!container || isRefreshing) return;
    if (container.scrollTop > 0) return;
    if (shouldIgnoreGesture(e.target, container)) return;

    startY.current = e.touches[0].clientY;
    isPulling.current = true;
    hasPrevented.current = false;
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    // Pequenos deltas: deixa o navegador decidir (scroll horizontal, micro-tremores).
    if (diff <= 8) return;

    // Só toma controle do gesto quando já passamos um limiar mínimo.
    if (e.cancelable) {
      e.preventDefault();
      hasPrevented.current = true;
    }

    const resistance = 0.5;
    const pull = Math.min(diff * resistance, maxPull);
    setPullDistance(pull);

    const newCanRefresh = pull >= threshold;
    if (newCanRefresh !== canRefresh) {
      setCanRefresh(newCanRefresh);
      if (newCanRefresh) haptics.medium();
    }
  }, [isRefreshing, threshold, maxPull, canRefresh, haptics]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (canRefresh && !isRefreshing) {
      setIsRefreshing(true);
      haptics.heavy();

      try {
        await onRefresh();
        haptics.success();
      } catch {
        haptics.error();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
        setCanRefresh(false);
      }
    } else {
      setPullDistance(0);
      setCanRefresh(false);
    }
  }, [canRefresh, isRefreshing, onRefresh, haptics]);

  useEffect(() => {
    if (disabled) return;
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    canRefresh,
    progress,
  };
}
