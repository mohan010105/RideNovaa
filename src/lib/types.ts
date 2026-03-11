export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface Booking {
  id: string;
  userId: string;
  userName: string;
  pickupLocation: string;
  dropLocation: string;
  date: string;
  time: string;
  cabType: 'Mini' | 'Sedan' | 'SUV';
  paymentMethod: 'Cash' | 'Card' | 'UPI';
  fare: number;
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  createdAt: string;
}

export type CabType = 'Mini' | 'Sedan' | 'SUV';
export type PaymentMethod = 'Cash' | 'Card' | 'UPI';
export type BookingStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
