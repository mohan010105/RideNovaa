import { useEffect, useState } from 'react';
import { TrendingUp, Zap } from 'lucide-react';

interface SurgePricingProps {
  className?: string;
}

function getSimulatedSurge(): { multiplier: number; demand: string } {
  const hour = new Date().getHours();
  // Peak hours: 8-10 AM, 5-8 PM
  const isPeak = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);
  const isLate = hour >= 22 || hour <= 5;

  if (isPeak) return { multiplier: 1.2 + Math.random() * 0.8, demand: 'High' };
  if (isLate) return { multiplier: 1.1 + Math.random() * 0.5, demand: 'Moderate' };
  return { multiplier: 1.0, demand: 'Normal' };
}

const SurgePricing = ({ className = '' }: SurgePricingProps) => {
  const [surge, setSurge] = useState(getSimulatedSurge);

  useEffect(() => {
    const interval = setInterval(() => setSurge(getSimulatedSurge()), 30000);
    return () => clearInterval(interval);
  }, []);

  if (surge.multiplier <= 1.05) return null;

  const color = surge.multiplier >= 1.5 ? 'text-destructive' : 'text-yellow-600';
  const bg = surge.multiplier >= 1.5 ? 'bg-destructive/10 border-destructive/20' : 'bg-yellow-50 border-yellow-200';

  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 ${bg} ${className}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card">
        {surge.multiplier >= 1.5 ? <Zap className={`h-4 w-4 ${color}`} /> : <TrendingUp className={`h-4 w-4 ${color}`} />}
      </div>
      <div className="flex-1">
        <p className={`text-sm font-semibold ${color}`}>
          {surge.multiplier.toFixed(1)}x Surge Pricing
        </p>
        <p className="text-xs text-muted-foreground">
          {surge.demand} demand right now
        </p>
      </div>
    </div>
  );
};

export { getSimulatedSurge };
export default SurgePricing;
