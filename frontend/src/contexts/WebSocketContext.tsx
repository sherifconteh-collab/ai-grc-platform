'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl, getSocketServerUrl } from '../lib/apiBase';

interface WebSocketContextType {
  socket: Socket | null;
  connected: boolean;
  organizationOnlineCount: number;
  reconnecting: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: React.ReactNode;
  token: string | null;
  enabled?: boolean;
}

export function WebSocketProvider({ children, token, enabled = true }: WebSocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [organizationOnlineCount, setOrganizationOnlineCount] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    // Don't connect if disabled or no token
    if (!enabled || !token) {
      setSocket((existingSocket) => {
        if (existingSocket) {
          existingSocket.disconnect();
        }
        return null;
      });
      setConnected(false);
      return;
    }

    const apiUrl = getApiBaseUrl();
    const wsUrl = getSocketServerUrl(apiUrl);

    console.log('[WebSocket] Connecting to:', wsUrl);

    // Create socket connection
    const newSocket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: maxReconnectAttempts,
      timeout: 20000
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('[WebSocket] Connected:', newSocket.id);
      setConnected(true);
      setReconnecting(false);
      reconnectAttempts.current = 0;
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
      setConnected(false);
      reconnectAttempts.current += 1;
      
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.warn('[WebSocket] Max reconnection attempts reached');
        newSocket.disconnect();
      }
    });

    newSocket.on('reconnect_attempt', (attempt) => {
      console.log('[WebSocket] Reconnecting, attempt:', attempt);
      setReconnecting(true);
    });

    newSocket.on('reconnect', () => {
      console.log('[WebSocket] Reconnected successfully');
      setReconnecting(false);
      reconnectAttempts.current = 0;
    });

    // Presence update
    newSocket.on('presence.update', (data: { organizationOnlineCount: number }) => {
      setOrganizationOnlineCount(data.organizationOnlineCount);
    });

    // Handle pong responses
    newSocket.on('pong', (data) => {
      console.log('[WebSocket] Pong received:', data.timestamp);
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      console.log('[WebSocket] Cleaning up connection');
      newSocket.disconnect();
    };
  }, [token, enabled]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!socket || !connected) return;

    const interval = setInterval(() => {
      socket.emit('ping');
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(interval);
  }, [socket, connected]);

  const value = {
    socket,
    connected,
    organizationOnlineCount,
    reconnecting
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

/**
 * Hook to subscribe to WebSocket events
 */
export function useWebSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void,
  enabled: boolean = true
) {
  const { socket, connected } = useWebSocket();

  useEffect(() => {
    if (!socket || !connected || !enabled) return;

    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [socket, connected, event, handler, enabled]);
}

/**
 * Hook for notification events
 */
export function useNotificationEvents() {
  const [newNotification, setNewNotification] = useState<any>(null);
  const [notificationRead, setNotificationRead] = useState<string | null>(null);
  const [allNotificationsRead, setAllNotificationsRead] = useState(false);

  useWebSocketEvent('notification.new', (data: { notification: any }) => {
    setNewNotification(data.notification);
  });

  useWebSocketEvent('notification.read', (data: { notificationId: string }) => {
    setNotificationRead(data.notificationId);
  });

  useWebSocketEvent('notification.read_all', () => {
    setAllNotificationsRead(true);
    setTimeout(() => setAllNotificationsRead(false), 100);
  });

  return {
    newNotification,
    notificationRead,
    allNotificationsRead,
    clearNewNotification: () => setNewNotification(null),
    clearNotificationRead: () => setNotificationRead(null)
  };
}

/**
 * Hook for user presence events
 */
export function usePresenceEvents() {
  const [userOnline, setUserOnline] = useState<{ userId: string; email: string } | null>(null);
  const [userOffline, setUserOffline] = useState<{ userId: string; email: string } | null>(null);

  useWebSocketEvent('user.online', (data: { userId: string; email: string }) => {
    setUserOnline(data);
    setTimeout(() => setUserOnline(null), 5000);
  });

  useWebSocketEvent('user.offline', (data: { userId: string; email: string }) => {
    setUserOffline(data);
    setTimeout(() => setUserOffline(null), 5000);
  });

  return { userOnline, userOffline };
}

/**
 * Hook for system alerts
 */
export function useSystemAlerts() {
  const [alert, setAlert] = useState<any>(null);

  useWebSocketEvent('system.alert', (data: { alert: any }) => {
    setAlert(data.alert);
  });

  return {
    alert,
    clearAlert: () => setAlert(null)
  };
}
