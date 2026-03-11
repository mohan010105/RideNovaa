import { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, AlertCircle, ArrowUpDown, X, LocateFixed } from 'lucide-react';
import { useRouteCalculation } from '@/hooks/useRouteCalculation';
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

export interface LocationData {
  address: string;
  lat: number;
  lng: number;
}

interface GoogleMapComponentProps {
  onPickupChange: (data: LocationData | null) => void;
  onDropChange: (data: LocationData | null) => void;
  onRouteCalculated: (distanceKm: number, durationText: string) => void;
  className?: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

const GoogleMapComponent = ({
  onPickupChange,
  onDropChange,
  onRouteCalculated,
  className = '',
}: GoogleMapComponentProps) => {
  const [pickupText, setPickupText] = useState('');
  const [dropText, setDropText] = useState('');
  const [pickup, setPickup] = useState<LocationData | null>(null);
  const [drop, setDrop] = useState<LocationData | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<NominatimResult[]>([]);
  const [dropSuggestions, setDropSuggestions] = useState<NominatimResult[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  const { route, loading: routeLoading, error: routeError, calculateRoute, clearRoute } = useRouteCalculation();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  const pickupDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dropDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629], // India center
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Search for locations using Nominatim
  const searchLocation = useCallback(async (query: string): Promise<NominatimResult[]> => {
    if (query.length < 3) return [];
    try {
      const res = await fetch(
        `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`
      );
      return await res.json();
    } catch {
      return [];
    }
  }, []);

  // Debounced pickup search
  const handlePickupInput = useCallback((value: string) => {
    setPickupText(value);
    if (pickup) { setPickup(null); onPickupChange(null); clearRoute(); }
    clearTimeout(pickupDebounceRef.current);
    if (value.length >= 3) {
      pickupDebounceRef.current = setTimeout(async () => {
        const results = await searchLocation(value);
        setPickupSuggestions(results);
      }, 300);
    } else {
      setPickupSuggestions([]);
    }
  }, [pickup, onPickupChange, searchLocation, clearRoute]);

  // Debounced drop search
  const handleDropInput = useCallback((value: string) => {
    setDropText(value);
    if (drop) { setDrop(null); onDropChange(null); clearRoute(); }
    clearTimeout(dropDebounceRef.current);
    if (value.length >= 3) {
      dropDebounceRef.current = setTimeout(async () => {
        const results = await searchLocation(value);
        setDropSuggestions(results);
      }, 300);
    } else {
      setDropSuggestions([]);
    }
  }, [drop, onDropChange, searchLocation, clearRoute]);

  const selectPickup = useCallback((result: NominatimResult) => {
    const data: LocationData = {
      address: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
    setPickup(data);
    setPickupText(data.address);
    setPickupSuggestions([]);
    onPickupChange(data);
  }, [onPickupChange]);

  const selectDrop = useCallback((result: NominatimResult) => {
    const data: LocationData = {
      address: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
    setDrop(data);
    setDropText(data.address);
    setDropSuggestions([]);
    onDropChange(data);
  }, [onDropChange]);

  // Geocode on blur if no selection made
  const handlePickupBlur = useCallback(async () => {
    // Delay to allow click on suggestion
    setTimeout(async () => {
      if (!pickup && pickupText.trim().length >= 3) {
        setGeocoding(true);
        const results = await searchLocation(pickupText);
        if (results.length > 0) {
          selectPickup(results[0]);
        } else {
          onPickupChange({ address: pickupText.trim(), lat: 0, lng: 0 });
        }
        setPickupSuggestions([]);
        setGeocoding(false);
      }
    }, 200);
  }, [pickup, pickupText, searchLocation, selectPickup, onPickupChange]);

  const handleDropBlur = useCallback(async () => {
    setTimeout(async () => {
      if (!drop && dropText.trim().length >= 3) {
        setGeocoding(true);
        const results = await searchLocation(dropText);
        if (results.length > 0) {
          selectDrop(results[0]);
        } else {
          onDropChange({ address: dropText.trim(), lat: 0, lng: 0 });
        }
        setDropSuggestions([]);
        setGeocoding(false);
      }
    }, 200);
  }, [drop, dropText, searchLocation, selectDrop, onDropChange]);

  // Calculate route when both locations are set
  useEffect(() => {
    if (pickup?.lat && pickup.lat !== 0 && drop?.lat && drop.lat !== 0) {
      calculateRoute(pickup.lat, pickup.lng, drop.lat, drop.lng);
    }
  }, [pickup, drop, calculateRoute]);

  // Notify parent of route result
  useEffect(() => {
    if (route) {
      onRouteCalculated(route.distance_km, `${route.duration_minutes} min`);
    }
  }, [route, onRouteCalculated]);

  // Update map markers and route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    if (pickupMarkerRef.current) { pickupMarkerRef.current.remove(); pickupMarkerRef.current = null; }
    if (dropMarkerRef.current) { dropMarkerRef.current.remove(); dropMarkerRef.current = null; }
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }

    const bounds = L.latLngBounds([]);

    if (pickup?.lat && pickup.lat !== 0) {
      const greenIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
      });
      pickupMarkerRef.current = L.marker([pickup.lat, pickup.lng], { icon: greenIcon })
        .addTo(map)
        .bindPopup(`📍 Pickup: ${pickup.address.slice(0, 50)}`);
      bounds.extend([pickup.lat, pickup.lng]);
    }

