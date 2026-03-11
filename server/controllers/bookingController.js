import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // load from main project

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase URL or Key is missing from env. Booking operations may fail.");
}

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

export async function createBookingLogic(req, res) {
  try {
    const { bookingId, otp, passengerPhone, passengerEmail } = req.body;
    
    if (!bookingId || !otp) {
      return res.status(400).json({ error: 'bookingId and otp are required' });
    }

    const otpMessage = `Your RideNova ride OTP is ${otp}. Please share this OTP with the driver to start your ride.`;
    
    // Attempt Twilio first
    let smsSent = false;
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER && passengerPhone) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: otpMessage,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: passengerPhone
        });
        console.log("OTP sent to passenger:", passengerPhone);
        smsSent = true;
      } catch (smsError) {
        console.error("Twilio SMS send error:", smsError);
      }
    }

    // Fallback to Nodemailer if SMS not configured or failed to send
    if (!smsSent && process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD && passengerEmail) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com', // fallback default
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true', // Use `true` for port 465, `false` for all other ports
          auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
          }
        });

        await transporter.sendMail({
          from: process.env.SMTP_EMAIL,
          to: passengerEmail,
          subject: "RideNova Ride OTP",
          text: otpMessage
        });
        console.log("OTP sent to passenger email:", passengerEmail);
      } catch (emailError) {
        console.error("Nodemailer email send error:", emailError);
      }
    }

    return res.status(200).json({ success: true, message: "Booking process post-trigger completed." });
  } catch (error) {
    console.error("Error in createBookingLogic:", error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

export async function cancelBooking(req, res) {
  try {
    const { booking_id, user_id } = req.body;

    if (!booking_id || !user_id) {
      return res.status(400).json({ success: false, message: 'booking_id and user_id are required' });
    }

    // Validate booking exists
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .eq('user_id', user_id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Check booking status is not started
    const uncancelableStatuses = ['started', 'on_the_way', 'completed', 'cancelled'];
    if (uncancelableStatuses.includes(booking.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel booking with status: ${booking.status}` });
    }

    // Update booking status
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', booking_id);

    if (updateError) {
      return res.status(500).json({ success: false, message: 'Failed to update booking status' });
    }

    // If driver was assigned, mark driver as available again
    if (booking.driver_id) {
      await supabase
        .from('drivers')
        .update({ status: 'available' })
        .eq('id', booking.driver_id);
    }

    console.log("Ride cancelled:", booking_id);

    return res.status(200).json({
      success: true,
      message: "Ride cancelled successfully"
    });

  } catch (error) {
    console.error("Error in cancelBooking:", error);
    return res.status(500).json({ success: false, message: 'Internal server error', details: error.message });
  }
}

export async function verifyOtp(req, res) {
  try {
    const { booking_id, otp } = req.body;
    if (!booking_id || !otp) {
      return res.status(400).json({ success: false, message: 'booking_id and otp required' });
    }
    const { data: booking, error: fetchError } = await supabase.from('bookings').select('otp, status').eq('id', booking_id).single();
    
    if (fetchError || !booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    if (booking.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP' });
    }
    
    const { error: updateError } = await supabase.from('bookings').update({ status: 'ongoing' }).eq('id', booking_id);
    if (updateError) throw updateError;
    
    return res.status(200).json({ success: true, message: 'OTP Verified, Ride Started' });
  } catch (error) {
    console.error("Error in verify-otp:", error);
    return res.status(500).json({ success: false, message: 'Internal server error', details: error.message });
  }
}

export async function getDriverRides(req, res) {
  try {
    const { driverId } = req.params;
    if (!driverId) {
      return res.status(400).json({ success: false, message: 'driverId required' });
    }
    const { data: rides, error } = await supabase.from('bookings')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return res.json({ success: true, rides: rides || [] });
  } catch (error) {
    console.error("Error in getDriverRides:", error);
    return res.status(500).json({ success: false, message: 'Internal server error', details: error.message });
  }
}
