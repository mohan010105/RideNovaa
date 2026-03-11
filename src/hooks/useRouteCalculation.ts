import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RouteResult {
  distance_km: number;
  duration_minutes: number;
  geometry: string; // encoded polyline
}

export function useRouteCalculation() {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateRoute = useCallback(
    async (
      pickupLat: number,
      pickupLng: number,
      dropLat: number,
      dropLng: number
    ): Promise<RouteResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'calculate-route',
          {
            body: {
              pickup_lat: pickupLat,
              pickup_lng: pickupLng,
              drop_lat: dropLat,
              drop_lng: dropLng,
            },
          }
        );

        if (fnError || data?.error) {
          const msg = data?.error || fnError?.message || 'Route calculation failed';
          setError(msg);
          setRoute(null);
          return null;
        }

        const result: RouteResult = {
          distance_km: data.distance_km,
          duration_minutes: data.duration_minutes,
          geometry: data.geometry,
        };
        setRoute(result);
        return result;
      } catch (e: any) {
        setError(e.message || 'Route calculation failed');
        setRoute(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearRoute = useCallback(() => {
    setRoute(null);
    setError(null);
  }, []);

  return { route, loading, error, calculateRoute, clearRoute };
}
