import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface BookingRow {
  id: string;
  user_id: string;
  driver_id: string | null;
  pickup_location: string;
  drop_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  drop_lat: number | null;
  drop_lng: number | null;
  distance_km: number | null;
  cab_type: string;
  payment_method: string;
  fare: number;
  surge_multiplier: number;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  created_at: string;
  updated_at: string;
  otp: string | null;
}

function generateOTP(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const FARE_RATES: Record<string, { base: number; perKm: number }> = {
  Mini: { base: 50, perKm: 8 },
  Sedan: { base: 80, perKm: 12 },
  SUV: { base: 120, perKm: 18 },
};

export function calculateFare(cabType: string, distanceKm?: number, surgeMultiplier = 1.0): number {
  const distance = distanceKm ?? Math.floor(Math.random() * 25) + 5;
  const rate = FARE_RATES[cabType] || FARE_RATES.Sedan;
  return Math.round((rate.base + rate.perKm * distance) * surgeMultiplier);
}

export function useBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });
    setBookings((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('bookings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchBookings]);

  const createBooking = async (data: {
    pickupLocation: string;
    dropLocation: string;
    cabType: string;
    paymentMethod: string;
    fare: number;
    surgeMultiplier: number;
    scheduledDate?: string;
    scheduledTime?: string;
    distanceKm?: number;
  }) => {
    if (!user) return null;
    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        pickup_location: data.pickupLocation,
        drop_location: data.dropLocation,
        cab_type: data.cabType as any,
        payment_method: data.paymentMethod as any,
        fare: data.fare,
        surge_multiplier: data.surgeMultiplier,
        scheduled_date: data.scheduledDate || null,
        scheduled_time: data.scheduledTime || null,
        distance_km: data.distanceKm || null,
        status: 'pending' as any,
        otp: generateOTP(),
      } as any)
      .select()
      .single();

    if (error) { console.error('Booking error:', error); return null; }
    
    // Trigger OTP sending
    try {
      await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookingId: booking.id,
          otp: booking.otp,
          pickupLocation: booking.pickup_location,
          dropLocation: booking.drop_location,
          passengerPhone: user.phone || '', // Need to ensure user object has phone
          passengerEmail: user.email || '' // Assuming user object has email
        })
      });
    } catch (apiError) {
      console.error('Failed to trigger OTP API:', apiError);
    }

    return booking as any as BookingRow;
  };

  const cancelBooking = async (id: string) => {
    try {
      console.log("Cancel ride request:", id);
      const response = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          booking_id: id,
          user_id: user?.id
        })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to cancel booking');
      }
      return data;
    } catch (err) {
      console.error("Cancel ride error:", err);
      throw err;
    }
  };

  const updateBookingStatus = async (id: string, status: string) => {
    await supabase.from('bookings').update({ status: status as any }).eq('id', id);
  };

  const getUserBookings = () => bookings.filter(b => b.user_id === user?.id);

  return { bookings, loading, createBooking, cancelBooking, updateBookingStatus, getUserBookings, refetch: fetchBookings };
}

export function useAllBookings() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      setBookings((data as any[]) || []);
      setLoading(false);
    };
    fetch();

    const channel = supabase
      .channel('all-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateBookingStatus = async (id: string, status: string) => {
    await supabase.from('bookings').update({ status: status as any }).eq('id', id);
  };

  return { bookings, loading, updateBookingStatus };
}
