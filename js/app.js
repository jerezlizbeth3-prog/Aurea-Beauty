const CATALOG_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
const SESSION_FORM_KEY = 'auraeFormDraft';

const catalogState = {
  category: 'todos',
  search: '',
  offset: 0,
  loaded: [],
  hasMore: true,
  loading: false,
  requestId: 0
};

let searchDebounceTimer = null;
let yaMostroFormulario = false;

function actualizarAltosBarraCatalogo() {
  const root = document.documentElement;
  const header = document.querySelector('.navbar') || document.querySelector('header');
  const barra = document.querySelector('.categorias-fija');
  const posicionHeader = header ? getComputedStyle(header).position : '';
  const altoHeader = header && (posicionHeader === 'fixed' || posicionHeader === 'sticky')
    ? header.getBoundingClientRect().height
    : 0;

  root.style.setProperty('--alto-header', Math.round(altoHeader) + 'px');
  root.style.setProperty('--alto-categorias', barra ? Math.round(barra.getBoundingClientRect().height) + 'px' : '0px');
}

function initStickyCatalogBar() {
  actualizarAltosBarraCatalogo();
  window.addEventListener('resize', actualizarAltosBarraCatalogo, { passive: true });
  window.addEventListener('load', actualizarAltosBarraCatalogo);
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initStickyCatalogBar();
  initCatalog();
  initOffers();
  initFormValidation();
  initDeliveryToggle();
  initCart();
  initCartSummary();
  initUserData();
  initSessionFormDraft();
  initSearch();
  initSmoothScroll();
  initReviews();
  initVideos();
  initContactFab();
  aplicarFiltroCategoriasPublico();
});

function initNavbar() {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        actualizarAltosBarraCatalogo();
        if (navLinks.classList.contains('active')) {
        let mobBtn = document.getElementById('mobVerCarro');
        if (!mobBtn) {
          mobBtn = document.createElement('button');
          mobBtn.id = 'mobVerCarro';
          mobBtn.className = 'btn-ver-carro nav-btn mob';
          mobBtn.type = 'button';
          mobBtn.setAttribute('aria-label', 'Ver carro');

          const icon = document.createElement('span');
          icon.className = 'nav-btn-icon';
          icon.setAttribute('aria-hidden', 'true');
          icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"></circle><circle cx="18" cy="20" r="1.5"></circle><path d="M2 3h2l2.4 11.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21 7H6"></path></svg>';

          const txt = document.createElement('span');
          txt.className = 'nav-btn-label';
          txt.textContent = 'Ver carro';
          const badge = document.createElement('span'); badge.className='carro-badge'; badge.id='carroBadgeMob'; badge.style.display='none'; badge.textContent='0';
          mobBtn.appendChild(icon); mobBtn.appendChild(txt); mobBtn.appendChild(badge);
          navLinks.appendChild(mobBtn);
          if (typeof updateCartBadges === 'function') updateCartBadges();
          mobBtn.addEventListener('click', () => { navLinks.classList.remove('active'); showCartView(); });

          const mobPedido = document.createElement('a');
          mobPedido.href = '#pedido';
          mobPedido.className = 'btn-pedido nav-btn mob';
          mobPedido.innerHTML = '<span class="nav-btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8z"></path><path d="M9 8V6a3 3 0 0 1 6 0v2"></path></svg></span><span class="nav-btn-label">Hacer pedido</span>';
          mobPedido.addEventListener('click', () => navLinks.classList.remove('active'));
          navLinks.appendChild(mobPedido);
        }
      }
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        actualizarAltosBarraCatalogo();
      });
    });
  }

  const btnVerCarro = document.getElementById('btnVerCarro');
  if (btnVerCarro) btnVerCarro.addEventListener('click', showCartView);
  document.getElementById('btnVerCarroForm')?.addEventListener('click', handleFormAddToCart);
  document.getElementById('btnSeguirComprando')?.addEventListener('click', goToCartCatalog);
  document.getElementById('carroBack')?.addEventListener('click', goToCartCatalog);
  document.getElementById('carroAddMore')?.addEventListener('click', goToCartCatalog);
  document.getElementById('carroVaciar')?.addEventListener('click', vaciarCarro);
  document.getElementById('carroDelSelected')?.addEventListener('click', deleteSelectedCartItems);

  document.getElementById('carroCheckAll')?.addEventListener('change', (e) => setAllCartChecks(e.target.checked));
  window.addEventListener('hashchange', () => {
    if (location.hash === '#carro') showCartView(); else hideCartView();
  });
  if (location.hash === '#carro') showCartView();
}

function initContactFab() {
  const fab = document.getElementById('contactFab');
  const toggle = document.getElementById('contactFabToggle');
  if (!fab || !toggle) return;

  function setOpen(open) {
    fab.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Cerrar medios de contacto' : 'Abrir medios de contacto');
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!fab.classList.contains('open'));
  });

  document.addEventListener('click', (e) => {
    if (fab.classList.contains('open') && !fab.contains(e.target)) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fab.classList.contains('open')) setOpen(false);
  });
}

function renderProductCards(container, list, options) {
  if (!container) return;
  container.textContent = '';
  (Array.isArray(list) ? list : []).forEach(product => {
    container.appendChild(createProductCard(product, options));
  });
}

