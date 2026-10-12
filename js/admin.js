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
  categorias: [],
  catLoading: false,
  catLoadingOnce: false,
  channel: null
};

const SELECT_PRODUCTOS =
  "id_producto, referencia, nombre, descripcion, precio, imagen_url, categoria, activo, creado_en," +
  " inventario ( cantidad_disponible, cantidad_reservada )";

const SELECT_PEDIDOS =
  "id_pedido, referencia, fecha, estado, total, origen_whatsapp, tipo_entrega," +
  " clientes ( nombre, telefono, direccion, ciudad )," +
  " pagos ( metodo, estado, monto )," +
  " envios ( direccion, estado, fecha_envio )";

const SELECT_DETALLE =
  "id_detalle, cantidad, precio, subtotal, productos ( nombre, referencia )";

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

function formatFecha(valor) {
  if (!valor) return "-";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
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
      state.categorias = [];
      state.catLoadingOnce = false;
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
    state.categorias = [];
    state.catLoadingOnce = false;
    render();
    renderOrders();
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

  const payload = {
    referencia: document.getElementById("fReferencia").value.trim(),
    nombre: document.getElementById("fNombre").value.trim(),
    descripcion: document.getElementById("fDescripcion").value.trim() || null,
    precio: Number(document.getElementById("fPrecio").value),
    imagen: document.getElementById("fImagen").value.trim() || null,
    categoria: document.getElementById("fCategoria").value.trim(),
    activo: document.getElementById("fActivo").checked
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
   CATEGORÍAS - carga y visibilidad
   La tabla categorias_config (categoria TEXT PK, visible BOOLEAN)
   decide qué categorías se muestran en el sitio público.
   Nunca se borra una fila: solo cambia "visible".
   ========================================================= */

function catVisible(cat) {
  return !!cat.visible;
}

async function loadCategorias() {
  if (state.catLoading) return;
  state.catLoading = true;
  showBox("catLoadingBox", true);
  showBox("catErrorBox", false);
  showBox("catEmptyBox", false);
  showBox("catTableWrap", false);
  document.getElementById("catMobileCards").innerHTML = "";

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("categorias_config")
      .select("categoria, visible")
      .order("categoria", { ascending: true });

    if (error) throw error;

    state.categorias = Array.isArray(data) ? data : [];
    state.catLoadingOnce = true;
    renderCategorias();
  } catch (error) {
    showBox("catLoadingBox", false);
    showBox("catErrorBox", true);
    document.getElementById("catErrorMessage").textContent =
      translateError(error, "Error al consultar categorías");
  } finally {
    state.catLoading = false;
  }
}

function renderCategorias() {
  showBox("catLoadingBox", false);
  if (state.catLoading) return;

  const list = state.categorias;

  if (!list.length) {
    showBox("catErrorBox", false);
    showBox("catTableWrap", false);
    document.getElementById("catMobileCards").innerHTML = "";
    showBox("catEmptyBox", true);
    return;
  }

  showBox("catEmptyBox", false);
  renderCategoriasTable(list);
  renderCategoriasMobile(list);
}

function toggleButtonHtml(cat) {
  const visible = catVisible(cat);
  return (
    '<button class="btn-row-action' + (visible ? " warn" : "") + '" type="button" data-action="cat-toggle" data-cat="' +
    escapeHtml(cat.categoria) + '">' + (visible ? "Ocultar" : "Mostrar") + "</button>"
  );
}

function renderCategoriasTable(list) {
  document.getElementById("catTableBody").innerHTML = list
    .map((c) => {
      const visible = catVisible(c);
      return (
        "<tr" + (visible ? "" : ' class="is-hidden"') + ">" +
        "<td><strong>" + escapeHtml(c.categoria) + "</strong></td>" +
        '<td><span class="badge ' + (visible ? "visible" : "oculto") + '">' +
          (visible ? "Visible" : "Oculta") + "</span></td>" +
        '<td class="cell-actions">' + toggleButtonHtml(c) + "</td>" +
        "</tr>"
      );
    })
    .join("");

  showBox("catTableWrap", true);
}

function renderCategoriasMobile(list) {
  document.getElementById("catMobileCards").innerHTML = list
    .map((c) => {
      const visible = catVisible(c);
      return (
        '<div class="m-card"' + (visible ? "" : ' style="opacity:.6"') + ">" +
          '<div class="m-card-body">' +
            '<div class="m-card-top">' +
              '<div class="m-card-name">' + escapeHtml(c.categoria) + "</div>" +
              '<span class="badge ' + (visible ? "visible" : "oculto") + '">' +
                (visible ? "Visible" : "Oculta") + "</span>" +
            "</div>" +
            '<div class="m-card-actions">' + toggleButtonHtml(c) + "</div>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

async function toggleCategoria(categoria) {
  const cat = state.categorias.find((c) => String(c.categoria) === String(categoria));
  if (!cat) return;

  const nuevoValor = !catVisible(cat);

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("categorias_config")
      .update({ visible: nuevoValor })
      .eq("categoria", categoria)
      .select("categoria, visible")
      .single();

    if (error) throw error;

    if (data) cat.visible = data.visible;
    renderCategorias();
    showToast(
      nuevoValor
        ? "La categoría '" + cat.categoria + "' ya es visible en la tienda."
        : "La categoría '" + cat.categoria + "' se ocultó de la tienda.",
      "success"
    );
  } catch (error) {
    showToast(translateError(error, "No se pudo cambiar la visibilidad de la categoría"), "error", "Error");
  }
}

/* =========================================================
   VISTAS / PESTAÑAS
   ========================================================= */

function switchView(view) {
  state.view = view;

  const views = ["viewProductos", "viewPedidos", "viewCategorias"];
  views.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === "view" + view.charAt(0).toUpperCase() + view.slice(1) ? "" : "none";
  });

  ["tabProductos", "tabPedidos", "tabCategorias"].forEach((id) => {
    const tab = document.getElementById(id);
    if (!tab) return;
    const active = tab.getAttribute("data-view") === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (view === "pedidos" && !state.orderLoadingOnce && state.orders.length === 0) {
    loadOrders();
  }
  if (view === "categorias" && !state.catLoadingOnce && state.categorias.length === 0) {
    loadCategorias();
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
          '<small style="color:#6B7280;">' + escapeHtml((cliente && cliente.telefono) || "-") + "</small></td>" +
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
            "<span>" + escapeHtml((cliente && cliente.telefono) || "-") + "</span>" +
            "<span>" + formatFecha(p.fecha) + "</span>" +
            "<span>" + pagoHtml(p) + "</span>" +
          "</div>" +
          '<div class="ord-card-envio">' +
            (isRecoge(p)
              ? "Recoge en tienda"
              : "📍 " + escapeHtml((envio && envio.direccion) || "Sin dirección")) +
          "</div>" +
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
        formatPrecio(pedido.total) + "</p>";
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

  /* --- reintentar carga de categorías --- */
  document.getElementById("catRetryBtn").addEventListener("click", loadCategorias);

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
    } else if (action === "cat-toggle") {
      toggleCategoria(btn.getAttribute("data-cat"));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("orderModal").classList.contains("active")) {
      closeOrderModal();
    } else {
      closeProductModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
