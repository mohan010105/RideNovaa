import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  const sessionId = searchParams.get('session_id');
  const bookingId = searchParams.get('booking_id');

  useEffect(() => {
    const verify = async () => {
      if (!sessionId || !bookingId) {
        toast.error('Missing payment information');
        setVerifying(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('verify-payment', {
          body: { sessionId, bookingId },
        });

        if (error) throw error;

        if (data?.success) {
          setVerified(true);
          toast.success('Payment confirmed!');
        } else {
          toast.error('Payment not confirmed. Please contact support.');
        }
      } catch (err: any) {
        console.error('Payment verification error:', err);
        toast.error('Could not verify payment');
      } finally {
        setVerifying(false);
      }
    };

    verify();
  }, [sessionId, bookingId]);

  useEffect(() => {
    if (verified) {
      const timer = setTimeout(() => navigate(`/track/${bookingId}`), 4000);
      return () => clearTimeout(timer);
    }
  }, [verified, bookingId, navigate]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="p-8">
          {verifying ? (
            <>
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
              <h2 className="mb-2 text-xl font-bold">Verifying Payment...</h2>
              <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
            </>
          ) : verified ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mb-2 text-2xl font-bold">Payment Successful!</h2>
              <p className="mb-1 text-muted-foreground">Your ride has been confirmed and paid.</p>
              <p className="mb-6 text-sm text-muted-foreground">Redirecting to ride tracking...</p>
              <div className="flex gap-3">
                <Button className="flex-1" onClick={() => navigate(`/track/${bookingId}`)}>
                  Track Ride
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
                  Dashboard
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-xl font-bold">Payment Issue</h2>
              <p className="mb-6 text-muted-foreground">We could not verify your payment. Please check your dashboard or contact support.</p>
              <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;