function createProductCard(product, options) {
  const opts = options || {};
  const compact = !!opts.compact;
  const offerPrice = getValidOfferPrice(product);
  const onOffer = offerPrice !== null;
  const basePrice = getProductOldPrice(product);

  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.ref = product.reference || '';

  if (onOffer) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'OFERTA';
    card.appendChild(badge);
  }

  const img = document.createElement('img');
  img.src = product.image || '';
  img.alt = product.name || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('click', () => openLightbox(product.image, product.name));
  card.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = product.name || '';
  body.appendChild(title);

  if (!compact) {
    const ref = document.createElement('div');
    ref.className = 'card-ref';
    ref.textContent = 'Ref: ' + (product.reference || '');
    body.appendChild(ref);
  }

  const priceBox = document.createElement('div');
  priceBox.className = 'card-price precio';
  if (onOffer) {
    const oldPrice = document.createElement('span');
    oldPrice.className = 'precio-antes';
    oldPrice.textContent = formatCOP(basePrice);
    const currentPrice = document.createElement('span');
    currentPrice.className = 'precio-oferta';
    currentPrice.textContent = formatCOP(offerPrice);
    priceBox.appendChild(oldPrice);
    priceBox.appendChild(currentPrice);
  } else {
    const currentPrice = document.createElement('span');
    currentPrice.className = 'precio-normal';
    currentPrice.textContent = formatCOP(basePrice);
    priceBox.appendChild(currentPrice);
  }
  body.appendChild(priceBox);

  if (!compact) {
    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description || '';
    body.appendChild(description);

    const toneLabel = document.createElement('label');
    toneLabel.htmlFor = 'tone-' + product.id;
    toneLabel.textContent = 'Tono';
    body.appendChild(toneLabel);

    const toneSelect = document.createElement('select');
    toneSelect.id = 'tone-' + product.id;
    toneSelect.className = 'catalog-tone';
    toneSelect.dataset.ref = product.reference || '';
    const tones = Array.isArray(product.tones) ? product.tones : [];
    if (tones.length > 0) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Seleccionar tono';
      toneSelect.appendChild(placeholder);
      tones.forEach(tone => {
        const option = document.createElement('option');
        option.value = tone;
        option.textContent = tone;
        toneSelect.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '';
      toneSelect.appendChild(option);
    }
    body.appendChild(toneSelect);

    const qtyLabel = document.createElement('label');
    qtyLabel.htmlFor = 'qty-' + product.id;
    qtyLabel.textContent = 'Cantidad';
    body.appendChild(qtyLabel);

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.id = 'qty-' + product.id;
    qtyInput.className = 'catalog-qty';
    qtyInput.value = '1';
    qtyInput.min = '1';
    qtyInput.dataset.ref = product.reference || '';
    body.appendChild(qtyInput);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (compact) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.textContent = 'Agregar al pedido';
    addBtn.addEventListener('click', () => scrollToCatalogAndSelect(product.reference));
    actions.appendChild(addBtn);
  } else {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary btn-sm';
    addBtn.textContent = 'Agregar al pedido';
    addBtn.addEventListener('click', () => addFromCatalog(product.reference));
    actions.appendChild(addBtn);

    const cartBtn = document.createElement('button');
    cartBtn.type = 'button';
    cartBtn.className = 'btn btn-secondary btn-sm btn-cart-add';
    cartBtn.textContent = 'Agregar al carro';
    cartBtn.addEventListener('click', () => addCatalogToCart(product.reference));
    actions.appendChild(cartBtn);
  }

  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

function normalizeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeSearchValue(value) {
  return normalizeText(value)
    .replace(/[%,()\\]/g, ' ')
    .replace(/'/g, "''")
    .trim();
}

function mapCatalogRow(row) {
  return {
    id: row.id,
    name: row.nombre,
    category: row.categoria,
    reference: row.referencia,
    price: Number(row.precio),
    description: row.descripcion,
    image: row.imagen_url,
    tones: Array.isArray(row.tonos) ? row.tonos.map(t => String(t)) : [],
    offer: row.en_oferta === true,
    offerPrice: (row.precio_oferta !== undefined && row.precio_oferta !== null) ? Number(row.precio_oferta) : null,
    stock: (row.stock_disponible !== undefined && row.stock_disponible !== null) ? Number(row.stock_disponible) : null
  };
}

function addProductsToCatalog(list) {
  let added = false;
  (Array.isArray(list) ? list : []).forEach(product => {
    if (!product || !product.reference) return;
    if (!products.some(p => p.reference === product.reference)) {
      products.push(product);
      added = true;
    }
  });

  if (added && typeof orderItems !== 'undefined') {
    if (typeof renderTable === 'function') renderTable();
    if (typeof renderMobileCards === 'function') renderMobileCards();
  }
}

function renderLoadError(container, message) {
  if (!container) return;
  container.textContent = '';
  const error = document.createElement('div');
  error.className = 'load-error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  container.appendChild(error);
}

function getCatalogQuery(category, search) {
  let query = window.supabaseClient
    .from('catalogo_publico')
    .select('*')
    .order('referencia');

  const categoria = normalizeText(category);
  if (categoria && categoria.toLowerCase() !== 'todos') {
    query = query.ilike('categoria', categoria);
  }

  const texto = normalizeSearchValue(search);
  if (texto) {
    query = query.or(`nombre.ilike.%${texto}%,referencia.ilike.%${texto}%`);
  }

  return query;
}

function setCatalogStatus(message) {
  const status = document.getElementById('catalogStatus');
  if (!status) return;
  status.textContent = message;
  status.hidden = false;
}

function showCatalogError(message) {
  const error = document.getElementById('catalogError');
  if (!error) return;
  error.textContent = 'Error: ' + (message || 'No se pudo cargar el catálogo.');
  error.hidden = false;
}

function clearCatalogError() {
  const error = document.getElementById('catalogError');
  if (error) error.hidden = true;
}

function setCatalogEmpty(visible) {
  const empty = document.getElementById('catalogEmpty');
  if (empty) empty.hidden = !visible;
}

function setLoadMoreVisible(visible) {
  const button = document.getElementById('catalogLoadMore');
  if (button) button.hidden = !visible;
}

function resetCatalog() {
  const requestId = ++catalogState.requestId;

  catalogState.offset = 0;
  catalogState.loaded = [];
  catalogState.hasMore = true;
  catalogState.loading = false;

  const grid = document.getElementById('catalogGrid');
  if (grid) grid.textContent = '';

  clearCatalogError();
  setCatalogEmpty(false);
  setLoadMoreVisible(false);
  setCatalogStatus('Mostrando 0 productos');

  fetchCatalogPage(false, requestId);
}

async function fetchCatalogPage(append, requestId) {
  const grid = document.getElementById('catalogGrid');
  if (!window.supabaseClient) {
    showCatalogError('No hay conexión con Supabase.');
    return;
  }
  if (!grid || catalogState.loading) return;

  const button = document.getElementById('catalogLoadMore');
  catalogState.loading = true;
  if (button) button.disabled = true;
  setCatalogStatus('Cargando productos...');

  const desde = catalogState.offset;

  try {
    const { data, error } = await getCatalogQuery(catalogState.category, catalogState.search)
      .range(desde, desde + CATALOG_PAGE_SIZE - 1);

    if (requestId !== catalogState.requestId) return;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const pageProducts = rows.map(mapCatalogRow);
    addProductsToCatalog(pageProducts);

    catalogState.loaded = append ? catalogState.loaded.concat(pageProducts) : pageProducts;
    renderProductCards(grid, catalogState.loaded);

    catalogState.offset = desde + rows.length;
    catalogState.hasMore = rows.length === CATALOG_PAGE_SIZE;

    clearCatalogError();
    setCatalogStatus(`Mostrando ${catalogState.loaded.length} productos`);
    setCatalogEmpty(catalogState.loaded.length === 0);
    setLoadMoreVisible(catalogState.hasMore);
  } catch (err) {
    if (requestId !== catalogState.requestId) return;
    setCatalogStatus(`Mostrando ${catalogState.loaded.length} productos`);
    showCatalogError(err && err.message ? err.message : 'No se pudo cargar el catálogo.');
    setLoadMoreVisible(false);
  } finally {
    if (requestId === catalogState.requestId) {
      catalogState.loading = false;
      if (button) button.disabled = false;
    }
  }
}

function loadMoreCatalog() {
  if (catalogState.loading || !catalogState.hasMore) return;
  fetchCatalogPage(true, catalogState.requestId);
}

function ensureCatalogProductsVisible() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  const estilos = getComputedStyle(document.documentElement);
  const altoHeader = parseFloat(estilos.getPropertyValue('--alto-header')) || 0;
  const altoBarra = parseFloat(estilos.getPropertyValue('--alto-categorias')) || 0;

  if (grid.getBoundingClientRect().top < altoHeader + altoBarra + 1) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function initCatalog() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      catalogState.category = tab.dataset.category || 'todos';
      resetCatalog();
      tab.scrollIntoView({ inline: 'center', block: 'nearest' });
      ensureCatalogProductsVisible();
    });
  });

  document.getElementById('catalogLoadMore')?.addEventListener('click', loadMoreCatalog);
  resetCatalog();
}

