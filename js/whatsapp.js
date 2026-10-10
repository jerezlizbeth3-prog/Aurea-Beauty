const WHATSAPP_NUMBER = "573170518355";

function buildWhatsAppMessage(client, items) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  const itemsText = items.map((item, i) =>
    `  ${i+1}. Ref: ${item.ref} | ${item.name} | Tono: ${item.tone || 'N/A'} | Cant: ${item.qty} | $${item.subtotal.toLocaleString("es-CO")}`
  ).join("\n");

  const message = `
🛍️ *NUEVO PEDIDO - Aurea Beauty*

👤 *DATOS DEL CLIENTE*
• Nombre: ${client.name}
• Teléfono: ${client.phone}
• Dirección: ${client.address}
• Ciudad: ${client.city}

🛒 *PRODUCTOS SOLICITADOS*
${itemsText}

💰 *TOTAL: $${total.toLocaleString("es-CO")}*

📝 Notas: ${client.notes || "Ninguna"}
  `.trim();

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

function submitOrder() {
  const client = {
    name: document.getElementById('clientName').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    address: document.getElementById('clientAddress').value.trim(),
    city: document.getElementById('clientCity').value,
    notes: document.getElementById('clientNotes').value.trim()
  };

  const validItems = orderItems.filter(item => item.ref && item.qty > 0);

  buildWhatsAppMessage(client, validItems);
}
