/* =========================================================
   Panel Administrativo - Aurae Beauty
   Lógica de sesión (Supabase Auth) + CRUD de productos.
   Regla de negocio: nunca se ejecuta DELETE. "Eliminar"
   un producto significa poner activo = false.
   ========================================================= */

const state = {
  user: null,
  products: [],
  search: "",
  filter: "todos",
  editingId: null,
  loading: false,
  view: "productos",
  orders: [],
  orderSearch: "",
  orderFilter: "todos",
  orderLoading: false,
  orderLoadingOnce: false,
  openOrderId: null,
  orderDetails: {},
  resenas: [],
  reviewFilter: "todas",
  reviewLoading: false,
  reviewLoadingOnce: false,
  editingReviewId: null,
  channel: null,
  videos: [],
  videoLoading: false,
  videoLoadingOnce: false,
  videoIndexLoaded: false,
  editingVideoId: null
};

const SELECT_PRODUCTOS =
  "id_producto, referencia, nombre, descripcion, precio, imagen_url, categoria, activo, creado_en, pedidos_clientes," +
  " inventario ( cantidad_disponible, cantidad_reservada )";

const SELECT_PEDIDOS =
  "id_pedido, referencia, fecha, estado, total, origen_whatsapp, tipo_entrega, notas," +
  " clientes ( nombre, identificacion, telefono, direccion, ciudad )," +
  " pagos ( metodo, estado, monto )," +
  " envios ( direccion, estado, fecha_envio )";

const SELECT_DETALLE =
  "id_detalle, cantidad, precio, subtotal, tono, productos ( nombre, referencia )";

const SELECT_RESENAS = "*";

const ORDEN_ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "pendiente_pago", label: "Pendientes de pago" },
  { value: "pagado", label: "Pagados" },
  { value: "cancelado", label: "Cancelados" },
  { value: "en_despacho", label: "En despacho" },
  { value: "entregado", label: "Entregados" }
];

const ESTADOS_ENVIO = [
  { value: "preparando", label: "Preparando" },
  { value: "en_camino", label: "En camino" },
  { value: "entregado", label: "Entregado" }
];

/* ---------- utilidades ---------- */

function getSupabase() {
  if (!window.supabaseClient) {
    throw new Error("No se pudo cargar la conexión con Supabase (js/supabaseClient.js).");
  }
  return window.supabaseClient;
}

function formatPrecio(valor) {
  const numero = Number(valor);
  if (!isFinite(numero)) return "$ 0";
  return "$ " + numero.toLocaleString("es-CO");
}

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInventario(producto) {
  const rel = producto.inventario;
  if (!rel) return null;
  if (Array.isArray(rel)) return rel.length ? rel[0] : null;
  return rel;
}

function getStock(producto) {
  const inv = getInventario(producto);
  if (inv && inv.cantidad_disponible !== null && inv.cantidad_disponible !== undefined) {
    return Number(inv.cantidad_disponible);
  }
  return 0;
}

function getReservado(producto) {
  const inv = getInventario(producto);
  if (inv && inv.cantidad_reservada !== null && inv.cantidad_reservada !== undefined) {
    return Number(inv.cantidad_reservada);
  }
  return 0;
}

function supabaseErrorMessage(error, fallback) {
  if (error && error.message) return String(error.message);
  if (typeof error === "string" && error.trim()) return error;
  return fallback || "Error desconocido.";
}

function translateError(error, contexto) {
  if (!error) {
    return (contexto || "Ocurrió un error inesperado.") +
      " Vuelve a intentarlo en unos segundos.";
  }

  const code = error.code || "";
  const msg = error.message || "";

  if (code === "42501" || /row-level security|policy/i.test(msg)) {
    return "Permisos insuficientes (RLS). Tu usuario no tiene permiso para esta operación. " +
      "Ejecuta el script sql/rls_admin.sql en el editor SQL de Supabase.";
  }
  if (code === "PGRST116" || /no rows returned/i.test(msg)) {
    return "No se encontró el registro. Puede que ya haya sido modificado por otra sesión.";
  }
  if (code === "23505" || /duplicate key|unique/i.test(msg)) {
    return "Ya existe un registro con esa referencia. Usa una referencia distinta.";
  }
  if (code === "23503" || /foreign key/i.test(msg)) {
    return "No se puede guardar: hay datos relacionados que no permiten esta operación.";
  }
  if (/fetch|network|conexi/i.test(msg)) {
    return "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  }
  if (code === "PGRST301" || /jwt/i.test(msg)) {
    return "Tu sesión expiró o no es válida. Cierra sesión y vuelve a entrar.";
  }

  return (contexto ? contexto + ": " : "") + (msg || "error desconocido.");
}

function showToast(mensaje, tipo, titulo) {
  const cont = document.getElementById("toastContainer");
  if (!cont) return;
  const toast = document.createElement("div");
  toast.className = "toast " + (tipo || "info");
  toast.innerHTML =
    (titulo ? "<strong>" + escapeHtml(titulo) + "</strong>" : "") +
    "<span>" + escapeHtml(mensaje) + "</span>";
  cont.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity .3s ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function showBox(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? "" : "none";
}

function setButtonsDisabled(disabled) {
  ["newProductBtn", "reloadBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
  document.querySelectorAll(".btn-row-action").forEach((b) => (b.disabled = disabled));
  // Los selectores de envío se controlan por su propia petición.
  document.querySelectorAll("select.envio-select").forEach((s) => (s.disabled = disabled));
}

/* ---------- helpers de relaciones (1:1 o 1:N) ---------- */

function firstRel(rel) {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel.length ? rel[0] : null;
  return rel;
}

function getCliente(pedido) {
  return firstRel(pedido.clientes);
}

function getPago(pedido) {
  return firstRel(pedido.pagos);
}

function getEnvio(pedido) {
  return firstRel(pedido.envios);
}

function isRecoge(pedido) {
  return pedido.tipo_entrega === "recoge";
}

function fmtFecha(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function formatFecha(valor) {
  return fmtFecha(valor);
}

function estadoEnvioLabel(valor) {
  const found = ESTADOS_ENVIO.find((e) => e.value === valor);
  return found ? found.label : (valor || "-");
}

function estadoPedidoLabel(valor) {
  const found = ORDEN_ESTADOS.find((e) => e.value === valor);
  if (found) return found.label;
  return String(valor || "-").replace(/_/g, " ");
}

/* ---------- autenticación ---------- */

async function init() {
  bindEvents();
  if (typeof bindVideoEvents === 'function') bindVideoEvents();
  if (typeof bindProductEvents === 'function') bindProductEvents();

  if (!window.supabase || !window.supabaseClient) {
    showLogin();
    showToast(
      "No se cargó el SDK de Supabase o la configuración. Revisa js/supabaseClient.js.",
      "error",
      "Error de configuración"
    );
    return;
  }

  try {
    const sb = getSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    if (data && data.session) {
      await enterPanel(data.session.user);
    } else {
      showLogin();
    }
  } catch (error) {
    showLogin();
    showToast(translateError(error, "No se pudo verificar la sesión"), "error");
  }

  getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      unsubscribeRealtime();
      state.user = null;
      state.products = [];
      state.orders = [];
      state.orderDetails = {};
      state.openOrderId = null;
      state.resenas = [];
      state.reviewLoadingOnce = false;
      showLogin();
      return;
    }
    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
      if (!state.user) enterPanel(session.user);
    }
  });
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("panelScreen").style.display = "none";
  const pwd = document.getElementById("loginPassword");
  if (pwd) pwd.value = "";
}

function showPanel() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("panelScreen").style.display = "block";
}

async function enterPanel(user) {
  state.user = user;
  showPanel();
  const label = document.getElementById("adminUser");
  if (label) label.textContent = (user && user.email) || "";
  await loadProducts();
  subscribeRealtime();
}

function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorBox = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  errorBox.classList.remove("visible");

  if (!email || !password) {
    errorBox.textContent = "Ingresa tu correo y tu contraseña.";
    errorBox.classList.add("visible");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Ingresando...";

  (async () => {
    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await enterPanel(data.user);
      showToast("Sesión iniciada correctamente.", "success");
    } catch (error) {
      const msg = (error && /invalid login credentials/i.test(error.message || ""))
        ? "Correo o contraseña incorrectos."
        : translateError(error, "No se pudo iniciar sesión");
      errorBox.textContent = msg;
      errorBox.classList.add("visible");
    } finally {
      btn.disabled = false;
      btn.textContent = "Ingresar";
    }
  })();
}

async function handleLogout() {
  try {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
  } catch (error) {
    showToast(translateError(error, "No se pudo cerrar sesión"), "error");
  } finally {
    unsubscribeRealtime();
    state.user = null;
    state.products = [];
    state.orders = [];
    state.orderDetails = {};
    state.openOrderId = null;
    state.resenas = [];
    state.reviewLoadingOnce = false;
    render();
    renderOrders();
    renderResenas();
    showLogin();
  }
}

/* ---------- carga de datos ---------- */

async function loadProducts() {
  if (state.loading) return;
  state.loading = true;
  setButtonsDisabled(true);
  showBox("loadingBox", true);
  showBox("errorBox", false);
  showBox("emptyBox", false);
  showBox("tableWrap", false);
  document.getElementById("adminMobileCards").innerHTML = "";

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("productos")
      .select(SELECT_PRODUCTOS)
      .order("creado_en", { ascending: false });

    if (error) throw error;

    state.products = Array.isArray(data) ? data : [];
     state.loading = false; 
    render();
  } catch (error) {
    showBox("loadingBox", false);
    showBox("errorBox", true);
    document.getElementById("errorMessage").textContent =
      translateError(error, "Error al consultar productos");
  } finally {
    state.loading = false;
    setButtonsDisabled(false);
  }
}

function filteredProducts() {
  const term = state.search.trim().toLowerCase();
  return state.products.filter((p) => {
    if (state.filter === "activo" && !p.activo) return false;
    if (state.filter === "inactivo" && p.activo) return false;
    if (state.filter === "stock0" && getStock(p) > 0) return false;
    if (!term) return true;
    return (
      String(p.nombre || "").toLowerCase().includes(term) ||
      String(p.referencia || "").toLowerCase().includes(term) ||
      String(p.categoria || "").toLowerCase().includes(term)
    );
  });
}

function render() {
  updateStats();
  showBox("loadingBox", false);

  const list = filteredProducts();
  const hasData = state.products.length > 0;
  const hasResults = list.length > 0;

  if (state.loading) return;

  if (!hasData) {
    showBox("errorBox", false);
    showBox("tableWrap", false);
    document.getElementById("adminMobileCards").innerHTML = "";
    showBox("emptyBox", true);
    document.querySelector("#emptyBox .state-title").textContent = "Todavía no hay productos";
    document.getElementById("emptyMessage").textContent =
      "Crea el primer producto con el botón + Nuevo producto.";
    return;
  }

  if (!hasResults) {
    showBox("errorBox", false);
    showBox("tableWrap", false);
    document.getElementById("adminMobileCards").innerHTML = "";
    showBox("emptyBox", true);
    document.querySelector("#emptyBox .state-title").textContent = "Sin resultados";
    document.getElementById("emptyMessage").textContent =
      "Ningún producto coincide con la búsqueda o el filtro seleccionado.";
    return;
  }

  showBox("emptyBox", false);
  renderTable(list);
  renderMobileCards(list);
}

function updateStats() {
  const total = state.products.length;
  const visibles = state.products.filter((p) => p.activo).length;
  const sinStock = state.products.filter((p) => getStock(p) <= 0).length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statVisible").textContent = visibles;
  document.getElementById("statOculto").textContent = total - visibles;
  document.getElementById("statSinStock").textContent = sinStock;
}

function stockBadgeHtml(stock) {
  if (stock <= 0) return '<span class="stock-badge zero">0</span>';
  if (stock <= 3) return '<span class="stock-badge low">' + stock + "</span>";
  return '<span class="stock-badge">' + stock + "</span>";
}

function imageHtml(p, sizeClass) {
  const cls = sizeClass || "cell-img";
  if (p.imagen_url) {
    return '<img class="' + cls + '" src="' + escapeHtml(p.imagen_url) + '" alt="" ' +
      'onerror="this.style.visibility=\'hidden\'">';
  }
  return '<div class="' + cls + '" style="display:flex;align-items:center;justify-content:center;' +
    'color:#9ca3af;font-size:.65rem;text-align:center;">Sin img</div>';
}

