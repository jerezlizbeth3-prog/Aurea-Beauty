# Aurae Beauty — Página Web de Ventas de Maquillaje

SPA completa para la venta de productos de maquillaje con envíos a Bucaramanga, Girón, Floridablanca y Piedecuesta (Colombia).

## 🚀 Deploy

Al ser HTML/CSS/JS vanilla, solo sube los archivos a cualquier hosting estático:

- **Netlify**: arrastra la carpeta a https://app.netlify.com
- **GitHub Pages**: sube a un repo y activa Pages desde `main/root`
- **Vercel**: `vercel --prod`

## ⚙️ Personalización

### Cambiar número de WhatsApp

Abre `js/whatsapp.js` y reemplaza:

```js
const WHATSAPP_NUMBER = "573170518355";
```

Ejemplo: `"573170518355"` (código de país 57 + número sin espacios ni signos).

### Agregar productos al catálogo

Abre `js/catalog.js`. Cada producto sigue esta estructura:

```js
{
  id: "016",                    // ID único
  name: "Nombre del producto",  // Nombre visible
  category: "maquillaje",       // Categoría: maquillaje | cuidado facial | lociones | accesorios
  reference: "XX-016",          // Referencia única
  price: 30000,                 // Precio en pesos colombianos
  tones: ["Tono1", "Tono2"],    // Arreglo de tonos (vacío si no aplica)
  image: "img/producto.jpg",    // Ruta de la imagen
  stock: true,                  // true = disponible
  offer: true,                  // true = mostrar en ofertas
  offerPrice: 25000             // Precio de oferta (solo si offer: true)
}
```

### Cambiar colores

Abre `css/styles.css` y modifica las variables CSS al inicio:

```css
:root {
  --color-primary:    #F48FB1;
  --color-secondary:  #F8BBD9;
  --color-accent:     #EC407A;
  --color-text:       #4A4A4A;
  --color-border:     #FCE4EC;
}
```

### Cambiar nombre de la tienda

Busca "GlamShop" en `index.html` y `js/whatsapp.js` y reemplázalo por el nombre deseado.

### Cambiar imágenes

Las imágenes actualmente usan URLs de Unsplash. Reemplázalas por imágenes locales en la carpeta `img/` y actualiza la ruta en `catalog.js`.

## 📁 Estructura de archivos

```
/
├── index.html          # Página principal
├── css/
│   └── styles.css      # Todos los estilos
├── js/
│   ├── app.js          # Navegación, catálogo, validaciones
│   ├── cart.js         # Lógica de tabla de pedidos
│   ├── catalog.js      # Datos del catálogo (15 productos)
│   └── whatsapp.js     # Mensaje para WhatsApp
├── img/                # Imágenes locales
└── README.md
```

## ✨ Funcionalidades

- ✅ Catálogo con filtro por categorías (tabs)
- ✅ Tarjetas de ofertas con badges
- ✅ Formulario de pedido con tabla tipo Excel editable
- ✅ Autocompletado de productos al seleccionar referencia
- ✅ Cálculo automático de subtotales y total
- ✅ Validación de campos en tiempo real
- ✅ Envío del pedido a WhatsApp
- ✅ Menú responsive con hamburguesa
- ✅ Smooth scroll a secciones
- ✅ Restricción geográfica (4 ciudades)
- ✅ Diseño responsive mobile/tablet/desktop
- ✅ Accesibilidad básica (labels, roles, aria)

## 🧰 Stack

- HTML5 semántico
- CSS3 con variables y Grid/Flexbox
- JavaScript vanilla (sin frameworks)
- Google Fonts (Poppins + Lato)
- Integración con WhatsApp Web
