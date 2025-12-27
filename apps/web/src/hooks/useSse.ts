import { useEffect, useRef, useState } from "react";

export function useSseEvent<T>(args: {
  url: string | null;
  eventName: string;
  parse: (data: unknown) => T;
}): { last: T | null; connected: boolean } {
  const { url, eventName, parse } = args;
  const [last, setLast] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    const es = new EventSource(url);
    esRef.current = es;

    const onOpen = () => setConnected(true);
    const onError = () => setConnected(false);

    const onEvent = (evt: MessageEvent<string>) => {
      try {
        setLast(parse(JSON.parse(String(evt.data)) as unknown));
      } catch {
        // ignore
      }
    };

    es.addEventListener("open", onOpen as EventListener);
    es.addEventListener("error", onError as EventListener);
    es.addEventListener(eventName, onEvent as EventListener);

    return () => {
      es.removeEventListener("open", onOpen as EventListener);
      es.removeEventListener("error", onError as EventListener);
      es.removeEventListener(eventName, onEvent as EventListener);
      es.close();
      esRef.current = null;
    };
  }, [url, eventName, parse]);

  return { last, connected };
}
