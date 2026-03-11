import { useState } from 'react';
import { useAllBookings } from '@/hooks/useBookings';
import { useAllPayments } from '@/hooks/usePayments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, Users, IndianRupee, Car, Clock, Loader2, RotateCcw, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  searching: 'bg-orange-100 text-orange-800',
  confirmed: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const paymentStatusColor: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-purple-100 text-purple-800',
};

const STATUSES = ['pending', 'searching', 'confirmed', 'ongoing', 'completed', 'cancelled'];
const PIE_COLORS = ['#eab308', '#f97316', '#3b82f6', '#a855f7', '#22c55e', '#ef4444'];
const PAYMENT_PIE_COLORS = ['#22c55e', '#eab308', '#ef4444', '#a855f7'];

const AdminPanel = () => {
  const { bookings, loading, updateBookingStatus } = useAllBookings();
  const { payments, loading: paymentsLoading } = useAllPayments();
  const [refundDialog, setRefundDialog] = useState<{ bookingId: string; paymentId: string; provider: string } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const totalRevenue = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const refundedAmount = payments.filter(p => p.status === 'refunded').reduce((s, p) => s + Number(p.amount), 0);
  const netRevenue = totalRevenue - refundedAmount;
  const stripeRevenue = payments.filter(p => p.status === 'paid' && p.method === 'Card').reduce((s, p) => s + Number(p.amount), 0);
  const razorpayRevenue = payments.filter(p => p.status === 'paid' && p.method === 'UPI').reduce((s, p) => s + Number(p.amount), 0);
  const cashRevenue = payments.filter(p => p.status === 'paid' && p.method === 'Cash').reduce((s, p) => s + Number(p.amount), 0);

  const uniqueUsers = new Set(bookings.map(b => b.user_id)).size;

  const stats = [
    { label: 'Total Bookings', value: bookings.length, icon: Car },
    { label: 'Active', value: bookings.filter(b => ['pending', 'searching', 'confirmed', 'ongoing'].includes(b.status)).length, icon: Clock },
    { label: 'Net Revenue', value: `₹${netRevenue}`, icon: IndianRupee },
    { label: 'Unique Users', value: uniqueUsers, icon: Users },
  ];

  const revenueStats = [
    { label: 'Total Revenue', value: `₹${totalRevenue}` },
    { label: 'Stripe (Card)', value: `₹${stripeRevenue}` },
    { label: 'Razorpay (UPI)', value: `₹${razorpayRevenue}` },
    { label: 'Cash', value: `₹${cashRevenue}` },
    { label: 'Refunded', value: `₹${refundedAmount}` },
  ];

  const statusData = STATUSES.map(s => ({
    name: s,
    value: bookings.filter(b => b.status === s).length,
  })).filter(d => d.value > 0);

  const paymentMethodData = [
    { name: 'Card', value: payments.filter(p => p.method === 'Card').length },
    { name: 'UPI', value: payments.filter(p => p.method === 'UPI').length },
    { name: 'Cash', value: payments.filter(p => p.method === 'Cash').length },
  ].filter(d => d.value > 0);

  const ridesPerDay: Record<string, number> = {};
  bookings.forEach(b => {
    const day = new Date(b.created_at).toLocaleDateString();
    ridesPerDay[day] = (ridesPerDay[day] || 0) + 1;
  });
  const dailyData = Object.entries(ridesPerDay).map(([date, count]) => ({ date, rides: count })).slice(0, 14);

  const revenuePerDay: Record<string, number> = {};
  payments.filter(p => p.status === 'paid').forEach(p => {
    const day = new Date(p.created_at).toLocaleDateString();
    revenuePerDay[day] = (revenuePerDay[day] || 0) + Number(p.amount);
  });
  const dailyRevenueData = Object.entries(revenuePerDay).map(([date, amount]) => ({ date, revenue: amount })).slice(0, 14);

  const paymentsMap = new Map(payments.map(p => [p.booking_id, p]));

  const handleStatusChange = async (id: string, status: string) => {
    await updateBookingStatus(id, status);
    toast.success(`Status updated to ${status}`);
  };

  const handleRefund = async () => {
    if (!refundDialog) return;
    setRefunding(true);
    try {
      const { error } = await supabase.functions.invoke('process-refund', {
        body: {
          paymentId: refundDialog.paymentId,
          bookingId: refundDialog.bookingId,
          refundReason,
          provider: refundDialog.provider,
        },
      });
      if (error) throw error;
      toast.success('Refund processed successfully');
      setRefundDialog(null);
      setRefundReason('');
    } catch (err: any) {
      toast.error(err.message || 'Refund failed');
    } finally {
      setRefunding(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center gap-2">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold">Admin Panel</h1>
      </div>

      {/* KPI Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          <Card key={s.label} className="glass-card">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Breakdown */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {revenueStats.map(r => (
          <Card key={r.label} className="glass-card">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{r.label}</p>
              <p className="text-lg font-bold">{r.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="mr-1 h-4 w-4" /> Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Rides Per Day</CardTitle></CardHeader>
              <CardContent>
                {dailyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="rides" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-8 text-center text-muted-foreground">No data yet</p>}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Daily Revenue</CardTitle></CardHeader>
              <CardContent>
                {dailyRevenueData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis />
                      <Tooltip formatter={(v: number) => `₹${v}`} />
                      <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-8 text-center text-muted-foreground">No data yet</p>}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
              <CardContent>
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[STATUSES.indexOf(statusData[i]?.name) % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="py-8 text-center text-muted-foreground">No data yet</p>}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Payments by Method</CardTitle></CardHeader>
              <CardContent>
                {paymentMethodData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={paymentMethodData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {paymentMethodData.map((_, i) => <Cell key={i} fill={PAYMENT_PIE_COLORS[i % PAYMENT_PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="py-8 text-center text-muted-foreground">No data yet</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bookings">
          <Card className="glass-card">
            <CardHeader><CardTitle>All Bookings</CardTitle></CardHeader>
            <CardContent>
              {bookings.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No bookings yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Cab</TableHead>
                        <TableHead>Fare</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.map(b => {
                        const payment = paymentsMap.get(b.id);
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-xs">{b.id.slice(0, 8)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{b.pickup_location} → {b.drop_location}</TableCell>
                            <TableCell className="whitespace-nowrap">{new Date(b.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>{b.cab_type}</TableCell>
                            <TableCell>₹{Number(b.fare)}</TableCell>
                            <TableCell>
                              {payment ? (
                                <Badge className={paymentStatusColor[payment.status] || ''}>{payment.method} - {payment.status}</Badge>
                              ) : (
                                <Badge className="bg-muted text-muted-foreground">{b.payment_method}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Select value={b.status} onValueChange={v => handleStatusChange(b.id, v)}>
                                <SelectTrigger className="h-8 w-[130px]">
                                  <Badge className={statusColor[b.status] || ''}>{b.status}</Badge>
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="glass-card">
            <CardHeader><CardTitle>All Payments</CardTitle></CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No payments yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Booking</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="font-mono text-xs">{p.booking_id.slice(0, 8)}</TableCell>
                          <TableCell>{p.method}</TableCell>
                          <TableCell>₹{Number(p.amount)}</TableCell>
                          <TableCell><Badge className={paymentStatusColor[p.status] || ''}>{p.status}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{p.stripe_payment_id?.slice(0, 20) || '—'}</TableCell>
                          <TableCell>
                            {p.status === 'paid' && p.stripe_payment_id && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setRefundDialog({
                                  bookingId: p.booking_id,
                                  paymentId: p.stripe_payment_id!,
                                  provider: p.method === 'Card' ? 'stripe' : 'razorpay',
                                })}
                              >
                                <RotateCcw className="mr-1 h-3 w-3" /> Refund
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Refund Dialog */}
      <Dialog open={!!refundDialog} onOpenChange={() => setRefundDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will refund the payment and cancel the booking. This action cannot be undone.
            </p>
            <Textarea
              placeholder="Reason for refund (optional)"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefund} disabled={refunding}>
              {refunding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : 'Confirm Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