function renderTable(list) {
  const body = document.getElementById("adminTableBody");
  body.innerHTML = list
    .map((p) => {
      const stock = getStock(p);
      const reservado = getReservado(p);
      return (
        "<tr" + (p.activo ? "" : ' class="is-hidden"') + ">" +
        "<td>" + imageHtml(p) + "</td>" +
        '<td class="cell-ref">' + escapeHtml(p.referencia) + "</td>" +
        '<td class="cell-name">' + escapeHtml(p.nombre) + "</td>" +
        "<td>" + escapeHtml(p.categoria || "-") + "</td>" +
        '<td class="cell-price">' + formatPrecio(p.precio) + "</td>" +
        '<td class="cell-price">' + (p.pedidos_clientes !== null && p.pedidos_clientes !== undefined ? formatPrecio(p.pedidos_clientes) : "-") + "</td>" +
        '<td class="cell-stock">' + stockBadgeHtml(stock) +
          (reservado > 0 ? '<br><small style="color:#6B7280;">res. ' + reservado + "</small>" : "") +
        "</td>" +
        '<td class="cell-stock"><span class="badge ' + (p.activo ? "visible" : "oculto") + '">' +
          (p.activo ? "Visible" : "Oculto") + "</span></td>" +
        '<td class="cell-actions">' +
          '<button class="btn-row-action" type="button" data-action="edit" data-id="' + p.id_producto + '">Editar</button>' +
          '<button class="btn-row-action warn" type="button" data-action="toggle" data-id="' + p.id_producto + '">' +
            (p.activo ? "Ocultar" : "Mostrar") + "</button>" +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  showBox("tableWrap", true);
}

function renderMobileCards(list) {
  document.getElementById("adminMobileCards").innerHTML = list
    .map((p) => {
      const stock = getStock(p);
      return (
        '<div class="m-card"' + (p.activo ? "" : ' style="opacity:.6"') + ">" +
        imageHtml(p, "m-card-img") +
        '<div class="m-card-body">' +
          '<div class="m-card-top">' +
            '<div class="m-card-name">' + escapeHtml(p.nombre) + "</div>" +
            '<span class="badge ' + (p.activo ? "visible" : "oculto") + '">' +
              (p.activo ? "Visible" : "Oculto") + "</span>" +
          "</div>" +
          '<div class="m-card-meta">' +
            "<span>Ref. " + escapeHtml(p.referencia) + "</span>" +
            "<span>" + formatPrecio(p.precio) + "</span>" +
            "<span>Stock: " + stockBadgeHtml(stock) + "</span>" +
          "</div>" +
          '<div class="m-card-actions">' +
            '<button class="btn-row-action" type="button" data-action="edit" data-id="' + p.id_producto + '">Editar</button>' +
            '<button class="btn-row-action warn" type="button" data-action="toggle" data-id="' + p.id_producto + '">' +
              (p.activo ? "Ocultar" : "Mostrar") + "</button>" +
          "</div>" +
        "</div>" +
        "</div>"
      );
    })
    .join("");
}

/* ---------- modal ---------- */

function openProductModal(producto) {
  state.editingId = producto ? producto.id_producto : null;

  document.getElementById("modalTitle").textContent = producto ? "Editar producto" : "Nuevo producto";
  document.getElementById("modalSubtitle").textContent = producto
    ? "Referencia " + producto.referencia + " - actualiza los datos y guarda."
    : "Completa los datos. El stock se guarda en la tabla de inventario.";

  const modalError = document.getElementById("modalError");
  modalError.classList.remove("visible");
  modalError.textContent = "";

  document.getElementById("fReferencia").value = producto ? producto.referencia || "" : "";
  document.getElementById("fNombre").value = producto ? producto.nombre || "" : "";
  document.getElementById("fDescripcion").value = producto ? producto.descripcion || "" : "";
  document.getElementById("fPrecio").value = producto ? producto.precio : "";
  document.getElementById("fCategoria").value = producto ? producto.categoria || "" : "";
  document.getElementById("fImagen").value = producto ? producto.imagen || "" : "";
  document.getElementById("fStock").value = producto ? getStock(producto) : 0;
  document.getElementById("fActivo").checked = producto ? !!producto.activo : true;
  document.getElementById("fPedidosClientes").value = producto && producto.pedidos_clientes !== null && producto.pedidos_clientes !== undefined ? producto.pedidos_clientes : "";

  fillCategoryList();
  updateImagePreview();

  document.querySelectorAll("#productForm .form-group").forEach((g) => g.classList.remove("error"));

  document.getElementById("productModal").classList.add("active");
  setTimeout(() => document.getElementById("fReferencia").focus(), 80);
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("active");
  document.getElementById("productForm").reset();
  document.getElementById("fActivo").checked = true;
  document.getElementById("imgPreview").style.display = "none";
  document.querySelectorAll("#productForm .form-group").forEach((g) => g.classList.remove("error"));
  state.editingId = null;
}

function fillCategoryList() {
  const list = document.getElementById("categoryList");
  const categorias = [];
  state.products.forEach((p) => {
    const c = (p.categoria || "").trim();
    if (c && categorias.indexOf(c) === -1) categorias.push(c);
  });
  categorias.sort();
  list.innerHTML = categorias.map((c) => '<option value="' + escapeHtml(c) + '">').join("");
}

function updateImagePreview() {
  const valor = document.getElementById("fImagen").value.trim();
  const preview = document.getElementById("imgPreview");
  if (!valor) {
    preview.style.display = "none";
    preview.src = "";
    return;
  }
  preview.src = valor;
  preview.style.display = "block";
}

function showFieldError(inputId, groupIndex) {
  const input = document.getElementById(inputId);
  if (!input) return false;
  const group = input.closest(".form-group");
  if (group) group.classList.add("error");
  return false;
}

function validateForm() {
  document.querySelectorAll("#productForm .form-group").forEach((g) => g.classList.remove("error"));

  const referencia = document.getElementById("fReferencia").value.trim();
  const nombre = document.getElementById("fNombre").value.trim();
  const categoria = document.getElementById("fCategoria").value.trim();
  const precioRaw = document.getElementById("fPrecio").value;
  const stockRaw = document.getElementById("fStock").value;

  let ok = true;
  if (!referencia) ok = showFieldError("fReferencia");
  if (!nombre) ok = showFieldError("fNombre");
  if (!categoria) ok = showFieldError("fCategoria");
  if (precioRaw === "" || isNaN(Number(precioRaw)) || Number(precioRaw) < 0) {
    ok = showFieldError("fPrecio");
  }
  if (stockRaw === "" || isNaN(Number(stockRaw)) || Number(stockRaw) < 0) {
    ok = showFieldError("fStock");
  }
  return ok;
}

/* ---------- escrituras ---------- */

async function handleSubmit(event) {
  event.preventDefault();

  const modalError = document.getElementById("modalError");
  modalError.classList.remove("visible");

  if (!validateForm()) {
    modalError.textContent = "Revisa los campos marcados en rojo.";
    modalError.classList.add("visible");
    return;
  }

  const pedidosClientesVal = document.getElementById("fPedidosClientes").value.trim();
  const payload = {
    referencia: document.getElementById("fReferencia").value.trim(),
    nombre: document.getElementById("fNombre").value.trim(),
    descripcion: document.getElementById("fDescripcion").value.trim() || null,
    precio: Number(document.getElementById("fPrecio").value),
    imagen: document.getElementById("fImagen").value.trim() || null,
    categoria: document.getElementById("fCategoria").value.trim(),
    activo: document.getElementById("fActivo").checked,
    pedidos_clientes: pedidosClientesVal === "" ? null : Number(pedidosClientesVal)
  };
  const stock = Number(document.getElementById("fStock").value);
  const editando = state.editingId !== null;

  const btn = document.getElementById("productSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const sb = getSupabase();
    let idProducto = state.editingId;

    if (editando) {
      const { data, error } = await sb
        .from("productos")
        .update(payload)
        .eq("id_producto", idProducto)
        .select("id_producto")
        .single();
      if (error) throw error;
      idProducto = data ? data.id_producto : idProducto;
    } else {
      const { data, error } = await sb
        .from("productos")
        .insert(payload)
        .select("id_producto")
        .single();
      if (error) throw error;
      idProducto = data ? data.id_producto : null;
      if (!idProducto) throw new Error("No se obtuvo el id del producto creado.");
    }

    const { error: errorInv } = await sb
      .from("inventario")
      .upsert(
        { id_producto: idProducto, cantidad_disponible: stock },
        { onConflict: "id_producto" }
      );

    if (errorInv) throw errorInv;

    closeProductModal();
    showToast(
      editando ? "Producto actualizado correctamente." : "Producto creado correctamente.",
      "success"
    );
    await loadProducts();
  } catch (error) {
    const msg = translateError(error, "No se pudo guardar el producto");
    modalError.textContent = msg;
    modalError.classList.add("visible");
    showToast(msg, "error", "Error al guardar");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar producto";
  }
}

async function toggleActivo(idProducto) {
  const producto = state.products.find((p) => p.id_producto === idProducto);
  if (!producto) return;

  const nuevoValor = !producto.activo;

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("productos")
      .update({ activo: nuevoValor })
      .eq("id_producto", idProducto)
      .select("id_producto, activo")
      .single();

    if (error) throw error;

    if (data) producto.activo = data.activo;
    render();
    showToast(
      nuevoValor
        ? "El producto volvió a ser visible en el catálogo."
        : "El producto se ocultó del catálogo (no se eliminó).",
      "success"
    );
  } catch (error) {
    showToast(translateError(error, "No se pudo cambiar el estado"), "error", "Error");
  }
}

/* =========================================================
   RESEÑAS - carga, estados y moderación
   La página pública solo muestra las reseñas con aprobada = true.
   Nunca se borra una reseña: Publicar/Ocultar cambia aprobada y
   revisada. Editar no cambia el estado de publicación.
   ========================================================= */

const RESENA_FILTROS = [
  { value: "todas", label: "Todas" },
  { value: "pendientes", label: "Pendientes" },
  { value: "publicadas", label: "Publicadas" },
  { value: "ocultas", label: "Ocultas" }
];

const RESENA_ESTADO_SINGULAR = {
  pendientes: "pendiente",
  publicadas: "publicada",
  ocultas: "oculta"
};

function getReviewName(r) {
  return (r && (r.nombre || r.nombre_cliente)) || "";
}

function estadoResena(r) {
  if (r && r.aprobada) return { key: "publicada", label: "Publicada", badge: "visible" };
  if (r && r.revisada) return { key: "oculta", label: "Oculta", badge: "oculto" };
  return { key: "pendiente", label: "Pendiente", badge: "pendiente" };
}

function estrellasHtml(valor) {
  const v = Math.max(0, Math.min(5, parseInt(valor) || 0));
  return '<span class="rev-stars" aria-label="' + v + ' de 5">' +
    "★".repeat(v) + "☆".repeat(5 - v) + "</span>";
}

function filteredResenas() {
  return state.resenas.filter((r) => {
    if (state.reviewFilter === "todas") return true;
    return estadoResena(r).key === RESENA_ESTADO_SINGULAR[state.reviewFilter];
  });
}

async function loadResenas() {
  if (state.reviewLoading) return;
  state.reviewLoading = true;
  showBox("revLoadingBox", true);
  showBox("revErrorBox", false);
  showBox("revEmptyBox", false);
  showBox("revTableWrap", false);
  document.getElementById("revMobileCards").innerHTML = "";

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("resenas")
      .select(SELECT_RESENAS)
      .order("creado_en", { ascending: false });

    if (error) throw error;

    state.resenas = Array.isArray(data) ? data : [];
    state.reviewLoadingOnce = true;
    state.reviewLoading = false;
    renderResenas();
  } catch (error) {
    showBox("revLoadingBox", false);
    showBox("revErrorBox", true);
    document.getElementById("revErrorMessage").textContent =
      translateError(error, "Error al consultar reseñas");
  } finally {
    state.reviewLoading = false;
  }
}

function renderResenas() {
  showBox("revLoadingBox", false);
  if (state.reviewLoading) return;

  renderReviewChips();

  const tabCount = document.getElementById("tabResenasCount");
  if (tabCount) tabCount.textContent = state.resenas.length;

  const list = filteredResenas();

  if (!state.resenas.length) {
    showBox("revErrorBox", false);
    showBox("revTableWrap", false);
    document.getElementById("revMobileCards").innerHTML = "";
    showBox("revEmptyBox", true);
    document.getElementById("revEmptyTitle").textContent = "Todavía no hay reseñas";
    document.getElementById("revEmptyMessage").textContent =
      "Las reseñas que envíen tus clientas aparecerán aquí.";
    return;
  }

  if (!list.length) {
    showBox("revErrorBox", false);
    showBox("revTableWrap", false);
    document.getElementById("revMobileCards").innerHTML = "";
    showBox("revEmptyBox", true);
    document.getElementById("revEmptyTitle").textContent = "Sin resultados";
    document.getElementById("revEmptyMessage").textContent =
      "Ninguna reseña coincide con el filtro seleccionado.";
    return;
  }

  showBox("revEmptyBox", false);
  renderResenasTable(list);
  renderResenasMobile(list);
}

function renderReviewChips() {
  const cont = document.getElementById("reviewChips");
  if (!cont) return;

  cont.innerHTML = RESENA_FILTROS.map((opt) => {
    const n = opt.value === "todas"
      ? state.resenas.length
      : state.resenas.filter((r) => estadoResena(r).key === RESENA_ESTADO_SINGULAR[opt.value]).length;
    return (
      '<button class="chip' + (state.reviewFilter === opt.value ? " active" : "") +
      '" type="button" data-review-filter="' + opt.value + '">' +
      escapeHtml(opt.label) + '<span class="chip-n">' + n + "</span></button>"
    );
  }).join("");
}

function resenaAccionesHtml(r) {
  return (
    '<button class="btn-row-action" type="button" data-action="resena-publicar" data-id="' + r.id_resena + '">Publicar</button>' +
    '<button class="btn-row-action warn" type="button" data-action="resena-ocultar" data-id="' + r.id_resena + '">Ocultar</button>' +
    '<button class="btn-row-action" type="button" data-action="resena-editar" data-id="' + r.id_resena + '">Editar</button>'
  );
}

function renderResenasTable(list) {
  document.getElementById("revTableBody").innerHTML = list
    .map((r) => {
      const st = estadoResena(r);
      return (
        "<tr" + (st.key === "publicada" ? "" : ' class="is-hidden"') + ">" +
        "<td><strong>" + escapeHtml(getReviewName(r) || "Anónima") + "</strong></td>" +
        "<td>" + estrellasHtml(r.calificacion) + "</td>" +
        '<td class="cell-comment">' + escapeHtml(r.comentario || "") + "</td>" +
        '<td style="white-space:nowrap;">' + formatFecha(r.creado_en) + "</td>" +
        '<td><span class="badge ' + st.badge + '">' + st.label + "</span></td>" +
        '<td class="cell-actions">' + resenaAccionesHtml(r) + "</td>" +
        "</tr>"
      );
    })
    .join("");

  showBox("revTableWrap", true);
}

function renderResenasMobile(list) {
  document.getElementById("revMobileCards").innerHTML = list
    .map((r) => {
      const st = estadoResena(r);
      return (
        '<div class="m-card"' + (st.key === "publicada" ? "" : ' style="opacity:.75"') + ">" +
          '<div class="m-card-body">' +
            '<div class="m-card-top">' +
              '<div class="m-card-name">' + escapeHtml(getReviewName(r) || "Anónima") + "</div>" +
              '<span class="badge ' + st.badge + '">' + st.label + "</span>" +
            "</div>" +
            '<div class="m-card-meta">' +
              "<span>" + estrellasHtml(r.calificacion) + "</span>" +
              "<span>" + formatFecha(r.creado_en) + "</span>" +
            "</div>" +
            '<p class="m-card-comment">' + escapeHtml(r.comentario || "") + "</p>" +
            '<div class="m-card-actions">' + resenaAccionesHtml(r) + "</div>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

async function setResenaEstado(idResena, aprobada) {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("resenas")
      .update({ aprobada: aprobada, revisada: true })
      .eq("id_resena", idResena)
      .select()
      .single();

    if (error) throw error;

    const idx = state.resenas.findIndex((r) => String(r.id_resena) === String(idResena));
    if (idx !== -1 && data) state.resenas[idx] = data;
    renderResenas();
    showToast(
      aprobada
        ? "Reseña publicada. Ya se ve en la página pública."
        : "Reseña ocultada. Dejó de verse en la página pública.",
      "success"
    );
  } catch (error) {
    showToast(translateError(error, "No se pudo actualizar la reseña"), "error", "Error");
  }
}

function openReviewModal(idResena) {
  const r = state.resenas.find((x) => String(x.id_resena) === String(idResena));
  if (!r) return;

  state.editingReviewId = idResena;

  const err = document.getElementById("revModalError");
  err.classList.remove("visible");
  err.textContent = "";

  document.getElementById("revfNombre").value = getReviewName(r) || "";
  document.getElementById("revfCalificacion").value = String(parseInt(r.calificacion) || 5);
  document.getElementById("revfComentario").value = r.comentario || "";

  document.getElementById("reviewModal").classList.add("active");
}

function closeReviewModal() {
  document.getElementById("reviewModal").classList.remove("active");
  state.editingReviewId = null;
}

async function handleReviewEditSubmit(event) {
  event.preventDefault();
  if (state.editingReviewId === null) return;

  const err = document.getElementById("revModalError");
  err.classList.remove("visible");

  const nombre = document.getElementById("revfNombre").value.trim();
  const calificacion = parseInt(document.getElementById("revfCalificacion").value) || 0;
  const comentario = document.getElementById("revfComentario").value.trim();

  if (!nombre || !comentario || calificacion < 1 || calificacion > 5) {
    err.textContent = "Revisa el nombre, la calificación (1 a 5) y el comentario.";
    err.classList.add("visible");
    return;
  }

  const btn = document.getElementById("revSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("resenas")
      .update({ nombre_cliente: nombre, calificacion: calificacion, comentario: comentario })
      .eq("id_resena", state.editingReviewId)
      .select()
      .single();

    if (error) throw error;

    const idx = state.resenas.findIndex((r) => String(r.id_resena) === String(state.editingReviewId));
    if (idx !== -1 && data) state.resenas[idx] = data;
    closeReviewModal();
    renderResenas();
    showToast("Reseña actualizada correctamente.", "success");
  } catch (error) {
    const msg = translateError(error, "No se pudo guardar la reseña");
    err.textContent = msg;
    err.classList.add("visible");
    showToast(msg, "error", "Error al guardar");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar cambios";
  }
}

/* =========================================================
   VIDEOS - listado, edición e importación desde Excel
   Regla: nunca se elimina un video. Ocultar = activo = false.
   ========================================================= */

const VIDEO_BUCKET = "Videos_cat";
const VIDEO_MAX_BYTES = 12 * 1024 * 1024;
const VIDEO_WARN_BYTES = 6 * 1024 * 1024;
const VIDEO_SELECT = "id_video, titulo, descripcion, video_url, activo, miniatura_url, archivo";
const VIDEO_WEIGHTS_KEY = "auraeVideoPesos";

const videoImportState = {
  excelRows: [],
  excelFileName: "",
  files: [],
  items: [],
  running: false
};

function readVideoWeights() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIDEO_WEIGHTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

let videoWeights = readVideoWeights();

function saveVideoWeights() {
  try {
    localStorage.setItem(VIDEO_WEIGHTS_KEY, JSON.stringify(videoWeights));
  } catch (e) {
    /* almacenamiento no disponible */
  }
}

function normalizeTextKey(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function importCompareKey(valor) {
  return String(valor || "")
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

function videoMatchKey(name) {
  const base = String(name || "").split(/[\\/]/).pop();
  return importCompareKey(base);
}

function cleanVideoFileName(name) {
  const raw = String(name || "").split(/[\\/]/).pop().trim();
  const dot = raw.lastIndexOf(".");
  let base = dot > 0 ? raw.slice(0, dot) : raw;
  let ext = dot > 0 ? raw.slice(dot + 1).toLowerCase() : "mp4";

  base = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase();

  ext = ext.replace(/[^a-z0-9]/g, "") || "mp4";
  if (!base) base = "video";
  return base + "." + ext;
}

function videoFileKey(name) {
  const raw = String(name || "").trim();
  return raw ? cleanVideoFileName(raw) : "";
}

function thumbnailFileName(cleanName) {
  return cleanName.replace(/\.[^.]+$/, "") + "_poster.webp";
}

function isMp4Name(name) {
  return /\.mp4$/i.test(String(name || "").trim());
}

function isMp4File(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  return type === "video/mp4" || (!type && isMp4Name(file.name)) || isMp4Name(file.name);
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!isFinite(value) || value < 0) return "Peso desconocido";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(0) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

function getVideoWeight(archivo) {
  const key = videoFileKey(archivo);
  return key && videoWeights[key] ? Number(videoWeights[key]) : null;
}

function setVideoWeight(archivo, bytes) {
  const key = videoFileKey(archivo);
  if (!key || !isFinite(Number(bytes))) return;
  videoWeights[key] = Number(bytes);
  saveVideoWeights();
}

function getPublicVideoUrl(name) {
  return getSupabase().storage.from(VIDEO_BUCKET).getPublicUrl(name).data.publicUrl;
}

async function uploadVideoToBucket(file, cleanName) {
  const sb = getSupabase();
  const { error } = await sb.storage.from(VIDEO_BUCKET).upload(cleanName, file, {
    cacheControl: "31536000",
    upsert: true,
    contentType: file.type || "video/mp4"
  });
  if (error) throw error;
  return getPublicVideoUrl(cleanName);
}

async function uploadThumbToBucket(blob, thumbName) {
  const sb = getSupabase();
  const { error } = await sb.storage.from(VIDEO_BUCKET).upload(thumbName, blob, {
    cacheControl: "31536000",
    upsert: true,
    contentType: "image/webp"
  });
  if (error) throw error;
  return getPublicVideoUrl(thumbName);
}

function generateVideoThumbnail(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.display = "none";
    document.body.appendChild(video);

    let finished = false;
    let timeoutId = null;

    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      if (video.parentNode) video.parentNode.removeChild(video);
    }

    function fail(message) {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(message));
    }

    function drawFrame() {
      if (finished) return;
      try {
        const vw = Number(video.videoWidth) || 640;
        const vh = Number(video.videoHeight) || 360;
        const scale = Math.min(1, 640 / Math.max(vw, vh));
        const width = Math.max(1, Math.round(vw * scale));
        const height = Math.max(1, Math.round(vh * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          fail("No se pudo preparar el lienzo de la miniatura.");
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (finished) return;
          if (!blob) {
            fail("No se pudo generar la miniatura en WebP.");
            return;
          }
          finished = true;
          cleanup();
          resolve(blob);
        }, "image/webp", 0.8);
      } catch (e) {
        fail("No se pudo generar la miniatura del video.");
      }
    }

    timeoutId = setTimeout(() => {
      fail("El video tardó demasiado en cargar para generar la miniatura.");
    }, 20000);

    video.addEventListener("error", () => {
      fail("No se pudo cargar el video para generar la miniatura.");
    }, { once: true });

    video.addEventListener("loadeddata", () => {
      if (finished) return;
      const duration = Number(video.duration);
      if (isFinite(duration) && duration > 1) {
        try { video.currentTime = 1; } catch (e) { drawFrame(); }
      } else {
        drawFrame();
      }
    }, { once: true });

    video.addEventListener("seeked", drawFrame, { once: true });

    video.src = objectUrl;
    video.load();
  });
}

async function ensureVideoIndex() {
  if (state.videoIndexLoaded) return;
  try {
    const { data, error } = await getSupabase()
      .from("videos_uso")
      .select(VIDEO_SELECT)
      .order("titulo", { ascending: true });
    if (error) throw error;
    state.videos = Array.isArray(data) ? data : [];
    state.videoIndexLoaded = true;
  } catch (error) {
    /* se reintenta al abrir la pestaña Videos */
  }
}

async function loadVideos() {
  if (state.videoLoading) return;
  state.videoLoading = true;
  showBox("vidLoadingBox", true);
  showBox("vidErrorBox", false);
  showBox("vidEmptyBox", false);
  showBox("vidTableWrap", false);
  const mobile = document.getElementById("vidMobileCards");
  if (mobile) mobile.textContent = "";

  try {
    const { data, error } = await getSupabase()
      .from("videos_uso")
      .select(VIDEO_SELECT)
      .order("titulo", { ascending: true });

    if (error) throw error;

    state.videos = Array.isArray(data) ? data : [];
    state.videoIndexLoaded = true;
    state.videoLoadingOnce = true;
    state.videoLoading = false;
    renderVideos();
  } catch (error) {
    showBox("vidLoadingBox", false);
    showBox("vidErrorBox", true);
    const msg = document.getElementById("vidErrorMessage");
    if (msg) msg.textContent = translateError(error, "Error al consultar videos");
  } finally {
    state.videoLoading = false;
  }
}

function videoStatusBadge(video) {
  return video && video.activo
    ? { className: "badge visible", label: "Visible" }
    : { className: "badge oculto", label: "Oculto" };
}

function makeVideoActionButtons(video) {
  const wrap = document.createElement("span");
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn-row-action";
  editBtn.setAttribute("data-action", "video-edit");
  editBtn.setAttribute("data-id", String(video.id_video));
  editBtn.textContent = "Editar";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "btn-row-action warn";
  toggleBtn.setAttribute("data-action", "video-toggle");
  toggleBtn.setAttribute("data-id", String(video.id_video));
  toggleBtn.textContent = video.activo ? "Ocultar" : "Mostrar";

  wrap.appendChild(editBtn);
  wrap.appendChild(toggleBtn);
  return wrap;
}

function makeVideoThumb(video, className) {
  const wrap = document.createElement("div");
  if (video.miniatura_url) {
    const img = document.createElement("img");
    img.className = className || "cell-img";
    img.src = String(video.miniatura_url);
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.style.visibility = "hidden";
    }, { once: true });
    wrap.appendChild(img);
  } else {
    const empty = document.createElement("div");
    empty.className = className || "cell-img";
    empty.textContent = "Sin miniatura";
    wrap.appendChild(empty);
  }
  return wrap;
}

function renderVideos() {
  showBox("vidLoadingBox", false);
  if (state.videoLoading) return;

  const list = state.videos || [];

  if (!list.length) {
    showBox("vidErrorBox", false);
    showBox("vidTableWrap", false);
    const mobile = document.getElementById("vidMobileCards");
    if (mobile) mobile.textContent = "";
    showBox("vidEmptyBox", true);
    return;
  }

  showBox("vidEmptyBox", false);
  renderVideosTable(list);
  renderVideosMobile(list);
}

