🚖 RideNova – Real-Time Cab Booking Platform

RideNova is a full-stack ride-hailing platform that allows users to book cabs, track drivers in real time, manage wallet payments, and complete rides securely using OTP verification. The system includes User, Driver, and Admin dashboards and provides an experience similar to modern ride-hailing applications like Uber or Ola.

📌 Features
👤 User Features

Search pickup and drop locations

Map-based route visualization

Estimated fare calculation

Real-time driver tracking

OTP-based ride verification

Wallet payment system

Ride history

Ride cancellation before ride start

Driver rating system

🚗 Driver Features

Online / Offline availability toggle

Receive nearby ride requests

Accept or reject ride requests

Navigate to pickup location

OTP verification to start ride

Real-time ride tracking

End ride functionality

Driver earnings dashboard

Ride history tracking

🛠 Admin Features

Dashboard analytics

Total rides monitoring

Revenue statistics

Driver management

User management

Ride activity tracking

🗺 Map & Routing System

RideNova uses OpenStreetMap and OpenRouteService instead of Google Maps.

Capabilities include:

Location search suggestions

Route generation

Distance calculation

ETA estimation

Route visualization on map

💳 Wallet & Payment System

RideNova integrates Razorpay to enable wallet-based payments.

Wallet Features:

Secure wallet top-up

Payment verification

Balance management

Transaction history

Payment success validation before wallet update

🔐 OTP Ride Verification

Each ride generates a unique OTP when booking is created.

Ride start process:

Driver arrives at pickup location

Passenger shares OTP

Driver enters OTP

System verifies OTP

Ride starts only after successful verification

This prevents unauthorized ride starts.

📡 Real-Time Tracking

RideNova implements real-time ride tracking using WebSockets.

Features:

Live driver location updates

Route progress visualization

Dynamic ETA updates

Map marker updates every few seconds

🧱 Tech Stack
Frontend

React.js

Vite

TailwindCSS

Recharts

Backend

Node.js

Express.js

Socket.io

Database

Supabase (PostgreSQL)

Maps & Routing

OpenStreetMap

OpenRouteService API

Payments

Razorpay

🗄 Database Structure

Main tables used in the system:

users
drivers
bookings
wallet_transactions
driver_locations
surge_pricing
🔄 Ride Flow

1️⃣ User selects pickup location
2️⃣ User selects drop location
3️⃣ Route and fare are calculated
4️⃣ User confirms booking
5️⃣ Driver receives ride request
6️⃣ Driver accepts ride
7️⃣ Passenger shares OTP with driver
8️⃣ Ride starts after OTP verification
9️⃣ Real-time ride tracking begins
🔟 Ride completes and payment is processed

🚀 Installation & Setup
1️⃣ Clone Repository
git clone https://github.com/yourusername/ridenova.git
cd ridenova
2️⃣ Install Dependencies
npm install
3️⃣ Configure Environment Variables

Create .env file:

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

ORS_API_KEY=

RPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
4️⃣ Start Backend Server
npm run dev
5️⃣ Start Frontend
npm run dev
📊 Future Enhancements

AI ride demand prediction

Dynamic surge pricing

Push notifications

Driver performance analytics

Multi-city ride support

📄 License

This project is developed for educational and demonstration purposes.

👨‍💻 Developed By

Mohan Raj

RideNova – Smart Ride Hailing Platform 🚖
