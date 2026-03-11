import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Car } from 'lucide-react';

interface NearbyDriversProps {
  pickupLat: number | null;
  pickupLng: number | null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NearbyDrivers = ({ pickupLat, pickupLng }: NearbyDriversProps) => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!pickupLat || !pickupLng) {
      setCount(null);
      return;
    }

    const fetchNearby = async () => {
      const { data } = await supabase
        .from('driver_locations')
        .select('lat, lng');

      if (!data) { setCount(0); return; }

      const nearby = data.filter((d) =>
        haversineDistance(pickupLat, pickupLng, d.lat, d.lng) <= 5
      );
      setCount(nearby.length);
    };

    fetchNearby();
  }, [pickupLat, pickupLng]);

  if (count === null) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-4 py-2.5">
      <Car className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium">
        {count > 0
          ? `${count} driver${count > 1 ? 's' : ''} available nearby`
          : 'No drivers nearby right now'}
      </span>
    </div>
  );
};

export default NearbyDrivers;
