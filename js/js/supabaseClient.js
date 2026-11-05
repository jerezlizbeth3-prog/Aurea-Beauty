/* =========================================================
   Conexión a Supabase
   - URL y anon key: Dashboard de Supabase > Project Settings > API
   - IMPORTANTE: solo la anon key va en el navegador.
     Nunca pongas aquí la service_role key.
   ========================================================= */

const SUPABASE_URL = "https://hcehesicjcwvtaorecom.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWhlc2ljamN3dnRhb3JlY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTI2MzIsImV4cCI6MjA5NDg4ODYzMn0.MjC-CilooarnxoGQRSGqVRxVs_QIqHfPH6QreVkAudI";

if (!window.supabase) {
  console.error("Falta cargar la librería de Supabase (CDN) antes de este archivo");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);
window.supabaseClient = supabaseClient;

// Antes estaba en catalog.js
let products = [];

async function cargarProductosDesdeSupabase() {
  const { data, error } = await supabaseClient
    .from('catalogo_publico')
    .select('*');

  if (error) {
    console.error('Error cargando catálogo desde Supabase:', error);
    products = [];
    return;
  }

  products = data.map(p => ({
    id: p.id,
    name: p.nombre,
    category: p.categoria,
    reference: p.referencia,
    price: Number(p.precio),
    description: p.descripcion,
    image: p.imagen_url,
    tones: Array.isArray(p.tonos) ? p.tonos.map(t => String(t)) : [],
    offer: p.en_oferta === true,
    offerPrice: (p.precio_oferta !== undefined && p.precio_oferta !== null) ? Number(p.precio_oferta) : null,
    stock: (p.stock_disponible !== undefined && p.stock_disponible !== null) ? Number(p.stock_disponible) : null
  }));
}