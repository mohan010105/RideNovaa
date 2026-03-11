import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import bookingRoutes from './routes/bookingRoutes.js';

dotenv.config({ path: '../.env' }); // load from main project

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.use('/api/bookings', bookingRoutes);
app.use('/api/rides', bookingRoutes); // for /api/rides/verify-otp
app.use('/api', bookingRoutes); // for /api/driver/rides/:driverId

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('driver_location_update', (data) => {
    // Broadcast to all clients (passengers will filter by driver_id)
    io.emit(`driver_location_${data.driver_id}`, data);
    console.log(`Driver ${data.driver_id} location update:`, data.lat, data.lng);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
