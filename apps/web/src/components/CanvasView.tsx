import { useEffect, useRef } from 'react';
import { CanvasEngine } from '../canvas/CanvasEngine';
import { type Viewport } from '../canvas/viewport';
import { type WorkspaceDoc } from '@gm/shared';

export function CanvasView(props: {
  doc: WorkspaceDoc;
  viewport: Viewport;
  width: number;
  height: number;
  dpr: number;
  ghostWorldRect?: { x: number; y: number; w: number; h: number } | null;
  onRenderMs?: (ms: number) => void;
}) {
  const { doc, viewport, width, height, dpr, ghostWorldRect, onRenderMs } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const onRenderMsRef = useRef<typeof onRenderMs>(onRenderMs);

  useEffect(() => {
    onRenderMsRef.current = onRenderMs;
  }, [onRenderMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new CanvasEngine(canvas);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resize({ width, height, dpr });
    const ms = engine.render({
      doc,
      viewport,
      width,
      height,
      dpr,
      ghostWorldRect: ghostWorldRect ?? null,
    });
    onRenderMsRef.current?.(ms);
  }, [doc, viewport, width, height, dpr, ghostWorldRect]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />;
}
