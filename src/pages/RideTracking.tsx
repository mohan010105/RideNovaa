import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useBookings } from '@/hooks/useBookings';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import GoogleMapTracking from '@/components/GoogleMapTracking';
import { getCoords } from '@/components/MapView';
import RideNotification from '@/components/RideNotification';
import RideRating from '@/components/RideRating';
import OtpVerification from '@/components/OtpVerification';
import { Car, User, Phone, Star, MapPin, Navigation, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { requestNotificationPermission, notifyRideStatus } from '@/lib/notifications';

const DRIVER_NAMES = ['Rajesh Kumar', 'Amit Singh', 'Priya Sharma', 'Suresh Patel', 'Deepak Verma'];
const CAR_NUMBERS = ['DL 01 AB 1234', 'MH 02 CD 5678', 'KA 03 EF 9012', 'TN 04 GH 3456'];

interface DriverInfo { name: string; phone: string; rating: number; carNumber: string; carModel: string; }

const TRACKING_STAGES = [
  { label: 'Booking Confirmed', icon: CheckCircle2, description: 'Your ride has been confirmed' },
  { label: 'Driver Assigned', icon: User, description: 'A driver has been assigned' },
  { label: 'Driver En Route', icon: Navigation, description: 'Driver is on the way to pickup' },
  { label: 'Arrived at Pickup', icon: MapPin, description: 'Driver has arrived' },
  { label: 'Ride in Progress', icon: Car, description: 'On the way to destination' },
  { label: 'Ride Completed', icon: CheckCircle2, description: 'You have arrived' },
];

const RideTracking = () => {
  const { id } = useParams<{ id: string }>();
  const { bookings, updateBookingStatus, cancelBooking, loading } = useBookings();
  const { user } = useAuth();

  const booking = bookings.find(b => b.id === id);

  const [stage, setStage] = useState(0);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null);
  const [eta, setEta] = useState(12);
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const [notifStage, setNotifStage] = useState<number | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [isDriverUser, setIsDriverUser] = useState(false);
  const handleETAUpdate = useCallback((etaMin: number, distKm: number) => {
    setEta(etaMin);
    setLiveDistance(distKm);
  }, []);
  const [showRating, setShowRating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelRide = async () => {
    if (!booking) return;
    try {
      setCancelling(true);
      await cancelBooking(booking.id);
      // Wait a moment for state to update or manually redirect
    } catch (error) {
      console.error(error);
    } finally {
      setCancelling(false);
    }
  };

  // Check if current user is the assigned driver
  useEffect(() => {
    if (!user || !booking?.driver_id) return;
    const checkDriver = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', user.id)
        .eq('id', booking.driver_id!)
        .maybeSingle();
      setIsDriverUser(!!data);
    };
    checkDriver();
  }, [user, booking?.driver_id]);

  const generateDriver = useCallback((): DriverInfo => {
    const idx = Math.floor(Math.random() * DRIVER_NAMES.length);
    const cabModels: Record<string, string> = { Mini: 'Maruti WagonR', Sedan: 'Honda City', SUV: 'Toyota Innova' };
    return {
      name: DRIVER_NAMES[idx],
      phone: `+91 ${9000000000 + Math.floor(Math.random() * 999999999)}`,
      rating: +(4 + Math.random()).toFixed(1),
      carNumber: CAR_NUMBERS[idx % CAR_NUMBERS.length],
      carModel: cabModels[booking?.cab_type || 'Sedan'],
    };
  }, [booking?.cab_type]);

  const advanceStage = useCallback((newStage: number) => {
    setStage(newStage);
    setNotifStage(newStage);
    // Map stage index to booking status for push notification
    const statusMap: Record<number, string> = { 1: 'confirmed', 2: 'confirmed', 3: 'confirmed', 4: 'ongoing', 5: 'completed' };
    const status = statusMap[newStage];
    if (status) notifyRideStatus(status, id);
  }, [id]);

  // Request notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if (!booking || booking.status === 'cancelled' || booking.status === 'completed') return;

    const t1 = setTimeout(() => {
      setDriver(generateDriver());
      advanceStage(1);
      updateBookingStatus(booking.id, 'confirmed');
    }, 3000);
    const t2 = setTimeout(() => { advanceStage(2); setEta(8); }, 6000);
    const t3 = setTimeout(() => { advanceStage(3); setEta(0); }, 10000);
    // Stage 4 (ride start) only happens after OTP verification — no auto-advance

    return () => { [t1, t2, t3].forEach(clearTimeout); };
  }, [booking?.id]);

  // When OTP is verified, advance to ride in progress and then to completed
  useEffect(() => {
    if (!otpVerified || !booking) return;
    advanceStage(4);
    setEta(15);
    updateBookingStatus(booking.id, 'ongoing');

    const t5 = setTimeout(() => {
      advanceStage(5); setEta(0);
      updateBookingStatus(booking.id, 'completed');
      setTimeout(() => setShowRating(true), 1500);
    }, 10000);

    return () => clearTimeout(t5);
  }, [otpVerified]);

  const handleOtpVerified = useCallback(() => {
    setOtpVerified(true);
  }, []);

  // Subscribe to real-time driver location from database
  useEffect(() => {
    if (!booking?.driver_id) return;

    // Fetch initial driver location
    const fetchInitialLocation = async () => {
      const { data } = await supabase
        .from('driver_locations')
        .select('lat, lng')
        .eq('driver_id', booking.driver_id!)
        .maybeSingle();
      if (data) setDriverPos([data.lat, data.lng]);
    };
    fetchInitialLocation();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`driver-location-${booking.driver_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${booking.driver_id}`,
        },
        (payload) => {
          const newData = payload.new as { lat: number; lng: number } | undefined;
          if (newData?.lat && newData?.lng) {
            setDriverPos([newData.lat, newData.lng]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [booking?.driver_id]);

  // Fallback: simulated driver movement when no real driver is assigned
  useEffect(() => {
    if (!booking || booking.driver_id || stage < 2) return;
    const pickupCoords = getCoords(booking.pickup_location);
    const dropCoords = getCoords(booking.drop_location);
    const interval = setInterval(() => {
      setDriverPos(prev => {
        const target = stage < 4 ? pickupCoords : dropCoords;
        const start = prev || [pickupCoords[0] + (Math.random() - 0.5) * 0.03, pickupCoords[1] + (Math.random() - 0.5) * 0.03];
        return [start[0] + (target[0] - start[0]) * 0.15, start[1] + (target[1] - start[1]) * 0.15];
      });
      setEta(prev => Math.max(0, prev - 1));
    }, 2000);
    return () => clearInterval(interval);
  }, [booking?.id, booking?.driver_id, stage]);

  const handleRatingSubmit = async (rating: number, review: string) => {
    if (!booking || !user) return;
    // For now store review - driver_id will be set when real drivers exist
    // We'll skip DB insert if no driver assigned
    if (booking.driver_id) {
      await supabase.from('reviews').insert({
        booking_id: booking.id,
        reviewer_id: user.id,
        driver_id: booking.driver_id,
        rating,
        comment: review,
      });
    }
    setShowRating(false);
  };

  if (loading) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!booking) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Card className="glass-card p-8 text-center">
          <p className="mb-4 text-lg">Booking not found</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </Card>
      </div>
    );
  }

  if (showRating && driver) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <RideRating driverName={driver.name} onSubmit={handleRatingSubmit} onSkip={() => setShowRating(false)} />
      </div>
    );
  }

  const progress = Math.min(((stage + 1) / TRACKING_STAGES.length) * 100, 100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <RideNotification stage={notifStage ?? -1} visible={notifStage !== null} onDismiss={() => setNotifStage(null)} />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ride Tracking</h1>
          <p className="text-sm text-muted-foreground">Booking #{booking.id.slice(0, 8)}</p>
        </div>
        <div className="flex gap-2">
          {stage < 4 && !otpVerified && (
            <Button variant="destructive" size="sm" onClick={handleCancelRide} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancel Ride
            </Button>
          )}
          <Link to="/dashboard"><Button variant="outline" size="sm">Back to Dashboard</Button></Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card className="glass-card overflow-hidden">
            <GoogleMapTracking
              pickupAddress={booking.pickup_location}
              dropAddress={booking.drop_location}
              pickupCoords={booking.pickup_lat && booking.pickup_lng ? { lat: booking.pickup_lat, lng: booking.pickup_lng } : null}
              dropCoords={booking.drop_lat && booking.drop_lng ? { lat: booking.drop_lat, lng: booking.drop_lng } : null}
              driverPosition={driverPos}
              className="h-[400px]"
              onETAUpdate={handleETAUpdate}
            />
          </Card>
          <Card className="glass-card mt-4">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm">📍</div>
                <div>
                  <p className="text-xs text-muted-foreground">Pickup</p>
                  <p className="text-sm font-medium">{booking.pickup_location}</p>
                </div>
              </div>
              <div className="border-t-2 border-dashed border-primary/30 flex-1 mx-4" />
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground text-right">Drop</p>
                  <p className="text-sm font-medium">{booking.drop_location}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-sm">🏁</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card className="glass-card-strong">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{stage === 5 ? 'Ride Complete' : 'Estimated Time'}</p>
              <p className="text-4xl font-bold text-primary">{stage === 5 ? '✓' : `${eta} min`}</p>
              {liveDistance !== null && stage < 5 && (
                <p className="mt-1 text-xs text-muted-foreground">{liveDistance} km remaining</p>
              )}
              <Progress value={progress} className="mt-3 h-2" />
              <p className="mt-1 text-xs text-muted-foreground">{TRACKING_STAGES[stage].label}</p>
            </CardContent>
          </Card>

          {/* Passenger OTP Display */}
          {!isDriverUser && stage < 4 && (booking as any)?.otp && (
            <Card className="glass-card bg-primary/5 border-primary/20">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Your Ride OTP</p>
                <p className="text-3xl font-bold tracking-[0.3em] text-primary">{(booking as any).otp}</p>
                <p className="text-xs text-muted-foreground mt-2">Share this with the driver to start the ride</p>
              </CardContent>
            </Card>
          )}

          {driver && (
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Your Driver</CardTitle></CardHeader>
              <CardContent className="space-y-3 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{driver.name}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> {driver.rating}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {driver.phone}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Car className="h-3.5 w-3.5" /> {driver.carModel} • {driver.carNumber}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* OTP Verification - show when driver has arrived (stage 3) and not yet verified */}
          {stage === 3 && !otpVerified && (booking as any)?.otp && (
            <OtpVerification
              bookingOtp={(booking as any).otp}
              onVerified={handleOtpVerified}
              isDriverView={isDriverUser}
            />
          )}

          <Card className="glass-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Ride Status</CardTitle></CardHeader>
            <CardContent className="pb-4">
              <div className="space-y-3">
                {TRACKING_STAGES.map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs
                      ${i < stage ? 'bg-primary text-primary-foreground' : i === stage ? 'bg-primary/20 text-primary ring-2 ring-primary/40' : 'bg-muted text-muted-foreground'}`}>
                      <s.icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${i <= stage ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm text-muted-foreground">Fare</p>
                <p className="text-xl font-bold">₹{Number(booking.fare)}</p>
              </div>
              <Badge variant="outline">{booking.payment_method}</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RideTracking;
