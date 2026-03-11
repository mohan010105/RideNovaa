import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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

    // Check admin role
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = roles?.some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin access required");

    const { paymentId, bookingId, refundReason, provider } = await req.json();
    if (!paymentId || !bookingId) throw new Error("Missing paymentId or bookingId");

    if (provider === "razorpay") {
      const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
      const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
      const refundRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
        },
        body: JSON.stringify({ speed: "normal" }),
      });
      if (!refundRes.ok) {
        const errText = await refundRes.text();
        throw new Error(`Razorpay refund failed: ${errText}`);
      }
    } else {
      // Stripe refund
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });
      await stripe.refunds.create({ payment_intent: paymentId });
    }

    // Update payment and booking status
    await serviceClient
      .from("payments")
      .update({ status: "refunded" })
      .eq("booking_id", bookingId);

    await serviceClient
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);

    // Send refund email notification (fire and forget)
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-payment-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ type: "refund_processed", bookingId, userId: null }),
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
