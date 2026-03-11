import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await anonClient.auth.getUser(token);
    if (!userData.user) throw new Error("Unauthorized");

    const { bookingId } = await req.json();
    if (!bookingId) throw new Error("Missing bookingId");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch booking
    const { data: booking } = await serviceClient
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (!booking) throw new Error("Booking not found");
    // Verify ownership
    if (booking.user_id !== userData.user.id) throw new Error("Not your booking");

    // Fetch payment
    const { data: payment } = await serviceClient
      .from("payments")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    // Fetch user profile
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("name, email, phone")
      .eq("user_id", booking.user_id)
      .single();

    const gstRate = 0.05;
    const baseFare = Number(booking.fare) / (1 + gstRate);
    const gstAmount = Number(booking.fare) - baseFare;

    const invoiceHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 40px; color: #1a1a1a; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
    .logo { font-size: 28px; font-weight: 800; color: #6366f1; }
    .invoice-title { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 2px; }
    .invoice-id { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
    .section p { margin: 4px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f4f4f8; text-align: left; padding: 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
    td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #6366f1; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #999; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-paid { background: #dcfce7; color: #16a34a; }
    .badge-pending { background: #fef9c3; color: #ca8a04; }
    .badge-refunded { background: #fee2e2; color: #dc2626; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">🚕 CabRide</div>
      <p style="color:#666;font-size:13px;">Your trusted ride partner</p>
    </div>
    <div style="text-align:right;">
      <div class="invoice-title">Invoice</div>
      <div class="invoice-id">#${bookingId.slice(0, 8).toUpperCase()}</div>
      <p style="font-size:13px;color:#666;">${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>

  <div class="grid">
    <div class="section">
      <h3>Billed To</h3>
      <p><strong>${profile?.name || 'Customer'}</strong></p>
      <p>${profile?.email || ''}</p>
      <p>${profile?.phone || ''}</p>
    </div>
    <div class="section">
      <h3>Ride Details</h3>
      <p><strong>Date:</strong> ${booking.scheduled_date || new Date(booking.created_at).toLocaleDateString()}</p>
      <p><strong>Time:</strong> ${booking.scheduled_time || new Date(booking.created_at).toLocaleTimeString()}</p>
      <p><strong>Cab:</strong> ${booking.cab_type}</p>
      <p><strong>Payment:</strong> ${booking.payment_method} 
        <span class="badge ${payment?.status === 'paid' ? 'badge-paid' : payment?.status === 'refunded' ? 'badge-refunded' : 'badge-pending'}">${payment?.status || 'pending'}</span>
      </p>
    </div>
  </div>

  <div class="section">
    <h3>Route</h3>
    <p>📍 <strong>Pickup:</strong> ${booking.pickup_location}</p>
    <p>🏁 <strong>Drop:</strong> ${booking.drop_location}</p>
    ${booking.distance_km ? `<p>📏 <strong>Distance:</strong> ${Number(booking.distance_km).toFixed(1)} km</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${booking.cab_type} Ride (${booking.distance_km ? Number(booking.distance_km).toFixed(1) + ' km' : 'Flat rate'})</td>
        <td style="text-align:right;">₹${baseFare.toFixed(2)}</td>
      </tr>
      ${Number(booking.surge_multiplier) > 1 ? `<tr><td>Surge Pricing (${Number(booking.surge_multiplier).toFixed(1)}x)</td><td style="text-align:right;">Included</td></tr>` : ''}
      <tr>
        <td>GST (5%)</td>
        <td style="text-align:right;">₹${gstAmount.toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td>Total</td>
        <td style="text-align:right;">₹${Number(booking.fare).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  ${payment?.stripe_payment_id ? `<p style="font-size:12px;color:#999;">Payment ID: ${payment.stripe_payment_id}</p>` : ''}

  <div class="footer">
    <p>Thank you for riding with CabRide!</p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
  </div>
</body>
</html>`;

    return new Response(invoiceHtml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
