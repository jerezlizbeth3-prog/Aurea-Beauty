const WHATSAPP_NUMBER = "573170518355";
let orderSubmitting = false;

function buildWhatsAppMessage(client, items) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  const itemsText = items.map((item, i) =>
    `  ${i+1}. Ref: ${item.ref} | ${item.name} | Tono: ${item.tone || 'N/A'} | Cant: ${item.qty} | $${item.subtotal.toLocaleString("es-CO")}`
  ).join("\n");

  const esDomicilio = client.deliveryMethod !== 'recoge';
  const entregaText = esDomicilio
    ? `• Dirección: ${client.address}\n• Ciudad: ${client.city}`
    : `• Entrega: Recoger en tienda\n• Ciudad: ${client.city}`;

  const message = `
🛍️ *NUEVO PEDIDO - Aurea Beauty*

👤 *DATOS DEL CLIENTE*
• Nombre: ${client.name}
• Teléfono: ${client.phone}
${entregaText}

🛒 *PRODUCTOS SOLICITADOS*
${itemsText}

💰 *TOTAL: $${total.toLocaleString("es-CO")}*

📝 Notas: ${client.notes || "Ninguna"}
  `.trim();

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  return message;
}

async function registerOrder(client, items) {
  if (!window.supabaseClient) throw new Error("Conexión a Supabase no disponible");

  const detalle = items.map(item => ({
    referencia: item.ref,
    nombre: item.name,
    tono: item.tone || null,
    cantidad: item.qty,
    precio_unitario: item.price,
    subtotal: item.subtotal
  }));

  const { error } = await window.supabaseClient.rpc('registrar_pedido', {
    p_nombre: client.name,
    p_telefono: client.phone,
    p_direccion: client.deliveryMethod === 'recoge' ? '' : client.address,
    p_ciudad: client.city,
    p_tipo_pago: client.paymentMethod,
    p_tipo_entrega: client.deliveryMethod,
    p_observaciones: client.notes || '',
    p_origen_whatsapp: 'whatsapp',
    p_detalle: detalle
  });

  if (error) throw error;
}

async function submitOrder() {
  if (orderSubmitting) return;
  orderSubmitting = true;

  const submitBtn = document.getElementById('submitOrder');
  const btnLabel = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Enviando pedido...';
  }

  const client = {
    name: document.getElementById('clientName').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    address: document.getElementById('clientAddress').value.trim(),
    city: document.getElementById('clientCity').value,
    notes: document.getElementById('clientNotes').value.trim(),
    paymentMethod: document.getElementById('clientPaymentMethod').value,
    deliveryMethod: document.getElementById('clientDeliveryMethod').value || 'domicilio'
  };

  const validItems = orderItems.filter(item => item.ref && item.qty > 0);

  try {
    await registerOrder(client, validItems);
  } catch (err) {
    console.error('registrar_pedido falló:', err);
    if (typeof showToast === 'function') {
      showToast(`El pedido no quedó guardado (${err.message}). Igual puedes enviarlo por WhatsApp.`);
    }
  }

  buildWhatsAppMessage(client, validItems);

  orderSubmitting = false;
  if (submitBtn) {
    submitBtn.textContent = btnLabel;
    submitBtn.disabled = false;
  }
}
