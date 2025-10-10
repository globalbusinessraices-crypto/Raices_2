// src/components/inputs/fetchers.js
import supabase from "../../lib/supabaseClient";

const clean = (s="") => s.replace(/[^\dA-Za-z áéíóúÁÉÍÓÚ.-]/g, "");

export async function fetchClients(q) {
  const query = clean(q || "");
  let req = supabase.from("clients")
    .select("id, name, tipo, telefono, ruc_dni")
    .order("name", { ascending: true })
    .limit(20);

  if (query) {
    // Busca por nombre o documento
    req = req.or(`name.ilike.%${query}%,ruc_dni.ilike.%${query}%`);
  }
  const { data, error } = await req;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function fetchProducts(q) {
  const query = clean(q || "");
  let req = supabase.from("products")
    .select("id, sku, name, unit, last_cost, supplier:suppliers(name)")
    .order("name", { ascending: true })
    .limit(20);

  if (query) {
    req = req.or(`name.ilike.%${query}%,sku.ilike.%${query}%`);
  }
  const { data, error } = await req;
  if (error) { console.error(error); return []; }
  return data || [];
}
