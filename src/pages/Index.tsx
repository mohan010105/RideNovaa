import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Car, MapPin, Shield, Zap, Clock, CreditCard } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const features = [
  { icon: Zap, title: 'Instant Booking', desc: 'Book your ride in seconds with our streamlined process' },
  { icon: Shield, title: 'Safe Rides', desc: 'Verified drivers and real-time trip tracking' },
  { icon: Clock, title: '24/7 Available', desc: 'Rides available round the clock, rain or shine' },
  { icon: MapPin, title: 'City Wide', desc: 'Coverage across all major routes and locations' },
  { icon: CreditCard, title: 'Easy Payment', desc: 'Pay via Cash, Card, or UPI — your choice' },
  { icon: Car, title: 'Multiple Cabs', desc: 'Choose from Mini, Sedan, or SUV based on your needs' },
];

const Index = () => {
  const { user } = useAuth();

  return (
    <main>
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="relative mx-auto max-w-6xl px-4 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Car className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Your Ride, <span className="text-primary">Your Way</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
            Book cabs instantly with CabRide. Affordable fares, safe rides, and seamless booking — all in one app.
          </p>
          <div className="flex items-center justify-center gap-4">
            {user ? (
              <Link to="/book"><Button size="lg" className="text-lg px-8">Book a Ride</Button></Link>
            ) : (
              <>
                <Link to="/signup"><Button size="lg" className="text-lg px-8">Get Started</Button></Link>
                <Link to="/login"><Button size="lg" variant="outline" className="text-lg px-8">Sign In</Button></Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-10 text-center text-3xl font-bold">Why CabRide?</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(f => (
            <Card key={f.title} className="glass-card transition-shadow hover:shadow-2xl">
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 CabRide. All rights reserved.</p>
      </footer>
    </main>
  );
};

export default Index;
