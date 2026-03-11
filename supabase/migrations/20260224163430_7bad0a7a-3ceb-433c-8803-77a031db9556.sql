
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'driver');

-- Create booking status enum
CREATE TYPE public.booking_status AS ENUM ('pending', 'searching', 'confirmed', 'ongoing', 'completed', 'cancelled');

-- Create cab type enum
CREATE TYPE public.cab_type AS ENUM ('Mini', 'Sedan', 'SUV');

-- Create payment method enum
CREATE TYPE public.payment_method AS ENUM ('Cash', 'Card', 'UPI');

-- Create payment status enum
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- ========== TABLES ==========

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);

-- Drivers table
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_model TEXT NOT NULL DEFAULT '',
  vehicle_plate TEXT NOT NULL DEFAULT '',
  vehicle_type public.cab_type NOT NULL DEFAULT 'Sedan',
  phone TEXT NOT NULL DEFAULT '',
  is_online BOOLEAN NOT NULL DEFAULT false,
  average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_rides INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id),
  pickup_location TEXT NOT NULL,
  drop_location TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  drop_lat DOUBLE PRECISION,
  drop_lng DOUBLE PRECISION,
  distance_km NUMERIC(8,2),
  cab_type public.cab_type NOT NULL DEFAULT 'Sedan',
  payment_method public.payment_method NOT NULL DEFAULT 'Cash',
  fare NUMERIC(10,2) NOT NULL DEFAULT 0,
  surge_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  status public.booking_status NOT NULL DEFAULT 'pending',
  scheduled_date DATE,
  scheduled_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  method public.payment_method NOT NULL DEFAULT 'Cash',
  status public.payment_status NOT NULL DEFAULT 'pending',
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id, reviewer_id)
);

-- Driver locations table
CREATE TABLE public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== INDEXES ==========
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_driver_id ON public.bookings(driver_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_created_at ON public.bookings(created_at);
CREATE INDEX idx_payments_booking_id ON public.payments(booking_id);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_reviews_driver_id ON public.reviews(driver_id);
CREATE INDEX idx_driver_locations_driver_id ON public.driver_locations(driver_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- ========== HELPER FUNCTIONS ==========

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, '')
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

-- Update driver average rating
CREATE OR REPLACE FUNCTION public.update_driver_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.drivers
  SET average_rating = (
    SELECT COALESCE(AVG(rating), 0) FROM public.reviews WHERE driver_id = NEW.driver_id
  ),
  total_rides = (
    SELECT COUNT(*) FROM public.reviews WHERE driver_id = NEW.driver_id
  )
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$;

-- ========== TRIGGERS ==========

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER on_review_created
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_driver_rating();

-- ========== ENABLE RLS ==========

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System creates profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Self-assign user or driver role" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND role IN ('user', 'driver')
);
CREATE POLICY "Admin manages roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin());

-- Drivers
CREATE POLICY "Anyone authenticated can view drivers" ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Driver can update own profile" ON public.drivers FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can register as driver" ON public.drivers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Bookings
CREATE POLICY "Users see own bookings" ON public.bookings FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR
  driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()) OR
  public.is_admin()
);
CREATE POLICY "Users create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Booking participants can update" ON public.bookings FOR UPDATE TO authenticated USING (
  auth.uid() = user_id OR
  driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()) OR
  public.is_admin()
);

-- Payments
CREATE POLICY "Users see own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users create payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Reviews
CREATE POLICY "Anyone can see reviews" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create reviews for own bookings" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);

-- Driver Locations
CREATE POLICY "Driver updates own location" ON public.driver_locations FOR ALL TO authenticated USING (
  driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()) OR public.is_admin()
);

-- ========== REALTIME ==========
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