function renderVideosTable(list) {
  const body = document.getElementById("vidTableBody");
  if (!body) return;
  body.textContent = "";

  list.forEach((video) => {
    const tr = document.createElement("tr");
    if (!video.activo) tr.className = "is-hidden";

    const tdThumb = document.createElement("td");
    tdThumb.appendChild(makeVideoThumb(video, "cell-img"));

    const tdTitle = document.createElement("td");
    const title = document.createElement("strong");
    title.textContent = String(video.titulo || "Sin título");
    tdTitle.appendChild(title);

    const tdDesc = document.createElement("td");
    tdDesc.className = "cell-comment";
    tdDesc.textContent = String(video.descripcion || "—");

    const tdFile = document.createElement("td");
    const archivo = String(video.archivo || "").trim();
    const archivoLine = document.createElement("div");
    archivoLine.textContent = archivo || "Enlace externo";
    tdFile.appendChild(archivoLine);
    const weight = getVideoWeight(archivo);
    const weightLine = document.createElement("small");
    weightLine.style.color = "#6B7280";
    weightLine.textContent = weight ? formatBytes(weight) : "Peso no registrado";
    tdFile.appendChild(weightLine);

    const tdState = document.createElement("td");
    const st = videoStatusBadge(video);
    const badge = document.createElement("span");
    badge.className = st.className;
    badge.textContent = st.label;
    tdState.appendChild(badge);

    const tdActions = document.createElement("td");
    tdActions.className = "cell-actions";
    tdActions.appendChild(makeVideoActionButtons(video));

    tr.appendChild(tdThumb);
    tr.appendChild(tdTitle);
    tr.appendChild(tdDesc);
    tr.appendChild(tdFile);
    tr.appendChild(tdState);
    tr.appendChild(tdActions);
    body.appendChild(tr);
  });

  showBox("vidTableWrap", true);
}

function renderVideosMobile(list) {
  const cont = document.getElementById("vidMobileCards");
  if (!cont) return;
  cont.textContent = "";

  list.forEach((video) => {
    const card = document.createElement("div");
    card.className = "m-card";
    if (!video.activo) card.style.opacity = "0.7";

    card.appendChild(makeVideoThumb(video, "m-card-img"));

    const body = document.createElement("div");
    body.className = "m-card-body";

    const top = document.createElement("div");
    top.className = "m-card-top";
    const name = document.createElement("div");
    name.className = "m-card-name";
    name.textContent = String(video.titulo || "Sin título");
    const st = videoStatusBadge(video);
    const badge = document.createElement("span");
    badge.className = st.className;
    badge.textContent = st.label;
    top.appendChild(name);
    top.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "m-card-meta";
    const archivo = String(video.archivo || "").trim();
    const weight = getVideoWeight(archivo);
    const fileSpan = document.createElement("span");
    fileSpan.textContent = archivo || "Enlace externo";
    const weightSpan = document.createElement("span");
    weightSpan.textContent = weight ? formatBytes(weight) : "Peso no registrado";
    meta.appendChild(fileSpan);
    meta.appendChild(weightSpan);

    const desc = document.createElement("p");
    desc.className = "m-card-comment";
    desc.textContent = String(video.descripcion || "—");

    const actions = document.createElement("div");
    actions.className = "m-card-actions";
    actions.appendChild(makeVideoActionButtons(video));

    body.appendChild(top);
    body.appendChild(meta);
    body.appendChild(desc);
    body.appendChild(actions);
    card.appendChild(body);
    cont.appendChild(card);
  });
}

function openVideoModal(video) {
  state.editingVideoId = video ? video.id_video : null;

  const title = document.getElementById("vidModalTitle");
  if (title) title.textContent = video ? "Editar video" : "Agregar video";

  const errorBox = document.getElementById("vidModalError");
  if (errorBox) {
    errorBox.classList.remove("visible");
    errorBox.textContent = "";
  }

  const titulo = document.getElementById("vidTitulo");
  const descripcion = document.getElementById("vidDescripcion");
  const enlace = document.getElementById("vidEnlace");
  const activo = document.getElementById("vidActivo");
  const fileInput = document.getElementById("vidFile");
  const preview = document.getElementById("vidPreviewThumb");
  const info = document.getElementById("vidArchivoInfo");

  if (titulo) titulo.value = video ? String(video.titulo || "") : "";
  if (descripcion) descripcion.value = video ? String(video.descripcion || "") : "";
  if (activo) activo.checked = video ? video.activo !== false : true;
  if (fileInput) fileInput.value = "";

  const videoUrl = video ? String(video.video_url || "") : "";
  if (enlace) enlace.value = video && !isMp4Name(videoUrl) ? videoUrl : "";

  if (preview) {
    if (video && video.miniatura_url) {
      preview.src = String(video.miniatura_url);
      preview.style.display = "block";
    } else {
      preview.src = "";
      preview.style.display = "none";
    }
  }

  if (info) {
    info.className = "import-hint";
    const archivo = video ? String(video.archivo || "").trim() : "";
    const weight = getVideoWeight(archivo);
    if (archivo) {
      info.textContent = "Archivo actual: " + archivo + (weight ? " · " + formatBytes(weight) : "");
    } else if (video && videoUrl) {
      info.textContent = "Este video usa un enlace externo.";
    } else {
      info.textContent = "";
    }
  }

  const modal = document.getElementById("videoModal");
  if (modal) modal.classList.add("active");
}

function closeVideoModal() {
  const modal = document.getElementById("videoModal");
  if (modal) modal.classList.remove("active");
  const form = document.getElementById("videoForm");
  if (form) form.reset();
  const activo = document.getElementById("vidActivo");
  if (activo) activo.checked = true;
  const preview = document.getElementById("vidPreviewThumb");
  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }
  const info = document.getElementById("vidArchivoInfo");
  if (info) info.textContent = "";
  state.editingVideoId = null;
}

async function handleVideoSubmit(event) {
  event.preventDefault();

  const errorBox = document.getElementById("vidModalError");
  if (errorBox) {
    errorBox.classList.remove("visible");
    errorBox.textContent = "";
  }

  const titulo = (document.getElementById("vidTitulo")?.value || "").trim();
  const descripcion = (document.getElementById("vidDescripcion")?.value || "").trim();
  const enlace = (document.getElementById("vidEnlace")?.value || "").trim();
  const activo = !!document.getElementById("vidActivo")?.checked;
  const fileInput = document.getElementById("vidFile");
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  const editing = state.editingVideoId !== null;
  const current = editing
    ? state.videos.find((v) => String(v.id_video) === String(state.editingVideoId))
    : null;

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.classList.add("visible");
    }
  }

  if (!titulo) {
    showError("El título es obligatorio.");
    return;
  }

  if (file) {
    if (!isMp4File(file)) {
      showError("Solo se permiten archivos MP4.");
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      showError("Comprime el video: máximo 12 MB");
      return;
    }
  } else if (enlace) {
    if (!/^https?:\/\//i.test(enlace)) {
      showError("Ingresa un enlace válido que empiece por http:// o https://.");
      return;
    }
  } else if (!editing || !current || !current.video_url) {
    showError("Selecciona un archivo MP4 o un enlace.");
    return;
  }

  const btn = document.getElementById("vidSubmitBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Guardando...";
  }

  try {
    const sb = getSupabase();
    const payload = {
      titulo: titulo,
      descripcion: descripcion || null,
      activo: activo
    };

    if (file) {
      const cleanName = cleanVideoFileName(file.name);
      const thumbBlob = await generateVideoThumbnail(file);
      const videoUrl = await uploadVideoToBucket(file, cleanName);
      const thumbName = thumbnailFileName(cleanName);
      const thumbUrl = await uploadThumbToBucket(thumbBlob, thumbName);

      payload.archivo = file.name;
      payload.video_url = videoUrl;
      payload.miniatura_url = thumbUrl;
      setVideoWeight(cleanName, file.size);
    } else if (enlace) {
      const currentUrl = current ? String(current.video_url || "").trim() : "";
      if (!current || enlace !== currentUrl) {
        payload.archivo = null;
        payload.video_url = enlace;
        payload.miniatura_url = null;
      }
    }

    if (editing) {
      const { error } = await sb
        .from("videos_uso")
        .update(payload)
        .eq("id_video", state.editingVideoId)
        .select("id_video")
        .single();
      if (error) throw error;
    } else if (payload.archivo) {
      const { error } = await sb
        .from("videos_uso")
        .upsert(payload, { onConflict: "archivo" })
        .select("id_video")
        .single();
      if (error) throw error;
    } else {
      const { error } = await sb
        .from("videos_uso")
        .insert(payload)
        .select("id_video")
        .single();
      if (error) throw error;
    }

    closeVideoModal();
    showToast("Video guardado correctamente.", "success");
    state.videoIndexLoaded = false;
    state.videoLoadingOnce = false;
    await loadVideos();
  } catch (error) {
    const msg = translateError(error, "No se pudo guardar el video");
    showError(msg);
    showToast(msg, "error", "Error al guardar");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Guardar video";
    }
  }
}

async function toggleVideoActivo(idVideo) {
  const video = state.videos.find((v) => String(v.id_video) === String(idVideo));
  if (!video) return;
  const nuevoValor = !video.activo;

  try {
    const { data, error } = await getSupabase()
      .from("videos_uso")
      .update({ activo: nuevoValor })
      .eq("id_video", idVideo)
      .select("id_video, activo")
      .single();

    if (error) throw error;

    video.activo = data ? data.activo : nuevoValor;
    renderVideos();
    showToast(
      nuevoValor
        ? "El video volvió a ser visible en la página pública."
        : "El video se ocultó de la página pública (no se eliminó).",
      "success"
    );
  } catch (error) {
    showToast(translateError(error, "No se pudo cambiar el estado del video"), "error", "Error");
  }
}

/* ---------- importación desde Excel ---------- */

async function handleVideoExcelFile(file) {
  if (!file) return;
  const summary = document.getElementById("videoImportSummary");
  const report = document.getElementById("videoImportReport");
  if (report) {
    report.className = "import-report";
    report.textContent = "";
  }

  if (!/\.xlsx$/i.test(file.name)) {
    videoImportState.excelRows = [];
    videoImportState.excelFileName = "";
    if (summary) summary.textContent = "Selecciona un archivo .xlsx.";
    renderVideoImportList([]);
    return;
  }

  try {
    await parseVideoExcel(file);
    const label = document.getElementById("videoExcelFileName");
    if (label) label.textContent = file.name;
    await buildVideoImportPreview();
  } catch (error) {
    videoImportState.excelRows = [];
    videoImportState.excelFileName = "";
    const label = document.getElementById("videoExcelFileName");
    if (label) label.textContent = "Archivo .xlsx";
    if (summary) summary.textContent = error.message || "No se pudo leer el Excel.";
    renderVideoImportList([]);
    showToast(error.message || "No se pudo leer el Excel.", "error", "Excel no válido");
  }
}

async function parseVideoExcel(file) {
  if (typeof ExcelJS === "undefined") {
    throw new Error("ExcelJS no está cargado.");
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const worksheet =
    workbook.worksheets.find((ws) => normalizeTextKey(ws.name) === "videos") ||
    workbook.getWorksheet("videos");

  if (!worksheet) {
    throw new Error('El Excel debe tener una hoja llamada "videos".');
  }

  const headers = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[normalizeTextKey(cell.text)] = colNumber;
  });

  ["titulo", "descripcion", "archivo", "activo"].forEach((key) => {
    if (!headers[key]) {
      throw new Error('Falta la columna "' + key + '" en la hoja "videos".');
    }
  });

  const rows = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    function valueOf(key) {
      return String(row.getCell(headers[key]).text || "").trim();
    }

    const titulo = valueOf("titulo");
    const descripcion = valueOf("descripcion");
    const archivo = valueOf("archivo");
    const activo = valueOf("activo");

    if (!titulo && !descripcion && !archivo && !activo) continue;

    rows.push({
      numero: r,
      titulo: titulo,
      descripcion: descripcion,
      archivo: archivo,
      activoRaw: activo
    });
  }

  videoImportState.excelRows = rows;
  videoImportState.excelFileName = file.name;
}

function handleVideoMp4Files(fileList) {
  const incoming = Array.from(fileList || []).filter(Boolean);
  if (!incoming.length) return;

  const map = new Map();
  videoImportState.files.forEach((file) => map.set(videoMatchKey(file.name), file));
  incoming.forEach((file) => map.set(videoMatchKey(file.name), file));
  videoImportState.files = Array.from(map.values());

  const label = document.getElementById("videoMp4FileName");
  if (label) label.textContent = videoImportState.files.length + " video(s) cargado(s)";

  buildVideoImportPreview();
}

async function buildVideoImportPreview() {
  await ensureVideoIndex();

  const summary = document.getElementById("videoImportSummary");
  const confirmBtn = document.getElementById("videoImportConfirmBtn");
  const rows = videoImportState.excelRows;

  if (!rows.length) {
    videoImportState.items = [];
    if (summary) summary.textContent = "Selecciona el Excel y arrastra los MP4 para ver la vista previa.";
    if (confirmBtn) confirmBtn.disabled = true;
    renderVideoImportList([]);
    return;
  }

  const fileMap = new Map();
  videoImportState.files.forEach((file) => fileMap.set(videoMatchKey(file.name), file));

  const existingMap = new Map();
  state.videos.forEach((video) => {
    const key = videoFileKey(video.archivo);
    if (key) existingMap.set(key, video);
  });

  const seen = new Set();
  const items = rows.map((row) => {
    const errors = [];
    const warnings = [];
    const titulo = String(row.titulo || "").trim();
    const descripcion = String(row.descripcion || "").trim();
    const archivoRaw = String(row.archivo || "").trim();

    if (!titulo) errors.push("El título es obligatorio.");
    if (!archivoRaw) {
      errors.push("Falta el nombre del archivo MP4.");
    } else if (!isMp4Name(archivoRaw)) {
      errors.push("El archivo debe ser MP4 (por ejemplo, lampina.mp4).");
    }

    const cleanName = archivoRaw ? cleanVideoFileName(archivoRaw) : "";
    const matchKey = archivoRaw ? videoMatchKey(archivoRaw) : "";
    if (cleanName) {
      if (seen.has(cleanName)) errors.push("Archivo repetido en el Excel.");
      seen.add(cleanName);
    }

    const file = matchKey ? fileMap.get(matchKey) : null;
    if (archivoRaw && !file) {
      errors.push("No se encontró el archivo " + archivoRaw + ".");
    }

    if (file) {
      if (!isMp4File(file)) {
        errors.push("Solo se permiten archivos MP4.");
      }
      if (file.size > VIDEO_MAX_BYTES) {
        errors.push("Comprime el video: máximo 12 MB");
      } else if (file.size > VIDEO_WARN_BYTES) {
        warnings.push("Pesa más de 6 MB. Si la página carga lenta, comprímelo.");
      }
    }

    const activoKey = normalizeTextKey(row.activoRaw);
    let activo = true;
    if (activoKey === "si") {
      activo = true;
    } else if (activoKey === "no") {
      activo = false;
    } else {
      errors.push("La columna activo debe ser SI o NO.");
    }

    const existing = cleanName ? existingMap.get(cleanName) : null;
    const exists = !!existing;

    return {
      numero: row.numero,
      titulo: titulo,
      descripcion: descripcion,
      archivo: archivoRaw,
      cleanName: cleanName,
      file: file,
      existing: existing,
      errors: errors,
      warnings: warnings,
      activo: activo,
      type: exists ? "update" : "new",
      weight: file ? file.size : null
    };
  });

  videoImportState.items = items;

  const nuevos = items.filter((item) => item.type === "new" && !item.errors.length).length;
  const actualizan = items.filter((item) => item.type === "update" && !item.errors.length).length;
  const conErrores = items.filter((item) => item.errors.length > 0).length;

  if (summary) {
    summary.textContent = nuevos + " nuevos, " + actualizan + " se actualizan, " + conErrores + " con errores";
  }

  renderVideoImportList(items);

  if (confirmBtn) {
    confirmBtn.disabled = videoImportState.running || items.filter((item) => !item.errors.length).length === 0;
  }
}

function renderVideoImportList(items) {
  const cont = document.getElementById("videoImportList");
  if (!cont) return;
  cont.textContent = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "import-item " + (item.errors.length ? "is-error" : item.type === "update" ? "is-update" : "is-new");

    const head = document.createElement("div");
    head.className = "import-item-head";

    const title = document.createElement("div");
    title.className = "import-item-title";
    title.textContent = item.titulo || ("Fila " + item.numero);
    head.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "import-badge " + (item.errors.length ? "error" : item.type === "update" ? "update" : "new");
    badge.textContent = item.errors.length ? "Error" : item.type === "update" ? "Se actualiza" : "Nuevo";
    head.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "import-item-meta";
    const fileText = document.createElement("span");
    fileText.textContent = item.archivo || "Sin archivo";
    const weightText = document.createElement("span");
    weightText.textContent = item.weight !== null ? formatBytes(item.weight) : "Peso desconocido";
    meta.appendChild(fileText);
    meta.appendChild(weightText);
    if (item.cleanName && item.cleanName !== String(item.archivo || "").trim()) {
      const cleanText = document.createElement("span");
      cleanText.textContent = "Se subirá a Storage como " + item.cleanName;
      meta.appendChild(cleanText);
    }

    card.appendChild(head);
    card.appendChild(meta);

    item.warnings.forEach((warning) => {
      const p = document.createElement("p");
      p.className = "import-warning";
      p.textContent = warning;
      card.appendChild(p);
    });

    item.errors.forEach((error) => {
      const p = document.createElement("p");
      p.className = "import-error";
      p.textContent = error;
      card.appendChild(p);
    });

    cont.appendChild(card);
  });
}

function downloadVideoTemplate() {
  if (typeof ExcelJS === "undefined") {
    showToast("ExcelJS no está cargado.", "error", "Error");
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("videos");

    worksheet.columns = [
      { header: "titulo", key: "titulo", width: 34 },
      { header: "descripcion", key: "descripcion", width: 52 },
      { header: "archivo", key: "archivo", width: 28 },
      { header: "activo", key: "activo", width: 12 }
    ];

    worksheet.addRow({
      titulo: "Labial mate",
      descripcion: "Aplicación paso a paso",
      archivo: "lampina.mp4",
      activo: "SI"
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCEAFB" } };

    workbook.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "plantilla_videos.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }).catch((error) => {
      showToast(error.message || "No se pudo generar la plantilla.", "error", "Error");
    });
  } catch (error) {
    showToast(error.message || "No se pudo generar la plantilla.", "error", "Error");
  }
}

function setVideoImportProgress(current, total, text) {
  const wrap = document.getElementById("videoImportProgressWrap");
  const bar = document.getElementById("videoImportProgressBar");
  const label = document.getElementById("videoImportProgressText");
  if (wrap) wrap.hidden = false;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  if (bar) bar.style.width = pct + "%";
  if (label) label.textContent = text || (pct + "%");
}

function showVideoImportReport(success, failures, total) {
  const report = document.getElementById("videoImportReport");
  if (!report) return;
  report.textContent = "";

  if (!failures.length) {
    report.className = "import-report is-success";
    report.textContent = "Listo: " + success + " de " + total + " video(s) importado(s) correctamente.";
    return;
  }

  report.className = "import-report is-error";
  const title = document.createElement("p");
  title.className = "import-report-title";
  title.textContent = "Se importaron " + success + " de " + total + " videos. Errores:";
  report.appendChild(title);

  const list = document.createElement("ul");
  failures.forEach((failure) => {
    const li = document.createElement("li");
    li.textContent = failure.archivo + ": " + failure.message;
    list.appendChild(li);
  });
  report.appendChild(list);
}