    if (drop?.lat && drop.lat !== 0) {
      const redIcon = new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
      });
      dropMarkerRef.current = L.marker([drop.lat, drop.lng], { icon: redIcon })
        .addTo(map)
        .bindPopup(`🏁 Drop: ${drop.address.slice(0, 50)}`);
      bounds.extend([drop.lat, drop.lng]);
    }

    // Draw route polyline
    if (route?.geometry) {
      const decoded = decodePolyline(route.geometry);
      routeLineRef.current = L.polyline(decoded, {
        color: 'hsl(160, 84%, 39%)',
        weight: 5,
        opacity: 0.8,
      }).addTo(map);
      decoded.forEach(p => bounds.extend(p));
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [pickup, drop, route]);

  const handleSwap = useCallback(() => {
    const oldPickup = pickup, oldDrop = drop, oldPT = pickupText, oldDT = dropText;
    setPickup(oldDrop); setDrop(oldPickup); setPickupText(oldDT); setDropText(oldPT);
    onPickupChange(oldDrop); onDropChange(oldPickup); clearRoute();
  }, [pickup, drop, pickupText, dropText, onPickupChange, onDropChange, clearRoute]);

  const clearPickup = useCallback(() => {
    setPickup(null); setPickupText(''); setPickupSuggestions([]);
    onPickupChange(null); clearRoute();
  }, [onPickupChange, clearRoute]);

  const clearDrop = useCallback(() => {
    setDrop(null); setDropText(''); setDropSuggestions([]);
    onDropChange(null); clearRoute();
  }, [onDropChange, clearRoute]);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
          );
          const data = await res.json();
          const addr = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          const loc: LocationData = { address: addr, lat, lng };
          setPickup(loc);
          setPickupText(addr);
          onPickupChange(loc);
        } catch {
          const loc: LocationData = { address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
          setPickup(loc);
          setPickupText(loc.address);
          onPickupChange(loc);
        }
        setGeocoding(false);
      },
      () => setGeocoding(false)
    );
  }, [onPickupChange]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Pickup */}
        <div className="space-y-2">
          <Label htmlFor="ors-pickup">
            <MapPin className="mr-1 inline h-4 w-4 text-primary" />Pickup Location
          </Label>
          <div className="relative">
            <Input
              id="ors-pickup"
              placeholder="Search pickup address..."
              value={pickupText}
              onChange={(e) => handlePickupInput(e.target.value)}
              onBlur={handlePickupBlur}
              className={pickup ? 'border-primary pr-8' : 'pr-8'}
            />
            {pickupText && (
              <button type="button" onClick={clearPickup}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            {pickupSuggestions.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {pickupSuggestions.map((s, i) => (
                  <button key={i} type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onMouseDown={() => selectPickup(s)}>
                    <MapPin className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                    {s.display_name.slice(0, 80)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={useCurrentLocation} className="h-7 gap-1 px-2 text-xs">
            <LocateFixed className="h-3 w-3" /> Use current location
          </Button>
        </div>

        {/* Drop */}
        <div className="space-y-2">
          <Label htmlFor="ors-drop">
            <MapPin className="mr-1 inline h-4 w-4 text-destructive" />Drop Location
          </Label>
          <div className="relative">
            <Input
              id="ors-drop"
              placeholder="Search drop address..."
              value={dropText}
              onChange={(e) => handleDropInput(e.target.value)}
              onBlur={handleDropBlur}
              className={drop ? 'border-primary pr-8' : 'pr-8'}
            />
            {dropText && (
              <button type="button" onClick={clearDrop}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            {dropSuggestions.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {dropSuggestions.map((s, i) => (
                  <button key={i} type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onMouseDown={() => selectDrop(s)}>
                    <MapPin className="mr-1.5 inline h-3.5 w-3.5 text-destructive" />
                    {s.display_name.slice(0, 80)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {(pickupText || dropText) && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={handleSwap} className="gap-1.5">
            <ArrowUpDown className="h-4 w-4" /> Swap
          </Button>
        </div>
      )}

      {(geocoding || routeLoading) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {routeLoading ? 'Calculating route...' : 'Resolving address...'}
        </div>
      )}

      {route && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/50 px-4 py-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Distance</p>
            <p className="text-lg font-bold text-primary">{route.distance_km} km</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">ETA</p>
            <p className="text-lg font-bold text-primary">{route.duration_minutes} min</p>
          </div>
        </div>
      )}

      {routeError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{routeError}</p>
        </div>
      )}

      {/* Leaflet Map */}
      <div
        ref={mapContainerRef}
        className="h-[400px] w-full rounded-xl border border-border overflow-hidden"
        style={{ zIndex: 0 }}
      />
    </div>
  );
};

export default GoogleMapComponent;
