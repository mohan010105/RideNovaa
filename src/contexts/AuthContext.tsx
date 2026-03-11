import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  avatarUrl?: string;
}

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  driverSignup: (name: string, email: string, phone: string, password: string, vehicleModel: string, vehiclePlate: string, vehicleType: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isDriver: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

async function fetchProfile(userId: string): Promise<AppUser | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (!profile) return null;

  return {
    id: userId,
    name: profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    roles: roles?.map((r: any) => r.role) || ['user'],
    avatarUrl: profile.avatar_url,
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        // Use setTimeout to avoid Supabase deadlock
        setTimeout(async () => {
          const appUser = await fetchProfile(session.user.id);
          setUser(appUser);
          setIsLoading(false);
        }, 0);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const appUser = await fetchProfile(session.user.id);
        setUser(appUser);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signup = async (name: string, email: string, phone: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { success: false, error: error.message };

    // Update profile with phone
    const { data: { user: newUser } } = await supabase.auth.getUser();
    if (newUser) {
      await supabase.from('profiles').update({ phone, name }).eq('user_id', newUser.id);
    }

    return { success: true };
  };

  const driverSignup = async (name: string, email: string, phone: string, password: string, vehicleModel: string, vehiclePlate: string, vehicleType: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { success: false, error: error.message };

    const userId = data.user?.id;
    if (userId) {
      await supabase.from('profiles').update({ phone, name }).eq('user_id', userId);
      
      // Add driver role
      await supabase.from('user_roles').insert({ user_id: userId, role: 'driver' as any });

      // Create driver record
      await supabase.from('drivers').insert({
        user_id: userId,
        vehicle_model: vehicleModel,
        vehicle_plate: vehiclePlate,
        vehicle_type: vehicleType as any,
        phone,
      });
    }

    return { success: true };
  };

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const isAdmin = user?.roles.includes('admin') ?? false;
  const isDriver = user?.roles.includes('driver') ?? false;

  return (
    <AuthContext.Provider value={{ user, session, isLoading, login, signup, driverSignup, logout, isAdmin, isDriver }}>
      {children}
    </AuthContext.Provider>
  );
};
