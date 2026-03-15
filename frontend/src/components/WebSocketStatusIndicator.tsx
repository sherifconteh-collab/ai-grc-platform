'use client';

import { useWebSocket } from '@/contexts/WebSocketContext';

/**
 * Small dot indicator showing real-time WebSocket connection status.
 * Green = connected, gray = disconnected.
 */
export function WebSocketStatusIndicator() {
  const { connected } = useWebSocket();

  return (
    <span
      title={connected ? 'Real-time: connected' : 'Real-time: disconnected'}
      className="fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur px-2.5 py-1 text-xs text-gray-500 shadow"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          connected ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}
