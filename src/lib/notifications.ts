// Web Audio API-based notification sounds
const audioCtx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

type SoundType = 'success' | 'info' | 'alert' | 'complete';

const SOUND_CONFIG: Record<SoundType, { freq: number; duration: number; type: OscillatorType; ramp?: number }[]> = {
  success: [
    { freq: 523, duration: 0.12, type: 'sine' },
    { freq: 659, duration: 0.12, type: 'sine' },
    { freq: 784, duration: 0.2, type: 'sine' },
  ],
  info: [
    { freq: 440, duration: 0.15, type: 'sine' },
    { freq: 554, duration: 0.15, type: 'sine' },
  ],
  alert: [
    { freq: 660, duration: 0.1, type: 'square' },
    { freq: 660, duration: 0.1, type: 'square' },
  ],
  complete: [
    { freq: 523, duration: 0.1, type: 'sine' },
    { freq: 659, duration: 0.1, type: 'sine' },
    { freq: 784, duration: 0.1, type: 'sine' },
    { freq: 1047, duration: 0.3, type: 'sine' },
  ],
};

export function playSound(type: SoundType) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  let time = audioCtx.currentTime;
  for (const note of SOUND_CONFIG[type]) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.freq, time);
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + note.duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + note.duration);
    time += note.duration * 0.8;
  }
}

// ── Web Notifications API ──────────────────────────────────────────

/** Request permission for browser push notifications. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Check current notification permission status */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  /** Also play an audio sound */
  sound?: SoundType;
}

const RIDE_STATUS_MESSAGES: Record<string, { title: string; body: string; sound: SoundType }> = {
  searching: {
    title: '🔍 Searching for Driver',
    body: 'We are finding the best driver for your ride.',
    sound: 'info',
  },
  confirmed: {
    title: '✅ Driver Assigned',
    body: 'A driver has been assigned to your ride and is on the way!',
    sound: 'success',
  },
  ongoing: {
    title: '🚗 Ride Started',
    body: 'Your ride has started. Enjoy the journey!',
    sound: 'info',
  },
  completed: {
    title: '🏁 Ride Completed',
    body: 'You have arrived at your destination. Thank you for riding!',
    sound: 'complete',
  },
  cancelled: {
    title: '❌ Ride Cancelled',
    body: 'Your ride has been cancelled.',
    sound: 'alert',
  },
};

/**
 * Show a browser push notification. Falls back silently if permission not granted.
 * Also plays the associated sound if specified.
 */
export function showPushNotification({ title, body, icon, tag, sound }: PushNotificationOptions) {
  if (sound) playSound(sound);

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      tag: tag || 'ridenova-notification',
      badge: '/favicon.ico',
    });
  } catch {
    // Silent fail — some browsers restrict Notification constructor
  }
}

/**
 * Send a push notification for a ride status change.
 * Call this whenever booking status updates.
 */
export function notifyRideStatus(status: string, bookingId?: string) {
  const config = RIDE_STATUS_MESSAGES[status];
  if (!config) return;

  showPushNotification({
    title: config.title,
    body: config.body,
    sound: config.sound,
    tag: bookingId ? `ride-${bookingId}` : undefined,
  });
}
