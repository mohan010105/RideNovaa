import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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
    const { pickup_lng, pickup_lat, drop_lng, drop_lat } = await req.json();

    if (!pickup_lng || !pickup_lat || !drop_lng || !drop_lat) {
      throw new Error("Missing coordinates");
    }

    const orsKey = Deno.env.get("ORS_API_KEY") ?? "";

    const orsRes = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: orsKey,
        },
        body: JSON.stringify({
          coordinates: [
            [pickup_lng, pickup_lat],
            [drop_lng, drop_lat],
          ],
        }),
      }
    );

    if (!orsRes.ok) {
      const errText = await orsRes.text();
      throw new Error(`ORS API error: ${errText}`);
    }

    const orsData = await orsRes.json();
    const route = orsData.routes?.[0];

    if (!route) throw new Error("No route found");

    const distance_km = +(route.summary.distance / 1000).toFixed(2);
    const duration_minutes = Math.ceil(route.summary.duration / 60);
    // ORS returns encoded polyline in geometry field
    const geometry = route.geometry;

    return new Response(
      JSON.stringify({ distance_km, duration_minutes, geometry }),
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
