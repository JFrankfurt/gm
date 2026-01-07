import { useEffect, useState } from 'react';
import type { UserFill } from './types';

// Hook to subscribe to user-specific WebSocket updates
export function useHyperliquidUserState(address: string | undefined) {
  const [fills, setFills] = useState<UserFill[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (!address) {
      setFills([]);
      setWsConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

        ws.onopen = () => {
          setWsConnected(true);
          
          // Subscribe to user fills
          const subscribeMsg = {
            method: 'subscribe',
            subscription: {
              type: 'userFills',
              user: address,
            },
          };
          ws?.send(JSON.stringify(subscribeMsg));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            
            // Handle user fills
            if (msg.channel === 'userFills' && msg.data) {
              const newFills: UserFill[] = Array.isArray(msg.data) ? msg.data : [msg.data];
              setFills((prev) => {
                // Prepend new fills and limit to 50
                const combined = [...newFills, ...prev];
                return combined.slice(0, 50);
              });
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err);
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
        };

        ws.onclose = () => {
          setWsConnected(false);
          // Reconnect after 2 seconds
          reconnectTimeout = setTimeout(connect, 2000);
        };
      } catch (err) {
        console.error('WebSocket connection error:', err);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [address]);

  return {
    fills,
    wsConnected,
  };
}