async function fetchOffers() {
  const all = [];
  let desde = 0;

  while (true) {
    const { data, error } = await window.supabaseClient
      .from('catalogo_publico')
      .select('*')
      .eq('en_oferta', true)
      .order('referencia')
      .range(desde, desde + CATALOG_PAGE_SIZE - 1);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    all.push(...rows.map(mapCatalogRow));

    if (rows.length < CATALOG_PAGE_SIZE) break;
    desde += rows.length;
  }

  return all.filter(p => isProductOnOffer(p));
}

async function cargarOfertasDesdeSupabase() {
  const container = document.getElementById('offersContainer');
  if (!container || !window.supabaseClient) return;

  try {
    const list = await fetchOffers();
    addProductsToCatalog(list);
    renderProductCards(container, list, { compact: true });

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'load-error';
      empty.textContent = 'No hay ofertas especiales en este momento.';
      container.appendChild(empty);
    }
  } catch (err) {
    renderLoadError(container, 'No se pudieron cargar las ofertas: ' + (err && err.message ? err.message : ''));
  }
}

function initOffers() {
  cargarOfertasDesdeSupabase();
}

function addFromCatalog(ref) {
  const product = products.find(p => p.reference === ref);
  if (!product) return;

  const toneSelect = document.querySelector(`.catalog-tone[data-ref="${ref}"]`);
  const qtyInput = document.querySelector(`.catalog-qty[data-ref="${ref}"]`);

  const tone = toneSelect ? toneSelect.value : '';
  const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

  addRow();
  const lastIndex = orderItems.length - 1;
  orderItems[lastIndex].ref = ref;
  orderItems[lastIndex].name = product.name;
  orderItems[lastIndex].price = getProductPrice(product);
  orderItems[lastIndex].qty = qty;
  orderItems[lastIndex].tone = tone || (product.tones.length > 0 ? product.tones[0] : '');
  calculateRow(lastIndex);
  renderTable();
  renderMobileCards();
  updateFormValidity();
  updateCartBadges();

  afterProductAdded();
}

function addCatalogToCart(ref) {
  const product = products.find(p => p.reference === ref);
  if (!product) return;

  const toneSelect = document.querySelector(`.catalog-tone[data-ref="${ref}"]`);
  const qtyInput = document.querySelector(`.catalog-qty[data-ref="${ref}"]`);
  const tone = toneSelect ? toneSelect.value : '';
  const qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

  const error = validateCartSelection(product, tone, qty);
  if (error) {
    showToast(error);
    return;
  }

  addItemToCart(product, tone, qty);
  afterProductAdded();
}

function handleFormAddToCart() {
  let index = -1;
  for (let i = orderItems.length - 1; i >= 0; i--) {
    if (orderItems[i] && orderItems[i].ref) {
      index = i;
      break;
    }
  }

  if (index < 0) {
    showCartView();
    return;
  }

  const item = orderItems[index];
  const product = products.find(p => p.reference === item.ref);
  if (!product) {
    showCartView();
    return;
  }

  const tone = item.tone || '';
  const qty = Math.max(1, parseInt(item.qty, 10) || 1);
  const error = validateCartSelection(product, tone, qty);
  if (error) {
    showToast(error);
    return;
  }

  addItemToCart(product, tone, qty, index);
  afterProductAdded();
}

function scrollToCatalogAndSelect(ref) {
  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });

  document.querySelectorAll('.category-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const allTab = document.querySelector('.category-tab[data-category="todos"]');
  if (allTab) {
    allTab.classList.add('active');
    allTab.setAttribute('aria-selected', 'true');
  }

  clearTimeout(searchDebounceTimer);
  const input = document.getElementById('searchInput');
  if (input) input.value = ref || '';
  document.getElementById('searchClear')?.classList.toggle('visible', !!ref);

  catalogState.category = 'todos';
  catalogState.search = normalizeSearchValue(ref);
  resetCatalog();

  setTimeout(() => {
    const grid = document.getElementById('catalogGrid');
    if (!grid) return;
    const card = Array.from(grid.querySelectorAll('.card')).find(c => c.dataset.ref === ref);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 600);
}

function getClientFormFields() {
  return [
    { id: 'clientName', validate: v => /^[A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00E1\u00E9\u00ED\u00F3\u00FA\u00D1\u00F1\s]+$/.test(v) && v.trim().length >= 2 && v.trim().length <= 50 },
    { id: 'clientId', validate: v => /^\d{6,12}$/.test(v) },
    { id: 'clientPhone', validate: v => /^\d{7,10}$/.test(v) },
    { id: 'clientAddress', validate: v => !isAddressRequired() || (v.trim().length >= 5 && v.trim().length <= 200) },
    { id: 'clientCity', validate: v => v !== '' },
    { id: 'clientNotes', validate: v => v.length <= 300 },
    { id: 'clientPaymentMethod', validate: v => v !== '' },
    { id: 'clientDeliveryMethod', validate: v => v === 'domicilio' || v === 'recoge' }
  ];
}

function formularioCompleto() {
  return getClientFormFields().every(f => {
    const el = document.getElementById(f.id);
    return !!el && f.validate(el.value.trim());
  });
}

function afterProductAdded() {
  showCartAddedToast();

  if (formularioCompleto() || yaMostroFormulario) return;
  yaMostroFormulario = true;
  document.getElementById('pedido')?.scrollIntoView({ behavior: 'smooth' });
}

function showCartAddedToast() {
  let toast = document.getElementById('carroAviso');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'carroAviso';
    toast.className = 'app-toast cart-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = 'Producto agregado al carro';
  toast.classList.add('visible');
  clearTimeout(showCartAddedToast._t);
  showCartAddedToast._t = setTimeout(() => toast.classList.remove('visible'), 2000);
}

function initFormValidation() {
  const fields = getClientFormFields();

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (!el) return;
    el.addEventListener('input', () => {
      const group = el.closest('.form-group');
      if (f.validate(el.value.trim())) {
        group.classList.remove('error');
        group.classList.add('success');
      } else {
        group.classList.remove('success');
        group.classList.add('error');
      }
      updateFormValidity();
    });

    el.addEventListener('blur', () => {
      const group = el.closest('.form-group');
      if (!f.validate(el.value.trim())) {
        group.classList.add('error');
        group.classList.remove('success');
      }
    });
  });

  const submitBtn = document.getElementById('submitOrder');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();

      let hasErrors = false;
      fields.forEach(f => {
        const el = document.getElementById(f.id);
        const group = el.closest('.form-group');
        if (!f.validate(el.value.trim())) {
          group.classList.add('error');
          group.classList.remove('success');
          hasErrors = true;
        }
      });

      const consent = document.getElementById('clientConsent');
      if (consent && !consent.checked) {
        consent.closest('.form-group')?.classList.add('error');
        hasErrors = true;
        let consentMsg = document.getElementById('consentErrorMsg');
        if (!consentMsg) {
          consentMsg = document.createElement('div');
          consentMsg.id = 'consentErrorMsg';
          consentMsg.className = 'consent-error-msg';
          consent.closest('.form-group')?.appendChild(consentMsg);
        }
        consentMsg.textContent = 'Para finalizar tu compra debes autorizar el tratamiento de tus datos personales. Sin esta autorización no podemos procesar tu pedido.';
        consentMsg.style.display = 'block';
      } else {
        const consentMsg = document.getElementById('consentErrorMsg');
        if (consentMsg) consentMsg.style.display = 'none';
      }

      const validItems = orderItems.filter(item => item.ref && item.qty > 0);
      if (validItems.length === 0) {
        alert('Debe agregar al menos un producto al pedido.');
        hasErrors = true;
      }

      if (hasErrors) {
        const consentErr = document.getElementById('consentErrorMsg');
        if (consentErr && consentErr.style.display !== 'none') {
          document.getElementById('clientConsent')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      submitOrder();
    });
  }

      const consentInput = document.getElementById('clientConsent');
      if (consentInput) {
        consentInput.addEventListener('change', () => {
          const group = consentInput.closest('.form-group');
          if (consentInput.checked) {
            group?.classList.remove('error');
            const consentMsg = document.getElementById('consentErrorMsg');
            if (consentMsg) consentMsg.style.display = 'none';
          }
          updateFormValidity();
        });
      }
}