async function importVideosFromExcel() {
  if (videoImportState.running) return;

  const validItems = videoImportState.items.filter((item) => !item.errors.length);
  if (!validItems.length) {
    showToast("No hay videos válidos para importar.", "error", "Importación");
    return;
  }

  videoImportState.running = true;
  const confirmBtn = document.getElementById("videoImportConfirmBtn");
  const clearBtn = document.getElementById("videoImportClearBtn");
  if (confirmBtn) confirmBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;

  const total = validItems.length;
  let success = 0;
  const failures = [];

  setVideoImportProgress(0, total, "Preparando importación...");

  for (let index = 0; index < validItems.length; index++) {
    const item = validItems[index];
    const label = item.titulo || item.cleanName;
    setVideoImportProgress(index, total, "Procesando " + (index + 1) + " de " + total + ": " + label);

    try {
      const thumbBlob = await generateVideoThumbnail(item.file);
      const videoUrl = await uploadVideoToBucket(item.file, item.cleanName);
      const thumbName = thumbnailFileName(item.cleanName);
      const thumbUrl = await uploadThumbToBucket(thumbBlob, thumbName);

      const payload = {
        archivo: item.archivo,
        video_url: videoUrl,
        miniatura_url: thumbUrl,
        titulo: item.titulo,
        descripcion: item.descripcion || null,
        activo: item.activo
      };

      const existing = item.existing;
      const { error } = existing && existing.id_video !== null && existing.id_video !== undefined
        ? await getSupabase()
          .from("videos_uso")
          .update(payload)
          .eq("id_video", existing.id_video)
          .select("id_video")
          .single()
        : await getSupabase()
          .from("videos_uso")
          .upsert(payload, { onConflict: "archivo" })
          .select("id_video")
          .single();

      if (error) throw error;

      setVideoWeight(item.cleanName, item.file.size);
      success++;
    } catch (error) {
      failures.push({
        archivo: item.archivo || (item.file && item.file.name) || item.cleanName || "Sin archivo",
        message: supabaseErrorMessage(error, "No se pudo importar")
      });
    }

    setVideoImportProgress(index + 1, total, (index + 1) + " de " + total + " procesados");
  }

  videoImportState.running = false;
  if (clearBtn) clearBtn.disabled = false;

  state.videoIndexLoaded = false;
  state.videoLoadingOnce = false;
  try {
    await loadVideos();
  } catch (e) {
    /* el informe igual se muestra */
  }

  await buildVideoImportPreview();
  showVideoImportReport(success, failures, total);

  if (failures.length) {
    showToast("Importación terminada con " + failures.length + " error(es).", "error", "Importar videos");
  } else {
    showToast("Videos importados correctamente.", "success");
  }
}

function resetVideoImport() {
  videoImportState.excelRows = [];
  videoImportState.excelFileName = "";
  videoImportState.files = [];
  videoImportState.items = [];
  videoImportState.running = false;

  const excelInput = document.getElementById("videoExcelInput");
  const mp4Input = document.getElementById("videoMp4Input");
  if (excelInput) excelInput.value = "";
  if (mp4Input) mp4Input.value = "";

  const excelLabel = document.getElementById("videoExcelFileName");
  const mp4Label = document.getElementById("videoMp4FileName");
  if (excelLabel) excelLabel.textContent = "Archivo .xlsx";
  if (mp4Label) mp4Label.textContent = "Puedes seleccionar varios videos";

  const summary = document.getElementById("videoImportSummary");
  if (summary) summary.textContent = "";
  renderVideoImportList([]);

  const report = document.getElementById("videoImportReport");
  if (report) {
    report.className = "import-report";
    report.textContent = "";
  }

  const progress = document.getElementById("videoImportProgressWrap");
  if (progress) progress.hidden = true;
  const bar = document.getElementById("videoImportProgressBar");
  if (bar) bar.style.width = "0%";
  const progressText = document.getElementById("videoImportProgressText");
  if (progressText) progressText.textContent = "";

  const confirmBtn = document.getElementById("videoImportConfirmBtn");
  if (confirmBtn) confirmBtn.disabled = true;
}

function bindVideoEvents() {
  const newBtn = document.getElementById("newVideoBtn");
  if (newBtn) newBtn.addEventListener("click", () => openVideoModal(null));

  const form = document.getElementById("videoForm");
  if (form) form.addEventListener("submit", handleVideoSubmit);

  const retryBtn = document.getElementById("vidRetryBtn");
  if (retryBtn) retryBtn.addEventListener("click", loadVideos);

  const fileInput = document.getElementById("vidFile");
  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const info = document.getElementById("vidArchivoInfo");
      const file = fileInput.files ? fileInput.files[0] : null;
      if (!info || !file) return;
      if (!isMp4File(file)) {
        info.className = "import-hint is-error";
        info.textContent = "Solo se permiten archivos MP4.";
        return;
      }
      if (file.size > VIDEO_MAX_BYTES) {
        info.className = "import-hint is-error";
        info.textContent = file.name + " · " + formatBytes(file.size) + " · Comprime el video: máximo 12 MB";
        return;
      }
      info.className = "import-hint" + (file.size > VIDEO_WARN_BYTES ? " is-warning" : "");
      info.textContent = file.name + " · " + formatBytes(file.size) +
        (file.size > VIDEO_WARN_BYTES ? " · Pesa más de 6 MB, recomendamos comprimirlo." : "");
    });
  }

  ["vidTableBody", "vidMobileCards"].forEach((id) => {
    const container = document.getElementById(id);
    if (!container) return;
    container.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.getAttribute("data-action");
      const idValue = button.getAttribute("data-id");

      if (action === "video-edit") {
        const video = state.videos.find((v) => String(v.id_video) === String(idValue));
        if (video) openVideoModal(video);
      } else if (action === "video-toggle") {
        toggleVideoActivo(idValue);
      }
    });
  });

  const templateBtn = document.getElementById("downloadVideoTemplateBtn");
  if (templateBtn) templateBtn.addEventListener("click", downloadVideoTemplate);

  const excelInput = document.getElementById("videoExcelInput");
  if (excelInput) {
    excelInput.addEventListener("change", () => {
      const file = excelInput.files ? excelInput.files[0] : null;
      if (file) handleVideoExcelFile(file);
    });
  }

  const mp4Input = document.getElementById("videoMp4Input");
  if (mp4Input) {
    mp4Input.addEventListener("change", () => {
      handleVideoMp4Files(mp4Input.files);
    });
  }

  const excelDrop = document.getElementById("videoExcelDrop");
  const mp4Drop = document.getElementById("videoMp4Drop");

  function bindDrop(dropZone, callback) {
    if (!dropZone) return;
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("is-dragging");
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("is-dragging");
      });
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove("is-dragging");
      callback(event.dataTransfer ? event.dataTransfer.files : null);
    });
  }

  bindDrop(excelDrop, (files) => {
    const file = files && files[0] ? files[0] : null;
    if (file) handleVideoExcelFile(file);
  });

  bindDrop(mp4Drop, (files) => {
    handleVideoMp4Files(files);
  });

  const confirmBtn = document.getElementById("videoImportConfirmBtn");
  if (confirmBtn) confirmBtn.addEventListener("click", importVideosFromExcel);

  const clearBtn = document.getElementById("videoImportClearBtn");
  if (clearBtn) clearBtn.addEventListener("click", resetVideoImport);

  const goProductos = document.getElementById("goProductosBtn");
  if (goProductos) goProductos.addEventListener("click", () => switchView("productos"));
}

/* =========================================================
   IMPORTAR PRODUCTOS E IMÁGENES
   ========================================================= */

const PRODUCT_BUCKET = "Img_Producto";
const PRODUCT_EXCEL_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const PRODUCT_MAX_ROWS = 5000;
const PRODUCT_UPSERT_BATCH = 200;
const PRODUCT_REFERENCE_BATCH = 100;
const PRODUCT_IMAGE_MAX_SIDE = 900;
const PRODUCT_IMAGE_QUALITY = 0.78;
const PRODUCT_PROVIDER_KEY = "auraeProductProviderField";

const PRODUCT_IMPORT_COLUMNS = [
  "referencia",
  "nombre",
  "descripcion",
  "precio",
  "categoria",
  "proveedor",
  "tonos",
  "stock",
  "en_oferta",
  "precio_oferta",
  "precio_proveedor",
  "activo"
];

const PRODUCT_VERIFY_SELECT =
  "referencia, nombre, precio, activo, en_oferta, precio_oferta, imagen_url," +
  " inventario ( cantidad_disponible )";

const productImportState = {
  excelRows: [],
  excelFileName: "",
  images: [],
  imageErrors: [],
  items: [],
  running: false,
  lastReportRows: []
};

let productProviderFieldCache = null;

function productReferenceKey(valor) {
  return normalizeTextKey(valor).replace(/\s+/g, "");
}

function productImageKey(name) {
  const base = String(name || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, "");
  return importCompareKey(base);
}

function cleanProductStorageName(referencia) {
  let base = String(referencia || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase();

  if (!base) base = "producto";
  return base.slice(0, 120) + ".webp";
}

function isProductImageName(name) {
  return /\.(png|jpe?g|webp)$/i.test(String(name || "").trim());
}

function isProductImageFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  return ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(type) || isProductImageName(file.name);
}

function productUnwrapCellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || "").join("");
    }
    if (value.result !== undefined && value.result !== null) return value.result;
    if (value.text !== undefined && value.text !== null) return value.text;
  }
  return value;
}

function productCellText(cell) {
  if (!cell) return "";
  const value = productUnwrapCellValue(cell.value);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseProductNumber(value) {
  const raw = productUnwrapCellValue(value);
  if (raw === null || raw === undefined || String(raw).trim() === "") return NaN;
  if (typeof raw === "number") return raw;

  let text = String(raw)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9.,-]/g, "");
  if (!text) return NaN;

  if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(text)) {
    text = text.replace(/,/g, "");
  } else {
    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) {
        text = text.replace(/\./g, "").replace(",", ".");
      } else {
        text = text.replace(/,/g, "");
      }
    } else if (lastComma >= 0) {
      const parts = text.split(",");
      if (parts.length === 2 && parts[1].length !== 3) text = text.replace(",", ".");
      else text = text.replace(/,/g, "");
    }
  }

  text = text.replace(/[^0-9.-]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

function parseProductSiNo(value) {
  const key = productReferenceKey(value);
  if (key === "si") return true;
  if (key === "no") return false;
  return null;
}

function parseProductTones(value) {
  const seen = new Set();
  return String(value || "")
    .split("|")
    .map((tono) => tono.trim())
    .filter((tono) => {
      const key = productReferenceKey(tono);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function productProviderId(provider) {
  if (!provider) return null;
  const keys = ["id_proveedor", "proveedor_id", "id"];
  for (const key of keys) {
    if (provider[key] !== null && provider[key] !== undefined) return provider[key];
  }
  return null;
}

function productProviderName(provider) {
  if (!provider) return "";
  return String(provider.nombre || provider.nombre_proveedor || "").trim();
}

async function fetchAllTableRows(table, select, pageSize) {
  const sb = getSupabase();
  const size = pageSize || 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + size - 1);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push.apply(rows, chunk);
    if (chunk.length < size) break;
    from += size;
  }

  return rows;
}

async function fetchProductRowsByReferences(references, select) {
  const sb = getSupabase();
  const rows = [];
  const list = references.filter(Boolean);

  for (let index = 0; index < list.length; index += PRODUCT_REFERENCE_BATCH) {
    const chunk = list.slice(index, index + PRODUCT_REFERENCE_BATCH);
    const { data, error } = await sb.from("productos").select(select).in("referencia", chunk);
    if (error) throw error;
    if (Array.isArray(data)) rows.push.apply(rows, data);
  }

  return rows;
}

async function getProductProviderField(sb) {
  if (productProviderFieldCache) return productProviderFieldCache;

  try {
    const cached = localStorage.getItem(PRODUCT_PROVIDER_KEY);
    if (cached) {
      productProviderFieldCache = cached;
      return cached;
    }
  } catch (e) {
    /* almacenamiento no disponible */
  }

  let field = "id_proveedor";
  try {
    const { data, error } = await sb.from("productos").select("*").limit(1);
    if (!error && data && data[0]) {
      const found = Object.keys(data[0]).find((key) => /proveedor/i.test(key) && !/nombre/i.test(key));
      if (found) field = found;
    }
  } catch (e) {
    /* se usa el nombre estándar */
  }

  productProviderFieldCache = field;
  try {
    localStorage.setItem(PRODUCT_PROVIDER_KEY, field);
  } catch (e) {
    /* almacenamiento no disponible */
  }
  return field;
}

async function ensureProductProviders(names) {
  const sb = getSupabase();
  const map = new Map();
  const errors = [];
  const desired = [];
  const seen = new Set();

  names.forEach((name) => {
    const clean = String(name || "").trim();
    const key = productReferenceKey(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    desired.push(clean);
  });

  if (!desired.length) return { map, errors };

  let existing = [];
  try {
    existing = await fetchAllTableRows("proveedores", "*", 1000);
  } catch (error) {
    errors.push(translateError(error, "No se pudieron consultar los proveedores"));
    return { map, errors };
  }

  existing.forEach((provider) => {
    const key = productReferenceKey(productProviderName(provider));
    if (key && !map.has(key)) map.set(key, provider);
  });

  const missing = desired.filter((name) => !map.has(productReferenceKey(name)));

  for (let index = 0; index < missing.length; index += 100) {
    const chunk = missing.slice(index, index + 100);
    const { data, error } = await sb
      .from("proveedores")
      .insert(chunk.map((nombre) => ({ nombre })))
      .select("*");

    if (!error) {
      (Array.isArray(data) ? data : []).forEach((provider) => {
        const key = productReferenceKey(productProviderName(provider));
        if (key) map.set(key, provider);
      });
      continue;
    }

    for (const name of chunk) {
      const inserted = await sb.from("proveedores").insert({ nombre: name }).select("*").single();
      if (!inserted.error && inserted.data) {
        map.set(productReferenceKey(name), inserted.data);
        continue;
      }

      const again = await sb.from("proveedores").select("*").eq("nombre", name).limit(1);
      if (!again.error && again.data && again.data[0]) {
        map.set(productReferenceKey(name), again.data[0]);
      } else {
        errors.push(name + ": " + translateError(inserted.error, "No se pudo crear el proveedor"));
      }
    }
  }

  return { map, errors };
}

function decodeProductImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen " + file.name + "."));
    };
    image.src = url;
  });
}

async function buildProductImageBlob(file) {
  const image = await decodeProductImage(file);
  const width = Number(image.naturalWidth || image.width || 0);
  const height = Number(image.naturalHeight || image.height || 0);
  if (!width || !height) throw new Error("La imagen " + file.name + " no tiene dimensiones válidas.");

  const scale = Math.min(1, PRODUCT_IMAGE_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no pudo procesar la imagen.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const toBlob = (type, quality) =>
    new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));

  let blob = await toBlob("image/webp", PRODUCT_IMAGE_QUALITY);
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob("image/jpeg", 0.8);
  }
  if (!blob) throw new Error("No se pudo convertir la imagen " + file.name + ".");
  return blob;
}

async function uploadProductImage(file, referencia) {
  const sb = getSupabase();
  const blob = await buildProductImageBlob(file);
  const storageName = cleanProductStorageName(referencia);
  const { error } = await sb.storage.from(PRODUCT_BUCKET).upload(storageName, blob, {
    upsert: true,
    cacheControl: "31536000",
    contentType: blob.type || "image/webp"
  });
  if (error) throw error;
  return sb.storage.from(PRODUCT_BUCKET).getPublicUrl(storageName).data.publicUrl;
}

async function handleProductExcelFile(file) {
  if (!file || productImportState.running) return;

  const summary = document.getElementById("productImportSummary");
  const report = document.getElementById("productImportReport");
  if (report) {
    report.className = "import-report";
    report.textContent = "";
  }

  if (!/\.xlsx$/i.test(file.name)) {
    productImportState.excelRows = [];
    productImportState.excelFileName = "";
    if (summary) summary.textContent = "Selecciona un archivo .xlsx.";
    renderProductImportList([], [], []);
    return;
  }

  try {
    await parseProductExcel(file);
    const label = document.getElementById("productExcelFileName");
    if (label) label.textContent = file.name;
    buildProductImportPreview();
  } catch (error) {
    productImportState.excelRows = [];
    productImportState.excelFileName = "";
    const label = document.getElementById("productExcelFileName");
    if (label) label.textContent = "Archivo .xlsx";
    if (summary) summary.textContent = error.message || "No se pudo leer el Excel.";
    renderProductImportList([], [], productImportState.imageErrors);
    showToast(error.message || "No se pudo leer el Excel.", "error", "Excel no válido");
  }
}

async function parseProductExcel(file) {
  if (typeof ExcelJS === "undefined") throw new Error("ExcelJS no está cargado.");
  if (file.size > PRODUCT_EXCEL_MAX_BYTES) {
    throw new Error("El Excel supera el máximo de 10 MB.");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const worksheet =
    workbook.worksheets.find((sheet) => normalizeTextKey(sheet.name) === "productos") ||
    workbook.getWorksheet("productos");

  if (!worksheet) throw new Error('El Excel debe tener una hoja llamada "productos".');

  const headers = {};
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[normalizeTextKey(cell.text)] = colNumber;
  });

  const missing = PRODUCT_IMPORT_COLUMNS.filter((key) => !headers[key]);
  if (missing.length) {
    throw new Error("Faltan estas columnas en la hoja productos: " + missing.join(", ") + ".");
  }

  const rows = [];
  const lastRow = worksheet.rowCount;

  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = {};
    PRODUCT_IMPORT_COLUMNS.forEach((key) => {
      values[key] = row.getCell(headers[key]).value;
    });

    const texts = {};
    PRODUCT_IMPORT_COLUMNS.forEach((key) => {
      texts[key] = productCellText(row.getCell(headers[key]));
    });

    const hasContent = PRODUCT_IMPORT_COLUMNS.some((key) => texts[key] !== "");
    if (!hasContent) continue;

    const referencia = texts.referencia;
    if (/^EJ-/i.test(referencia)) continue;

    rows.push({
      numero: rowNumber,
      referencia,
      nombre: texts.nombre,
      descripcion: texts.descripcion,
      precioRaw: values.precio,
      categoria: texts.categoria,
      proveedor: texts.proveedor,
      tonosRaw: texts.tonos,
      stockRaw: values.stock,
      enOfertaRaw: texts.en_oferta,
      precioOfertaRaw: values.precio_oferta,
      precioProveedorRaw: values.precio_proveedor,
      activoRaw: texts.activo
    });

    if (rows.length > PRODUCT_MAX_ROWS) {
      throw new Error("El Excel supera el máximo de " + PRODUCT_MAX_ROWS + " productos.");
    }
  }

  productImportState.excelRows = rows;
  productImportState.excelFileName = file.name;
}

function handleProductImageFiles(fileList) {
  if (productImportState.running) return;
  const incoming = Array.from(fileList || []).filter(Boolean);
  if (!incoming.length) return;

  const map = new Map();
  productImportState.images.forEach((file) => {
    const key = productImageKey(file.name);
    if (key && !map.has(key)) map.set(key, file);
  });

  const rejected = [];
  incoming.forEach((file) => {
    const key = productImageKey(file.name);
    if (!key) {
      rejected.push(file.name + ": el nombre no contiene una referencia válida.");
    } else if (!isProductImageFile(file)) {
      rejected.push(file.name + ": solo se permiten PNG, JPG o WebP.");
    } else if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
      rejected.push(file.name + ": supera el máximo de 15 MB.");
    } else {
      map.set(key, file);
    }
  });

  productImportState.images = Array.from(map.values());
  productImportState.imageErrors = rejected;

  const label = document.getElementById("productImageFileName");
  if (label) label.textContent = productImportState.images.length + " imagen(es) cargada(s)";

  if (rejected.length) {
    showToast(rejected.length + " imagen(es) no se cargaron. Revisa el detalle.", "error", "Imágenes");
  }

  buildProductImportPreview();
}

