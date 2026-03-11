CREATE POLICY "Authenticated users can view driver locations"
ON public.driver_locations FOR SELECT
TO authenticated
USING (true);