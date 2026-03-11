import { useRef, useEffect, useState, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { decodePolyline } from '@/lib/decodePolyline';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface GoogleMapTrackingProps {
  pickupAddress: string;
  dropAddress: string;
  pickupCoords?: { lat: number; lng: number } | null;
  dropCoords?: { lat: number; lng: number } | null;
  driverPosition?: [number, number] | null;
  className?: string;
  onETAUpdate?: (etaMinutes: number, distanceKm: number) => void;
}

const GoogleMapTracking = ({
  pickupAddress,
  dropAddress,
  pickupCoords,
  dropCoords,
  driverPosition,
  className = '',
  onETAUpdate,
}: GoogleMapTrackingProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropMarkerRef = useRef<L.Marker | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const driverRouteRef = useRef<L.Polyline | null>(null);

  const [resolvedPickup, setResolvedPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvedDrop, setResolvedDrop] = useState<{ lat: number; lng: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Geocode using Nominatim
  const geocode = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch {}
    return null;
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Resolve pickup coords
  useEffect(() => {
    if (pickupCoords?.lat) {
      setResolvedPickup(pickupCoords);
    } else if (pickupAddress) {
      geocode(pickupAddress).then(r => r && setResolvedPickup(r));
    }
  }, [pickupAddress, pickupCoords, geocode]);

  // Resolve drop coords
  useEffect(() => {
    if (dropCoords?.lat) {
      setResolvedDrop(dropCoords);
    } else if (dropAddress) {
      geocode(dropAddress).then(r => r && setResolvedDrop(r));
    }
  }, [dropAddress, dropCoords, geocode]);

  // Calculate route from ORS and draw
  const routeCalculated = useRef(false);
  useEffect(() => {
    if (!resolvedPickup || !resolvedDrop || routeCalculated.current) return;
    routeCalculated.current = true;

    (async () => {
      try {
        const { data } = await supabase.functions.invoke('calculate-route', {
          body: {
            pickup_lat: resolvedPickup.lat,
            pickup_lng: resolvedPickup.lng,
            drop_lat: resolvedDrop.lat,
            drop_lng: resolvedDrop.lng,
          },
        });

        if (data?.geometry && mapRef.current) {
          if (routeLineRef.current) routeLineRef.current.remove();
          const decoded = decodePolyline(data.geometry);
          routeLineRef.current = L.polyline(decoded, {
            color: '#7c3aed',
            weight: 5,
            opacity: 0.7,
          }).addTo(mapRef.current);
        }
      } catch (e) {
        console.error('Route calculation failed:', e);
      }
    })();
  }, [resolvedPickup, resolvedDrop]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Pickup marker
    if (pickupMarkerRef.current) pickupMarkerRef.current.remove();
    if (resolvedPickup) {
      const greenIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
      });
      pickupMarkerRef.current = L.marker([resolvedPickup.lat, resolvedPickup.lng], { icon: greenIcon })
        .addTo(map).bindPopup(`📍 Pickup: ${pickupAddress.slice(0, 50)}`);
    }

    // Drop marker
    if (dropMarkerRef.current) dropMarkerRef.current.remove();
    if (resolvedDrop) {
      const redIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
      });
      dropMarkerRef.current = L.marker([resolvedDrop.lat, resolvedDrop.lng], { icon: redIcon })
        .addTo(map).bindPopup(`🏁 Drop: ${dropAddress.slice(0, 50)}`);
    }

    // Fit bounds
    const bounds = L.latLngBounds([]);
    if (resolvedPickup) bounds.extend([resolvedPickup.lat, resolvedPickup.lng]);
    if (resolvedDrop) bounds.extend([resolvedDrop.lat, resolvedDrop.lng]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
  }, [resolvedPickup, resolvedDrop, mapReady, pickupAddress, dropAddress]);

  // Driver marker with smooth movement
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!driverPosition) {
      if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
      return;
    }

    const driverIcon = L.divIcon({
      html: '<div style="font-size:24px;text-align:center;">🚕</div>',
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker([driverPosition[0], driverPosition[1]], { icon: driverIcon, zIndexOffset: 1000 })
        .addTo(map);
    } else {
      driverMarkerRef.current.setLatLng([driverPosition[0], driverPosition[1]]);
    }

    // Fit bounds to include driver
    const bounds = L.latLngBounds([]);
    if (resolvedPickup) bounds.extend([resolvedPickup.lat, resolvedPickup.lng]);
    if (resolvedDrop) bounds.extend([resolvedDrop.lat, resolvedDrop.lng]);
    bounds.extend([driverPosition[0], driverPosition[1]]);
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
  }, [driverPosition, mapReady, resolvedPickup, resolvedDrop]);

  // ETA calculation for driver
  const lastEtaCalc = useRef(0);
  useEffect(() => {
    if (!driverPosition || !resolvedDrop || !onETAUpdate) return;
    const now = Date.now();
    if (now - lastEtaCalc.current < 5000) return;
    lastEtaCalc.current = now;

    (async () => {
      try {
        const { data } = await supabase.functions.invoke('calculate-route', {
          body: {
            pickup_lat: driverPosition[0],
            pickup_lng: driverPosition[1],
            drop_lat: resolvedDrop.lat,
            drop_lng: resolvedDrop.lng,
          },
        });

        if (data?.distance_km && data?.duration_minutes) {
          onETAUpdate(data.duration_minutes, data.distance_km);

          // Draw driver-to-destination line
          if (data.geometry && mapRef.current) {
            if (driverRouteRef.current) driverRouteRef.current.remove();
            const decoded = decodePolyline(data.geometry);
            driverRouteRef.current = L.polyline(decoded, {
              color: '#22c55e',
              weight: 4,
              opacity: 0.7,
              dashArray: '8, 8',
            }).addTo(mapRef.current);
          }
        }
      } catch {}
    })();
  }, [driverPosition, resolvedDrop, onETAUpdate]);

  return (
    <div className={`overflow-hidden rounded-lg ${className}`} style={{ minHeight: '300px' }}>
      <div
        ref={mapContainerRef}
        className="h-[400px] w-full"
        style={{ zIndex: 0 }}
      />
    </div>
  );
};

export default GoogleMapTracking;
