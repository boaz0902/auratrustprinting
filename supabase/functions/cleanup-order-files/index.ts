import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    console.error("Cleanup function is missing Supabase server configuration.");
    return response({ error: "File cleanup is not configured." }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return response({ error: "Unauthorized." }, 401);
  }

  const configuredDays = Number(Deno.env.get("FILE_RETENTION_DAYS") || "30");
  if (!Number.isInteger(configuredDays) || configuredDays < 1 || configuredDays > 3650) {
    console.error("FILE_RETENTION_DAYS must be a whole number between 1 and 3650.");
    return response({ error: "File retention is not configured correctly." }, 500);
  }

  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const cutoff = new Date(Date.now() - configuredDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error: loadError } = await client
    .from("orders")
    .select("id,items")
    .in("status", ["Completed", "Cancelled"])
    .is("files_deleted_at", null)
    .lte("status_changed_at", cutoff);

  if (loadError) {
    console.error("Could not load orders due for file cleanup.", loadError);
    return response({ error: "Could not load orders due for cleanup." }, 500);
  }

  let deletedFiles = 0;
  for (const order of orders || []) {
    const items = Array.isArray(order.items) ? order.items : [];
    const paths = items.map((item) => item?.storagePath).filter((path): path is string => typeof path === "string" && path.length > 0);
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error: removeError } = await client.storage.from("order-files").remove(paths.slice(offset, offset + 100));
      if (removeError) {
        console.error(`Could not remove files for order ${order.id}.`, removeError);
        return response({ error: "Could not delete one or more order files. Cleanup can be retried." }, 500);
      }
    }

    const updatedItems = items.map((item) => ({ ...item, storagePath: null }));
    const { error: updateError } = await client
      .from("orders")
      .update({ items: updatedItems, files_deleted_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("files_deleted_at", null);
    if (updateError) {
      console.error(`Could not record file cleanup for order ${order.id}.`, updateError);
      return response({ error: "Files were removed but the order record could not be updated." }, 500);
    }
    deletedFiles += paths.length;
  }

  return response({ ordersProcessed: orders?.length || 0, filesDeleted: deletedFiles, retentionDays: configuredDays });
});