function buildProductImportPreview() {
  const summary = document.getElementById("productImportSummary");
  const confirmBtn = document.getElementById("productImportConfirmBtn");
  const imageHint = document.getElementById("productImportImageHint");
  const rows = productImportState.excelRows;

  if (!rows.length) {
    productImportState.items = [];
    if (summary) summary.textContent = "Selecciona el Excel y arrastra las imágenes para ver la vista previa.";
    if (confirmBtn) confirmBtn.disabled = true;
    if (imageHint) {
      imageHint.className = "import-hint" + (productImportState.imageErrors.length ? " is-error" : "");
      imageHint.textContent = productImportState.imageErrors.join(" ");
    }
    renderProductImportList([], productImportState.images, productImportState.imageErrors);
    return;
  }

  const fileMap = new Map();
  productImportState.images.forEach((file) => {
    const key = productImageKey(file.name);
    if (key) fileMap.set(key, file);
  });

  const existingMap = new Map();
  state.products.forEach((product) => {
    const key = productReferenceKey(product.referencia);
    if (key) existingMap.set(key, product);
  });

  const seen = new Set();
  const items = rows.map((row) => {
    const errors = [];
    const warnings = [];
    const referencia = String(row.referencia || "").trim();
    const nombre = String(row.nombre || "").trim();
    const refKey = productReferenceKey(referencia);
    const matchKey = importCompareKey(referencia);

    if (!referencia) errors.push("La referencia es obligatoria.");
    if (refKey) {
      if (seen.has(refKey)) errors.push("Referencia repetida en el Excel.");
      seen.add(refKey);
    }
    if (!nombre) errors.push("El nombre es obligatorio.");

    const precio = parseProductNumber(row.precioRaw);
    if (!isFinite(precio) || precio < 0) {
      errors.push("El precio debe ser un número mayor o igual a 0.");
    }

    const stock = parseProductNumber(row.stockRaw);
    if (!Number.isInteger(stock) || stock < 0) {
      errors.push("El stock debe ser un entero mayor o igual a 0.");
    }

    const enOferta = parseProductSiNo(row.enOfertaRaw);
    if (enOferta === null) errors.push("La columna en_oferta debe ser SI o NO.");

    const precioOferta = parseProductNumber(row.precioOfertaRaw);
    if (enOferta === true) {
      if (!isFinite(precioOferta) || precioOferta < 0) {
        errors.push("Si en_oferta es SI, precio_oferta debe ser un número mayor o igual a 0.");
      } else if (isFinite(precio) && precioOferta >= precio) {
        errors.push("El precio de oferta debe ser menor que el precio normal.");
      }
    } else if (enOferta === false && productCellTextValue(row.precioOfertaRaw) !== "") {
      warnings.push("Como en_oferta es NO, el precio_oferta se guardará vacío.");
    }

    const precioProveedorRaw = productCellTextValue(row.precioProveedorRaw);
    const precioProveedor = parseProductNumber(row.precioProveedorRaw);
    if (precioProveedorRaw !== "" && (!isFinite(precioProveedor) || precioProveedor < 0)) {
      errors.push("El precio_proveedor debe ser un número mayor o igual a 0.");
    }

    const activo = parseProductSiNo(row.activoRaw);
    if (activo === null) errors.push("La columna activo debe ser SI o NO.");

    const imageFile = matchKey ? fileMap.get(matchKey) : null;
    const exists = refKey ? existingMap.has(refKey) : false;

    return {
      numero: row.numero,
      referencia,
      refKey,
      nombre,
      descripcion: String(row.descripcion || "").trim(),
      precio,
      categoria: String(row.categoria || "").trim(),
      proveedor: String(row.proveedor || "").trim(),
      tonos: parseProductTones(row.tonosRaw),
      stock,
      enOferta: enOferta === true,
      precioOferta: enOferta === true ? precioOferta : null,
      precioProveedor: precioProveedorRaw === "" ? null : precioProveedor,
      activo: activo === true,
      imageFile,
      imageUrl: null,
      errors,
      warnings,
      type: exists ? "update" : "new"
    };
  });

  productImportState.items = items;

  const validKeys = new Set(
    items
      .filter((item) => !item.errors.length && item.referencia)
      .map((item) => importCompareKey(item.referencia))
  );
  const unmatchedImages = productImportState.images.filter((file) => !validKeys.has(productImageKey(file.name)));

  const nuevos = items.filter((item) => item.type === "new" && !item.errors.length).length;
  const actualizan = items.filter((item) => item.type === "update" && !item.errors.length).length;
  const conErrores = items.filter((item) => item.errors.length > 0).length;
  const imagenes = items.filter((item) => item.imageFile && !item.errors.length).length;

  if (summary) {
    summary.textContent =
      nuevos + " nuevos, " + actualizan + " se actualizan, " + conErrores + " con errores, " + imagenes + " imágenes";
  }

  if (imageHint) {
    const notes = [];
    if (unmatchedImages.length) {
      notes.push(unmatchedImages.length + " imagen(es) no coinciden con ninguna referencia del Excel.");
    }
    if (productImportState.imageErrors.length) {
      notes.push(productImportState.imageErrors.join(" "));
    }
    imageHint.className = "import-hint" + (notes.length ? " is-error" : "");
    imageHint.textContent = notes.join(" ");
  }

  renderProductImportList(items, unmatchedImages, productImportState.imageErrors);

  if (confirmBtn) {
    confirmBtn.disabled = productImportState.running || items.filter((item) => !item.errors.length).length === 0;
  }
}

function productCellTextValue(value) {
  const raw = productUnwrapCellValue(value);
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

function renderProductImportList(items, unmatchedImages, imageErrors) {
  const cont = document.getElementById("productImportList");
  if (!cont) return;
  cont.textContent = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className =
      "import-item " +
      (item.errors.length ? "is-error" : item.type === "update" ? "is-update" : "is-new");

    const head = document.createElement("div");
    head.className = "import-item-head";

    const title = document.createElement("div");
    title.className = "import-item-title";
    title.textContent = item.nombre || item.referencia || "Fila " + item.numero;
    head.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "import-badge " + (item.errors.length ? "error" : item.type === "update" ? "update" : "new");
    badge.textContent = item.errors.length ? "Error" : item.type === "update" ? "Se actualiza" : "Nuevo";
    head.appendChild(badge);
    card.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "import-item-meta";
    const metaParts = [
      "Ref. " + (item.referencia || "-"),
      isFinite(item.precio) ? formatPrecio(item.precio) : "Precio inválido",
      "Stock: " + (Number.isInteger(item.stock) ? item.stock : "-"),
      "Categoría: " + (item.categoria || "-"),
      "Proveedor: " + (item.proveedor || "-"),
      "Tonos: " + item.tonos.length,
      item.enOferta ? "Oferta: " + formatPrecio(item.precioOferta) : "Sin oferta",
      item.imageFile ? "Imagen: " + item.imageFile.name : "Sin imagen"
    ];
    metaParts.forEach((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      meta.appendChild(span);
    });
    card.appendChild(meta);

    item.warnings.forEach((warning) => {
      const p = document.createElement("p");
      p.className = "import-warning";
      p.textContent = warning;
      card.appendChild(p);
    });

    item.errors.forEach((error) => {
      const p = document.createElement("p");
      p.className = "import-error";
      p.textContent = error;
      card.appendChild(p);
    });

    cont.appendChild(card);
  });

  if (unmatchedImages.length || imageErrors.length) {
    const card = document.createElement("div");
    card.className = "import-item is-update";

    const head = document.createElement("div");
    head.className = "import-item-head";
    const title = document.createElement("div");
    title.className = "import-item-title";
    title.textContent = "Imágenes sin producto coincidente";
    head.appendChild(title);
    card.appendChild(head);

    unmatchedImages.slice(0, 25).forEach((file) => {
      const p = document.createElement("p");
      p.className = "import-warning";
      p.textContent = file.name + ": no hay una referencia igual en el Excel.";
      card.appendChild(p);
    });
    if (unmatchedImages.length > 25) {
      const p = document.createElement("p");
      p.className = "import-warning";
      p.textContent = "+" + (unmatchedImages.length - 25) + " imagen(es) más.";
      card.appendChild(p);
    }

    imageErrors.forEach((error) => {
      const p = document.createElement("p");
      p.className = "import-error";
      p.textContent = error;
      card.appendChild(p);
    });

    cont.appendChild(card);
  }
}

function downloadProductTemplate() {
  if (typeof ExcelJS === "undefined") {
    showToast("ExcelJS no está cargado.", "error", "Error");
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const products = workbook.addWorksheet("productos");
    const videos = workbook.addWorksheet("videos");

    products.columns = PRODUCT_IMPORT_COLUMNS.map((header) => ({
      header,
      key: header,
      width: header === "descripcion" ? 44 : header === "nombre" ? 30 : 18
    }));

    products.addRow({
      referencia: "EJ-001",
      nombre: "Labial mate",
      descripcion: "Labial de larga duración",
      precio: 45000,
      categoria: "Maquillaje",
      proveedor: "Proveedor ejemplo",
      tonos: "Rojo|Nude",
      stock: 12,
      en_oferta: "SI",
      precio_oferta: 39900,
      precio_proveedor: 22000,
      activo: "SI"
    });

    videos.columns = [
      { header: "titulo", key: "titulo", width: 34 },
      { header: "descripcion", key: "descripcion", width: 52 },
      { header: "archivo", key: "archivo", width: 28 },
      { header: "activo", key: "activo", width: 12 }
    ];

    videos.addRow({
      titulo: "Labial mate",
      descripcion: "Aplicación paso a paso",
      archivo: "lampina.mp4",
      activo: "SI"
    });

    [products, videos].forEach((worksheet) => {
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCEAFB" } };
      worksheet.views = [{ state: "frozen", ySplit: 1 }];
    });

    workbook.xlsx
      .writeBuffer()
      .then((buffer) => {
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "plantilla_catalogo.xlsx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch((error) => {
        showToast(error.message || "No se pudo generar la plantilla.", "error", "Error");
      });
  } catch (error) {
    showToast(error.message || "No se pudo generar la plantilla.", "error", "Error");
  }
}

function setProductImportProgress(current, total, text) {
  const wrap = document.getElementById("productImportProgressWrap");
  const bar = document.getElementById("productImportProgressBar");
  const label = document.getElementById("productImportProgressText");
  if (wrap) wrap.hidden = false;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
  if (bar) bar.style.width = pct + "%";
  if (label) label.textContent = text || current + " de " + total;
}

function buildProductPayload(item, providerField, providerMap, existing) {
  const payload = {
    referencia: item.referencia,
    nombre: item.nombre,
    precio: Number(item.precio),
    activo: item.activo,
    en_oferta: item.enOferta,
    descripcion: item.descripcion || existing?.descripcion || null,
    categoria: item.categoria || existing?.categoria || null,
    tonos: item.tonos.length ? item.tonos : Array.isArray(existing?.tonos) ? existing.tonos : [],
    pedidos_clientes:
      item.precioProveedor !== null
        ? Number(item.precioProveedor)
        : existing?.pedidos_clientes !== null && existing?.pedidos_clientes !== undefined
          ? existing.pedidos_clientes
          : null,
    imagen_url: item.imageUrl || existing?.imagen_url || null,
    precio_oferta: item.enOferta ? Number(item.precioOferta) : null
  };

  let providerId = null;
  if (item.proveedor) {
    const provider = providerMap.get(productReferenceKey(item.proveedor));
    providerId = productProviderId(provider);
  }
  if (providerId === null && existing && existing[providerField] !== null && existing[providerField] !== undefined) {
    providerId = existing[providerField];
  }
  payload[providerField] = providerId;

  return payload;
}

async function updateProductInventory(items, idMap) {
  const sb = getSupabase();
  const failures = [];
  const rows = items
    .map((item) => {
      const id = idMap.get(item.refKey);
      if (id === null || id === undefined) return null;
      return { id_producto: id, cantidad_disponible: item.stock };
    })
    .filter(Boolean);

  for (let index = 0; index < rows.length; index += PRODUCT_UPSERT_BATCH) {
    const chunk = rows.slice(index, index + PRODUCT_UPSERT_BATCH);
    const { error } = await sb.from("inventario").upsert(chunk, { onConflict: "id_producto" });

    if (!error) continue;

    for (const row of chunk) {
      const single = await sb.from("inventario").upsert(row, { onConflict: "id_producto" });
      if (single.error) {
        failures.push({
          referencia: items.find((item) => idMap.get(item.refKey) === row.id_producto)?.referencia || "",
          message: translateError(single.error, "No se pudo actualizar el stock")
        });
      }
    }
  }

  return failures;
}

async function hideMissingProducts(excelReferences) {
  const all = await fetchAllTableRows("productos", "id_producto, referencia, activo", 1000);
  const present = new Set(excelReferences.map(productReferenceKey).filter(Boolean));
  const missing = all.filter((product) => {
    const key = productReferenceKey(product.referencia);
    return key && !present.has(key);
  });

  if (!missing.length) return { hidden: 0, failures: [] };

  const failures = [];
  let hidden = 0;
  const ids = missing.map((product) => product.id_producto).filter((id) => id !== null && id !== undefined);

  for (let index = 0; index < ids.length; index += PRODUCT_UPSERT_BATCH) {
    const chunk = ids.slice(index, index + PRODUCT_UPSERT_BATCH);
    const { error, count } = await getSupabase()
      .from("productos")
      .update({ activo: false }, { count: "exact" })
      .in("id_producto", chunk);
    if (error) {
      failures.push(translateError(error, "No se pudieron ocultar algunos productos"));
    } else {
      hidden += Number(count || 0);
    }
  }

  return { hidden, failures };
}

async function verifyProductImport(items, idMap) {
  const expected = items.filter((item) => idMap.get(item.refKey) !== null && idMap.get(item.refKey) !== undefined);
  if (!expected.length) {
    return { products: 0, stock: 0, images: 0, mismatches: [] };
  }

  const rows = await fetchProductRowsByReferences(expected.map((item) => item.referencia), PRODUCT_VERIFY_SELECT);
  const rowMap = new Map();
  rows.forEach((row) => {
    const key = productReferenceKey(row.referencia);
    if (key) rowMap.set(key, row);
  });

  let products = 0;
  let stock = 0;
  let images = 0;
  const mismatches = [];

  expected.forEach((item) => {
    const row = rowMap.get(item.refKey);
    if (!row) {
      mismatches.push({ referencia: item.referencia, motivo: "No se encontró el producto en la base de datos." });
      return;
    }

    const productDiffs = [];
    if (String(row.nombre || "").trim() !== item.nombre) productDiffs.push("nombre");

    if (Math.abs(Number(row.precio) - Number(item.precio)) > 0.01) productDiffs.push("precio");

    if ((row.activo === true) !== item.activo) productDiffs.push("activo");

    if ((row.en_oferta === true) !== item.enOferta) {
      productDiffs.push("en_oferta");
    } else if (item.enOferta) {
      const storedOffer = row.precio_oferta === null || row.precio_oferta === undefined ? null : Number(row.precio_oferta);
      if (storedOffer === null || Math.abs(storedOffer - Number(item.precioOferta)) > 0.01) {
        productDiffs.push("precio_oferta");
      }
    } else if (row.precio_oferta !== null && row.precio_oferta !== undefined) {
      productDiffs.push("precio_oferta");
    }

    const inventory = getInventario(row);
    const storedStock =
      inventory && inventory.cantidad_disponible !== null && inventory.cantidad_disponible !== undefined
        ? Number(inventory.cantidad_disponible)
        : null;
    const stockOk = storedStock === Number(item.stock);

    let imageOk = true;
    if (item.imageUrl) {
      imageOk = String(row.imagen_url || "") === String(item.imageUrl);
    }

    const diffs = productDiffs.slice();
    if (!stockOk) diffs.push("stock");
    if (!imageOk) diffs.push("imagen_url");

    if (!productDiffs.length) products++;
    if (stockOk) stock++;
    if (imageOk && item.imageUrl) images++;

    if (diffs.length) {
      mismatches.push({
        referencia: item.referencia,
        motivo: "Diferencias en: " + diffs.join(", ") + "."
      });
    }
  });

  return { products, stock, images, mismatches };
}

function productReportCsv(rows) {
  const header = ["referencia", "tipo", "archivo", "detalle"];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    const values = [row.referencia, row.tipo, row.archivo, row.detalle].map((value) => {
      const text = String(value || "").replace(/"/g, '""');
      return '"' + text + '"';
    });
    lines.push(values.join(","));
  });
  return "\uFEFFsep=,\r\n" + lines.join("\r\n");
}

