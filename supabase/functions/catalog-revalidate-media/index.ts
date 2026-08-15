import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isJunkImage, filterReachableImages } from "../_shared/catalog-media.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  organization_id: string;
  product_id?: string | null;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as Body;
    if (!body.organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só usuários da própria organização podem revalidar
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: allowed } = await supabase.rpc("user_belongs_to_organization", {
      _user_id: user.id,
      _organization_id: body.organization_id,
    });
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!allowed && !isSuper) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = Math.min(body.limit ?? 200, 500);
    let q = supabase
      .from("product_catalog_items")
      .select("id, images, thumbnail_url")
      .eq("organization_id", body.organization_id)
      .limit(limit);
    if (body.product_id) q = q.eq("product_id", body.product_id);

    const { data: items, error } = await q;
    if (error) throw error;

    let checked = 0, cleaned = 0, withoutImage = 0;

    for (const item of items ?? []) {
      checked++;
      const raw: string[] = [
        ...(Array.isArray(item.images) ? (item.images as string[]) : []),
        ...(item.thumbnail_url ? [item.thumbnail_url as string] : []),
      ].filter((u) => typeof u === "string" && u.length > 0 && !isJunkImage(u));

      const valid = await filterReachableImages(raw, 6);
      const currentImages = Array.isArray(item.images) ? (item.images as string[]) : [];
      const sameImages =
        valid.length === currentImages.length && valid.every((u, i) => u === currentImages[i]);
      const sameThumb = (valid[0] ?? null) === (item.thumbnail_url ?? null);
      if (sameImages && sameThumb) {
        if (valid.length === 0) withoutImage++;
        continue;
      }

      await supabase
        .from("product_catalog_items")
        .update({ images: valid, thumbnail_url: valid[0] ?? null })
        .eq("id", item.id);
      cleaned++;
      if (valid.length === 0) withoutImage++;
    }

    return new Response(
      JSON.stringify({ success: true, checked, cleaned, without_image: withoutImage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[catalog-revalidate-media] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
