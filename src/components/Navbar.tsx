import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Car, LogOut, User, LayoutDashboard, ShieldCheck, Truck, Wallet, Plus, History } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const Navbar = () => {
  const { user, logout, isAdmin, isDriver } = useAuth();
  const { wallet, refetch } = useWallet();
  const navigate = useNavigate();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleTopUp = async () => {
    const amount = parseInt(topUpAmount);
    if (!amount || amount < 10) {
      toast.error('Minimum top-up is ₹10');
      return;
    }
    setTopUpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-topup-order', {
        body: { amount },
      });
      if (error || !data?.orderId) {
        toast.error('Failed to create top-up order');
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency,
          name: 'RideNova Wallet',
          description: 'Wallet Top-Up',
          order_id: data.orderId,
          handler: async (response: any) => {
            try {
              const { error: verifyError } = await supabase.functions.invoke('wallet-topup-verify', {
                body: {
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpaySignature: response.razorpay_signature,
                  amount,
                },
              });
              if (verifyError) {
                toast.error('Verification failed');
              } else {
                toast.success(`₹${amount} added to wallet!`);
                refetch();
                setTopUpOpen(false);
                setTopUpAmount('');
              }
            } catch {
              toast.error('Verification error');
            }
          },
          modal: { ondismiss: () => toast.info('Top-up cancelled') },
          prefill: { email: user?.email || '' },
          theme: { color: '#6366f1' },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      };
      document.body.appendChild(script);
    } catch {
      toast.error('Top-up failed');
    } finally {
      setTopUpLoading(false);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
            <Car className="h-6 w-6" />
            RideNova
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              {/* Wallet Balance Indicator */}
              <button
                onClick={() => setTopUpOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <Wallet className="h-4 w-4 text-primary" />
                <span>₹{wallet?.balance ?? 0}</span>
                <Plus className="h-3 w-3 text-muted-foreground" />
              </button>

              <Link to="/book">
                <Button size="sm">Book a Cab</Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full">
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-sm font-medium">{user.name}</div>
                  <div className="px-2 pb-1.5 text-xs text-muted-foreground">{user.email}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/history')}>
                    <History className="mr-2 h-4 w-4" /> Ride History
                  </DropdownMenuItem>
                  {isDriver && (
                    <DropdownMenuItem onClick={() => navigate('/driver')}>
                      <Truck className="mr-2 h-4 w-4" /> Driver Panel
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate('/admin')}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login"><Button variant="ghost" size="sm">Login</Button></Link>
              <Link to="/signup"><Button size="sm">Sign Up</Button></Link>
            </div>
          )}
        </div>
      </nav>

      {/* Top-Up Dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Add Money
            </DialogTitle>
            <DialogDescription>Current balance: ₹{wallet?.balance ?? 0}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[100, 500, 1000].map((amt) => (
                <Button
                  key={amt}
                  variant={topUpAmount === String(amt) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTopUpAmount(String(amt))}
                >
                  ₹{amt}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Enter amount"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              min={10}
            />
            <Button className="w-full" onClick={handleTopUp} disabled={topUpLoading}>
              {topUpLoading ? 'Processing...' : `Add ₹${topUpAmount || '0'} to Wallet`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Navbar;
