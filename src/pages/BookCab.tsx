import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBookings, calculateFare } from '@/hooks/useBookings';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Car, Calendar, Clock, CreditCard, Loader2, CheckCircle2, AlertCircle, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import SurgePricing, { getSimulatedSurge } from '@/components/SurgePricing';
import GoogleMapComponent from '@/components/GoogleMapComponent';
import NearbyDrivers from '@/components/NearbyDrivers';

const CAB_INFO: Record<string, { desc: string; icon: string }> = {
  Mini: { desc: 'Affordable & compact', icon: '🚗' },
  Sedan: { desc: 'Comfortable ride', icon: '🚙' },
  SUV: { desc: 'Spacious & premium', icon: '🚐' },
};

interface LocationData {
  address: string;
  lat: number;
  lng: number;
}

const PAYMENT_METHODS = [
  { value: 'Cash', label: '💵 Cash', desc: 'Pay driver directly' },
  { value: 'Card', label: '💳 Card (Stripe)', desc: 'Secure card payment' },
  { value: 'UPI', label: '📱 UPI (Razorpay)', desc: 'Google Pay, PhonePe, BHIM' },
];

const BookCab = () => {
  const { user } = useAuth();
  const { createBooking } = useBookings();
  const { wallet, payFromWallet } = useWallet();
  const navigate = useNavigate();

  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [drop, setDrop] = useState<LocationData | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [duration, setDuration] = useState<string>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [cabType, setCabType] = useState('Sedan');
  const [payment, setPayment] = useState('Cash');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: string; fare: number; otp?: string } | null>(null);

  const surge = getSimulatedSurge();
  const estimatedFare = distanceKm
    ? calculateFare(cabType, distanceKm, surge.multiplier)
    : calculateFare(cabType, undefined, surge.multiplier);

  const onRouteCalculated = useCallback((dist: number, dur: string) => {
    setDistanceKm(dist);
    setDuration(dur);
  }, []);

  const canBook = !!(pickup && drop && date && time);

  // Validation messages
  const getMissingFields = () => {
    const missing: string[] = [];
    if (!pickup) missing.push('pickup location');
    if (!drop) missing.push('drop location');
    if (!date) missing.push('date');
    if (!time) missing.push('time');
    return missing;
  };

  const handleRazorpayPayment = async (bookingId: string, fare: number) => {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: { bookingId, amount: fare },
    });

    if (error || !data?.orderId) {
      toast.error('Failed to create payment order. Booking saved as pending.');
      setConfirmation({ id: bookingId, fare, otp: undefined });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'CabRide',
        description: `${cabType} Ride Payment`,
        order_id: data.orderId,
        handler: async (response: any) => {
          try {
            const { error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
              body: {
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
                bookingId,
                amount: fare,
              },
            });
            if (verifyError) {
              toast.error('Payment verification failed');
              setConfirmation({ id: bookingId, fare, otp: undefined });
            } else {
              toast.success('Payment successful!');
              navigate(`/track/${bookingId}`);
            }
          } catch {
            toast.error('Payment verification error');
            setConfirmation({ id: bookingId, fare, otp: undefined });
          }
        },
        modal: {
          ondismiss: () => {
            toast.info('Payment cancelled. You can retry from your dashboard.');
            setConfirmation({ id: bookingId, fare });
          },
        },
        prefill: { email: user?.email || '', name: user?.name || '' },
        theme: { color: '#6366f1' },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    };
    document.body.appendChild(script);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickup || !drop) {
      toast.error('Please enter pickup and drop locations');
      return;
    }
    if (!date || !time) {
      toast.error('Please select date and time');
      return;
    }

    setLoading(true);
    try {
      const fare = calculateFare(cabType, distanceKm ?? undefined, surge.multiplier);

      const booking = await createBooking({
        pickupLocation: pickup.address,
        dropLocation: drop.address,
        cabType,
        paymentMethod: payment,
        fare,
        surgeMultiplier: surge.multiplier,
        scheduledDate: date,
        scheduledTime: time,
        distanceKm: distanceKm ?? undefined,
      });

      if (!booking) {
        toast.error('Failed to book ride. Please try again.');
        return;
      }

      const bookingOtp = (booking as any).otp;

      if (payment === 'Card') {
        try {
          const { data, error } = await supabase.functions.invoke('create-payment', {
            body: {
              bookingId: booking.id,
              amount: fare,
              pickupLocation: pickup.address,
              dropLocation: drop.address,
              cabType,
            },
          });
          if (error || !data?.url) {
            toast.error('Payment session failed. Booking saved as pending.');
            setConfirmation({ id: booking.id, fare, otp: bookingOtp });
          } else {
            window.location.href = data.url;
            return;
          }
        } catch {
          toast.error('Payment failed. Booking saved as pending.');
            setConfirmation({ id: booking.id, fare, otp: bookingOtp });
        }
      } else if (payment === 'UPI') {
        await handleRazorpayPayment(booking.id, fare);
      } else if (payment === 'Wallet') {
        const paid = await payFromWallet(fare, booking.id);
        if (paid) {
          toast.success('Paid from wallet! Ride booked.');
          setConfirmation({ id: booking.id, fare, otp: bookingOtp });
        } else {
          toast.error('Insufficient wallet balance. Booking saved as pending.');
          setConfirmation({ id: booking.id, fare, otp: bookingOtp });
        }
      } else {
        setConfirmation({ id: booking.id, fare, otp: bookingOtp });
        toast.success('Ride booked successfully!');
      }
    } finally {
      setLoading(false);
    }
  };

  if (confirmation) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <Card className="glass-card w-full max-w-md text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">Booking Confirmed!</h2>
            <p className="mb-1 text-muted-foreground">Your ride has been booked</p>
            <p className="mb-2 text-sm text-muted-foreground">Booking ID: {confirmation.id.slice(0, 8)}</p>
            {confirmation.otp && (
              <div className="mb-6 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">Ride OTP — Share with driver</p>
                <p className="text-4xl font-bold tracking-[0.3em] text-primary">{confirmation.otp}</p>
              </div>
            )}
            <div className="mb-6 rounded-lg bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Estimated Fare</p>
              <p className="text-3xl font-bold text-primary">₹{confirmation.fare}</p>
            </div>
            <div className="mb-4 space-y-2 text-left text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">From</span><span className="font-medium">{pickup?.address}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium">{drop?.address}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{date} at {time}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cab</span><span className="font-medium">{cabType}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="font-medium">{payment}</span></div>
              {duration && <div className="flex justify-between"><span className="text-muted-foreground">ETA</span><span className="font-medium">{duration}</span></div>}
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => navigate(`/track/${confirmation.id}`)}>Track Ride</Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const missingFields = getMissingFields();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Car className="h-6 w-6 text-primary" /> Book a Cab
          </CardTitle>
          <CardDescription>Enter your pickup & drop locations to get started</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            <GoogleMapComponent
              onPickupChange={setPickup}
              onDropChange={setDrop}
              onRouteCalculated={onRouteCalculated}
            />

            <NearbyDrivers pickupLat={pickup?.lat ?? null} pickupLng={pickup?.lng ?? null} />

            {/* Date & Time */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date"><Calendar className="mr-1 inline h-4 w-4" />Date</Label>
                <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time"><Clock className="mr-1 inline h-4 w-4" />Time</Label>
                <Input id="time" type="time" value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>

            {/* Cab Type */}
            <div className="space-y-2">
              <Label>Cab Type</Label>
              <div className="grid grid-cols-3 gap-3">
                {(['Mini', 'Sedan', 'SUV'] as const).map(type => (
                  <button type="button" key={type}
                    onClick={() => setCabType(type)}
                    className={`rounded-lg border-2 p-3 text-center transition-all ${cabType === type ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                    <div className="text-2xl">{CAB_INFO[type].icon}</div>
                    <div className="text-sm font-medium">{type}</div>
                    <div className="text-xs text-muted-foreground">{CAB_INFO[type].desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label><CreditCard className="mr-1 inline h-4 w-4" />Payment Method</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PAYMENT_METHODS.map(m => (
                  <button type="button" key={m.value}
                    onClick={() => setPayment(m.value)}
                    className={`rounded-lg border-2 p-3 text-center transition-all ${payment === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </button>
                ))}
                <button type="button"
                  onClick={() => setPayment('Wallet')}
                  className={`rounded-lg border-2 p-3 text-center transition-all ${payment === 'Wallet' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                  <div className="text-sm font-medium"><Wallet className="mr-1 inline h-4 w-4" />Wallet</div>
                  <div className="text-xs text-muted-foreground">
                    Balance: ₹{wallet?.balance ?? 0}
                  </div>
                </button>
              </div>
              {payment === 'Wallet' && wallet && wallet.balance < estimatedFare && (
                <p className="text-xs text-destructive">Insufficient balance. Top up from your dashboard.</p>
              )}
            </div>

            <SurgePricing className="mb-2" />

            {/* Estimated Fare */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
              <p className="text-sm text-muted-foreground">Estimated Fare</p>
              <p className="text-3xl font-bold text-primary">₹{estimatedFare}</p>
              {distanceKm && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {distanceKm.toFixed(1)} km • {duration}
                </p>
              )}
            </div>

            {/* Validation feedback */}
            {missingFields.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-600">
                  Please fill in: {missingFields.join(', ')}
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading || !canBook}>
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
              ) : (
                `Book Now — ₹${estimatedFare}`
              )}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};

export default BookCab;
