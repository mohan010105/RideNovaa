import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: string;
  amount: number;
  description: string;
  booking_id: string | null;
  created_at: string;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Try to get existing wallet
    let { data } = await supabase
      .from('wallets' as any)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Create wallet if it doesn't exist
    if (!data) {
      const { data: newWallet } = await supabase
        .from('wallets' as any)
        .insert({ user_id: user.id, balance: 0 } as any)
        .select()
        .single();
      data = newWallet;
    }

    setWallet(data as any);

    // Fetch transactions
    if (data) {
      const { data: txns } = await supabase
        .from('wallet_transactions' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setTransactions((txns as any[]) || []);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('wallet-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => fetchWallet())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchWallet]);

  const topUp = async (amount: number) => {
    if (!user || !wallet) return false;
    const newBalance = wallet.balance + amount;

    const { error: updateError } = await supabase
      .from('wallets' as any)
      .update({ balance: newBalance, updated_at: new Date().toISOString() } as any)
      .eq('id', wallet.id);

    if (updateError) return false;

    await supabase.from('wallet_transactions' as any).insert({
      wallet_id: wallet.id,
      user_id: user.id,
      type: 'topup',
      amount,
      description: `Wallet top-up of ₹${amount}`,
    } as any);

    await fetchWallet();
    return true;
  };

  const payFromWallet = async (amount: number, bookingId: string) => {
    if (!user || !wallet || wallet.balance < amount) return false;
    const newBalance = wallet.balance - amount;

    const { error: updateError } = await supabase
      .from('wallets' as any)
      .update({ balance: newBalance, updated_at: new Date().toISOString() } as any)
      .eq('id', wallet.id);

    if (updateError) return false;

    await supabase.from('wallet_transactions' as any).insert({
      wallet_id: wallet.id,
      user_id: user.id,
      type: 'ride_payment',
      amount: -amount,
      description: `Ride payment for booking`,
      booking_id: bookingId,
    } as any);

    await fetchWallet();
    return true;
  };

  return { wallet, transactions, loading, topUp, payFromWallet, refetch: fetchWallet };
}
