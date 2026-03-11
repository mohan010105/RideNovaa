import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface OtpVerificationProps {
  bookingOtp: string;
  onVerified: () => void;
  isDriverView?: boolean;
}

const OtpVerification = ({ bookingOtp, onVerified, isDriverView = false }: OtpVerificationProps) => {
  const [otpValue, setOtpValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(false);

  const handleVerify = () => {
    if (otpValue.length !== 4) {
      toast.error('Please enter the full 4-digit OTP');
      return;
    }

    setVerifying(true);
    setError(false);

    // Simulate a brief verification delay
    setTimeout(() => {
      if (otpValue === bookingOtp) {
        toast.success('OTP verified! Ride started.');
        onVerified();
      } else {
        setError(true);
        toast.error('Invalid OTP. Please try again.');
        setOtpValue('');
      }
      setVerifying(false);
    }, 800);
  };

  if (!isDriverView) {
    // Passenger view — show OTP to share with driver
    return (
      <Card className="border-2 border-dashed border-primary/40 bg-primary/5">
        <CardContent className="p-4 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">Share this OTP with your driver</p>
          <p className="mt-1 text-3xl font-bold tracking-[0.3em] text-primary">{bookingOtp}</p>
          <p className="mt-2 text-xs text-muted-foreground">The driver will enter this to start your ride</p>
        </CardContent>
      </Card>
    );
  }

  // Driver view — enter OTP to start ride
  return (
    <Card className="border-2 border-primary/30">
      <CardHeader className="pb-2 text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Verify Ride OTP
        </CardTitle>
        <p className="text-xs text-muted-foreground">Ask the passenger for the 4-digit OTP</p>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        <div className="flex justify-center">
          <InputOTP maxLength={4} value={otpValue} onChange={setOtpValue}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            Incorrect OTP. Please try again.
          </div>
        )}

        <Button
          onClick={handleVerify}
          disabled={otpValue.length !== 4 || verifying}
          className="w-full"
          size="sm"
        >
          {verifying ? (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Verifying...</>
          ) : (
            'Verify & Start Ride'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default OtpVerification;