function downloadProductImportReport() {
  const rows = productImportState.lastReportRows || [];
  if (!rows.length) {
    showToast("No hay incidencias para exportar.", "info", "Informe");
    return;
  }

  const blob = new Blob([productReportCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "informe_importacion_productos_" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function showProductImportReport(success, total, productFailures, imageFailures, inventoryFailures, providerFailures, hideResult, verification, verificationError, generalError) {
  const report = document.getElementById("productImportReport");
  if (!report) return;
  report.textContent = "";

  const failures = [];
  productFailures.forEach((failure) => {
    failures.push({ referencia: failure.referencia, tipo: "Error de producto", archivo: "", detalle: failure.message });
  });
  imageFailures.forEach((failure) => {
    failures.push({ referencia: failure.referencia, tipo: "Error de imagen", archivo: failure.archivo, detalle: failure.message });
  });
  providerFailures.forEach((message) => {
    failures.push({ referencia: "", tipo: "Error de proveedor", archivo: "", detalle: message });
  });
  inventoryFailures.forEach((failure) => {
    failures.push({ referencia: failure.referencia, tipo: "Error de stock", archivo: "", detalle: failure.message });
  });
  if (hideResult && hideResult.failures) {
    hideResult.failures.forEach((message) => {
      failures.push({ referencia: "", tipo: "Error al ocultar", archivo: "", detalle: message });
    });
  }
  if (verification) {
    verification.mismatches.forEach((mismatch) => {
      failures.push({ referencia: mismatch.referencia, tipo: "Verificación", archivo: "", detalle: mismatch.motivo });
    });
  }
  if (verificationError) {
    failures.push({ referencia: "", tipo: "Verificación", archivo: "", detalle: verificationError });
  }
  if (generalError) {
    failures.push({ referencia: "", tipo: "Error general", archivo: "", detalle: generalError });
  }
  productImportState.items
    .filter((item) => item.errors.length)
    .forEach((item) => {
      failures.push({
        referencia: item.referencia,
        tipo: "Validación",
        archivo: item.imageFile ? item.imageFile.name : "",
        detalle: item.errors.join(" ")
      });
    });

  productImportState.lastReportRows = failures;

  report.className = "import-report " + (failures.length ? "is-error" : "is-success");

  const title = document.createElement("p");
  title.className = "import-report-title";
  title.textContent =
    "Se importaron " + success + " de " + total + " producto(s)" +
    (failures.length ? ". Incidencias: " + failures.length + "." : " correctamente.");
  report.appendChild(title);

  if (hideResult) {
    const hideText = document.createElement("p");
    hideText.textContent =
      "Productos ocultados: " + hideResult.hidden + ". No se eliminó ningún registro.";
    report.appendChild(hideText);
  }

  if (verification) {
    const verified = document.createElement("p");
    verified.className = "import-verification";
    verified.textContent =
      "Verificado en la base de datos: " + verification.products + " productos, " +
      verification.stock + " stock, " + verification.images + " imágenes";
    report.appendChild(verified);
  }

  if (failures.length) {
    const list = document.createElement("ul");
    failures.slice(0, 40).forEach((failure) => {
      const li = document.createElement("li");
      li.textContent =
        (failure.referencia ? failure.referencia + ": " : "") +
        (failure.archivo ? failure.archivo + ": " : "") +
        failure.detalle;
      list.appendChild(li);
    });
    if (failures.length > 40) {
      const li = document.createElement("li");
      li.textContent = "+" + (failures.length - 40) + " incidencia(s) más. Descarga el CSV para verlas todas.";
      list.appendChild(li);
    }
    report.appendChild(list);
  }

  const actions = document.createElement("div");
  actions.className = "import-report-actions";

  if (failures.length) {
    const csvBtn = document.createElement("button");
    csvBtn.type = "button";
    csvBtn.className = "btn btn-secondary btn-sm";
    csvBtn.textContent = "Descargar informe CSV";
    csvBtn.addEventListener("click", downloadProductImportReport);
    actions.appendChild(csvBtn);
  }

  const catalogLink = document.createElement("a");
  catalogLink.className = "btn btn-secondary btn-sm";
  catalogLink.href = "index.html#catalogo";
  catalogLink.target = "_blank";
  catalogLink.rel = "noopener";
  catalogLink.textContent = "Ver catálogo público";
  actions.appendChild(catalogLink);

  report.appendChild(actions);
}

async function importProductsFromExcel() {
  if (productImportState.running) return;

  const validItems = productImportState.items.filter((item) => !item.errors.length);
  if (!validItems.length) {
    showToast("No hay productos válidos para importar.", "error", "Importación");
    return;
  }

  const hideInput = document.getElementById("productHideMissing");
  let hideMissing = !!(hideInput && hideInput.checked);
  const excelReferences = productImportState.excelRows.map((row) => row.referencia);

  if (hideMissing) {
    try {
      const all = await fetchAllTableRows("productos", "id_producto, referencia, activo", 1000);
      const present = new Set(excelReferences.map(productReferenceKey).filter(Boolean));
      const missing = all.filter((product) => {
        const key = productReferenceKey(product.referencia);
        return key && !present.has(key);
      });

      if (!missing.length) {
        hideMissing = false;
        showToast("Todos los productos de la base ya vienen en el archivo.", "info", "Ocultar productos");
      } else if (!confirm("Se ocultarán " + missing.length + " producto(s) que no vienen en el Excel. No se eliminarán. ¿Continuar?")) {
        hideMissing = false;
        if (hideInput) hideInput.checked = false;
      }
    } catch (error) {
      hideMissing = false;
      showToast(translateError(error, "No se pudo preparar la ocultación"), "error", "Importación");
    }
  }

  productImportState.running = true;
  productImportState.lastReportRows = [];
  validItems.forEach((item) => {
    item.imageUrl = null;
  });

  const confirmBtn = document.getElementById("productImportConfirmBtn");
  const clearBtn = document.getElementById("productImportClearBtn");
  if (confirmBtn) confirmBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;

  const report = document.getElementById("productImportReport");
  if (report) {
    report.className = "import-report";
    report.textContent = "";
  }

  const imageItems = validItems.filter((item) => item.imageFile);
  const totalSteps = validItems.length + imageItems.length;
  let completedSteps = 0;
  const productFailures = [];
  const imageFailures = [];
  const providerFailures = [];
  let inventoryFailures = [];
  let hideResult = null;
  let verification = null;
  let verificationError = "";
  const idMap = new Map();

  setProductImportProgress(0, totalSteps, "Preparando importación...");

  try {
    const sb = getSupabase();
    const providerResult = await ensureProductProviders(validItems.map((item) => item.proveedor));
    providerResult.errors.forEach((message) => providerFailures.push(message));

    const providerField = validItems.some((item) => item.proveedor)
      ? await getProductProviderField(sb)
      : "id_proveedor";

    const existingRows = await fetchProductRowsByReferences(
      validItems.map((item) => item.referencia),
      "*"
    );
    const existingMap = new Map();
    existingRows.forEach((row) => {
      const key = productReferenceKey(row.referencia);
      if (key) existingMap.set(key, row);
    });

    const importable = [];
    validItems.forEach((item) => {
      if (item.proveedor && !providerResult.map.has(productReferenceKey(item.proveedor))) {
        productFailures.push({
          referencia: item.referencia,
          message: "No se pudo crear o encontrar el proveedor " + item.proveedor + "."
        });
        return;
      }
      importable.push(item);
    });

    let imagesDone = 0;
    for (let index = 0; index < imageItems.length; index += 3) {
      const chunk = imageItems.slice(index, index + 3);
      await Promise.all(
        chunk.map(async (item) => {
          try {
            item.imageUrl = await uploadProductImage(item.imageFile, item.referencia);
          } catch (error) {
            imageFailures.push({
              referencia: item.referencia,
              archivo: item.imageFile.name,
              message: supabaseErrorMessage(error, "No se pudo subir la imagen")
            });
          } finally {
            imagesDone++;
            completedSteps++;
            setProductImportProgress(
              completedSteps,
              totalSteps,
              "Imágenes: " + imagesDone + " de " + imageItems.length
            );
          }
        })
      );
    }

    let productsDone = 0;
    for (let index = 0; index < importable.length; index += PRODUCT_UPSERT_BATCH) {
      const chunk = importable.slice(index, index + PRODUCT_UPSERT_BATCH);
      const payloads = chunk.map((item) =>
        buildProductPayload(item, providerField, providerResult.map, existingMap.get(item.refKey))
      );
      const result = await sb
        .from("productos")
        .upsert(payloads, { onConflict: "referencia" })
        .select("id_producto, referencia");

      if (!result.error) {
        (Array.isArray(result.data) ? result.data : []).forEach((row) => {
          const key = productReferenceKey(row.referencia);
          if (key) idMap.set(key, row.id_producto);
        });
      } else {
        for (const item of chunk) {
          const payload = buildProductPayload(item, providerField, providerResult.map, existingMap.get(item.refKey));
          const single = await sb
            .from("productos")
            .upsert(payload, { onConflict: "referencia" })
            .select("id_producto, referencia")
            .single();

          if (single.error) {
            productFailures.push({
              referencia: item.referencia,
              message: translateError(single.error, "No se pudo guardar el producto")
            });
          } else if (single.data && single.data.id_producto !== null && single.data.id_producto !== undefined) {
            idMap.set(item.refKey, single.data.id_producto);
          }
        }
      }

      productsDone += chunk.length;
      completedSteps += chunk.length;
      setProductImportProgress(
        completedSteps,
        totalSteps,
        "Productos: " + productsDone + " de " + importable.length
      );
    }

    const importedItems = validItems.filter((item) => idMap.has(item.refKey));
    inventoryFailures = await updateProductInventory(importedItems, idMap);

    if (hideMissing) {
      const result = await hideMissingProducts(excelReferences);
      hideResult = { hidden: result.hidden, failures: result.failures };
    }

    try {
      verification = await verifyProductImport(validItems, idMap);
    } catch (error) {
      verificationError = translateError(error, "No se pudo verificar la importación");
    }

    try {
      await loadProducts();
    } catch (error) {
      /* el informe se muestra igual */
    }

    buildProductImportPreview();
    showProductImportReport(
      importedItems.length,
      validItems.length,
      productFailures,
      imageFailures,
      inventoryFailures,
      providerFailures,
      hideResult,
      verification,
      verificationError,
      ""
    );

    const hasValidationErrors = productImportState.items.some((item) => item.errors.length);
    const hasHideErrors = !!(hideResult && hideResult.failures.length);
    if (productFailures.length || imageFailures.length || inventoryFailures.length || providerFailures.length || hasValidationErrors || hasHideErrors || (verification && verification.mismatches.length) || verificationError) {
      showToast("Importación terminada con incidencias. Revisa el informe.", "error", "Importar productos");
    } else {
      showToast("Productos importados y verificados correctamente.", "success");
    }
  } catch (error) {
    const message = translateError(error, "No se pudo completar la importación");
    showProductImportReport(idMap.size, validItems.length, productFailures, imageFailures, inventoryFailures, providerFailures, hideResult, verification, verificationError, message);
    showToast(message, "error", "Importar productos");
  } finally {
    productImportState.running = false;
    if (clearBtn) clearBtn.disabled = false;
    if (confirmBtn) {
      confirmBtn.disabled = productImportState.items.filter((item) => !item.errors.length).length === 0;
    }
  }
}

function resetProductImport() {
  productImportState.excelRows = [];
  productImportState.excelFileName = "";
  productImportState.images = [];
  productImportState.imageErrors = [];
  productImportState.items = [];
  productImportState.running = false;
  productImportState.lastReportRows = [];

  const excelInput = document.getElementById("productExcelInput");
  const imageInput = document.getElementById("productImageInput");
  if (excelInput) excelInput.value = "";
  if (imageInput) imageInput.value = "";

  const excelLabel = document.getElementById("productExcelFileName");
  const imageLabel = document.getElementById("productImageFileName");
  if (excelLabel) excelLabel.textContent = "Archivo .xlsx";
  if (imageLabel) imageLabel.textContent = "Puedes seleccionar varias imágenes";

  const summary = document.getElementById("productImportSummary");
  if (summary) summary.textContent = "";
  const imageHint = document.getElementById("productImportImageHint");
  if (imageHint) {
    imageHint.className = "import-hint";
    imageHint.textContent = "";
  }
  renderProductImportList([], [], []);

  const report = document.getElementById("productImportReport");
  if (report) {
    report.className = "import-report";
    report.textContent = "";
  }

  const progress = document.getElementById("productImportProgressWrap");
  if (progress) progress.hidden = true;
  const bar = document.getElementById("productImportProgressBar");
  if (bar) bar.style.width = "0%";
  const progressText = document.getElementById("productImportProgressText");
  if (progressText) progressText.textContent = "";

  const confirmBtn = document.getElementById("productImportConfirmBtn");
  if (confirmBtn) confirmBtn.disabled = true;
  const clearBtn = document.getElementById("productImportClearBtn");
  if (clearBtn) clearBtn.disabled = false;
  const hideInput = document.getElementById("productHideMissing");
  if (hideInput) hideInput.checked = false;
}

function bindProductEvents() {
  const templateBtn = document.getElementById("downloadProductTemplateBtn");
  if (templateBtn) templateBtn.addEventListener("click", downloadProductTemplate);

  const excelInput = document.getElementById("productExcelInput");
  if (excelInput) {
    excelInput.addEventListener("change", () => {
      const file = excelInput.files ? excelInput.files[0] : null;
      if (file) handleProductExcelFile(file);
    });
  }

  const imageInput = document.getElementById("productImageInput");
  if (imageInput) {
    imageInput.addEventListener("change", () => handleProductImageFiles(imageInput.files));
  }

  const excelDrop = document.getElementById("productExcelDrop");
  const imageDrop = document.getElementById("productImageDrop");

  function bindProductDrop(dropZone, callback) {
    if (!dropZone) return;
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("is-dragging");
      });
    });
    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("is-dragging");
      });
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove("is-dragging");
      callback(event.dataTransfer ? event.dataTransfer.files : null);
    });
  }

  bindProductDrop(excelDrop, (files) => {
    const file = files && files[0] ? files[0] : null;
    if (file) handleProductExcelFile(file);
  });

  bindProductDrop(imageDrop, (files) => handleProductImageFiles(files));

  const confirmBtn = document.getElementById("productImportConfirmBtn");
  if (confirmBtn) confirmBtn.addEventListener("click", importProductsFromExcel);

  const clearBtn = document.getElementById("productImportClearBtn");
  if (clearBtn) clearBtn.addEventListener("click", resetProductImport);
}

/* =========================================================
   VISTAS / PESTAÑAS
   ========================================================= */

function switchView(view) {
  state.view = view;

  const views = ["viewProductos", "viewPedidos", "viewResenas", "viewProveedor", "viewImportar", "viewVideos"];
  views.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === "view" + view.charAt(0).toUpperCase() + view.slice(1) ? "" : "none";
  });

  ["tabProductos", "tabPedidos", "tabResenas", "tabProveedor", "tabImportar", "tabVideos"].forEach((id) => {
    const tab = document.getElementById(id);
    if (!tab) return;
    const active = tab.getAttribute("data-view") === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (view === "pedidos" && !state.orderLoadingOnce && state.orders.length === 0) {
    loadOrders();
  }
  if (view === "resenas" && !state.reviewLoadingOnce && state.resenas.length === 0) {
    loadResenas();
  }
  if (view === "proveedor" && typeof loadProveedor === "function") {
    loadProveedor();
  }
  if (view === "videos" && !state.videoLoadingOnce) {
    loadVideos();
  }
  if (view === "importar") {
    ensureVideoIndex();
  }
}

/* =========================================================
   PEDIDOS - carga
   ========================================================= */

async function loadOrders() {
  if (state.orderLoading) return;
  state.orderLoading = true;
  showBox("ordLoadingBox", true);
  showBox("ordErrorBox", false);
  showBox("ordEmptyBox", false);
  showBox("ordTableWrap", false);
  document.getElementById("ordMobileCards").innerHTML = "";

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("pedidos")
      .select(SELECT_PEDIDOS)
      .order("fecha", { ascending: false });

    if (error) throw error;

    state.orders = Array.isArray(data) ? data : [];
    state.orderLoadingOnce = true;
    state.orderLoading = false; 
    renderOrders();
  } catch (error) {
    showBox("ordLoadingBox", false);
    showBox("ordErrorBox", true);
    document.getElementById("ordErrorMessage").textContent =
      translateError(error, "Error al consultar pedidos");
  } finally {
    state.orderLoading = false;
  }
}

function filteredOrders() {
  const term = state.orderSearch.trim().toLowerCase();
  return state.orders.filter((p) => {
    if (state.orderFilter !== "todos" && p.estado !== state.orderFilter) return false;
    if (!term) return true;
    const cliente = getCliente(p);
    return (
      String(cliente && cliente.nombre).toLowerCase().includes(term) ||
      String(cliente && cliente.telefono).toLowerCase().includes(term) ||
      String(cliente && cliente.identificacion).toLowerCase().includes(term) ||
      String(p.referencia).toLowerCase().includes(term) ||
      String(p.id_pedido).includes(term)
    );
  });
}

function renderOrders() {
   showBox("ordLoadingBox", false); 
  if (state.orderLoading) return;

  renderOrderChips();
  updateOrderStats();

  const tabCount = document.getElementById("tabPedidosCount");
  if (tabCount) tabCount.textContent = state.orders.length;

  const list = filteredOrders();
  const hasData = state.orders.length > 0;
  const hasResults = list.length > 0;

  if (!hasData) {
    showBox("ordErrorBox", false);
    showBox("ordTableWrap", false);
    document.getElementById("ordMobileCards").innerHTML = "";
    showBox("ordEmptyBox", true);
    document.getElementById("ordEmptyTitle").textContent = "Todavía no hay pedidos";
    document.getElementById("ordEmptyMessage").textContent =
      "Los pedidos aparecerán aquí solos, en tiempo real, sin recargar la página.";
    return;
  }

  if (!hasResults) {
    showBox("ordErrorBox", false);
    showBox("ordTableWrap", false);
    document.getElementById("ordMobileCards").innerHTML = "";
    showBox("ordEmptyBox", true);
    document.getElementById("ordEmptyTitle").textContent = "Sin resultados";
    document.getElementById("ordEmptyMessage").textContent =
      "Ningún pedido coincide con la búsqueda o el filtro seleccionado.";
    return;
  }

  showBox("ordEmptyBox", false);
  renderOrdersTable(list);
  renderOrdersMobile(list);
}

function renderOrderChips() {
  const cont = document.getElementById("orderChips");
  if (!cont) return;

  cont.innerHTML = ORDEN_ESTADOS.map((opt) => {
    const n = opt.value === "todos"
      ? state.orders.length
      : state.orders.filter((p) => p.estado === opt.value).length;
    return (
      '<button class="chip' + (state.orderFilter === opt.value ? " active" : "") +
      '" type="button" data-order-filter="' + opt.value + '">' +
      escapeHtml(opt.label) + '<span class="chip-n">' + n + "</span></button>"
    );
  }).join("");
}

function updateOrderStats() {
  const total = state.orders.length;
  const porCobrar = state.orders.filter((p) => p.estado === "pendiente_pago").length;
  const despacho = state.orders.filter((p) => p.estado === "en_despacho").length;
  const domicilio = state.orders.filter((p) => !isRecoge(p)).length;
  document.getElementById("ordStatTotal").textContent = total;
  document.getElementById("ordStatPendiente").textContent = porCobrar;
  document.getElementById("ordStatDespacho").textContent = despacho;
  document.getElementById("ordStatDomicilio").textContent = domicilio;
}

function entregaClass(pedido) {
  return isRecoge(pedido) ? "entrega-recoge" : "entrega-domicilio";
}

function pagoHtml(pedido) {
  const pago = getPago(pedido);
  if (!pago) return '<span class="envio-vacio">Sin registro</span>';
  const metodo = escapeHtml(pago.metodo || "-");
  const estado = escapeHtml(pago.estado || "pendiente");
  return (
    metodo + " <span class=\"badge-estado pago-" + estado + "\">" + estado.replace(/_/g, " ") + "</span>"
  );
}

function envioInfoHtml(pedido) {
  if (isRecoge(pedido)) {
    return '<span class="entrega-tag recoge">Recoge en tienda</span>';
  }
  const envio = getEnvio(pedido);
  if (!envio) return '<span class="envio-vacio">Sin envío registrado</span>';
  return (
    '<div class="entrega-tag domicilio">Domicilio</div>' +
    "<div>" + escapeHtml(envio.direccion || "Sin dirección") + "</div>"
  );
}

function envioSelectHtml(pedido) {
  if (isRecoge(pedido)) return '<span class="envio-vacio">No aplica</span>';
  const envio = getEnvio(pedido);
  const actual = envio && envio.estado ? envio.estado : "preparando";
  return (
    '<select class="envio-select" data-action="envio" data-id="' + pedido.id_pedido + '">' +
    ESTADOS_ENVIO.map(
      (e) =>
        '<option value="' + e.value + '"' +
        (e.value === actual ? " selected" : "") + ">" + e.label + "</option>"
    ).join("") +
    "</select>"
  );
}

