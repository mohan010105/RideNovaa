import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const LOCATION_COORDS: Record<string, [number, number]> = {
  'delhi': [28.6139, 77.2090],
  'mumbai': [19.0760, 72.8777],
  'bangalore': [12.9716, 77.5946],
  'chennai': [13.0827, 80.2707],
  'hyderabad': [17.3850, 78.4867],
  'kolkata': [22.5726, 88.3639],
  'pune': [18.5204, 73.8567],
  'ahmedabad': [23.0225, 72.5714],
  'jaipur': [26.9124, 75.7873],
  'lucknow': [26.8467, 80.9462],
  'airport': [28.5562, 77.1000],
  'station': [28.6423, 77.2199],
  'connaught place': [28.6315, 77.2167],
  'mall': [28.5672, 77.3211],
  'market': [28.6506, 77.2334],
  'hospital': [28.5672, 77.2100],
  'university': [28.6886, 77.2091],
};

function getCoords(location: string): [number, number] {
  const lower = location.toLowerCase();
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (lower.includes(key)) return coords;
  }
  // Generate deterministic coords from string hash
  let hash = 0;
  for (let i = 0; i < location.length; i++) {
    hash = ((hash << 5) - hash) + location.charCodeAt(i);
    hash |= 0;
  }
  const lat = 28.5 + (Math.abs(hash % 1000) / 5000);
  const lng = 77.1 + (Math.abs((hash >> 10) % 1000) / 5000);
  return [lat, lng];
}

interface MapViewProps {
  pickup: string;
  drop: string;
  driverPosition?: [number, number] | null;
  className?: string;
}

const MapView = ({ pickup, drop, driverPosition, className = '' }: MapViewProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);

  const pickupCoords = getCoords(pickup);
  const dropCoords = getCoords(drop);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView(pickupCoords, 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const pickupIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="background:#10b981;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">📍</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const dropIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="background:#ef4444;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">🏁</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    L.marker(pickupCoords, { icon: pickupIcon }).addTo(map).bindPopup(`<b>Pickup:</b> ${pickup}`);
    L.marker(dropCoords, { icon: dropIcon }).addTo(map).bindPopup(`<b>Drop:</b> ${drop}`);

    L.polyline([pickupCoords, dropCoords], {
      color: '#10b981',
      weight: 4,
      opacity: 0.7,
      dashArray: '10, 10',
    }).addTo(map);

    const bounds = L.latLngBounds([pickupCoords, dropCoords]);
    map.fitBounds(bounds, { padding: [50, 50] });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [pickup, drop]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    if (driverPosition) {
      const driverIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:#3b82f6;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 10px rgba(59,130,246,0.5);border:2px solid white;animation:pulse 2s infinite;">🚕</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng(driverPosition);
      } else {
        driverMarkerRef.current = L.marker(driverPosition, { icon: driverIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup('<b>Driver</b> is on the way!');
      }
    }
  }, [driverPosition]);

  return <div ref={mapRef} className={`rounded-lg ${className}`} style={{ minHeight: '300px' }} />;
};

export { getCoords };
export default MapView;
