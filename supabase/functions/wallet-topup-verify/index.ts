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

    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, amount } =
      await req.json();
    console.log("Wallet payment verification:", { razorpayPaymentId, razorpayOrderId, amount, userId: userData.user.id });

    // Verify signature
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      throw new Error("Payment signature verification failed");
    }

    // Use service role for DB updates
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const userId = userData.user.id;

    // Get or create wallet
    let { data: wallet } = await serviceClient
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) {
      const { data: newWallet } = await serviceClient
        .from("wallets")
        .insert({ user_id: userId, balance: 0 })
        .select()
        .single();
      wallet = newWallet;
    }

    if (!wallet) throw new Error("Failed to get wallet");

    // Update wallet balance
    const newBalance = Number(wallet.balance) + Number(amount);
    await serviceClient
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);

    // Record transaction
    await serviceClient.from("wallet_transactions").insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: "topup",
      amount: Number(amount),
      description: `Wallet top-up of ₹${amount} via Razorpay`,
    });

    return new Response(
      JSON.stringify({ success: true, newBalance }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
