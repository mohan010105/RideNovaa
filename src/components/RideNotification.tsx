import { useEffect, useState } from 'react';
import { CheckCircle2, Navigation, MapPin, Car, User, X } from 'lucide-react';
import { playSound } from '@/lib/notifications';

interface NotificationProps {
  stage: number;
  visible: boolean;
  onDismiss: () => void;
}

const NOTIFICATIONS = [
  { title: 'Booking Confirmed', message: 'Your ride request has been confirmed!', icon: CheckCircle2, sound: 'success' as const },
  { title: 'Driver Assigned', message: 'A driver has been assigned to your ride', icon: User, sound: 'info' as const },
  { title: 'Driver En Route', message: 'Your driver is heading to your pickup point', icon: Navigation, sound: 'info' as const },
  { title: 'Driver Arrived', message: 'Your driver has arrived at the pickup location!', icon: MapPin, sound: 'alert' as const },
  { title: 'Ride Started', message: 'Enjoy your ride! You\'re on the way', icon: Car, sound: 'info' as const },
  { title: 'Ride Completed!', message: 'You\'ve arrived at your destination. Thank you!', icon: CheckCircle2, sound: 'complete' as const },
];

const RideNotification = ({ stage, visible, onDismiss }: NotificationProps) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      playSound(NOTIFICATIONS[stage]?.sound ?? 'info');
      const t = setTimeout(() => { setShow(false); onDismiss(); }, 4000);
      return () => clearTimeout(t);
    }
  }, [visible, stage]);

  if (!show || !NOTIFICATIONS[stage]) return null;

  const notif = NOTIFICATIONS[stage];
  const Icon = notif.icon;

  return (
    <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right-full duration-300">
      <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/80 p-4 shadow-2xl backdrop-blur-xl"
        style={{ minWidth: 300, maxWidth: 400 }}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{notif.title}</p>
          <p className="text-xs text-muted-foreground">{notif.message}</p>
        </div>
        <button onClick={() => { setShow(false); onDismiss(); }} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default RideNotification;
