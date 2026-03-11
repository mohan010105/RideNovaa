import { useAuth } from '@/contexts/AuthContext';
import { useBookings, BookingRow } from '@/hooks/useBookings';
import { usePayments, PaymentRow } from '@/hooks/usePayments';
import { useWallet } from '@/hooks/useWallet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, MapPin, Clock, IndianRupee, XCircle, Navigation, Loader2, CreditCard, FileText, RotateCcw, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

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

const Dashboard = () => {
  const { user } = useAuth();
  const { getUserBookings, cancelBooking, loading } = useBookings();
  const { payments, loading: paymentsLoading } = usePayments();
  const { wallet, topUp, transactions, refetch: refetchWallet } = useWallet();
  const navigate = useNavigate();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const bookings = getUserBookings();

  const paymentsMap = new Map<string, PaymentRow>();
  payments.forEach(p => paymentsMap.set(p.booking_id, p));

  const stats = {
    total: bookings.length,
    active: bookings.filter(b => ['pending', 'searching', 'confirmed', 'ongoing'].includes(b.status)).length,
    completed: bookings.filter(b => b.status === 'completed').length,
    spent: bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + Number(b.fare), 0),
  };

  const handleCancel = async (id: string) => {
    await cancelBooking(id);
    toast.success('Booking cancelled');
  };

  const handleRetryPayment = async (booking: BookingRow) => {
    setRetryingId(booking.id);
    try {
      if (booking.payment_method === 'Card') {
        const { data, error } = await supabase.functions.invoke('create-payment', {
          body: {
            bookingId: booking.id,
            amount: Number(booking.fare),
            pickupLocation: booking.pickup_location,
            dropLocation: booking.drop_location,
            cabType: booking.cab_type,
          },
        });
        if (error || !data?.url) throw new Error('Failed to create payment session');
        window.location.href = data.url;
        return;
      }
      if (booking.payment_method === 'UPI') {
        const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
          body: { bookingId: booking.id, amount: Number(booking.fare) },
        });
        if (error || !data?.orderId) throw new Error('Failed to create payment order');
        // Load Razorpay
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => {
          const options = {
            key: data.keyId,
            amount: data.amount,
            currency: data.currency,
            name: 'CabRide',
            description: `Ride Payment`,
            order_id: data.orderId,
            handler: async (response: any) => {
              const { error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
                body: {
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                  bookingId: booking.id,
                  amount: Number(booking.fare),
                },
              });
              if (verifyError) toast.error('Payment verification failed');
              else toast.success('Payment successful!');
            },
            prefill: { email: user?.email || '', name: user?.name || '' },
            theme: { color: '#6366f1' },
          };
          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        };
        document.body.appendChild(script);
        return;
      }
    } catch (err: any) {
      toast.error(err.message || 'Payment retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDownloadInvoice = async (bookingId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice', {
        body: { bookingId },
      });
      if (error) throw error;
      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) w.focus();
    } catch {
      toast.error('Failed to generate invoice');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getPaymentBadge = (booking: BookingRow) => {
    const payment = paymentsMap.get(booking.id);
    if (booking.payment_method === 'Cash') return <Badge className="bg-muted text-muted-foreground">Cash</Badge>;
    if (payment) return <Badge className={paymentStatusColor[payment.status] || ''}>{payment.status}</Badge>;
    if (['pending', 'searching', 'confirmed'].includes(booking.status) && booking.payment_method !== 'Cash') {
      return <Badge className="bg-yellow-100 text-yellow-800">Unpaid</Badge>;
    }
    return null;
  };

  const canRetry = (booking: BookingRow) => {
    const payment = paymentsMap.get(booking.id);
    return booking.payment_method !== 'Cash' && 
           !payment?.status?.match(/^(paid|refunded)$/) &&
           !['cancelled', 'completed'].includes(booking.status);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user?.name || 'User'}!</h1>
          <p className="text-muted-foreground">Here's your ride summary</p>
        </div>
        <Link to="/book"><Button><Car className="mr-2 h-4 w-4" /> Book a Cab</Button></Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Rides', value: stats.total, icon: Car },
          { label: 'Active', value: stats.active, icon: Clock },
          { label: 'Completed', value: stats.completed, icon: MapPin },
          { label: 'Total Spent', value: `₹${stats.spent}`, icon: IndianRupee },
        ].map(s => (
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

      {/* Wallet Card */}
      <Card className="glass-card mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> My Wallet</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-3xl font-bold text-primary">₹{wallet?.balance ?? 0}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={topUpAmount}
                onChange={e => setTopUpAmount(e.target.value)}
                className="w-32"
                min="1"
              />
              <Button
                disabled={topUpLoading || !topUpAmount || Number(topUpAmount) <= 0}
                onClick={async () => {
                  const amt = Number(topUpAmount);
                  if (amt <= 0) return;
                  setTopUpLoading(true);
                  try {
                    // Create Razorpay order for wallet top-up
                    const { data, error } = await supabase.functions.invoke('wallet-topup-order', {
                      body: { amount: amt },
                    });
                    if (error || !data?.orderId) {
                      // Fallback to direct top-up if Razorpay order fails
                      const success = await topUp(amt);
                      if (success) { toast.success(`₹${topUpAmount} added to wallet!`); setTopUpAmount(''); }
                      else toast.error('Top-up failed');
                      setTopUpLoading(false);
                      return;
                    }
                    // Load Razorpay checkout
                    const script = document.createElement('script');
                    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                    script.onload = () => {
                      const options = {
                        key: data.keyId,
                        amount: data.amount,
                        currency: data.currency,
                        name: 'RideNova',
                        description: 'Wallet Top-Up',
                        order_id: data.orderId,
                        handler: async (response: any) => {
                          try {
                            const { error: verifyError } = await supabase.functions.invoke('wallet-topup-verify', {
                              body: {
                                razorpayPaymentId: response.razorpay_payment_id,
                                razorpayOrderId: response.razorpay_order_id,
                                razorpaySignature: response.razorpay_signature,
                                amount: amt,
                              },
                            });
                            if (verifyError) {
                              toast.error('Payment verification failed');
                            } else {
                              toast.success(`₹${amt} added to wallet!`);
                              setTopUpAmount('');
                              await refetchWallet();
                            }
                          } catch {
                            toast.error('Payment verification error');
                          }
                          setTopUpLoading(false);
                        },
                        modal: {
                          ondismiss: () => {
                            toast.info('Payment cancelled');
                            setTopUpLoading(false);
                          },
                        },
                        prefill: { email: user?.email || '', name: user?.name || '' },
                        theme: { color: '#0d9488' },
                      };
                      const rzp = new (window as any).Razorpay(options);
                      rzp.open();
                    };
                    script.onerror = () => {
                      toast.error('Failed to load payment gateway');
                      setTopUpLoading(false);
                    };
                    document.body.appendChild(script);
                  } catch {
                    toast.error('Top-up failed');
                    setTopUpLoading(false);
                  }
                }}
              >
                {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Top Up via Razorpay'}
              </Button>
            </div>
          </div>
          {transactions.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-muted-foreground">Recent Transactions</p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {transactions.slice(0, 10).map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                    <span>{t.description || t.type}</span>
                    <span className={t.amount >= 0 ? 'font-medium text-green-600' : 'font-medium text-destructive'}>
                      {t.amount >= 0 ? '+' : ''}₹{Math.abs(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="bookings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bookings">Booking History</TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-1 h-4 w-4" /> Payment History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          {bookings.length === 0 ? (
            <Card className="p-12 text-center shadow-md">
              <Car className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No bookings yet</p>
              <p className="mb-4 text-muted-foreground">Book your first ride now!</p>
              <Link to="/book"><Button>Book a Cab</Button></Link>
            </Card>
          ) : (
            <div className="space-y-3">
              {bookings.map(b => (
                <Card key={b.id} className="glass-card">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.pickup_location}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{b.drop_location}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span>{b.scheduled_date || new Date(b.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{b.cab_type}</span>
                        <span>•</span>
                        <span>₹{Number(b.fare)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={statusColor[b.status] || ''}>{b.status}</Badge>
                      {getPaymentBadge(b)}
                      {['pending', 'searching', 'confirmed'].includes(b.status) && (
                        <>
                          <Link to={`/track/${b.id}`}>
                            <Button variant="ghost" size="sm" className="text-primary">
                              <Navigation className="mr-1 h-4 w-4" /> Track
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => handleCancel(b.id)} className="text-destructive hover:text-destructive">
                            <XCircle className="mr-1 h-4 w-4" /> Cancel
                          </Button>
                        </>
                      )}
                      {canRetry(b) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={retryingId === b.id}
                          onClick={() => handleRetryPayment(b)}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />
                          {retryingId === b.id ? 'Processing...' : 'Retry Payment'}
                        </Button>
                      )}
                      {b.status === 'completed' && (
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadInvoice(b.id)}>
                          <FileText className="mr-1 h-4 w-4" /> Invoice
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {payments.length === 0 ? (
            <Card className="p-12 text-center">
              <CreditCard className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No payments yet</p>
              <p className="text-muted-foreground">Payment records will appear here after your rides.</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
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
                          <TableCell className="font-mono text-xs">{p.stripe_payment_id?.slice(0, 16) || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
