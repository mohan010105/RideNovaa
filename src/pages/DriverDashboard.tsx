import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Car, IndianRupee, Star, MapPin, Loader2, Power, Navigation, Phone, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import GoogleMapTracking from '@/components/GoogleMapTracking';

const DriverDashboard = () => {
  const { user } = useAuth();
  const [driver, setDriver] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [incomingRequest, setIncomingRequest] = useState<any>(null);
  const [ignoredRequests, setIgnoredRequests] = useState<Set<string>>(new Set());
  const [otpInput, setOtpInput] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Driver location tracking for active ride
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [eta, setEta] = useState(0);

  // Profile Management State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileData, setProfileData] = useState({ name: '', phone: '', vehicle_plate: '', vehicle_model: '', vehicle_type: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const fetchDriverData = useCallback(async () => {
    if (!user) return;
    const { data: driverData } = await supabase.from('drivers').select('*').eq('user_id', user.id).single();
    setDriver(driverData);

    if (driverData) {
      // Use the new API
      try {
        const res = await fetch(`/api/driver/rides/${driverData.id}`);
        const json = await res.json();
        if (json.success) setBookings(json.rides);
      } catch (err) {
        console.error(err);
      }

      const { data: reviewData } = await supabase
        .from('reviews')
        .select('*')
        .eq('driver_id', driverData.id)
        .order('created_at', { ascending: false });
      setReviews(reviewData || []);

      // Also fetch driver's profile name from profiles table
      const { data: profile } = await supabase.from('profiles').select('name, phone').eq('user_id', user.id).single();
      if (profile) {
        setProfileData({
           name: profile.name || '',
           phone: profile.phone || driverData.phone || '',
           vehicle_plate: driverData.vehicle_plate || '',
           vehicle_model: driverData.vehicle_model || '',
           vehicle_type: driverData.vehicle_type || ''
        });
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchDriverData();
  }, [fetchDriverData]);

  // Handle incoming 'pending' rides
  useEffect(() => {
    if (!driver || !driver.is_online) {
      setIncomingRequest(null);
      return;
    }

    const channel = supabase.channel('pending_rides')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: "status=eq.pending" }, (payload) => {
        if (!ignoredRequests.has(payload.new.id)) {
          setIncomingRequest(payload.new);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driver, ignoredRequests]);

  // Handle active ride changes (Passenger cancels, etc.)
  useEffect(() => {
    if (!driver) return;
    const channel = supabase.channel('driver_rides')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `driver_id=eq.${driver.id}` }, (payload) => {
         const updatedRide = payload.new;
         if (updatedRide.status === 'cancelled') {
            toast.error('The passenger cancelled the ride.');
            fetchDriverData();
         }
         if (updatedRide.status === 'completed') {
            toast.success('Ride was completed.');
            fetchDriverData();
         }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [driver, fetchDriverData]);

  // Timer for rejecting incoming rides automatically
  useEffect(() => {
    if (!incomingRequest) return;
    const timer = setTimeout(() => {
      rejectRide(incomingRequest.id);
    }, 10000);
    return () => clearTimeout(timer);
  }, [incomingRequest]);

  // Location mocking/updating (simulate driver driving toward pickup or drop)
  const activeRide = bookings.find(b => ['confirmed', 'ongoing'].includes(b.status));

  useEffect(() => {
    if (!driver || !activeRide) {
      setDriverLocation(null);
      return;
    }
    // Very basic location setup initially based on active ride
    if (!driverLocation) {
       // if confirmed, we are heading to pickup
       if (activeRide.status === 'confirmed' && activeRide.pickup_lat) {
           setDriverLocation([activeRide.pickup_lat - 0.05, activeRide.pickup_lng - 0.05]); 
       } else if (activeRide.status === 'ongoing' && activeRide.pickup_lat) {
           setDriverLocation([activeRide.pickup_lat, activeRide.pickup_lng]); 
       }
    }
    
    // Simulate driving location updates every 5s
    const interval = setInterval(async () => {
       setDriverLocation(prev => {
          if (!prev) return prev;
          let targetLat = 0, targetLng = 0;
          if (activeRide.status === 'confirmed') {
              targetLat = activeRide.pickup_lat || prev[0];
              targetLng = activeRide.pickup_lng || prev[1];
          } else {
              targetLat = activeRide.drop_lat || prev[0];
              targetLng = activeRide.drop_lng || prev[1];
          }
          // move 10% toward target
          const newLat = prev[0] + (targetLat - prev[0]) * 0.1;
          const newLng = prev[1] + (targetLng - prev[1]) * 0.1;

          // Push to drivers_locations to broadcast to passenger (they listen on this)
          supabase.from('driver_locations').upsert({
            driver_id: driver.id,
            lat: newLat,
            lng: newLng,
            updated_at: new Date().toISOString()
          }).then();

          return [newLat, newLng];
       });
    }, 5000);

    return () => clearInterval(interval);
  }, [driver, activeRide?.id, activeRide?.status]);

  const toggleOnline = async () => {
    if (!driver) return;
    const newStatusLine = !driver.is_online;
    
    // Map offline/online logic seamlessly (with 'status' specifically updated per instructions)
    await supabase.from('drivers').update({ 
       is_online: newStatusLine,
       status: newStatusLine ? 'online' : 'offline'
    } as any).eq('id', driver.id);
    
    setDriver({ ...driver, is_online: newStatusLine });
    toast.success(newStatusLine ? 'You are now online' : 'You are now offline');
  };

  const acceptRide = async (rideId: string) => {
    if (!driver) return;
    const { data, error } = await supabase.from('bookings').update({ driver_id: driver.id, status: 'confirmed' }).eq('id', rideId).eq('status', 'pending').select().single();
    if (error || !data) {
       toast.error('Ride no longer available.');
    } else {
       toast.success('Ride accepted!');
       fetchDriverData();
    }
    setIncomingRequest(null);
  };

  const rejectRide = (rideId: string) => {
    setIgnoredRequests(prev => new Set(prev).add(rideId));
    setIncomingRequest(null);
  };

  const verifyPassengerOtp = async () => {
    if (!activeRide) return;
    setVerifyingOtp(true);
    try {
      const res = await fetch('/api/rides/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: activeRide.id, otp: otpInput })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchDriverData();
        setOtpInput('');
      } else {
        toast.error(data.message || 'Incorrect OTP');
      }
    } catch (err) {
      toast.error('Failed to verify OTP');
    }
    setVerifyingOtp(false);
  };

  const endRide = async () => {
    if (!activeRide) return;
    const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', activeRide.id);
    if (error) {
      toast.error('Failed to end ride');
    } else {
      toast.success('Ride completed!');
      fetchDriverData();
      // Optional: notification of ride completeness is natively sent by our tracker
    }
  };

  const handleUpdateProfile = async () => {
    if (!driver || !user) return;
    setSavingProfile(true);
    try {
       // Update drivers table
       await supabase.from('drivers').update({
          phone: profileData.phone,
          vehicle_plate: profileData.vehicle_plate,
          vehicle_model: profileData.vehicle_model,
          vehicle_type: profileData.vehicle_type as any
       }).eq('id', driver.id);
       
       // Update profiles table
       await supabase.from('profiles').update({
          name: profileData.name,
          phone: profileData.phone
       }).eq('user_id', user.id);

       toast.success('Profile updated successfully');
       setIsProfileOpen(false);
       fetchDriverData();
    } catch (e) {
       toast.error('Failed to update profile');
    } finally {
       setSavingProfile(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!driver) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Card className="glass-card p-8 text-center">
          <p className="text-lg">No driver profile found</p>
          <p className="text-muted-foreground">Please register as a driver first.</p>
        </Card>
      </div>
    );
  }

  // Earnings calculations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const completedRidesList = bookings.filter(b => b.status === 'completed');
  const todayEarnings = completedRidesList.filter(b => new Date(b.created_at) >= todayStart).reduce((s, b) => s + Number(b.fare), 0);
  const weeklyEarnings = completedRidesList.reduce((s, b) => s + Number(b.fare), 0); // simplification
  const completedRidesCount = completedRidesList.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 relative">
      {/* INCOMING RIDE OVERLAY */}
      {incomingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
           <Card className="w-full max-w-sm glass-card-strong animate-in zoom-in-95">
             <CardHeader className="text-center">
               <CardTitle className="text-xl">New Ride Request!</CardTitle>
               <p className="text-sm text-muted-foreground">Respond within 10s</p>
             </CardHeader>
             <CardContent className="space-y-4">
                <div>
                   <p className="text-xs text-muted-foreground">Pickup</p>
                   <p className="font-semibold">{incomingRequest.pickup_location}</p>
                </div>
                <div>
                   <p className="text-xs text-muted-foreground">Drop</p>
                   <p className="font-semibold">{incomingRequest.drop_location}</p>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                   <div>
                     <p className="text-xs text-muted-foreground">Est. Fare</p>
                     <p className="font-bold text-primary">₹{incomingRequest.fare}</p>
                   </div>
                   <div>
                     <p className="text-xs text-muted-foreground">Distance</p>
                     <p className="font-bold">{incomingRequest.distance_km} km</p>
                   </div>
                </div>
             </CardContent>
             <CardFooter className="flex gap-4">
                <Button className="flex-1" variant="outline" onClick={() => rejectRide(incomingRequest.id)}>Reject</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => acceptRide(incomingRequest.id)}>Accept</Button>
             </CardFooter>
           </Card>
        </div>
      )}

      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Driver Dashboard</h1>
          <p className="text-muted-foreground">{driver.vehicle_model} • {driver.vehicle_plate}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="online-toggle" className="text-sm">
              {driver.is_online ? '🟢 Online' : '🔴 Offline'}
            </Label>
            <Switch id="online-toggle" checked={driver.is_online} onCheckedChange={toggleOnline} disabled={!!activeRide} />
          </div>
          
          <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
            <DialogTrigger asChild>
               <Button variant="outline" size="sm"><UserIcon className="w-4 h-4 mr-2" />Profile</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                 <DialogTitle>Edit Profile</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                 <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={profileData.name} onChange={e => setProfileData(prev => ({...prev, name: e.target.value}))} />
                 </div>
                 <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input value={profileData.phone} onChange={e => setProfileData(prev => ({...prev, phone: e.target.value}))} />
                 </div>
                 <div className="space-y-2">
                    <Label>Vehicle Model</Label>
                    <Input value={profileData.vehicle_model} onChange={e => setProfileData(prev => ({...prev, vehicle_model: e.target.value}))} />
                 </div>
                 <div className="space-y-2">
                    <Label>Vehicle Plate / Number</Label>
                    <Input value={profileData.vehicle_plate} onChange={e => setProfileData(prev => ({...prev, vehicle_plate: e.target.value}))} />
                 </div>
                 <div className="space-y-2">
                    <Label>Vehicle Category (Mini, Sedan, SUV)</Label>
                    <Input value={profileData.vehicle_type} onChange={e => setProfileData(prev => ({...prev, vehicle_type: e.target.value}))} />
                 </div>
              </div>
              <DialogFooter>
                 <Button onClick={handleUpdateProfile} disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save Profile'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Today's Earnings", value: `₹${todayEarnings}`, icon: IndianRupee },
          { label: 'Weekly Earnings', value: `₹${weeklyEarnings}`, icon: IndianRupee },
          { label: 'Completed Rides', value: completedRidesCount, icon: Car },
          { label: 'Driver Rating', value: Number(driver.average_rating).toFixed(1), icon: Star },
        ].map(s => (
          <Card key={s.label} className="glass-card">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeRide ? (
        <Card className="glass-card-strong mb-6 border-primary/30 overflow-hidden">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex justify-between items-center text-lg text-primary">
              <span className="flex items-center gap-2"><Navigation className="w-5 h-5"/> {activeRide.status === 'confirmed' ? 'Navigating to Pickup' : 'Ride in Progress'}</span>
              {activeRide.status === 'confirmed' && <Button size="sm" variant="destructive" onClick={async () => {
                  await supabase.from('bookings').update({status: 'pending', driver_id: null}).eq('id', activeRide.id);
                  fetchDriverData();
              }}>Cancel Ride</Button>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <GoogleMapTracking
               pickupAddress={activeRide.pickup_location}
               dropAddress={activeRide.status === 'confirmed' ? activeRide.pickup_location : activeRide.drop_location}
               pickupCoords={{ lat: activeRide.pickup_lat, lng: activeRide.pickup_lng }}
               dropCoords={activeRide.status === 'confirmed' ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng } : { lat: activeRide.drop_lat, lng: activeRide.drop_lng }}
               driverPosition={driverLocation}
               onETAUpdate={(duration) => setEta(duration)}
               className="h-[300px] sm:h-[400px]"
             />
             <div className="p-6 grid gap-6 sm:grid-cols-2">
                <div>
                   <p className="text-sm text-muted-foreground mb-1">Passanger Name: {activeRide.profiles?.name || 'Passenger'}</p>
                   <p className="text-sm text-muted-foreground mb-1">Dest: {activeRide.status === 'confirmed' ? 'Pickup' : 'Drop'}</p>
                   <p className="font-medium text-lg mb-4">{activeRide.status === 'confirmed' ? activeRide.pickup_location : activeRide.drop_location}</p>
                   <div className="flex items-center gap-4">
                      <Button variant="outline"><Phone className="w-4 h-4 mr-2"/> Call Passenger</Button>
                      <Badge variant="secondary" className="px-3 py-1 text-sm bg-primary/10">ETA: {eta} mins</Badge>
                   </div>
                </div>
                
                <div className="flex flex-col justify-center">
                  {activeRide.status === 'confirmed' ? (
                     <div className="space-y-4">
                        <Label>Enter Ride OTP to Start</Label>
                        <div className="flex gap-2">
                           <Input placeholder="4-digit OTP" maxLength={4} value={otpInput} onChange={e => setOtpInput(e.target.value)} />
                           <Button onClick={verifyPassengerOtp} disabled={verifyingOtp || otpInput.length < 4}>Verify</Button>
                        </div>
                     </div>
                  ) : (
                     <Button size="lg" className="w-full bg-red-600 hover:bg-red-700" onClick={endRide}>End Ride</Button>
                  )}
                </div>
             </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <h2 className="mb-4 text-xl font-semibold">Ride History</h2>
          {bookings.length === 0 ? (
            <p className="text-muted-foreground">No rides yet</p>
          ) : (
            <div className="space-y-3">
              {bookings.filter(b => b.status === 'completed' || b.status === 'cancelled').slice(0, 20).map((b: any) => (
                <Card key={b.id} className="glass-card">
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{b.pickup_location} → {b.drop_location}</p>
                      <p className="text-sm text-muted-foreground">{new Date(b.created_at).toLocaleDateString()} • {b.distance_km}km • ₹{Number(b.fare)}</p>
                    </div>
                    <Badge className={b.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}>{b.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DriverDashboard;
