document.addEventListener('DOMContentLoaded', async () => {
  await cargarProductosDesdeSupabase();
  initNavbar();
  initCatalog();
  initOffers();
  initFormValidation();
  initCart();
  initUserData();
  initSearch();
  initSmoothScroll();
  initReviews();
  initVideos();
  await aplicarFiltroCategoriasPublico();
});

function initNavbar() {
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
      });
    });
  }
}

function initOffers() {
  const container = document.getElementById('offersContainer');
  if (!container) return;

  const offerProducts = products.filter(p => p.offer);

  container.innerHTML = offerProducts.map(p => `
    <div class="card">
      <span class="badge">OFERTA</span>
      <img src="${p.image}" alt="${p.name}" loading="lazy">
      <div class="card-body">
        <h3>${p.name}</h3>
        <div class="price">
          <span class="old">$${p.price.toLocaleString('es-CO')}</span>
          <span class="current">$${(p.offerPrice || p.price).toLocaleString('es-CO')}</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="scrollToCatalogAndSelect('${p.reference}')">
          Agregar al pedido
        </button>
      </div>
    </div>
  `).join('');
}

function initCatalog() {
  const grid = document.getElementById('catalogGrid');
  const tabs = document.querySelectorAll('.category-tab');
  if (!grid) return;

  function renderProducts(list) {
    grid.innerHTML = list.map(p => {
      const toneOptions = p.tones.length > 0
        ? `<option value="">Seleccionar tono</option>
           ${p.tones.map(t => `<option value="${t}">${t}</option>`).join('')}`
        : '<option value=""></option>';

      return `
        <div class="card">
          <img src="${p.image}" alt="${p.name}" loading="lazy" onclick="openLightbox('${p.image}', '${p.name}')" style="cursor:zoom-in">
          <div class="card-body">
            <div class="card-title">${p.name}</div>
            <div class="card-ref">Ref: ${p.reference}</div>
            <div class="card-price">$${p.price.toLocaleString('es-CO')}</div>
            <p class="product-description">${p.description || ''}</p>
            <label for="tone-${p.id}">Tono</label>
            <select id="tone-${p.id}" class="catalog-tone" data-ref="${p.reference}">
              ${toneOptions}
            </select>
            <label for="qty-${p.id}">Cantidad</label>
            <input type="number" id="qty-${p.id}" class="catalog-qty" value="1" min="1" data-ref="${p.reference}">
            <button class="btn btn-primary btn-sm" onclick="addFromCatalog('${p.reference}')">
              Agregar al pedido
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function getFiltered(category, query) {
    return products.filter(p => {
      const matchCat = category === 'todos' || p.category === category;
      const matchSearch = !query || p.name.toLowerCase().includes(query) || p.reference.toLowerCase().includes(query);
      return matchCat && matchSearch;
    });
  }

  function render(category) {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    renderProducts(getFiltered(category, query));
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      render(tab.dataset.category);
    });
  });

  render('todos');
}

function renderFiltered(list) {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;
  grid.innerHTML = list.map(p => {
    const toneOptions = p.tones.length > 0
      ? `<option value="">Seleccionar tono</option>
         ${p.tones.map(t => `<option value="${t}">${t}</option>`).join('')}`
      : '<option value=""></option>';
    return `
      <div class="card">
        <img src="${p.image}" alt="${p.name}" loading="lazy" onclick="openLightbox('${p.image}', '${p.name}')" style="cursor:zoom-in">
        <div class="card-body">
          <div class="card-title">${p.name}</div>
          <div class="card-ref">Ref: ${p.reference}</div>
          <div class="card-price">$${p.price.toLocaleString('es-CO')}</div>
          <p class="product-description">${p.description || ''}</p>
          <label for="tone-${p.id}">Tono</label>
          <select id="tone-${p.id}" class="catalog-tone" data-ref="${p.reference}">
            ${toneOptions}
          </select>
          <label for="qty-${p.id}">Cantidad</label>
          <input type="number" id="qty-${p.id}" class="catalog-qty" value="1" min="1" data-ref="${p.reference}">
          <button class="btn btn-primary btn-sm" onclick="addFromCatalog('${p.reference}')">
            Agregar al pedido
          </button>
        </div>
      </div>
    `;
  }).join('');
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
  orderItems[lastIndex].price = product.price;
  orderItems[lastIndex].qty = qty;
  orderItems[lastIndex].tone = tone || (product.tones.length > 0 ? product.tones[0] : '');
  calculateRow(lastIndex);
  renderTable();
  renderMobileCards();
  updateFormValidity();

  document.getElementById('pedido').scrollIntoView({ behavior: 'smooth' });
}

function scrollToCatalogAndSelect(ref) {
  document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });

  document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
  const allTab = document.querySelector('.category-tab[data-category="todos"]');
  if (allTab) allTab.classList.add('active');

  const grid = document.getElementById('catalogGrid');
  if (grid) {
    const filtered = products.filter(p => p.offer);
    grid.innerHTML = filtered.map(p => {
      const toneOptions = p.tones.length > 0
        ? `<option value="">Seleccionar tono</option>
           ${p.tones.map(t => `<option value="${t}">${t}</option>`).join('')}`
        : '<option value="">N/A</option>';

      return `
        <div class="card">
          <img src="${p.image}" alt="${p.name}" loading="lazy" onclick="openLightbox('${p.image}', '${p.name}')" style="cursor:zoom-in">
          <div class="card-body">
            <div class="card-title">${p.name}</div>
            <div class="card-ref">Ref: ${p.reference}</div>
            <div class="card-price">$${p.price.toLocaleString('es-CO')}</div>
            <label for="tone-${p.id}">Tono</label>
            <select id="tone-${p.id}" class="catalog-tone" data-ref="${p.reference}">
              ${toneOptions}
            </select>
            <label for="qty-${p.id}">Cantidad</label>
            <input type="number" id="qty-${p.id}" class="catalog-qty" value="1" min="1" data-ref="${p.reference}">
            <button class="btn btn-primary btn-sm" onclick="addFromCatalog('${p.reference}')">
              Agregar al pedido
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  setTimeout(() => {
    const el = document.querySelector(`.btn-primary[onclick*="${ref}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
}

function initFormValidation() {
  const fields = [
    { id: 'clientName', validate: v => /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(v) && v.trim().length > 0 },
    { id: 'clientPhone', validate: v => /^\d{7,10}$/.test(v) },
    { id: 'clientAddress', validate: v => !isAddressRequired() || v.length > 0 },
    { id: 'clientCity', validate: v => v !== '' },
    { id: 'clientPaymentMethod', validate: v => v !== '' },
    { id: 'clientDeliveryMethod', validate: v => v === 'domicilio' || v === 'recoge' }
  ];

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

      const validItems = orderItems.filter(item => item.ref && item.qty > 0);
      if (validItems.length === 0) {
        alert('Debe agregar al menos un producto al pedido.');
        hasErrors = true;
      }

      if (hasErrors) return;
      submitOrder();
    });
  }
}

function isAddressRequired() {
  const el = document.getElementById('clientDeliveryMethod');
  return !el || el.value !== 'recoge';
}

function handleDeliveryMethodChange(value) {
  const addressInput = document.getElementById('clientAddress');
  const addressReq = document.getElementById('addressReq');
  const pickupBlock = document.getElementById('pickupAddress');
  const isPickup = value === 'recoge';

  if (addressInput) {
    addressInput.required = !isPickup;
    addressInput.closest('.form-group')?.classList.remove('error', 'success');
    if (isAddressRequired() && addressInput.value.trim()) {
      addressInput.closest('.form-group')?.classList.add('success');
    }
  }
  if (addressReq) addressReq.style.display = isPickup ? 'none' : '';
  if (pickupBlock) pickupBlock.style.display = isPickup ? 'block' : 'none';

  updateFormValidity();
}

function handlePaymentMethodChange(value) {
  const warning = document.getElementById('paymentWarning');
  if (warning) warning.classList.toggle('visible', value.startsWith('Transferencia'));
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
    const query = input.value.toLowerCase().trim();
    clearBtn.classList.toggle('visible', query.length > 0);

    const activeTab = document.querySelector('.category-tab.active');
    const category = activeTab ? activeTab.dataset.category : 'todos';

    const filtered = products.filter(p => {
      const matchCat = category === 'todos' || p.category === category;
      const matchSearch = !query ||
        p.name.toLowerCase().includes(query) ||
        p.reference.toLowerCase().includes(query);
      return matchCat && matchSearch;
    });

    renderFiltered(filtered);
  });
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  if (input) input.value = '';
  if (clearBtn) clearBtn.classList.remove('visible');
  const activeTab = document.querySelector('.category-tab.active');
  const category = activeTab ? activeTab.dataset.category : 'todos';
  renderFiltered(category === 'todos' ? products : products.filter(p => p.category === category));
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
        ocultas.add(String(row.categoria).trim().toLowerCase());
      }
    });
  } catch (err) {
    ocultas = new Set();
  }

  let activeHidden = false;
  tabs.forEach((tab) => {
    const cat = tab.dataset.category;
    const ocultar = cat !== 'todos' && ocultas.has(String(cat || '').trim().toLowerCase());
    tab.style.display = ocultar ? 'none' : '';
    if (ocultar && tab.classList.contains('active')) activeHidden = true;
  });

  if (activeHidden) {
    tabs.forEach((t) => t.classList.remove('active'));
    const allTab = document.querySelector('.category-tab[data-category="todos"]');
    if (allTab) allTab.classList.add('active');
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filtered = query
      ? products.filter(p => p.name.toLowerCase().includes(query) || p.reference.toLowerCase().includes(query))
      : products;
    renderFiltered(filtered);
  }
}

function initUserData() {
  const user = JSON.parse(localStorage.getItem('auraeUser') || 'null');

  if (user) {
    fillFormWithUser(user);
    lockFormFields(true);
    document.getElementById('userWelcome').style.display = 'flex';
    document.getElementById('userRegisterNote').style.display = 'none';
    document.getElementById('userGreeting').textContent = `👋 Hola, ${user.name.split(' ')[0]}`;
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
  const id = document.getElementById('clientId')?.value.trim() || '';
  const address = document.getElementById('clientAddress').value.trim();
  const city = document.getElementById('clientCity').value;

  if (!name || !phone || !city || (isAddressRequired() && !address)) {
    alert('Por favor completa todos los campos obligatorios antes de guardar.');
    return;
  }

  const user = { name, phone, id, address, city };
  localStorage.setItem('auraeUser', JSON.stringify(user));
  lockFormFields(true);

  document.getElementById('userRegisterNote').style.display = 'none';
  document.getElementById('userWelcome').style.display = 'flex';
  document.getElementById('userGreeting').textContent = `👋 Hola, ${name.split(' ')[0]}`;
}

function lockFormFields(locked) {
  const fields = ['clientName','clientPhone','clientId','clientAddress','clientCity'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locked;
  });
}

function fillFormWithUser(user) {
  const map = {
    clientName: user.name,
    clientPhone: user.phone,
    clientId: user.id,
    clientAddress: user.address,
    clientCity: user.city
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  });
  updateFormValidity();
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
    const stars = '⭐'.repeat(Math.max(0, Math.min(5, calificacion)));
    const comment = (r.comentario || '').toString().trim();
    const author = (r.nombre || '').toString().trim();
    return `
      <div class="review-card">
        <div class="review-stars">${stars}</div>
        <p>"${escapeHtml(comment)}"</p>
        ${author ? `<span class="review-author">— ${escapeHtml(author)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return str
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
    nombre,
    comentario,
    calificacion
  });

  if (btn) btn.disabled = false;

  if (error) {
    showToast(
      error.code === '42501'
        ? 'No tienes permiso para enviar reseñas. Revisa las políticas de RLS.'
        : `No se pudo enviar la reseña: ${error.message}`
    );
    return;
  }

  document.getElementById('reviewForm').reset();
  closeReviewForm();
  showToast('¡Gracias! Tu reseña será publicada pronto.');
  await loadReviews();
}

async function initVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('videosEmpty');
  if (!grid || !window.supabaseClient) return;

  const { data, error } = await window.supabaseClient
    .from('videos_uso')
    .select('*')
    .eq('activo', true)
    .order('creado_en', { ascending: false });

  const list = error ? [] : (data || []);

  if (!list.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.innerHTML = list.map(v => `
    <div class="video-card">
      <video controls preload="metadata" playsinline src="${escapeHtml((v.video_url || '').toString())}"></video>
      <div class="video-card-body">
        ${v.titulo ? `<h3>${escapeHtml(v.titulo.toString())}</h3>` : ''}
        ${v.descripcion ? `<p>${escapeHtml(v.descripcion.toString())}</p>` : ''}
      </div>
    </div>
  `).join('');
}

function showToast(message) {
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
  showToast._t = setTimeout(() => toast.classList.remove('visible'), 4000);
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
