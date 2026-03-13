// @tier: community
/**
 * Push notification utilities for browser notifications
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * Convert base64 VAPID key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported
 */
export function isPushNotificationSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get current notification permission status
 */
export function getNotificationPermissionStatus(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  console.log('Notification permission:', permission);
  return permission;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(apiUrl: string, token: string): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    console.warn('Push notifications not supported');
    return false;
  }

  // Request permission if not granted
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission not granted');
    return false;
  }

  try {
    // Register service worker if not already registered
    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      console.log('Already subscribed to push notifications');
      // Send subscription to server
      await sendSubscriptionToServer(apiUrl, token, subscription);
      return true;
    }

    // Subscribe to push notifications
    if (!VAPID_PUBLIC_KEY) {
      console.warn('VAPID public key not configured');
      return false;
    }

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
    });

    console.log('Subscribed to push notifications');

    // Send subscription to server
    await sendSubscriptionToServer(apiUrl, token, subscription);
    
    return true;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(apiUrl: string, token: string): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      console.log('Not subscribed to push notifications');
      return true;
    }

    // Unsubscribe
    await subscription.unsubscribe();
    console.log('Unsubscribed from push notifications');

    // Remove from server
    await removeSubscriptionFromServer(apiUrl, token, subscription.endpoint);

    return true;
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
    return false;
  }
}

/**
 * Send subscription to server
 */
async function sendSubscriptionToServer(
  apiUrl: string,
  token: string,
  subscription: PushSubscription
): Promise<void> {
  const endpoint = subscription.endpoint;
  const keys = subscription.toJSON().keys;

  if (!keys || !keys.p256dh || !keys.auth) {
    throw new Error('Invalid subscription keys');
  }

  const response = await fetch(`${apiUrl}/realtime/push-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth
      }
    })
  });

  if (!response.ok) {
    throw new Error('Failed to save push subscription to server');
  }

  console.log('Push subscription saved to server');
}

/**
 * Remove subscription from server
 */
async function removeSubscriptionFromServer(
  apiUrl: string,
  token: string,
  endpoint: string
): Promise<void> {
  const response = await fetch(`${apiUrl}/realtime/push-subscription`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ endpoint })
  });

  if (!response.ok) {
    throw new Error('Failed to remove push subscription from server');
  }

  console.log('Push subscription removed from server');
}

/**
 * Check if currently subscribed to push notifications
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error('Failed to check push subscription status:', error);
    return false;
  }
}
