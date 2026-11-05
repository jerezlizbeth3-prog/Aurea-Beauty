let orderItems = [];
let rowCounter = 0;

function initCart() {
  addRow();
  updateFormValidity();
}

function getProductStock(product) {
  if (!product) return null;
  const raw = product.stock;
  if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function validateCartSelection(product, tone, qty) {
  if (!product) return 'Selecciona un producto';

  const tones = Array.isArray(product.tones) ? product.tones : [];
  if (tones.length > 0 && (!tone || String(tone).trim() === '')) return 'Elige un tono';

  const stock = getProductStock(product);
  const amount = Math.max(1, parseInt(qty, 10) || 1);
  if (stock !== null && amount > stock) {
    if (stock <= 0) return 'Producto agotado';
    return 'Solo hay ' + stock + (stock === 1 ? ' disponible' : ' disponibles');
  }

  return '';
}

function addItemToCart(product, tone, qty, existingIndex) {
  if (!product) return;

  const tones = Array.isArray(product.tones) ? product.tones : [];
  const selectedTone = (tone !== undefined && tone !== null && String(tone).trim() !== '')
    ? String(tone)
    : (tones.length > 0 ? String(tones[0]) : '');
  const amount = Math.max(1, parseInt(qty, 10) || 1);

  let index = existingIndex;
  if (typeof index !== 'number' || index < 0 || index >= orderItems.length) {
    addRow();
    index = orderItems.length - 1;
  }

  const item = orderItems[index];
  item.ref = product.reference;
  item.name = product.name;
  item.price = getProductPrice(product);
  item.qty = amount;
  item.tone = selectedTone;
  calculateRow(index);

  renderTable();
  renderMobileCards();
  updateFormValidity();
  if (typeof updateCartBadges === 'function') updateCartBadges();

  const view = document.getElementById('carroView');
  if (view && view.classList.contains('active') && typeof renderCartView === 'function') {
    renderCartView();
  }
}

function addRow() {
  rowCounter++;
  const index = orderItems.length;
  orderItems.push({
    id: `row-${rowCounter}`,
    ref: '',
    name: '',
    tone: '',
    qty: 1,
    price: 0,
    subtotal: 0
  });
  renderTable();
  renderMobileCards();
  updateFormValidity();
}

function removeRow(index) {
  if (orderItems.length <= 1) return;
  orderItems.splice(index, 1);
  renderTable();
  renderMobileCards();
  updateFormValidity();
  if (typeof updateCartBadges === 'function') updateCartBadges();
}

function handleRefChange(index, ref) {
  const product = products.find(p => p.reference === ref);
  if (product) {
    orderItems[index].ref = ref;
    orderItems[index].name = product.name;
    orderItems[index].price = getProductPrice(product);
    orderItems[index].tone = product.tones.length > 0 ? product.tones[0] : '';
  } else {
    orderItems[index].ref = '';
    orderItems[index].name = '';
    orderItems[index].price = 0;
    orderItems[index].tone = '';
  }
  orderItems[index].qty = 1;
  calculateRow(index);
  renderTable();
  renderMobileCards();
  updateFormValidity();
  if (typeof updateCartBadges === 'function') updateCartBadges();
}

function handleToneChange(index, tone) {
  orderItems[index].tone = tone;
  renderTable();
  renderMobileCards();
}

function handleQtyChange(index, qty) {
  const val = parseInt(qty) || 1;
  orderItems[index].qty = Math.max(1, val);
  calculateRow(index);
  renderTable();
  renderMobileCards();
  updateFormValidity();
  if (typeof updateCartBadges === 'function') updateCartBadges();
}

function getItemUnitPrice(item) {
  const product = products.find(p => p.reference === item.ref);
  if (product && typeof getProductPrice === 'function') return getProductPrice(product);
  return Number(item.price) || 0;
}

function calculateRow(index) {
  const item = orderItems[index];
  item.price = getItemUnitPrice(item);
  item.subtotal = item.qty * item.price;
}

function getTotal() {
  return orderItems.reduce((sum, item) => {
    return sum + getItemUnitPrice(item) * (Number(item.qty) || 0);
  }, 0);
}

function isFormValid() {
  const client = getClientData();
  if (!client.name || !/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(client.name)) return false;
  if (client.name.trim().length < 2 || client.name.trim().length > 50) return false;
  if (!client.id || !/^\d{6,12}$/.test(client.id)) return false;
  if (!client.phone || !/^\d{7,10}$/.test(client.phone)) return false;
  if (typeof isAddressRequired === 'function' && isAddressRequired()) {
    if (!client.address || client.address.length < 5 || client.address.length > 200) return false;
  }
  if (!client.city) return false;
  if (!client.deliveryMethod || !client.paymentMethod) return false;

  const consent = document.getElementById('clientConsent');
  if (consent && !consent.checked) return false;

  const validItems = orderItems.filter(item => item.ref && item.qty > 0);
  if (validItems.length === 0) return false;

  return true;
}

function getClientData() {
  return {
    name: document.getElementById('clientName')?.value?.trim() || '',
    id: document.getElementById('clientId')?.value?.trim() || '',
    phone: document.getElementById('clientPhone')?.value?.trim() || '',
    address: document.getElementById('clientAddress')?.value?.trim() || '',
    city: document.getElementById('clientCity')?.value || '',
    notes: document.getElementById('clientNotes')?.value?.trim() || '',
    paymentMethod: document.getElementById('clientPaymentMethod')?.value || '',
    deliveryMethod: document.getElementById('clientDeliveryMethod')?.value || ''
  };
}

function updateFormValidity() {
  const submitBtn = document.getElementById('submitOrder');
  if (submitBtn) {
    submitBtn.disabled = !isFormValid();
  }
}

function renderTable() {
  const tbody = document.querySelector('#orderTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  orderItems.forEach((item, i) => {
    const productOptions = products.map(p =>
      `<option value="${p.reference}" ${item.ref === p.reference ? 'selected' : ''}>${p.reference} - ${p.name}</option>`
    ).join('');

    const toneOptions = (() => {
      const prod = products.find(p => p.reference === item.ref);
      if (!prod || prod.tones.length === 0) {
        return '<option value="">N/A</option>';
      }
      return prod.tones.map(t =>
        `<option value="${t}" ${item.tone === t ? 'selected' : ''}>${t}</option>`
      ).join('');
    })();

    const unitPrice = getItemUnitPrice(item);
    const subtotal = unitPrice * (Number(item.qty) || 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>
        <select onchange="handleRefChange(${i}, this.value)" aria-label="Referencia">
          <option value="">Seleccionar...</option>
          ${productOptions}
        </select>
      </td>
      <td>${item.name || '-'}</td>
      <td>
        ${item.ref && products.find(p => p.reference === item.ref && p.tones.length > 0)
          ? `<select onchange="handleToneChange(${i}, this.value)" aria-label="Tono">${toneOptions}</select>`
          : '<span>-</span>'}
      </td>
      <td>
        <input type="number" min="1" value="${item.qty}"
          onchange="handleQtyChange(${i}, this.value)"
          aria-label="Cantidad">
      </td>
      <td class="subtotal-cell">$${unitPrice.toLocaleString('es-CO')}</td>
      <td class="subtotal-cell">$${subtotal.toLocaleString('es-CO')}</td>
      <td>
        <button class="delete-btn" onclick="removeRow(${i})" aria-label="Eliminar fila">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalRow = document.createElement('tr');
  totalRow.className = 'total-row';
  totalRow.innerHTML = `
    <td colspan="6" style="text-align:right;font-weight:700;">TOTAL DEL PEDIDO</td>
    <td class="subtotal-cell total-amount">$${getTotal().toLocaleString('es-CO')}</td>
    <td></td>
  `;
  tbody.appendChild(totalRow);
}

function renderMobileCards() {
  const container = document.getElementById('orderMobileCards');
  if (!container) return;

  container.innerHTML = '';
  orderItems.forEach((item, i) => {
    const prod = products.find(p => p.reference === item.ref);
    const unitPrice = getItemUnitPrice(item);
    const subtotal = unitPrice * (Number(item.qty) || 0);
    const card = document.createElement('div');
    card.className = 'order-mobile-card';

    const toneHtml = prod && prod.tones.length > 0
      ? `<select onchange="handleToneChange(${i}, this.value)" aria-label="Tono">
          ${prod.tones.map(t => `<option value="${t}" ${item.tone === t ? 'selected' : ''}>${t}</option>`).join('')}
         </select>`
      : '<span>N/A</span>';

    card.innerHTML = `
      <button class="delete-btn" onclick="removeRow(${i})" aria-label="Eliminar fila">&times;</button>
      <div class="row">
        <label>Producto</label>
        <select onchange="handleRefChange(${i}, this.value)" aria-label="Producto">
          <option value="">Seleccionar...</option>
          ${products.map(p =>
            `<option value="${p.reference}" ${item.ref === p.reference ? 'selected' : ''}>${p.reference} - ${p.name}</option>`
          ).join('')}
        </select>
      </div>
      <div class="row">
        <label>Tono</label>
        ${toneHtml}
      </div>
      <div class="row">
        <label>Cantidad</label>
        <input type="number" min="1" value="${item.qty}" onchange="handleQtyChange(${i}, this.value)" aria-label="Cantidad">
      </div>
      <div class="row">
        <label>Precio</label>
        <span>$${unitPrice.toLocaleString('es-CO')}</span>
      </div>
      <div class="row">
        <label>Subtotal</label>
        <span>$${subtotal.toLocaleString('es-CO')}</span>
      </div>
    `;
    container.appendChild(card);
  });

  const totalDiv = document.createElement('div');
  totalDiv.className = 'order-mobile-total';
  totalDiv.innerHTML = `
    <span>TOTAL DEL PEDIDO</span>
    <span class="total-amount">$${getTotal().toLocaleString('es-CO')}</span>
  `;
  container.appendChild(totalDiv);
}