function isAddressRequired() {
  const el = document.getElementById('clientDeliveryMethod');
  return !el || el.value !== 'recoge';
}

function initDeliveryToggle() {
  const sel = document.getElementById('clientDeliveryMethod');
  if (sel) handleDeliveryMethodChange(sel.value || 'domicilio');
}

function handleDeliveryMethodChange(value) {
  const addressInput = document.getElementById('clientAddress');
  const addressReq = document.getElementById('addressReq');
  const deliveryBlock = document.getElementById('deliveryAddress');
  const pickupBlock = document.getElementById('pickupAddress');
  const isPickup = value === 'recoge';

  if (deliveryBlock) deliveryBlock.style.display = isPickup ? 'none' : '';
  if (pickupBlock) pickupBlock.style.display = isPickup ? 'block' : 'none';

  if (addressInput) {
    addressInput.required = !isPickup;
    const group = addressInput.closest('.form-group');
    group?.classList.remove('error', 'success');
    if (!isPickup && addressInput.value.trim().length >= 5) group?.classList.add('success');
  }
  if (addressReq) addressReq.style.display = isPickup ? 'none' : '';

  updateFormValidity();
}

function handlePaymentMethodChange(value) {
  const warning = document.getElementById('paymentWarning');
  if (warning) warning.classList.toggle('visible', value === 'Transferencia Bancolombia');
  updateFormValidity();
}

function openLightbox(src, alt) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  img.src = src;
  img.alt = alt || '';
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('reviewFormModal')?.classList.contains('active')) {
    closeReviewForm();
    return;
  }
  if (document.getElementById('reviewsModal')?.classList.contains('active')) {
    closeReviewsModal();
    return;
  }
  closeLightbox();
});

function initSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (!input) return;

  input.addEventListener('input', () => {
    clearBtn?.classList.toggle('visible', input.value.trim().length > 0);

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      catalogState.search = input.value.trim();
      resetCatalog();
    }, SEARCH_DEBOUNCE_MS);
  });
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (input) input.value = '';
  if (clearBtn) clearBtn.classList.remove('visible');

  clearTimeout(searchDebounceTimer);
  catalogState.search = '';
  resetCatalog();
}

/* =========================================================
   CATEGORÍAS VISIBLES (sitio público)
   Consulta categorias_config y oculta por completo las
   categorías marcadas como visible = false por el admin.
   El botón "todos" siempre permanece visible.
   ========================================================= */

async function aplicarFiltroCategoriasPublico() {
  const tabs = document.querySelectorAll('.category-tab');
  if (!tabs.length || !window.supabaseClient) return;

  let ocultas = new Set();

  try {
    const { data, error } = await window.supabaseClient
      .from('categorias_config')
      .select('categoria, visible');

    if (error) throw error;

    (data || []).forEach((row) => {
      if (row.visible === false && row.categoria) {
        ocultas.add(normalizeText(row.categoria).toLowerCase());
      }
    });
  } catch (err) {
    ocultas = new Set();
    console.error('Error cargando categorías visibles:', err);
    showToast('No se pudieron cargar las categorías.');
  }

  let activeHidden = false;
  tabs.forEach((tab) => {
    const cat = tab.dataset.category;
    const ocultar = cat !== 'todos' && ocultas.has(normalizeText(cat).toLowerCase());
    tab.style.display = ocultar ? 'none' : '';
    if (ocultar && tab.classList.contains('active')) activeHidden = true;
  });

  if (activeHidden) {
    tabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    const allTab = document.querySelector('.category-tab[data-category="todos"]');
    if (allTab) {
      allTab.classList.add('active');
      allTab.setAttribute('aria-selected', 'true');
    }
    catalogState.category = 'todos';
    resetCatalog();
  }
  actualizarAltosBarraCatalogo();
}

function initUserData() {
  const user = JSON.parse(localStorage.getItem('auraeUser') || 'null');

  if (user) {
    fillFormWithUser(user);
    lockFormFields(true);
    document.getElementById('userWelcome').style.display = 'flex';
    document.getElementById('userRegisterNote').style.display = 'none';
    document.getElementById('userGreeting').textContent = `\u{1F44B} Hola, ${user.name.split(' ')[0]}`;
  } else {
    lockFormFields(false);
    document.getElementById('userWelcome').style.display = 'none';
    document.getElementById('userRegisterNote').style.display = 'flex';
  }
}

function enableEditUser() {
  lockFormFields(false);
  document.getElementById('userWelcome').style.display = 'none';
  document.getElementById('userRegisterNote').style.display = 'flex';
  document.getElementById('clientName').focus();
}

function saveUserFromForm() {
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();
  const address = document.getElementById('clientAddress').value.trim();
  const city = document.getElementById('clientCity').value;

  if (!name || !phone || !city || (isAddressRequired() && !address)) {
    alert('Por favor completa todos los campos obligatorios antes de guardar.');
    return;
  }

  const user = { name, phone, address, city };
  localStorage.setItem('auraeUser', JSON.stringify(user));
  lockFormFields(true);

  document.getElementById('userRegisterNote').style.display = 'none';
  document.getElementById('userWelcome').style.display = 'flex';
  document.getElementById('userGreeting').textContent = `\u{1F44B} Hola, ${name.split(' ')[0]}`;
}

