const WHATSAPP_NUMBER = "573170518355";
let orderSubmitting = false;

function getOrderFormValues() {
  return {
    name: document.getElementById('clientName')?.value.trim() || '',
    id: document.getElementById('clientId')?.value.trim() || '',
    phone: document.getElementById('clientPhone')?.value.trim() || '',
    address: document.getElementById('clientAddress')?.value.trim() || '',
    city: document.getElementById('clientCity')?.value || '',
    notes: document.getElementById('clientNotes')?.value.trim() || '',
    paymentMethod: document.getElementById('clientPaymentMethod')?.value || '',
    deliveryMethod: document.getElementById('clientDeliveryMethod')?.value || 'domicilio'
  };
}

function validateOrder(client, items) {
  if (client.name.length < 2 || client.name.length > 50) {
    return 'El nombre debe tener entre 2 y 50 caracteres.';
  }
  if (!/^\d{6,12}$/.test(client.id)) {
    return 'La identificación debe tener entre 6 y 12 dígitos.';
  }
  if (!/^\d{7,10}$/.test(client.phone)) {
    return 'El teléfono debe tener entre 7 y 10 dígitos.';
  }
  if (!client.city) {
    return 'Debes seleccionar una ciudad.';
  }
  if (client.deliveryMethod === 'domicilio' &&
      (client.address.length < 5 || client.address.length > 200)) {
    return 'La dirección debe tener entre 5 y 200 caracteres.';
  }
  if (client.notes.length > 300) {
    return 'Las observaciones no pueden superar 300 caracteres.';
  }
  if (!client.paymentMethod) {
    return 'Debes seleccionar un método de pago.';
  }
  if (!items.length) {
    return 'Debes agregar al menos un producto al pedido.';
  }
  return '';
}

function buildWhatsAppMessage(client, items, referencia, total, notRegistered) {
  const itemsText = items.map((item, i) =>
    `  ${i+1}. Ref: ${item.ref} | ${item.name} | Tono: ${item.tone || 'N/A'} | Cant: ${item.qty}`
  ).join('\n');

  const esDomicilio = client.deliveryMethod !== 'recoge';
  const entregaText = esDomicilio
    ? `• Dirección: ${client.address}\n• Ciudad: ${client.city}`
    : `• Entrega: Recoger en tienda\n• Ciudad: ${client.city}`;

  const refLine = referencia ? `• Pedido: ${referencia}\n` : '';
  const totalLine =
    (total !== null && total !== undefined)
      ? `\n\n💰 *TOTAL: $${Number(total).toLocaleString('es-CO')}*`
      : '';
  const warning = notRegistered
    ? '\n\n⚠️ NOTA: este pedido no quedó registrado en el sistema, solo se envía por WhatsApp.'
    : '';

  return `
🛍️ *NUEVO PEDIDO - Aurea Beauty*

${refLine}👤 *DATOS DEL CLIENTE*
• Nombre: ${client.name}
• Teléfono: ${client.phone}
${entregaText}

🛒 *PRODUCTOS SOLICITADOS*
${itemsText}${totalLine}

📝 Notas: ${client.notes || 'Ninguna'}${warning}
  `.trim();
}

function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

async function registerOrder(client, items) {
  if (!window.supabaseClient) throw new Error('Conexión a Supabase no disponible');

  const { data, error } = await window.supabaseClient.rpc('registrar_pedido', {
    p_nombre: client.name,
    p_identificacion: client.id,
    p_telefono: client.phone,
    p_direccion: client.deliveryMethod === 'recoge' ? null : client.address,
    p_ciudad: client.city,
    p_items: items.map(item => ({
      referencia: item.ref,
      cantidad: item.qty,
      tono: item.tone || null
    })),
    p_metodo_pago: client.paymentMethod,
    p_tipo_entrega: client.deliveryMethod,
    p_notas: client.notes || ''
  });

  if (error) throw error;
  return data || {};
}

function resetOrderForm() {
  const clientForm = document.getElementById('clientForm');
  if (clientForm) clientForm.reset();
  document.querySelectorAll('#clientForm .form-group').forEach(g => g.classList.remove('error', 'success'));

  const paymentWarning = document.getElementById('paymentWarning');
  if (paymentWarning) paymentWarning.classList.remove('visible');

  const fallbackBtn = document.getElementById('whatsappOnlyBtn');
  if (fallbackBtn) fallbackBtn.style.display = 'none';

  orderItems = [];
  rowCounter = 0;
  addRow();

  const sel = document.getElementById('clientDeliveryMethod');
  handleDeliveryMethodChange(sel ? sel.value : 'domicilio');
  updateFormValidity();
}

async function submitOrder() {
  if (orderSubmitting) return;

  const honeypot = document.getElementById('orderWebsite');
  if (honeypot && honeypot.value.trim() !== '') {
    const clientForm = document.getElementById('clientForm');
    if (clientForm) clientForm.reset();
    return;
  }

  const consent = document.getElementById('clientConsent');
  if (consent && !consent.checked) {
    if (typeof showToast === 'function') {
      showToast('Debes autorizar el tratamiento de tus datos para continuar.');
    }
    return;
  }

  const client = getOrderFormValues();
  const validItems = orderItems.filter(item => item.ref && item.qty > 0);

  const validationError = validateOrder(client, validItems);
  if (validationError) {
    if (typeof showToast === 'function') showToast(validationError);
    return;
  }

  const submitBtn = document.getElementById('submitOrder');
  const fallbackBtn = document.getElementById('whatsappOnlyBtn');
  if (fallbackBtn) fallbackBtn.style.display = 'none';

  orderSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando pedido...';
  }

  let waWindow = null;

  try {
    waWindow = window.open('', '_blank');
    const data = await registerOrder(client, validItems);
    const referencia = (data && data.referencia) || '';
    const total = (data && data.total !== undefined) ? data.total : null;

    const message = buildWhatsAppMessage(client, validItems, referencia, total, false);
    const url = whatsappUrl(message);
    if (waWindow) waWindow.location.href = url;
    else window.open(url, '_blank');

    resetOrderForm();
    if (typeof showToast === 'function') {
      showToast('Pedido registrado correctamente. Te esperamos en WhatsApp.');
    }
  } catch (err) {
    if (err && err.code === 'P0001') {
      if (waWindow) waWindow.close();
      if (typeof showToast === 'function') {
        showToast(err.message || 'No se pudo registrar el pedido.');
      }
    } else {
      if (waWindow) waWindow.close();
      if (typeof showToast === 'function') {
        showToast('No se pudo registrar el pedido en el sistema. Puedes enviarlo solo por WhatsApp.');
      }
      if (fallbackBtn) {
        fallbackBtn.style.display = '';
        fallbackBtn.onclick = () => {
          const message = buildWhatsAppMessage(client, validItems, '', null, true);
          window.open(whatsappUrl(message), '_blank');
        };
      }
    }
  } finally {
    orderSubmitting = false;
    if (submitBtn) {
      submitBtn.textContent = 'Finalizar pedido';
      updateFormValidity();
    }
  }
}
