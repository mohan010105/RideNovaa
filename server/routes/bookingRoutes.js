import express from 'express';
import { cancelBooking, createBookingLogic, verifyOtp, getDriverRides } from '../controllers/bookingController.js';

const router = express.Router();

// Trigger OTP notification / logic
router.post('/create', createBookingLogic);

// Cancel ride logic
router.post('/cancel', cancelBooking);

// OTP Verification
router.post('/verify-otp', verifyOtp);

// Get Driver Rides
router.get('/driver/rides/:driverId', getDriverRides);

export default router;
