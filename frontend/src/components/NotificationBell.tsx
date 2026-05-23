'use client';

import { useEffect, useState, useRef } from 'react';
import { notificationsAPI } from '@/lib/api';
import { useNotificationEvents } from '@/contexts/WebSocketContext';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  // Real-time notification events
  const { newNotification, notificationRead, allNotificationsRead, clearNewNotification, clearNotificationRead } = useNotificationEvents();

  useEffect(() => {
    loadNotifications();
    // Reduced polling interval from 30s to 60s since we have real-time updates; keep 60s as backup polling
    const interval = setInterval(loadNotifications, 60000); // Poll every 60 seconds as backup
    return () => clearInterval(interval);
  }, []);

  // Handle new real-time notification
  useEffect(() => {
    if (newNotification) {
      setNotifications(prev => [newNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
      clearNewNotification();
      
      // Show browser notification if permission granted
      if (Notification.permission === 'granted') {
        new Notification(newNotification.title, {
          body: newNotification.message,
          icon: '/icon-192.png',
          badge: '/icon-72.png'
        });
      }
    }
  }, [newNotification, clearNewNotification]);

  // Handle notification read event
  useEffect(() => {
    if (notificationRead) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationRead ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      clearNotificationRead();
    }
  }, [notificationRead, clearNotificationRead]);

  // Handle all notifications read event
  useEffect(() => {
    if (allNotificationsRead) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  }, [allNotificationsRead]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await notificationsAPI.getAll({ limit: 10 });
      setNotifications(response.data.data.notifications || []);
      setUnreadCount(response.data.data.unreadCount || 0);
    } catch (err) {
      // Silently fail — notifications are non-critical
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await notificationsAPI.markRead(id);
      // Real-time event (notificationRead from useEffect lines 52-60) will update the UI
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      // Real-time event will update the UI
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'control_due': return '\u23F0';
      case 'assessment_needed': return '\u{1F4CB}';
      case 'status_change': return '\u{1F504}';
      case 'crosswalk': return '\u{1F517}';
      case 'system': return '\u2699';
      default: return '\u{1F514}';
    }
  };

  return (
    <div className="relative z-[70]" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-300 hover:text-white transition-colors"
        title="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-lg shadow-xl border z-[80] max-h-96 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-purple-600 hover:text-purple-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-72">
            {notifications.length > 0 ? (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 border-b hover:bg-gray-50 cursor-pointer ${
                    !notification.is_read ? 'bg-purple-50' : ''
                  }`}
                  onClick={() => {
                    if (!notification.is_read) handleMarkRead(notification.id);
                    if (notification.link) window.location.href = notification.link;
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg flex-shrink-0">{typeIcon(notification.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm break-words ${!notification.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 break-words">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notification.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-purple-600 rounded-full flex-shrink-0 mt-1.5"></span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">
                No notifications yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
