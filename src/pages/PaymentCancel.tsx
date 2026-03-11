import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

const PaymentCancel = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id');

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="mb-2 text-2xl font-bold">Payment Cancelled</h2>
          <p className="mb-6 text-muted-foreground">
            Your payment was cancelled. The booking is still pending — you can retry or switch to Cash.
          </p>
          <div className="flex gap-3">
            {bookingId && (
              <Button className="flex-1" onClick={() => navigate('/book')}>
                Try Again
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentCancel;
