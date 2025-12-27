import { useEffect, useRef, useState } from 'react';

export type PerfStats = {
  fps: number;
  renderMs: number | null;
  hitTestMs: number | null;
  reducerMs: number | null;
};

export function useFps(): number {
  const [fps, setFps] = useState(0);
  const raf = useRef<number | null>(null);
  const frames = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    last.current = performance.now();

    function loop(t: number) {
      frames.current += 1;
      const dt = t - last.current;
      if (dt >= 500) {
        setFps(Math.round((frames.current * 1000) / dt));
        frames.current = 0;
        last.current = t;
      }
      raf.current = requestAnimationFrame(loop);
    }

    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return fps;
}
