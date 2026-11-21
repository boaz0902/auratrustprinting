import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

export const isSupabaseConfigured = () =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
  && !SUPABASE_URL.includes("YOUR_PROJECT")
  && !SUPABASE_ANON_KEY.includes("YOUR_");

export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add your project URL and anon key in js/config.js.");
  }
  return supabase;
}

export async function getPublicPriceData() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("services")
    .select("id,name,category,description,unit,price,variants,popular,visible,sort_order,updated_at")
    .eq("visible", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return {
    services: data || [],
    lastUpdated: (data || []).reduce((latest, service) =>
      service.updated_at && (!latest || service.updated_at > latest) ? service.updated_at : latest, null)
  };
}

export async function getAllServices() {
  const { data, error } = await requireSupabase()
    .from("services")
    .select("id,name,category,description,unit,price,variants,popular,visible,sort_order,updated_at")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveService(serviceId, service) {
  const client = requireSupabase();
  const query = serviceId
    ? client.from("services").update({ ...service, updated_at: new Date().toISOString() }).eq("id", serviceId)
    : client.from("services").insert({ ...service, updated_at: new Date().toISOString() });
  const { error } = await query;
  if (error) throw error;
}

export async function removeService(serviceId) {
  const { error } = await requireSupabase().from("services").delete().eq("id", serviceId);
  if (error) throw error;
}

export async function observeAuth(onUser, onError) {
  const client = requireSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) {
    onError(error);
    throw error;
  }
  onUser(session?.user || null);
  const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
    if (event !== "INITIAL_SESSION") onUser(nextSession?.user || null);
  });
  return () => subscription.unsubscribe();
}

export async function signInAdmin(email, password) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutAdmin() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function ensureAnonymousCustomer() {
  const client = requireSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (session?.user?.is_anonymous) return session.user;
  if (session?.user) {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("A secure customer session could not be created.");
  return data.user;
}

export async function uploadOrderFile(userId, orderId, file, fileName = file.name) {
  const safeName = fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${orderId}/${safeName}`;
  const { data, error } = await requireSupabase().storage.from("order-files").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (error) throw error;
  return { path: data.path, fileName: file.name, fileType: file.type, size: file.size };
}

export async function createCustomerOrder(order) {
  const { error } = await requireSupabase().from("orders").insert(order);
  if (error) throw error;
  return { id: order.id, order_number: order.order_number };
}

export async function trackCustomerOrder(orderNumber, mobile) {
  const { data, error } = await requireSupabase().rpc("track_order", {
    p_order_number: orderNumber.trim(),
    p_mobile: mobile.trim()
  });
  if (error) throw error;
  const order = Array.isArray(data) ? data[0] : data;
  if (!order) throw new Error("No matching order was found. Check the order number and mobile number.");
  return order;
}

export async function getAllOrders() {
  const { data, error } = await requireSupabase().from("orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateOrderStatus(orderId, status) {
  const { error } = await requireSupabase().from("orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}

export async function getSignedUrl(path) {
  const { data, error } = await requireSupabase().storage.from("order-files").createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteOldOrderFiles(orders) {
  const client = requireSupabase();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const oldOrders = orders.filter((order) => order.created_at && new Date(order.created_at).getTime() < cutoff);
  let removed = 0;
  for (const order of oldOrders) {
    const items = Array.isArray(order.items) ? order.items : [];
    const paths = items.map((item) => item.storagePath).filter(Boolean);
    if (order.receipt_path) paths.push(order.receipt_path);
    if (paths.length) {
      const { error } = await client.storage.from("order-files").remove(paths);
      if (error) throw error;
    }
    const { error } = await client.from("orders").update({
      items: items.map((item) => ({ ...item, storagePath: null })),
      receipt_path: null
    }).eq("id", order.id);
    if (error) throw error;
    removed += paths.length;
  }
  return { orders: oldOrders.length, files: removed };
}
