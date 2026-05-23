'use client';

import { useWebSocket } from '@/contexts/WebSocketContext';
import { useState, useEffect } from 'react';

export function WebSocketStatusIndicator() {
  const { connected, reconnecting, organizationOnlineCount } = useWebSocket();
  const [showTooltip, setShowTooltip] = useState(false);
  const [visible, setVisible] = useState(true);

  // Hide indicator after successful connection
  useEffect(() => {
    if (connected && !reconnecting) {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [connected, reconnecting]);

  if (!visible && connected && !reconnecting) {
    return null;
  }

  const getStatus = () => {
    if (reconnecting) return { text: 'Reconnecting...', color: 'bg-yellow-500', icon: '⟳' };
    if (connected) return { text: 'Connected', color: 'bg-green-500', icon: '●' };
    return { text: 'Disconnected', color: 'bg-red-500', icon: '○' };
  };

  const status = getStatus();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg shadow-lg border border-gray-200 bg-white ${
          reconnecting ? 'animate-pulse' : ''
        }`}>
          <span className={`inline-block w-2 h-2 rounded-full ${status.color}`}></span>
          <span className="text-sm font-medium text-gray-700">
            {status.text}
          </span>
          {connected && organizationOnlineCount > 0 && (
            <span className="text-xs text-gray-500 ml-2">
              ({organizationOnlineCount} online)
            </span>
          )}
        </div>

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl">
            <div className="mb-2">
              <div className="font-semibold mb-1">Real-time Connection Status</div>
              <div className="text-gray-300">
                {connected
                  ? 'You\'re receiving real-time updates for notifications, control changes, and more.'
                  : 'Real-time updates are currently unavailable. Trying to reconnect...'}
              </div>
            </div>
            {connected && organizationOnlineCount > 0 && (
              <div className="pt-2 border-t border-gray-700">
                <span className="text-gray-400">
                  {organizationOnlineCount} {organizationOnlineCount === 1 ? 'user' : 'users'} online in your organization
                </span>
              </div>
            )}
            {/* Arrow */}
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
    </div>
  );
}
