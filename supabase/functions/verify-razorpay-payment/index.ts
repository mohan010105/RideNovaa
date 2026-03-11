import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createHmac } from "node:crypto";

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

    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, bookingId, amount } = await req.json();

    // Verify signature
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      throw new Error("Payment signature verification failed");
    }

    // Update DB with service role
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await serviceClient
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId)
      .eq("user_id", userData.user.id);

    await serviceClient.from("payments").insert({
      booking_id: bookingId,
      user_id: userData.user.id,
      amount: amount,
      method: "UPI",
      status: "paid",
      stripe_payment_id: razorpayPaymentId,
    });

    // Send payment success email (fire and forget)
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ type: "payment_success", bookingId, userId: userData.user.id }),
      });
    } catch (e) { console.error("Email notification failed:", e); }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
