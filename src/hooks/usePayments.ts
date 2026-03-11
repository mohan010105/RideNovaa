import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PaymentRow {
  id: string;
  booking_id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  stripe_payment_id: string | null;
  created_at: string;
}

export function usePayments() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      setPayments((data as any[]) || []);
      setLoading(false);
    };
    fetch();

    const channel = supabase
      .channel('payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return { payments, loading };
}

export function useAllPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      setPayments((data as any[]) || []);
      setLoading(false);
    };
    fetch();

    const channel = supabase
      .channel('all-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { payments, loading };
}
