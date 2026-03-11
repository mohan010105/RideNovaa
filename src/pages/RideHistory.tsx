import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarIcon, MapPin, Navigation, Clock, IndianRupee, Filter, Download } from 'lucide-react';
import { useBookings } from '@/hooks/useBookings';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  searching: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-indigo-100 text-indigo-800',
  ongoing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const RideHistory = () => {
  const { getUserBookings, loading } = useBookings();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const bookings = getUserBookings();

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      const created = new Date(b.created_at);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (created > end) return false;
      }
      return true;
    });
  }, [bookings, statusFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setStatusFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const exportCSV = useCallback((rows: typeof bookings) => {
    if (rows.length === 0) return;
    const headers = ['Date', 'Pickup', 'Drop', 'Distance (km)', 'Fare (₹)', 'Status', 'Cab Type', 'Payment'];
    const csvRows = rows.map(b => [
      format(new Date(b.created_at), 'yyyy-MM-dd HH:mm'),
      `"${b.pickup_location}"`,
      `"${b.drop_location}"`,
      b.distance_km ?? '',
      b.fare,
      b.status,
      b.cab_type,
      b.payment_method,
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ride-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 pt-20">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ride History</h1>
          <p className="text-sm text-muted-foreground">View and filter your past rides</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[140px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd MMM yy') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[140px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd MMM yy') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <Filter className="mr-1 h-3 w-3" /> Clear
            </Button>

            <Button variant="outline" size="sm" onClick={() => exportCSV(filtered)}>
              <Download className="mr-1 h-3 w-3" /> Export CSV
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No rides found for the selected filters.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <Card key={b.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3.5 w-3.5 text-green-600" />
                        <span className="line-clamp-1">{b.pickup_location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Navigation className="h-3.5 w-3.5 text-red-500" />
                        <span className="line-clamp-1">{b.drop_location}</span>
                      </div>
                    </div>
                    <Badge className={statusColor[b.status] || 'bg-muted text-muted-foreground'}>
                      {b.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(b.created_at), 'dd MMM yyyy, hh:mm a')}
                    </span>
                    {b.distance_km && (
                      <span>{b.distance_km} km</span>
                    )}
                    <span className="flex items-center gap-0.5 font-semibold text-foreground">
                      <IndianRupee className="h-3 w-3" />
                      {b.fare}
                    </span>
                    <span className="text-xs">{b.cab_type} · {b.payment_method}</span>
                  </div>

                  {(b.status === 'confirmed' || b.status === 'ongoing') && (
                    <Button size="sm" variant="outline" className="self-end" onClick={() => navigate(`/track/${b.id}`)}>
                      Track Ride
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RideHistory;