function renderOrdersTable(list) {
  document.getElementById("ordTableBody").innerHTML = list
    .map((p) => {
      const cliente = getCliente(p);
      return (
        '<tr class="' + entregaClass(p) + '">' +
        '<td class="cell-ref">' + escapeHtml(p.referencia || p.id_pedido) + "</td>" +
        "<td><strong>" + escapeHtml((cliente && cliente.nombre) || "Sin cliente") + "</strong><br>" +
          '<small style="color:#6B7280;">ID: ' + escapeHtml((cliente && cliente.identificacion) || "-") +
          "<br>Tel: " + escapeHtml((cliente && cliente.telefono) || "-") + "</small>" +
          (p.notas ? '<br><small style="color:#6B7280;">📝 ' + escapeHtml(p.notas) + "</small>" : "") +
          "</td>" +
        '<td style="white-space:nowrap;">' + formatFecha(p.fecha) + "</td>" +
        '<td class="cell-price">' + formatPrecio(p.total) + "</td>" +
        "<td>" + pagoHtml(p) + "</td>" +
        '<td><span class="badge-estado ' + escapeHtml(p.estado || "") + '">' +
          escapeHtml(estadoPedidoLabel(p.estado)) + "</span></td>" +
        "<td>" + envioInfoHtml(p) + "</td>" +
        '<td class="cell-actions">' + envioSelectHtml(p) +
          '<button class="btn-row-action" type="button" data-action="detail" data-id="' + p.id_pedido + '">Detalle</button>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  showBox("ordTableWrap", true);
}

function renderOrdersMobile(list) {
  document.getElementById("ordMobileCards").innerHTML = list
    .map((p) => {
      const cliente = getCliente(p);
      const envio = getEnvio(p);
      return (
        '<div class="ord-card ' + entregaClass(p) + '">' +
          '<div class="ord-card-head">' +
            "<div>" +
              '<div class="entrega-tag ' + (isRecoge(p) ? "recoge" : "domicilio") + '">' +
                (isRecoge(p) ? "Recoge" : "Domicilio") + "</div>" +
              '<div class="ord-card-cliente">' + escapeHtml((cliente && cliente.nombre) || "Sin cliente") + "</div>" +
              '<div class="ord-card-ref">Ref. ' + escapeHtml(p.referencia || p.id_pedido) + "</div>" +
            "</div>" +
            '<div style="text-align:right;">' +
              '<div class="ord-card-total">' + formatPrecio(p.total) + "</div>" +
              '<span class="badge-estado ' + escapeHtml(p.estado || "") + '">' +
                escapeHtml(estadoPedidoLabel(p.estado)) + "</span>" +
            "</div>" +
          "</div>" +
          '<div class="ord-card-meta">' +
            "<span>" + escapeHtml((cliente && cliente.identificacion) || "-") + "</span>" +
            "<span>" + escapeHtml((cliente && cliente.telefono) || "-") + "</span>" +
            "<span>" + formatFecha(p.fecha) + "</span>" +
            "<span>" + pagoHtml(p) + "</span>" +
          "</div>" +
          '<div class="ord-card-envio">' +
            (isRecoge(p)
              ? "Recoge en tienda"
              : "📍 " + escapeHtml((envio && envio.direccion) || "Sin dirección")) +
          "</div>" +
          (p.notas ? '<div class="ord-card-notas">📝 ' + escapeHtml(p.notas) + "</div>" : "") +
          '<div class="ord-card-actions">' + envioSelectHtml(p) +
            '<button class="btn-row-action" type="button" data-action="detail" data-id="' + p.id_pedido + '">Ver detalle</button>' +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

/* =========================================================
   PEDIDOS - realtime
   ========================================================= */

function setRealtimeStatus(status, mensaje) {
  const bar = document.getElementById("realtimeBar");
  const text = document.getElementById("rtText");
  const btn = document.getElementById("reconnectBtn");
  if (!bar || !text) return;

  bar.classList.remove("live", "connecting", "error");
  if (status) bar.classList.add(status);
  text.textContent = mensaje;
  if (btn) btn.style.display = status === "error" ? "" : "none";
}

function unsubscribeRealtime() {
  if (state.channel) {
    try {
      getSupabase().removeChannel(state.channel);
    } catch (e) {
      /* canal ya cerrado */
    }
    state.channel = null;
  }
  setRealtimeStatus("connecting", "Conectando actualizaciones en tiempo real...");
}

function subscribeRealtime() {
  unsubscribeRealtime();

  let sb;
  try {
    sb = getSupabase();
  } catch (error) {
    setRealtimeStatus("error", "No se pudo iniciar el tiempo real: falta la conexión con Supabase.");
    return;
  }

  const reload = debounce(() => loadOrders(), 400);

  const channel = sb
    .channel("admin-pedidos")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "pedidos" },
      (payload) => {
        const ref = (payload.new && payload.new.referencia) || "";
        showToast("Nuevo pedido recibido: " + (ref || "sin referencia"), "info", "Pedido nuevo");
        reload();
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "pedidos" },
      () => reload()
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "envios" },
      () => reload()
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "envios" },
      () => reload()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setRealtimeStatus("live", "En vivo - los pedidos nuevos aparecen automáticamente.");
        loadOrders();
      } else if (status === "CHANNEL_ERROR") {
        setRealtimeStatus("error",
          "Error en el canal de tiempo real. Revisa que 'pedidos' y 'envios' estén en la " +
          "publicación supabase_realtime (ver sql/rls_admin.sql).");
      } else if (status === "TIMED_OUT") {
        setRealtimeStatus("error", "La conexión de tiempo real expiró. Usa Reintentar conexión.");
      } else if (status === "CLOSED") {
        setRealtimeStatus("error", "La conexión de tiempo real se cerró. Usa Reintentar conexión.");
      } else {
        setRealtimeStatus("connecting", "Conectando actualizaciones en tiempo real...");
      }
    });

  state.channel = channel;
}

/* =========================================================
   PEDIDOS - detalle
   ========================================================= */

async function openOrderDetail(idPedido) {
  state.openOrderId = idPedido;
  const pedido = state.orders.find((p) => String(p.id_pedido) === String(idPedido));
  if (!pedido) return;

  const cliente = getCliente(pedido);
  const envio = getEnvio(pedido);
  const pago = getPago(pedido);

  document.getElementById("ordModalTitle").textContent =
    "Pedido " + (pedido.referencia || pedido.id_pedido);
  document.getElementById("ordModalSubtitle").textContent =
    formatFecha(pedido.fecha) + (pedido.origen_whatsapp ? " - Origen: " + pedido.origen_whatsapp : "");

  const errBox = document.getElementById("ordModalError");
  errBox.classList.remove("visible");
  errBox.textContent = "";

  document.getElementById("ordModalBody").innerHTML =
    '<div class="ord-loading"><span class="spinner"></span> Cargando productos del pedido...</div>';
  document.getElementById("orderModal").classList.add("active");

  const head =
    '<div class="ord-detail-head">' +
      '<div><div class="od-label">Cliente</div><div class="od-value">' +
        escapeHtml((cliente && cliente.nombre) || "-") + "</div></div>" +
      '<div><div class="od-label">Identificación</div><div class="od-value">' +
        escapeHtml((cliente && cliente.identificacion) || "-") + "</div></div>" +
      '<div><div class="od-label">Teléfono</div><div class="od-value">' +
        escapeHtml((cliente && cliente.telefono) || "-") + "</div></div>" +
      '<div><div class="od-label">Tipo de entrega</div><div class="od-value">' +
        (isRecoge(pedido) ? "Recoge en tienda" : "Domicilio") + "</div></div>" +
      '<div><div class="od-label">Estado del pedido</div><div class="od-value">' +
        escapeHtml(estadoPedidoLabel(pedido.estado)) + "</div></div>" +
      '<div><div class="od-label">Pago</div><div class="od-value">' +
        escapeHtml((pago && pago.metodo) || "Sin registro") + " - " +
        escapeHtml((pago && pago.estado) || "-") + "</div></div>" +
      '<div><div class="od-label">Dirección</div><div class="od-value">' +
        (isRecoge(pedido)
          ? "Recoge en tienda"
          : escapeHtml((envio && envio.direccion) || "Sin dirección")) + "</div></div>" +
      '<div><div class="od-label">Notas</div><div class="od-value">' +
        escapeHtml(pedido.notas || "Ninguna") + "</div></div>" +
    "</div>";

  const body = document.getElementById("ordModalBody");

  try {
    let lineas = state.orderDetails[idPedido];

    if (!lineas) {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("detalle_pedido")
        .select(SELECT_DETALLE)
        .eq("id_pedido", idPedido);
      if (error) throw error;
      lineas = Array.isArray(data) ? data : [];
      state.orderDetails[idPedido] = lineas;
    }

    if (state.openOrderId !== idPedido) return;

    if (!lineas.length) {
      body.innerHTML = head + '<p class="envio-vacio">Este pedido no tiene productos registrados.</p>';
      return;
    }

    const rows = lineas
      .map((d) => {
        const prod = firstRel(d.productos);
        const nombre = (prod && prod.nombre) || "Producto eliminado";
        const ref = (prod && prod.referencia) || "";
        const cantidad = Number(d.cantidad || 0);
        const precio = Number(d.precio || 0);
        const subtotal = d.subtotal !== null && d.subtotal !== undefined
          ? Number(d.subtotal)
          : cantidad * precio;
        return (
          "<tr>" +
            "<td><strong>" + escapeHtml(nombre) + "</strong>" +
              (ref ? '<br><small style="color:#6B7280;">Ref. ' + escapeHtml(ref) + "</small>" : "") +
              (d.tono ? '<br><small style="color:#6B7280;">Tono: ' + escapeHtml(d.tono) + "</small>" : "") +
            "</td>" +
            '<td class="num">' + cantidad + "</td>" +
            '<td class="num">' + formatPrecio(precio) + "</td>" +
            '<td class="num">' + formatPrecio(subtotal) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    const suma = lineas.reduce((acc, d) => {
      const cantidad = Number(d.cantidad || 0);
      const precio = Number(d.precio || 0);
      const subtotal = d.subtotal !== null && d.subtotal !== undefined
        ? Number(d.subtotal)
        : cantidad * precio;
      return acc + subtotal;
    }, 0);

    let pagoActions = "";
    if (pedido.estado === "pendiente_pago") {
      pagoActions =
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">' +
          '<button class="btn btn-primary btn-sm" type="button" data-pago-action="confirmar" data-id="' + pedido.id_pedido + '">Confirmar pago</button>' +
          '<button class="btn btn-secondary btn-sm" type="button" data-pago-action="liberar" data-id="' + pedido.id_pedido + '">Cancelar / Liberar reserva</button>' +
        '</div>';
    }

    body.innerHTML =
      head +
      '<div class="order-table-wrapper"><table class="ord-lines">' +
        "<thead><tr><th>Producto</th><th style='text-align:right;'>Cant.</th>" +
        "<th style='text-align:right;'>Precio</th><th style='text-align:right;'>Subtotal</th></tr></thead>" +
        "<tbody>" + rows +
        '<tr class="tot-row"><td>Total</td><td></td><td></td><td class="num">' +
          formatPrecio(suma) + "</td></tr>" +
        "</tbody></table></div>" +
      '<p style="font-size:.78rem;color:#6B7280;margin-top:10px;">Total registrado en pedidos: ' +
        formatPrecio(pedido.total) + "</p>" +
      pagoActions;
  } catch (error) {
    if (state.openOrderId !== idPedido) return;
    body.innerHTML = head;
    const msg = translateError(error, "No se pudo cargar el detalle del pedido");
    errBox.textContent = msg;
    errBox.classList.add("visible");
  }
}

function closeOrderModal() {
  document.getElementById("orderModal").classList.remove("active");
  state.openOrderId = null;
}

/* =========================================================
   PEDIDO A PROVEEDOR
   ========================================================= */

let provCache = { lotes: [] };

function showProvBox(id, v) {
  const el = document.getElementById(id);
  if (el) el.style.display = v ? "" : "none";
}

function getProvDatos() {
  try { return JSON.parse(localStorage.getItem("auraeProvDatos") || "{}"); } catch { return {}; }
}
function openProvDatosModal() {
  const d = getProvDatos();
  document.getElementById("pdNombre").value = d.nombre || "";
  document.getElementById("pdCedula").value = d.cedula || "";
  document.getElementById("pdDir").value = d.dir || "";
  document.getElementById("pdCiudad").value = d.ciudad || "";
  document.getElementById("pdComp").value = d.comp || "";
  document.getElementById("pdCel").value = d.cel || "";
  document.getElementById("provDatosModal").classList.add("active");
}
function closeProvDatosModal() { document.getElementById("provDatosModal").classList.remove("active"); }
function saveProvDatos(e) {
  e.preventDefault();
  const d = {
    nombre: document.getElementById("pdNombre").value,
    cedula: document.getElementById("pdCedula").value,
    dir: document.getElementById("pdDir").value,
    ciudad: document.getElementById("pdCiudad").value,
    comp: document.getElementById("pdComp").value,
    cel: document.getElementById("pdCel").value
  };
  try { localStorage.setItem("auraeProvDatos", JSON.stringify(d)); } catch {}
  closeProvDatosModal();
}

function fmtFechaCO(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function limpiarTono(t) {
  if (!t) return "Sin tono";
  let s = String(t).trim();
  s = s.replace(/^\d+\.\s*/, "");
  return s || "Sin tono";
}

async function loadProveedor() {
  showProvBox("provLoadingBox", true);
  showProvBox("provErrorBox", false);
  showProvBox("provEmptyBox", false);
  showProvBox("provTableWrap", false);
  document.getElementById("provLotes").innerHTML = "";

  const estado = document.getElementById("provEstado")?.value || "pagado";
  const desde = document.getElementById("provDesde")?.value;
  const hasta = document.getElementById("provHasta")?.value;

  try {
    const sb = getSupabase();
    const [{ data: cortes }, { data: det }] = await Promise.all([
      sb.from("cortes_proveedor").select("*").order("fecha_corte", { ascending: false }),
      sb.from("detalle_pedido").select(`
        cantidad, tono,
        pedidos!inner ( id_pedido, referencia, estado, fecha ),
        productos ( id_producto, referencia, nombre, imagen_url, precio, pedidos_clientes, tonos, proveedores ( nombre ) )
      `)
    ]);

    if (!det) throw new Error("Sin datos");

    let rows = Array.isArray(det) ? det : [];
    rows = rows.filter(d => {
      const p = Array.isArray(d.pedidos) ? d.pedidos[0] : d.pedidos;
      if (!p || p.estado === "cancelado") return false;
      if (estado === "pagado" && p.estado !== "pagado") return false;
      if (estado === "pendiente_pago" && p.estado !== "pendiente_pago") return false;
      if (estado === "todos" && !["pagado","pendiente_pago","en_despacho","entregado"].includes(p.estado)) return false;
      return true;
    });

    const cortesList = (Array.isArray(cortes) ? cortes : []).filter(c => !c.anulado).sort((a,b)=> new Date(a.fecha_corte)-new Date(b.fecha_corte));
    const lastCut = cortesList.length ? cortesList[cortesList.length-1] : null;

    const lotes = [];
    const current = rows.filter(d => {
      const p = Array.isArray(d.pedidos) ? d.pedidos[0] : d.pedidos;
      if (lastCut) return new Date(p.fecha) > new Date(lastCut.fecha_corte);
      return true;
    });
    lotes.push({ type: "actual", fechaCorte: null, items: current });

    for (let i=cortesList.length-1; i>=0; i--) {
      const c = cortesList[i];
      const prev = cortesList[i-1];
      const items = rows.filter(d => {
        const p = Array.isArray(d.pedidos) ? d.pedidos[0] : d.pedidos;
        const f = new Date(p.fecha);
        const cut = new Date(c.fecha_corte);
        const pcut = prev ? new Date(prev.fecha_corte) : new Date(0);
        return f <= cut && f > pcut;
      });
      lotes.push({ type: "corte", corte: c, items });
    }

    renderLotes(lotes, desde, hasta);
  } catch (e) {
    showProvBox("provLoadingBox", false);
    showProvBox("provErrorBox", true);
    document.getElementById("provErrorMessage").textContent = translateError(e, "Error");
  }
}

function groupItems(items) {
  const map = new Map();
  let sinValor = false;
  for (const d of items) {
    const prod = Array.isArray(d.productos) ? d.productos[0] : d.productos;
    const prov = prod && prod.proveedores && (Array.isArray(prod.proveedores) ? prod.proveedores[0] : prod.proveedores);
    const tono = limpiarTono(d.tono);
    const key = (prod?.referencia || "") + "|" + tono + "|" + (prov?.nombre || "");
    if (prod && (prod.pedidos_clientes === null || prod.pedidos_clientes === undefined)) sinValor = true;
    const pc = prod?.pedidos_clientes !== null && prod?.pedidos_clientes !== undefined ? Number(prod.pedidos_clientes) : NaN;
    if (!map.has(key)) {
      map.set(key, { imagen_url: prod?.imagen_url || "", referencia: prod?.referencia || "", nombre: prod?.nombre || "", tono, cantidad_total: 0, pedidos_clientes: pc, proveedor: prov?.nombre || "" });
    }
    map.get(key).cantidad_total += Number(d.cantidad || 0);
  }
  const list = Array.from(map.values()).sort((a,b)=>(a.proveedor||"").localeCompare(b.proveedor||"")||(a.referencia||"").localeCompare(b.referencia||""));
  return { list, sinValor };
}

function renderLotes(lotes, desde, hasta) {
  showProvBox("provLoadingBox", false);
  const cont = document.getElementById("provLotes");
  if (!lotes.some(l => l.items && l.items.length)) {
    showProvBox("provEmptyBox", true);
    return;
  }
  let html = "";
  for (let idx=0; idx<lotes.length; idx++) {
    const lote = lotes[idx];
    const { list, sinValor } = groupItems(lote.items);
    if (!list.length) continue;
    if (lote.type === "actual") {
      html += "<div style='background:#F9A8D4;padding:10px 14px;border-radius:8px;margin:10px 0;font-weight:700;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;'><div>Pedido actual</div><div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap;'><input type='date' id='corteFecha' value='"+new Date().toISOString().slice(0,10)+"'><input type='text' id='corteNota' placeholder='Nota opcional'><button class='btn btn-primary btn-sm' data-marcar='actual'>Marcar como enviado</button><button class='btn btn-secondary btn-sm' data-excel='actual'>Descargar Excel</button></div></div>";
    } else {
      const c = lote.corte;
      html += "<div style='background:#F9A8D4;padding:10px 14px;border-radius:8px;margin:10px 0;font-weight:700;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;'><div>Pedido enviado: " + fmtFechaCO(c.fecha_corte) + "</div><div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap;'><button class='btn btn-secondary btn-sm' data-deshacer='"+c.id_corte+"'>Deshacer</button><button class='btn btn-secondary btn-sm' data-excel='corte:"+c.id_corte+"'>Descargar Excel</button></div></div>";
    }
    if (sinValor) html += "<div style='background:#FEF3C7;padding:8px 12px;border-radius:8px;margin-bottom:8px;color:#92400E;'>Hay productos sin Precio proveedor</div>";
    html += "<div class='admin-table-wrapper'><table class='admin-table'><thead><tr><th>Proveedor</th><th>Imagen</th><th>Referencia</th><th>Nombre</th><th>Tono / Descripción</th><th style='text-align:center;'>Cantidad total</th><th style='text-align:right;'>Precio proveedor</th><th style='text-align:right;'>Subtotal</th></tr></thead><tbody>";
    let lastProv = "", total=0;
    for (const r of list) {
      if (r.proveedor !== lastProv) { lastProv = r.proveedor; html += "<tr><td colspan='8' style='background:#F9FAFB;font-weight:700;'>"+escapeHtml(lastProv||"Sin proveedor")+"</td></tr>"; }
      const pc = r.pedidos_clientes; const sub = isNaN(pc)?0:pc*Number(r.cantidad_total||0); total += sub;
      html += "<tr><td></td><td>"+(r.imagen_url?"<img class='cell-img' src='"+escapeHtml(r.imagen_url)+"'>":"")+"</td><td class='cell-ref'>"+escapeHtml(r.referencia)+"</td><td class='cell-name'>"+escapeHtml(r.nombre)+"</td><td>"+escapeHtml(r.tono)+"</td><td style='text-align:center;'>"+r.cantidad_total+"</td><td style='text-align:right;'>"+(isNaN(pc)?"—":formatPrecio(pc))+"</td><td style='text-align:right;'>"+(isNaN(pc)?"—":formatPrecio(sub))+"</td></tr>";
    }
    html += "</tbody></table><div style='text-align:right;margin-top:10px;font-weight:700;'>Total: "+formatPrecio(total)+"</div></div>";
  }
  cont.innerHTML = html;
  showProvBox("provTableWrap", true);
}

async function deshacerCorte(id) {
  if (!confirm("¿Deshacer este corte?")) return;
  try {
    const sb = getSupabase();
    await sb.from("cortes_proveedor").update({ anulado: true }).eq("id_corte", id);
    loadProveedor();
  } catch (e) {
    alert(translateError(e, "Error"));
  }
}

function renderProveedor(list, sinValor) {
  showProvBox("provLoadingBox", false);
  const body = document.getElementById("provTableBody");
  if (!list.length) {
    showProvBox("provEmptyBox", true);
    return;
  }
  let lastProv = "";
  let html = "";
  let total = 0;
  for (const r of list) {
    if (r.proveedor !== lastProv) {
      lastProv = r.proveedor;
      html += "<tr><td colspan='8' style='background:#F9FAFB;font-weight:700;'>" + escapeHtml(lastProv || "Sin proveedor") + "</td></tr>";
    }
    const pc = r.pedidos_clientes;
    const sub = isNaN(pc) ? 0 : pc * Number(r.cantidad_total || 0);
    total += sub;
    html += "<tr>" +
      "<td></td>" +
      "<td>" + (r.imagen_url ? "<img class='cell-img' src='" + escapeHtml(r.imagen_url) + "'>" : "") + "</td>" +
      "<td class='cell-ref'>" + escapeHtml(r.referencia) + "</td>" +
      "<td class='cell-name'>" + escapeHtml(r.nombre) + "</td>" +
      "<td>" + escapeHtml(r.tono || "-") + "</td>" +
      "<td style='text-align:center;'>" + r.cantidad_total + "</td>" +
      "<td style='text-align:right;'>" + (isNaN(pc) ? "—" : formatPrecio(pc)) + "</td>" +
      "<td style='text-align:right;'>" + (isNaN(pc) ? "—" : formatPrecio(sub)) + "</td>" +
      "</tr>";
  }
  body.innerHTML = html;
  document.getElementById("provTotalGeneral").textContent = formatPrecio(total);
  if (sinValor) {
    document.getElementById("provNotaSinValor").textContent = "Hay productos sin valor en Pedidos clientes";
    document.getElementById("provNotaSinValor").style.display = "block";
  }
  showProvBox("provTableWrap", true);
}

async function descargarExcelProv(key) {
  const btn = document.querySelector("button[data-excel='"+key+"']");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "Generando Excel...";
  try {
    if (typeof ExcelJS === "undefined") throw new Error("ExcelJS no cargado");
    const wb = new ExcelJS.Workbook();
    const datos = getProvDatos();
    const sb = getSupabase();
    const [{ data: cortes }, { data: det }] = await Promise.all([
      sb.from("cortes_proveedor").select("*").order("fecha_corte", { ascending: true }),
      sb.from("detalle_pedido").select(`cantidad, tono, pedidos!inner ( id_pedido, referencia, estado, fecha ), productos ( referencia, nombre, imagen_url, precio, pedidos_clientes, tonos, proveedores ( nombre ) )`)
    ]);
    let items = [];
    let fileName = "Pedido_Proveedor_" + new Date().toISOString().slice(0,10) + ".xlsx";
    if (key === "actual") {
      const cortesList = (Array.isArray(cortes) ? cortes : []).filter(c => !c.anulado).sort((a,b)=> new Date(a.fecha_corte)-new Date(b.fecha_corte));
      const lastCut = cortesList.length ? cortesList[cortesList.length-1] : null;
      items = (Array.isArray(det)?det:[]).filter(d=>{
        const p = Array.isArray(d.pedidos)?d.pedidos[0]:d.pedidos;
        if (!p || p.estado==="cancelado") return false;
        if (lastCut) return new Date(p.fecha) > new Date(lastCut.fecha_corte);
        return true;
      });
    } else if (key.startsWith("corte:")) {
      const idc = key.split(":")[1];
      const cortesList = (Array.isArray(cortes) ? cortes : []).filter(c => !c.anulado).sort((a,b)=> new Date(a.fecha_corte)-new Date(b.fecha_corte));
      const c = cortesList.find(x=>String(x.id_corte)===String(idc));
      if (!c) throw new Error("Corte no encontrado");
      const idx = cortesList.findIndex(x=>String(x.id_corte)===String(idc));
      const prev = cortesList[idx-1];
      items = (Array.isArray(det)?det:[]).filter(d=>{
        const p = Array.isArray(d.pedidos)?d.pedidos[0]:d.pedidos;
        if (!p || p.estado==="cancelado") return false;
        const f=new Date(p.fecha); const cut=new Date(c.fecha_corte); const pcut=prev?new Date(prev.fecha_corte):new Date(0);
        return f<=cut && f>pcut;
      });
      fileName = "Pedido_Proveedor_" + (prev?new Date(prev.fecha_corte).toISOString().slice(0,10):new Date(0).toISOString().slice(0,10)) + "_al_" + new Date(c.fecha_corte).toISOString().slice(0,10) + ".xlsx";
    }
    const { list } = groupItems(items);
    const provs = {};
    for (const r of list) { const pn=r.proveedor||"Sin proveedor"; if(!provs[pn]) provs[pn]=[]; provs[pn].push(r); }
    async function fetchImageAsBase64(url){
      try {
        if (!url) return null;
        const res = await fetch(url, { mode:"cors" });
        const blob = await res.blob();
        return new Promise((resolve)=>{
          const img = new Image();
          img.crossOrigin = "anonymous";
          const reader = new FileReader();
          reader.onload = function(){
            const canvas = document.createElement("canvas");
            canvas.width=80; canvas.height=80;
            const ctx = canvas.getContext("2d");
            img.onload = function(){ ctx.drawImage(img,0,0,80,80); resolve(canvas.toDataURL("image/png")); };
            img.src = reader.result;
          };
          reader.readAsDataURL(blob);
        });
      } catch(e){ return null; }
    }
    const imgCache = {};
    async function loadImg(url){ if(!url) return null; if(imgCache[url]) return imgCache[url]; imgCache[url]=await fetchImageAsBase64(url); return imgCache[url]; }
    // limit concurrency
    const tasks = [];
    for (const pn of Object.keys(provs)){
      for (const r of provs[pn]) tasks.push({pn, r, p: loadImg(r.imagen_url)});
    }
    const results = [];
    let i=0;
    while(i<tasks.length){ const batch = tasks.slice(i,i+5); await Promise.all(batch.map(async t=>{ const d=await t.p; results.push({pn:t.pn,r:t.r,data:d}); })); i+=5; }
    const mapRes = {};
    for (const x of results){ if(!mapRes[x.pn]) mapRes[x.pn]=[]; mapRes[x.pn].push(x); }
    for (const pn of Object.keys(provs)) {
      const ws = wb.addWorksheet(pn.substring(0,31).replace(/[:\\/?*\[\]]/g,'_')||"Sin proveedor");
      ws.getCell('A1').value = "Nombre y apellido:"; ws.getCell('B1').value = datos.nombre||""; ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; ws.mergeCells('B1:F1');
      ws.getCell('A2').value = "Cédula o Nit:"; ws.getCell('B2').value = datos.cedula||""; ws.getCell('A2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; ws.mergeCells('B2:F2');
      ws.getCell('A3').value = "Dirección: Barrio:"; ws.getCell('B3').value = datos.dir||""; ws.getCell('A3').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; ws.mergeCells('B3:F3');
      ws.getCell('A4').value = "Ciudad: Complemento de dirección:"; ws.getCell('B4').value = ((datos.ciudad||"")+" "+(datos.comp||"")).trim(); ws.getCell('A4').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; ws.mergeCells('B4:F4');
      ws.getCell('A5').value = "Celular:"; ws.getCell('B5').value = datos.cel||""; ws.getCell('A5').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; ws.mergeCells('B5:F5');
      ws.addRow([]);
      ws.addRow(["Pedido del " + new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota'})]);
      ws.addRow([]);
      const hrow = ws.addRow(["IMAGEN","REFERENCIA","CANTIDAD","TONO / DESCRIPCIÓN","PRECIO PROVEEDOR","TOTAL"]);
      hrow.height = 18;
      for(let i=1;i<=6;i++){ const c=hrow.getCell(i); c.font={bold:true,name:'Calibri',size:11}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};}
      ws.columns = [{width:14},{width:14},{width:12},{width:45},{width:18},{width:16}];
      const itemsPn = mapRes[pn]||[];
      for (const it of itemsPn) {
        const r = it.r;
        const row = ws.addRow(["", r.referencia, Number(r.cantidad_total||0), r.tono, isNaN(r.pedidos_clientes)?null:Number(r.pedidos_clientes), {formula:`C${ws.rowCount+1}*E${ws.rowCount+1}`}]);
        row.height = 60;
        row.getCell(1).font={name:'Calibri',size:11};
        row.getCell(2).font={name:'Calibri',size:11};
        row.getCell(3).font={name:'Calibri',size:11};
        row.getCell(4).font={name:'Calibri',size:11};
        row.getCell(5).numFmt = '"$" #,##0';
        row.getCell(5).font={name:'Calibri',size:11};
        row.getCell(6).numFmt = '"$" #,##0';
        row.getCell(6).font={name:'Calibri',size:11};
        for(let i=1;i<=6;i++){ row.getCell(i).border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};}
        if (it.data) {
          const imgId = wb.addImage({ base64: it.data.split(',')[1], extension: 'png' });
          ws.addImage(imgId, { tl: { col: 0, row: row.number-1 }, ext: { width: 60, height: 60 } });
        } else {
          row.getCell(1).value = "sin imagen";
        }
      }
      const tr = ws.addRow(["","","","TOTAL","",""]);
      tr.getCell(4).font={bold:true,name:'Calibri',size:11};
      tr.getCell(6).font={bold:true,name:'Calibri',size:11};
      tr.getCell(6).numFmt = '"$" #,##0';
      tr.getCell(6).value = {formula:`SUM(F${hrow.number+1}:F${tr.number-1})`};
      for(let i=1;i<=6;i++){ tr.getCell(i).border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};}
      for(let i=1;i<=5;i++){ ws.getRow(i).font={name:'Calibri',size:11}; ws.getRow(i).getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFCEAFB'}}; }
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    btn.disabled=false; btn.textContent="Listo";
    setTimeout(()=>{ btn.textContent=oldText; }, 1500);
  } catch(e) { btn.disabled=false; btn.textContent=oldText; alert(e.message||e); }
}

/* =========================================================
   PEDIDOS - confirmar/liberar pago
   ========================================================= */

async function confirmarPagoPedido(idPedido) {
  if (!confirm("¿Confirmar el pago de este pedido? Esto descontará el stock reservado.")) return;
  try {
    const sb = getSupabase();
    const { error } = await sb.rpc("confirmar_pago_pedido", { p_id_pedido: Number(idPedido) });
    if (error) throw error;
    showToast("Pago confirmado. Pedido marcado como pagado.", "success");
    closeOrderModal();
    await loadOrders();
  } catch (error) {
    showToast(translateError(error, "No se pudo confirmar el pago"), "error", "Error");
  }
}

async function liberarReservaPedido(idPedido) {
  if (!confirm("¿Cancelar este pedido pendiente de pago? Se liberará la reserva de inventario.")) return;
  try {
    const sb = getSupabase();
    const { error } = await sb.rpc("liberar_reserva_pedido", { p_id_pedido: Number(idPedido) });
    if (error) throw error;
    showToast("Reserva liberada. Pedido cancelado.", "success");
    closeOrderModal();
    await loadOrders();
  } catch (error) {
    showToast(translateError(error, "No se pudo liberar la reserva"), "error", "Error");
  }
}

/* =========================================================
   PEDIDOS - actualizar estado de envío
   ========================================================= */

function lockEnvioSelect(idPedido, disabled) {
  document
    .querySelectorAll('select.envio-select[data-id="' + idPedido + '"]')
    .forEach((s) => (s.disabled = disabled));
}

async function updateEnvioEstado(idPedido, selectEl) {
  const pedido = state.orders.find((p) => String(p.id_pedido) === String(idPedido));
  if (!pedido || isRecoge(pedido)) return;

  const nuevoEstado = selectEl.value;
  const envio = getEnvio(pedido);
  const anterior = envio && envio.estado ? envio.estado : "preparando";

  if (nuevoEstado === anterior) return;

  selectEl.disabled = true;

  // Actualización optimista: se pinta al instante y se revierte si falla.
  if (envio) envio.estado = nuevoEstado;
  else pedido.envios = { direccion: null, estado: nuevoEstado, fecha_envio: null };
  renderOrders();
  lockEnvioSelect(idPedido, true);

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("envios")
      .update({ estado: nuevoEstado })
      .eq("id_pedido", idPedido)
      .select("id_envio, id_pedido, direccion, estado, fecha_envio")
      .single();

    if (error) {
      // Si el pedido no tiene fila en envios, se crea con un upsert.
      if (error.code === "PGRST116") {
        const { data: nuevo, error: errorUpsert } = await sb
          .from("envios")
          .upsert(
            { id_pedido: Number(idPedido), estado: nuevoEstado },
            { onConflict: "id_pedido" }
          )
          .select("id_envio, id_pedido, direccion, estado, fecha_envio")
          .single();
        if (errorUpsert) throw errorUpsert;
        pedido.envios = nuevo ? [nuevo] : pedido.envios;
        renderOrders();
        showToast("Envío actualizado a " + estadoEnvioLabel(nuevoEstado) + ".", "success");
        return;
      }
      throw error;
    }

    if (data) pedido.envios = [data];
    renderOrders();
    showToast("Envío actualizado a " + estadoEnvioLabel(nuevoEstado) + ".", "success");
  } catch (error) {
    // Reversión al estado anterior.
    if (envio) envio.estado = anterior;
    else pedido.envios = null;
    renderOrders();
    showToast(translateError(error, "No se pudo actualizar el envío"), "error", "Error");
  }
}

/* ---------- eventos ---------- */

function debounce(fn, delay) {
  let timer = null;
  return function () {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), delay);
  };
}

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("reloadBtn").addEventListener("click", loadProducts);
  document.getElementById("retryBtn").addEventListener("click", loadProducts);
  document.getElementById("newProductBtn").addEventListener("click", () => openProductModal(null));
  document.getElementById("productForm").addEventListener("submit", handleSubmit);
  document.getElementById("fImagen").addEventListener("input", updateImagePreview);

  document.getElementById("adminSearch").addEventListener(
    "input",
    debounce(function (e) {
      state.search = e.target.value;
      document.getElementById("adminSearchClear").classList.toggle("visible", !!state.search);
      render();
    }, 250)
  );

  document.getElementById("adminSearchClear").addEventListener("click", () => {
    const input = document.getElementById("adminSearch");
    input.value = "";
    state.search = "";
    document.getElementById("adminSearchClear").classList.remove("visible");
    render();
    input.focus();
  });

  document.getElementById("filterEstado").addEventListener("change", (e) => {
    state.filter = e.target.value;
    render();
  });

  /* --- pestañas --- */
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.getAttribute("data-view")));
  });

  document.getElementById("provDatos")?.addEventListener("click", openProvDatosModal);
  document.getElementById("provDatosClose")?.addEventListener("click", closeProvDatosModal);
  document.getElementById("provDatosCancel")?.addEventListener("click", closeProvDatosModal);
  document.getElementById("provDatosModal")?.addEventListener("click", (e) => { if (e.target.id === "provDatosModal") closeProvDatosModal(); });
  document.getElementById("provDatosForm")?.addEventListener("submit", saveProvDatos);
  document.getElementById("provEstado")?.addEventListener("change", () => { clearTimeout(window._provT); window._provT = setTimeout(loadProveedor, 300); });
  document.getElementById("provDesde")?.addEventListener("change", () => { clearTimeout(window._provT); window._provT = setTimeout(loadProveedor, 300); });
  document.getElementById("provHasta")?.addEventListener("change", () => { clearTimeout(window._provT); window._provT = setTimeout(loadProveedor, 300); });
  document.getElementById("provLotes")?.addEventListener("click", (e) => {
    const m = e.target.closest("button[data-marcar]");
    if (m) { marcarEnviado(m.dataset.marcar); return; }
    const d = e.target.closest("button[data-deshacer]");
    if (d) { deshacerCorte(d.dataset.deshacer); return; }
    const x = e.target.closest("button[data-excel]");
    if (x) { descargarExcelProv(x.dataset.excel); }
  });

  /* --- búsqueda de pedidos --- */
  document.getElementById("orderSearch").addEventListener(
    "input",
    debounce(function (e) {
      state.orderSearch = e.target.value;
      document.getElementById("orderSearchClear").classList.toggle("visible", !!state.orderSearch);
      renderOrders();
    }, 250)
  );

  document.getElementById("orderSearchClear").addEventListener("click", () => {
    const input = document.getElementById("orderSearch");
    input.value = "";
    state.orderSearch = "";
    document.getElementById("orderSearchClear").classList.remove("visible");
    renderOrders();
    input.focus();
  });

  /* --- filtros de estado (chips) --- */
  document.getElementById("orderChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-order-filter]");
    if (!chip) return;
    state.orderFilter = chip.getAttribute("data-order-filter");
    renderOrders();
  });

  /* --- reintentar realtime --- */
  document.getElementById("reconnectBtn").addEventListener("click", () => {
    setRealtimeStatus("connecting", "Reconectando...");
    subscribeRealtime();
  });

  /* --- reintentar carga de pedidos --- */
  document.getElementById("ordRetryBtn").addEventListener("click", loadOrders);

  /* --- reintentar carga de reseñas --- */
  document.getElementById("revRetryBtn").addEventListener("click", loadResenas);

  /* --- filtros de reseñas (chips) --- */
  document.getElementById("reviewChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-review-filter]");
    if (!chip) return;
    state.reviewFilter = chip.getAttribute("data-review-filter");
    renderResenas();
  });

  /* --- modal editar reseña --- */
  document.getElementById("reviewModal").addEventListener("click", (e) => {
    if (e.target.id === "reviewModal") closeReviewModal();
  });
  document.getElementById("revModalClose").addEventListener("click", closeReviewModal);
  document.getElementById("revModalCancel").addEventListener("click", closeReviewModal);
  document.getElementById("reviewFormAdmin").addEventListener("submit", handleReviewEditSubmit);

  /* --- modal detalle --- */
  document.getElementById("orderModal").addEventListener("click", (e) => {
    if (e.target.id === "orderModal") closeOrderModal();
  });
  document.getElementById("orderModalClose").addEventListener("click", closeOrderModal);
  document.getElementById("ordModalCancel").addEventListener("click", closeOrderModal);

  /* --- cambio de estado de envío (evento change, no click) --- */
  document.addEventListener("change", (e) => {
    const select = e.target.closest("select.envio-select");
    if (!select) return;
    updateEnvioEstado(select.getAttribute("data-id"), select);
  });

  document.addEventListener("click", (e) => {
    const pagoBtn = e.target.closest("button[data-pago-action]");
    if (pagoBtn) {
      const action = pagoBtn.getAttribute("data-pago-action");
      const id = pagoBtn.getAttribute("data-id");
      if (action === "confirmar" && id) confirmarPagoPedido(id);
      if (action === "liberar" && id) liberarReservaPedido(id);
      return;
    }

    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "edit") {
      const producto = state.products.find((p) => String(p.id_producto) === String(id));
      if (producto) openProductModal(producto);
    } else if (action === "toggle") {
      toggleActivo(id);
    } else if (action === "detail") {
      openOrderDetail(id);
    } else if (action === "resena-publicar") {
      setResenaEstado(id, true);
    } else if (action === "resena-ocultar") {
      setResenaEstado(id, false);
    } else if (action === "resena-editar") {
      openReviewModal(id);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("orderModal").classList.contains("active")) {
      closeOrderModal();
    } else if (document.getElementById("reviewModal").classList.contains("active")) {
      closeReviewModal();
    } else {
      closeProductModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
