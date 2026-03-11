import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { playSound } from '@/lib/notifications';

interface RideRatingProps {
  driverName: string;
  onSubmit: (rating: number, review: string) => void;
  onSkip: () => void;
}

const RideRating = ({ driverName, onSubmit, onSkip }: RideRatingProps) => {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState('');

  const handleSubmit = () => {
    if (rating === 0) { toast.error('Please select a rating'); return; }
    playSound('success');
    onSubmit(rating, review);
    toast.success('Thanks for your feedback!');
  };

  return (
    <Card className="glass-card w-full max-w-md shadow-2xl">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-xl">Rate Your Ride</CardTitle>
        <p className="text-sm text-muted-foreground">How was your experience with {driverName}?</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`h-10 w-10 transition-colors ${
                  star <= (hover || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground/30'
                }`}
              />
            </button>
          ))}
        </div>
        {rating > 0 && (
          <p className="text-center text-sm font-medium text-muted-foreground">
            {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
          </p>
        )}
        <Textarea
          placeholder="Share your experience (optional)..."
          value={review}
          onChange={e => setReview(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex gap-3">
          <Button onClick={handleSubmit} className="flex-1">Submit Rating</Button>
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">Skip</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RideRating;
