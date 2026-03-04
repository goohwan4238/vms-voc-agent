import { useEffect, useRef } from 'react';

interface SSEEvent {
  type: string;
  vocId: string;
}

export function useSSE(onEvent: (event: SSEEvent) => void) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/events');

    es.onmessage = (e) => {
      try {
        const data: SSEEvent = JSON.parse(e.data);
        callbackRef.current(data);
      } catch {
        // 무시
      }
    };

    es.onerror = () => {
      // EventSource는 자동 재연결
    };

    return () => es.close();
  }, []);
}