function lockFormFields(locked) {
  const fields = ['clientName','clientPhone','clientAddress','clientCity'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locked;
  });
}

function fillFormWithUser(user) {
  const map = {
    clientName: user.name,
    clientPhone: user.phone,
    clientAddress: user.address,
    clientCity: user.city
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  });
  updateFormValidity();
}

function getCamposBorradorSession() {
  return ['clientName', 'clientPhone', 'clientAddress', 'clientCity', 'clientBarrio', 'clientNotes'];
}

function guardarBorradorFormularioSession() {
  const datos = {};
  getCamposBorradorSession().forEach(id => {
    const el = document.getElementById(id);
    datos[id] = el ? el.value : '';
  });

  try {
    sessionStorage.setItem(SESSION_FORM_KEY, JSON.stringify(datos));
  } catch (err) {}
}

function initSessionFormDraft() {
  getCamposBorradorSession().forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', guardarBorradorFormularioSession);
    el.addEventListener('change', guardarBorradorFormularioSession);
  });

  let datos = null;
  try {
    const raw = sessionStorage.getItem(SESSION_FORM_KEY);
    datos = raw ? JSON.parse(raw) : null;
  } catch (err) {
    datos = null;
  }

  if (!datos || typeof datos !== 'object') return;

  getCamposBorradorSession().forEach(id => {
    const el = document.getElementById(id);
    if (el && Object.prototype.hasOwnProperty.call(datos, id)) {
      el.value = datos[id] == null ? '' : String(datos[id]);
    }
  });

  lockFormFields(false);
  const welcome = document.getElementById('userWelcome');
  if (welcome) welcome.style.display = 'none';
  const note = document.getElementById('userRegisterNote');
  if (note) note.style.display = 'flex';
  updateFormValidity();
}

function limpiarBorradorFormularioSession() {
  try {
    sessionStorage.removeItem(SESSION_FORM_KEY);
  } catch (err) {}
}

function openReviewsModal() {
  document.getElementById('reviewsModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeReviewsModal() {
  document.getElementById('reviewsModal').classList.remove('active');
  document.body.style.overflow = '';
}

function openReviewForm() {
  document.getElementById('reviewFormModal').classList.add('active');
}

function closeReviewForm() {
  document.getElementById('reviewFormModal').classList.remove('active');
}

function getSelectedRating() {
  const checked = document.querySelector('input[name="rating"]:checked');
  return checked ? parseInt(checked.value) : 0;
}

function renderReviews(list) {
  const container = document.getElementById('reviewsList');
  const empty = document.getElementById('reviewsEmpty');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  container.innerHTML = list.map(r => {
    const calificacion = parseInt(r.calificacion) || 0;
    const stars = '\u2605'.repeat(Math.max(0, Math.min(5, calificacion)));
    const comment = (r.comentario || '').toString().trim();
    const author = (r.nombre_cliente || r.nombre || '').toString().trim();
    return `
      <div class="review-card">
        <div class="review-stars">${stars}</div>
        <p>"${escapeHtml(comment)}"</p>
        ${author ? `<span class="review-author">\u2014 ${escapeHtml(author)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadReviews() {
  if (!window.supabaseClient) return;
  const { data, error } = await window.supabaseClient
    .from('resenas')
    .select('*')
    .eq('aprobada', true)
    .order('creado_en', { ascending: false });

  if (error) {
    renderReviews([]);
    return;
  }
  renderReviews(data || []);
}

async function initReviews() {
  await loadReviews();
}

async function submitReview(event) {
  event.preventDefault();

  const honeypot = document.getElementById('reviewWebsite');
  if (honeypot && honeypot.value.trim() !== '') {
    const form = document.getElementById('reviewForm');
    if (form) form.reset();
    closeReviewForm();
    return;
  }

  const nombre = document.getElementById('reviewName').value.trim();
  const comentario = document.getElementById('reviewComment').value.trim();
  const calificacion = getSelectedRating();

  if (!nombre || !comentario) return;
  if (!calificacion) {
    showToast('Selecciona una calificación de 1 a 5 estrellas.');
    return;
  }

  const btn = document.getElementById('reviewSubmitBtn');
  if (btn) btn.disabled = true;

  const { error } = await window.supabaseClient.from('resenas').insert({
    nombre_cliente: nombre,
    comentario,
    calificacion,
    aprobada: false,
    revisada: false
  });

  if (btn) btn.disabled = false;

  if (error) {
    showToast(
      error.code === '42501'
        ? 'No tienes permiso para enviar reseñas. Revisa las políticas de RLS.'
        : 'No se pudo enviar la reseña. Inténtalo de nuevo.'
    );
    return;
  }

  document.getElementById('reviewForm').reset();
  closeReviewForm();
    showToast('¡Gracias por tu opinión!');
  await loadReviews();
}

function isYoutubeUrlPublic(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') return true;
    if (host === 'www.youtube.com' || host === 'youtube.com') {
      if (u.pathname === '/watch') return true;
      if (u.pathname.startsWith('/shorts/')) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function extractYoutubeIdPublic(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be') {
      return u.pathname.replace('/', '').split('?')[0];
    }
    if (host === 'www.youtube.com' || host === 'youtube.com') {
      if (u.pathname === '/watch') {
        return u.searchParams.get('v');
      }
      if (u.pathname.startsWith('/shorts/')) {
        const parts = u.pathname.split('/');
        return parts[2] || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getYoutubeThumbPublic(id) {
  if (!id) return '';
  return 'https://img.youtube.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg';
}

function isVimeoUrlPublic(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'vimeo.com' || host === 'www.vimeo.com') return true;
    return false;
  } catch {
    return false;
  }
}

function isMp4UrlPublic(url) {
  return /\.mp4(?:$|[?#])/i.test(url);
}

function setVideoOrientation(frame, width, height) {
  if (!frame || !width || !height) return;
  frame.classList.toggle('is-vertical', height > width);
  frame.classList.toggle('is-horizontal', height <= width);
}

function detectPosterOrientation(url, frame) {
  if (!url) return;
  const probe = new Image();
  probe.onload = () => setVideoOrientation(frame, probe.naturalWidth, probe.naturalHeight);
  probe.src = url;
}

function createVideoBody(titulo, descripcion) {
  const body = document.createElement('div');
  body.className = 'video-card-body';

  const title = String(titulo || '').trim();
  const desc = String(descripcion || '').trim();

  if (title) {
    const h3 = document.createElement('h3');
    h3.className = 'video-card-title';
    h3.textContent = title;
    body.appendChild(h3);
  }

  if (desc) {
    const p = document.createElement('p');
    p.className = 'video-card-desc';
    p.textContent = desc;
    body.appendChild(p);
  }

  return body;
}

function createMp4VideoCard(videoUrl, miniaturaUrl, titulo, descripcion) {
  const card = document.createElement('article');
  card.className = 'video-card';

  const frame = document.createElement('div');
  frame.className = 'video-frame';

  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('controlsList', 'nodownload noplaybackrate');
  video.setAttribute('playsinline', '');
  video.disablePictureInPicture = true;

  const poster = String(miniaturaUrl || '').trim();
  if (poster) {
    video.setAttribute('poster', poster);
    detectPosterOrientation(poster, frame);
  } else {
    const fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.className = 'video-fallback-play';
    fallback.setAttribute('aria-label', 'Reproducir ' + (titulo || 'video'));
    fallback.textContent = '▶';
    fallback.addEventListener('click', () => {
      fallback.remove();
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
    });
    frame.appendChild(fallback);
    video.addEventListener('play', () => {
      if (fallback.parentNode) fallback.remove();
    }, { once: true });
  }

  video.addEventListener('loadedmetadata', () => {
    setVideoOrientation(frame, video.videoWidth, video.videoHeight);
  });

  video.src = videoUrl;
  frame.appendChild(video);
  card.appendChild(frame);
  card.appendChild(createVideoBody(titulo, descripcion));
  return card;
}

function createLegacyVideoCard(videoUrl, titulo, descripcion, provider) {
  const card = document.createElement('article');
  card.className = 'video-card';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'video-legacy-play';
  button.setAttribute('aria-label', 'Reproducir ' + (titulo || 'video'));
  const icon = document.createElement('span');
  icon.className = 'video-legacy-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '▶';
  const label = document.createElement('span');
  label.className = 'video-legacy-label';
  label.textContent = provider === 'youtube' ? 'YouTube' : 'Vimeo';
  button.appendChild(icon);
  button.appendChild(label);

  button.addEventListener('click', () => {
    let iframeSrc = '';
    if (provider === 'youtube') {
      const vidId = extractYoutubeIdPublic(videoUrl);
      if (vidId) iframeSrc = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vidId) + '?autoplay=1';
    } else {
      try {
        const u = new URL(videoUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        const id = parts[0];
        if (id && /^\d+$/.test(id)) iframeSrc = 'https://player.vimeo.com/video/' + encodeURIComponent(id) + '?autoplay=1';
      } catch (e) {}
    }

    if (!iframeSrc) {
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = iframeSrc;
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.className = 'video-legacy-iframe';
    button.replaceWith(iframe);
  });

  card.appendChild(button);
  card.appendChild(createVideoBody(titulo, descripcion));
  return card;
}

async function initVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('videosEmpty');
  if (!grid || !window.supabaseClient) return;

  try {
    const { data, error } = await window.supabaseClient
      .from('videos_uso')
      .select('id_video, titulo, descripcion, video_url, miniatura_url')
      .eq('activo', true)
      .order('creado_en', { ascending: false });

    if (error) throw error;

    const list = data || [];
    grid.textContent = '';

    if (!list.length) {
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    list.forEach((v) => {
      const url = String(v.video_url || '').trim();
      if (!url) return;

      const titulo = String(v.titulo || '');
      const descripcion = String(v.descripcion || '');
      const miniatura = String(v.miniatura_url || '');
      let card = null;

      if (isMp4UrlPublic(url)) {
        card = createMp4VideoCard(url, miniatura, titulo, descripcion);
      } else if (isYoutubeUrlPublic(url)) {
        card = createLegacyVideoCard(url, titulo, descripcion, 'youtube');
      } else if (isVimeoUrlPublic(url)) {
        card = createLegacyVideoCard(url, titulo, descripcion, 'vimeo');
      } else if (/^https:\/\//i.test(url)) {
        card = createMp4VideoCard(url, miniatura, titulo, descripcion);
      }

      if (card) grid.appendChild(card);
    });
  } catch (err) {
    grid.textContent = '';
    if (empty) empty.style.display = 'none';
    renderLoadError(grid, 'No se pudieron cargar los videos: ' + (err && err.message ? err.message : ''));
  }
}

function updateCartBadges() {
  const badge = document.getElementById('carroBadge');
  const badgeMob = document.getElementById('carroBadgeMob');
  let total = 0;
  if (typeof orderItems !== 'undefined') {
    for (const it of orderItems) {
      if (it && it.ref && Number(it.qty) > 0) total += Number(it.qty || 0);
    }
  }
  if (badge) {
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = 'inline-flex';
      badge.classList.remove('pulse');
      void badge.offsetWidth;
      badge.classList.add('pulse');
      setTimeout(() => badge.classList.remove('pulse'), 400);
    } else {
      badge.textContent = '0';
      badge.style.display = 'none';
    }
  }
  if (badgeMob) {
    if (total > 0) {
      badgeMob.textContent = total;
      badgeMob.style.display = 'inline-flex';
      badgeMob.classList.remove('pulse');
      void badgeMob.offsetWidth;
      badgeMob.classList.add('pulse');
      setTimeout(() => badgeMob.classList.remove('pulse'), 400);
    } else {
      badgeMob.textContent = '0';
      badgeMob.style.display = 'none';
    }
  }
  const btn = document.getElementById('btnVerCarro');
  if (btn) btn.setAttribute('aria-label', 'Ver carro, ' + total + ' productos');
  const btnForm = document.getElementById('btnVerCarroForm');
  if (btnForm) btnForm.setAttribute('aria-label', 'Agregar al carro');
  const btnFormTxt = document.getElementById('btnVerCarroFormTxt');
  if (btnFormTxt) btnFormTxt.textContent = 'Agregar al carro';
  const cc = document.getElementById('carroCount');
  if (cc) cc.textContent = '(' + total + ')';
}

function initCartSummary() {
  const formDelivery = document.getElementById('clientDeliveryMethod');
  const formPayment = document.getElementById('clientPaymentMethod');
  const sumDelivery = document.getElementById('carroDeliveryMethod');
  const sumPayment = document.getElementById('carroPaymentMethod');
  if (!formDelivery || !formPayment || !sumDelivery || !sumPayment) return;

  sumDelivery.addEventListener('change', () => {
    formDelivery.value = sumDelivery.value;
    handleDeliveryMethodChange(formDelivery.value);
    syncCartSummaryControls();
  });

  sumPayment.addEventListener('change', () => {
    formPayment.value = sumPayment.value;
    handlePaymentMethodChange(formPayment.value);
    syncCartSummaryControls();
  });

  formDelivery.addEventListener('change', syncCartSummaryControls);
  formPayment.addEventListener('change', syncCartSummaryControls);

  document.getElementById('clientForm')?.addEventListener('reset', () => {
    setTimeout(syncCartSummaryControls, 0);
  });

  syncCartSummaryControls();
}

function syncCartSummaryControls() {
  const formDelivery = document.getElementById('clientDeliveryMethod');
  const sumDelivery = document.getElementById('carroDeliveryMethod');
  if (!formDelivery || !sumDelivery) return;

  sumDelivery.value = formDelivery.value || 'domicilio';

  const deliveryWarning = document.getElementById('carroDeliveryWarning');
  if (deliveryWarning) {
    deliveryWarning.style.display = sumDelivery.value === 'recoge' ? 'none' : 'block';
  }

  const formPayment = document.getElementById('clientPaymentMethod');
  const sumPayment = document.getElementById('carroPaymentMethod');
  if (formPayment && sumPayment) {
    sumPayment.value = formPayment.value || '';
    const paymentWarning = document.getElementById('carroPaymentWarning');
    if (paymentWarning) {
      paymentWarning.classList.toggle('visible', sumPayment.value === 'Transferencia Bancolombia');
    }
  }
}

function getValidOfferPrice(prod) {
  if (!prod || prod.offer !== true) return null;

  const normalPrice = Number(prod.price);
  const offerPrice = Number(prod.offerPrice);

  if (!Number.isFinite(normalPrice) || !Number.isFinite(offerPrice)) return null;
  if (offerPrice <= 0 || offerPrice >= normalPrice) return null;

  return offerPrice;
}

function getProductPrice(prod) {
  const offerPrice = getValidOfferPrice(prod);
  if (offerPrice !== null) return offerPrice;
  return Number(prod && prod.price) || 0;
}

function getProductOldPrice(prod) {
  return Number(prod && prod.price) || 0;
}

function showCartView() {
  const view = document.getElementById('carroView');
  if (!view) return;
  if (location.hash !== '#carro') history.pushState({}, '', '#carro');
  view.classList.add('active');
  view.setAttribute('aria-hidden', 'false');
  document.body.classList.add('carro-open');
  renderCartView();
  view.scrollTop = 0;
  const back = view.querySelector('.carro-back');
  if (back) back.focus({ preventScroll: true });
}

function hideCartView() {
  const view = document.getElementById('carroView');
  if (view) {
    view.classList.remove('active');
    view.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('carro-open');
  if (location.hash === '#carro') {
    history.pushState({}, '', window.location.pathname + window.location.search);
  }
}

function goToCartCatalog() {
  hideCartView();
  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
}

function goToCartCheckout() {
  hideCartView();
  document.getElementById('pedido')?.scrollIntoView({ behavior: 'smooth' });
  const heading = document.querySelector('#pedido .form-block h3');
  if (heading) setTimeout(() => heading.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

function formatCOP(value) {
  return '$' + Number(value || 0).toLocaleString('es-CO');
}

function isProductOnOffer(prod) {
  return getValidOfferPrice(prod) !== null;
}

function getCartMaxQty(prod) {
  if (prod && prod.stock !== undefined && prod.stock !== null && prod.stock !== '') {
    const stock = Number(prod.stock);
    if (Number.isFinite(stock)) return Math.max(1, Math.min(stock, 10));
  }
  return 10;
}

function setAllCartChecks(checked) {
  document.querySelectorAll('#carroContent .carro-check').forEach(c => { c.checked = checked; });
  const all = document.getElementById('carroCheckAll');
  if (all) { all.checked = checked; all.indeterminate = false; }
}

function syncCartCheckAll() {
  const checks = Array.from(document.querySelectorAll('#carroContent .carro-check'));
  const marked = checks.filter(c => c.checked).length;
  const all = document.getElementById('carroCheckAll');
  if (!all) return;
  all.checked = checks.length > 0 && marked === checks.length;
  all.indeterminate = marked > 0 && marked < checks.length;
}

function syncCartAfterChange() {
  if (typeof renderTable === 'function') { renderTable(); renderMobileCards(); }
  if (typeof updateFormValidity === 'function') updateFormValidity();
  renderCartView();
  if (typeof guardarCarroEnStorage === 'function') guardarCarroEnStorage();
}


function deleteSelectedCartItems() {
  const checks = Array.from(document.querySelectorAll('#carroContent .carro-check:checked'));
  if (checks.length === 0) {
    alert('Marca el producto que quieres eliminar');
    return;
  }
  if (!confirm('¿Eliminar los productos seleccionados?')) return;
  const indexes = checks.map(c => Number(c.dataset.index)).filter(n => Number.isInteger(n)).sort((a, b) => b - a);
  for (const index of indexes) orderItems.splice(index, 1);
  syncCartAfterChange();
}

function limpiarTonoText(t) {
  if (!t) return '';
  let s = String(t).replace(/^\s*\d+\.\s*/, '').trim();
  return s;
}

function renderCartView() {
  updateCartBadges();
  syncCartSummaryControls();
  const cont = document.getElementById('carroContent');
  const view = document.getElementById('carroView');
  if (!cont) return;

  cont.textContent = '';

  const validItems = [];
  for (let i = 0; i < orderItems.length; i++) {
    const item = orderItems[i];
    if (item && item.ref) validItems.push({ item, index: i });
  }

  const hasItems = validItems.length > 0;
  if (view) view.classList.toggle('has-items', hasItems);

  const checkAll = document.getElementById('carroCheckAll');
  const delSel = document.getElementById('carroDelSelected');
  if (checkAll) {
    checkAll.checked = false;
    checkAll.indeterminate = false;
    checkAll.disabled = !hasItems;
  }
  if (delSel) delSel.disabled = !hasItems;

  const vaciar = document.getElementById('carroVaciar');
  if (vaciar) {
    vaciar.hidden = !hasItems;
    vaciar.style.display = hasItems ? '' : 'none';
  }

  let grandTotal = 0;

  let oldTotal = 0;
  let totalQty = 0;

  if (!hasItems) {
    const empty = document.createElement('div');
    empty.className = 'carro-empty';
    const ico = document.createElement('div');
    ico.className = 'carro-empty-ico';
    ico.textContent = '\u{1F6CD}\u{FE0F}';
    ico.setAttribute('aria-hidden', 'true');
    const msg = document.createElement('p');
    msg.className = 'carro-empty-msg';
    msg.textContent = 'Tu carrito está vacío';
    const btn = document.createElement('button');
    btn.className = 'carro-btn carro-btn-secondary';
    btn.type = 'button';
    btn.textContent = 'Ver catálogo';
    btn.onclick = goToCartCatalog;
    empty.appendChild(ico);
    empty.appendChild(msg);
    empty.appendChild(btn);
    cont.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'carro-list';

    validItems.forEach(({ item: it, index: i }) => {
    const prod = typeof products !== 'undefined' ? products.find(p => p.reference === it.ref) : null;
    const price = prod ? getProductPrice(prod) : Number(it.price || 0);
    const oldPrice = prod ? getProductOldPrice(prod) : Number(it.price || 0);
    const qty = Math.max(1, Number(it.qty || 1));
    const maxQty = getCartMaxQty(prod);
    const onOffer = isProductOnOffer(prod);
    const subtotalFila = price * qty;
    const itemName = prod?.name || it.name || 'Producto';
    const toneText = limpiarTonoText(it.tone);

    grandTotal += subtotalFila;
    oldTotal += (onOffer ? oldPrice : price) * qty;
    totalQty += qty;

    const row = document.createElement('article');
    row.className = 'carro-row';

    const checkWrap = document.createElement('label');
    checkWrap.className = 'carro-checkwrap';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'carro-check';
    check.dataset.index = String(i);
    check.setAttribute('aria-label', 'Seleccionar ' + itemName + ' para eliminar');
    check.addEventListener('change', syncCartCheckAll);
    checkWrap.appendChild(check);
    row.appendChild(checkWrap);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'carro-imgwrap';
    const img = document.createElement('img');
    img.className = 'carro-img';
    img.src = prod?.image || '';
    img.alt = itemName;
    img.loading = 'lazy';
    img.decoding = 'async';
    imgWrap.appendChild(img);
    const stock = prod ? Number(prod.stock) : NaN;
    if (Number.isFinite(stock) && stock > 0 && stock <= 10) {
      const tag = document.createElement('div');
      tag.className = 'carro-stocktag';
      tag.textContent = 'solo ' + stock + ' disponibles';
      imgWrap.appendChild(tag);
    }
    row.appendChild(imgWrap);

    const mainInfo = document.createElement('div');
    mainInfo.className = 'carro-maininfo';

    const topLine = document.createElement('div');
    topLine.className = 'carro-topline';
    const name = document.createElement('div');
    name.className = 'carro-name';
    name.textContent = itemName;
    topLine.appendChild(name);

    const delOne = document.createElement('button');
    delOne.className = 'carro-del-one';
    delOne.type = 'button';
    delOne.setAttribute('aria-label', 'Eliminar ' + itemName);
    delOne.textContent = '\u{1F5D1}';
    delOne.addEventListener('click', () => {
      if (!confirm('¿Eliminar este producto?')) return;
      orderItems.splice(i, 1);
      syncCartAfterChange();
    });
    topLine.appendChild(delOne);
    mainInfo.appendChild(topLine);

    if (toneText) {
      const tone = document.createElement('div');
      tone.className = 'carro-tone';
      tone.textContent = 'Tono: ' + toneText;
      const arrow = document.createElement('span');
      arrow.className = 'carro-tone-arrow';
      arrow.textContent = '\u203A';
      arrow.setAttribute('aria-hidden', 'true');
      tone.appendChild(arrow);
      mainInfo.appendChild(tone);
    }

    const ref = document.createElement('div');
    ref.className = 'carro-ref';
    ref.textContent = 'Ref: ' + (it.ref || '');
    mainInfo.appendChild(ref);

    const priceRow = document.createElement('div');
    priceRow.className = 'carro-pricerow';

    const priceCol = document.createElement('div');
    priceCol.className = 'carro-pricecol';
    const newPrice = document.createElement('div');
    newPrice.className = 'carro-newprice';
    newPrice.textContent = formatCOP(price);
    priceCol.appendChild(newPrice);

    if (onOffer) {
      const oldP = document.createElement('div');
      oldP.className = 'carro-oldprice';
      oldP.textContent = formatCOP(prod.price);
      priceCol.appendChild(oldP);
      const disc = Math.round((1 - Number(prod.offerPrice) / Number(prod.price)) * 100);
      if (disc > 0) {
        const discBadge = document.createElement('span');
        discBadge.className = 'carro-disc';
        discBadge.textContent = '-' + disc + '%';
        priceCol.appendChild(discBadge);
      }
    }
    priceRow.appendChild(priceCol);

    const qtyCol = document.createElement('div');
    qtyCol.className = 'carro-qtycol';
    const sel = document.createElement('select');
    sel.className = 'carro-qtysel';
    sel.setAttribute('aria-label', 'Cantidad de ' + itemName);
    for (let q = 1; q <= maxQty; q++) {
      const opt = document.createElement('option');
      opt.value = String(q);
      opt.textContent = String(q);
      if (q === qty) opt.selected = true;
      sel.appendChild(opt);
    }
    if (qty > maxQty) {
      const opt = document.createElement('option');
      opt.value = String(qty);
      opt.textContent = String(qty);
      opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      orderItems[i].qty = Number(sel.value) || 1;
      if (typeof calculateRow === 'function') calculateRow(i);
      syncCartAfterChange();
    });
    qtyCol.appendChild(sel);
    priceRow.appendChild(qtyCol);
    mainInfo.appendChild(priceRow);

    if (qty > 1) {
      const subrow = document.createElement('div');
      subrow.className = 'carro-subrow';
      subrow.textContent = 'Subtotal: ' + formatCOP(subtotalFila);
      mainInfo.appendChild(subrow);
    }

    row.appendChild(mainInfo);
    list.appendChild(row);
  });

    cont.appendChild(list);
  }

  const cc = document.getElementById('carroCount');
  if (cc) cc.textContent = '(' + totalQty + ')';

  updateCartSummaryDisplay(grandTotal, oldTotal, totalQty, hasItems);
}

function updateCartSummaryDisplay(grandTotal, oldTotal, totalQty, hasItems) {
  const save = oldTotal - grandTotal;

  const sub = document.getElementById('carroSumSub');
  if (sub) sub.textContent = formatCOP(grandTotal);

  const sp = document.getElementById('carroSumPay');
  if (sp) sp.textContent = formatCOP(grandTotal);

  const soRow = document.getElementById('carroSumOldRow');
  const so = document.getElementById('carroSumOld');
  if (soRow && so) {
    so.textContent = formatCOP(oldTotal);
    soRow.style.display = save > 0 ? 'flex' : 'none';
  }

  const sr = document.getElementById('carroSaveRow');
  const sv = document.getElementById('carroSave');
  if (sr && sv) {
    if (save > 0) {
      sr.style.display = 'flex';
      sv.textContent = formatCOP(save);
    } else {
      sr.style.display = 'none';
    }
  }

  const st = document.getElementById('carroStickyTotal');
  if (st) st.textContent = formatCOP(grandTotal);

  const sto = document.getElementById('carroStickyOld');
  if (sto) {
    sto.textContent = formatCOP(oldTotal);
    sto.style.display = save > 0 ? 'block' : 'none';
  }

  const sts = document.getElementById('carroStickySave');
  if (sts) {
    if (save > 0) {
      sts.style.display = 'block';
      sts.textContent = 'Ahorras ' + formatCOP(save);
    } else {
      sts.style.display = 'none';
    }
  }

  [document.getElementById('carroCheckout'), document.getElementById('carroCheckoutSticky')].forEach(btn => {
    if (!btn) return;
    btn.disabled = !hasItems;
    btn.textContent = 'Finalizar compra';
    btn.onclick = hasItems ? goToCartCheckout : null;
  });

  const note = document.getElementById('carroSumNote');
  if (note) {
    note.textContent = hasItems
      ? 'El total es informativo. El servidor recalcula al guardar tu pedido.'
      : 'Agrega productos para continuar';
  }
}

function openCartPanel(){ showCartView(); }
function closeCartPanel(){ hideCartView(); }

function showToast(message, duration) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('visible'), duration || 4000);
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
}

