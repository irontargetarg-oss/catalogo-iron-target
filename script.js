// =====================================================================
// CATÁLOGO IRON TARGET — versión estática (GitHub Pages)
// =====================================================================
// Esta página NO tiene backend propio: lee los productos y guarda los
// pedidos hablando con el mismo Google Apps Script que ya usás para el
// panel de administrador (Productos, Ventas, Pedidos siguen viviendo en
// tu Google Sheets de siempre). La diferencia es que en vez de
// "google.script.run" (que solo funciona adentro de una página servida
// por el propio Apps Script) esta página usa JSONP: una técnica antigua
// pero muy confiable para pedirle datos a otro dominio sin chocar con
// los bloqueos de CORS que Instagram y otros navegadores "in-app"
// suelen aplicar a este tipo de pedidos.
//
// ⚠️ PASO OBLIGATORIO: pegá acá abajo la URL de tu Apps Script publicado
// (la misma que usás para entrar al panel de administrador, pero SIN el
// "?page=admin" al final). La sacás de Apps Script → Implementar →
// Administrar implementaciones. Termina en "/exec".
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx5hpXTY918A06JXsgeRn02wx2NKIi3AFVnp78wKVC2xvsa3mpklB6reQa8Yi7g37cg/exec';

let productos = [];
let carrito = [];
const NUMERO_WHATSAPP = '5492215774834';

// ---------- JSONP: hablar con el Apps Script sin problemas de CORS ----------
let jsonpContador = 0;
function llamarApi(action, extraParams) {
  return new Promise(function (resolve, reject) {
    jsonpContador += 1;
    const nombreCallback = 'cbCatalogoIronTarget_' + jsonpContador;
    let url = APPS_SCRIPT_URL + '?action=' + encodeURIComponent(action) + '&callback=' + nombreCallback;
    if (extraParams) {
      Object.keys(extraParams).forEach(function (k) {
        url += '&' + k + '=' + encodeURIComponent(extraParams[k]);
      });
    }

    const script = document.createElement('script');
    const timeoutId = setTimeout(function () {
      limpiar();
      reject(new Error('Tiempo de espera agotado.'));
    }, 20000);

    function limpiar() {
      clearTimeout(timeoutId);
      delete window[nombreCallback];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[nombreCallback] = function (data) {
      limpiar();
      resolve(data);
    };
    script.onerror = function () {
      limpiar();
      reject(new Error('No se pudo conectar con el catálogo.'));
    };
    script.src = url;
    document.body.appendChild(script);
  });
}

function cargar() {
  llamarApi('productos').then(function (data) {
    productos = (data && data.productos) || [];
    document.getElementById('estado').style.display = 'none';
    poblarFiltroLineas();
    renderizar(productos);
    actualizarBadgeCarrito();
  }).catch(function () {
    document.getElementById('estado').textContent = 'No se pudo cargar el catálogo. Reintentá más tarde.';
  });
}

function poblarFiltroLineas() {
  const select = document.getElementById('filtroLinea');
  const lineas = Array.from(new Set(productos.map(function (p) { return (p.linea || '').trim(); }).filter(Boolean))).sort();
  if (!lineas.length) {
    select.style.display = 'none';
    return;
  }
  lineas.forEach(function (linea) {
    const opt = document.createElement('option');
    opt.value = linea;
    opt.textContent = linea;
    select.appendChild(opt);
  });
}

function formatoPrecio(valor) {
  return '$' + Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

// Abre WhatsApp con un click de <a> real en vez de window.open(): dentro de
// navegadores restringidos como el de Instagram, window.open() a veces se
// bloquea (por eso "a veces no manda el mensaje"), pero un click real sobre
// un link normal es mucho más confiable.
function abrirWhatsApp(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderizar(lista) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  if (!lista.length) {
    grid.innerHTML = '<div class="empty">Todavía no hay productos publicados.</div>';
    return;
  }
  lista.forEach(function (p) {
    const card = document.createElement('div');
    card.className = 'card';

    // Si el producto tiene video, se muestra directamente en el lugar de la foto
    // (en vez de un botón aparte). La foto, cuando no hay video, se ve completa,
    // sin recortar (por eso "contain" en vez de "cover" en el CSS).
    let media;
    if (p.videoUrl) {
      media = '<iframe src="' + p.videoUrl + '" allow="autoplay" allowfullscreen frameborder="0"></iframe>';
    } else if (p.imagenUrl) {
      media = '<img src="' + p.imagenUrl + '" alt="' + escapeHtml(p.nombre) + '">';
    } else {
      media = '<div class="no-img">Sin imagen</div>';
    }

    const badgeStock = p.stock > 0
      ? '<span class="badge ok">Disponible</span>'
      : '<span class="badge out">Agotado</span>';
    const badgeLinea = p.linea
      ? '<span class="badge line">' + escapeHtml(p.linea) + '</span>'
      : '';
    const badgeFeria = p.enFeria
      ? '<span class="badge feria">Oferta feria</span>'
      : '';

    const precioBlock = p.enFeria
      ? '<div class="price-lista-tachado">Antes: ' + formatoPrecio(p.precio) + '</div>' +
        '<span class="price">' + formatoPrecio(p.precioVigente) + '</span>'
      : '<span class="price">' + formatoPrecio(p.precioVigente) + '</span>';

    // El botón de pedido aparece siempre: el stock del catálogo es solo el disponible
    // en la feria, pero igual se puede encargar aunque haya (o no) stock en ese momento.
    const botones =
      '<button class="add-cart" onclick="agregarAlCarrito(\'' + p.id + '\')">🛒 Agregar al carrito</button>' +
      '<button class="secondary block" onclick="consultarProducto(\'' + p.id + '\')">Solo consultar</button>';

    const selectorCalibre = (p.calibres && p.calibres.length)
      ? '<div class="form-row" style="margin:6px 0 0;">' +
          '<label style="font-size:12px;">Calibre / pieza</label>' +
          '<select id="calibre-' + p.id + '">' +
            '<option value="">Elegí una opción</option>' +
            p.calibres.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('') +
          '</select>' +
        '</div>'
      : '';

    card.innerHTML =
      '<div class="card-media">' + media + '</div>' +
      '<div class="body">' +
        '<div class="badges-row">' + badgeLinea + badgeFeria + '</div>' +
        '<h3>' + escapeHtml(p.nombre) + '</h3>' +
        '<p class="desc">' + escapeHtml(p.descripcion || '') + '</p>' +
        '<div class="price-block">' +
          precioBlock +
          // El descuento en efectivo es siempre sobre el precio de lista. Si hay precio
          // especial de feria activo, ese precio ya es el mismo para cualquier medio de pago.
          (p.enFeria
            ? '<div class="price-efectivo">Precio de feria — válido en efectivo, transferencia o tarjeta</div>'
            : '<div class="price-efectivo">Efectivo: ' + formatoPrecio(p.precioEfectivo) + '</div>') +
        '</div>' +
        '<div class="price-row">' + badgeStock + '</div>' +
        selectorCalibre +
        botones +
      '</div>';
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function filtrar() {
  const q = document.getElementById('buscador').value.toLowerCase();
  const linea = document.getElementById('filtroLinea').value;
  const filtrados = productos.filter(function (p) {
    const coincideTexto = (p.nombre || '').toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q);
    const coincideLinea = !linea || p.linea === linea;
    return coincideTexto && coincideLinea;
  });
  renderizar(filtrados);
}

// ---------- CALIBRES / PIEZAS INTERCAMBIABLES ----------
// Para productos con banderas o piezas intercambiables, el cliente elige antes de pedir o consultar.
function obtenerCalibreSeleccionado(p) {
  if (!p.calibres || !p.calibres.length) return '';
  const select = document.getElementById('calibre-' + p.id);
  return select ? select.value : '';
}

function calibreRequeridoYFaltante(p) {
  return !!(p.calibres && p.calibres.length && !obtenerCalibreSeleccionado(p));
}

// ---------- SOLO CONSULTA (sin formulario, abre WhatsApp directo) ----------
function consultarProducto(productoId) {
  const p = productos.find(function (x) { return x.id === productoId; });
  if (!p) return;
  if (calibreRequeridoYFaltante(p)) {
    alert('Por favor elegí primero el calibre / pieza que querés antes de consultar.');
    return;
  }
  const calibre = obtenerCalibreSeleccionado(p);
  const texto =
    'Hola! Quiero hacer una consulta sobre este producto de Iron Target:\n\n' +
    p.nombre + (calibre ? ' (Calibre: ' + calibre + ')' : '') + ' — ' + formatoPrecio(p.precioVigente);
  const url = 'https://wa.me/' + NUMERO_WHATSAPP + '?text=' + encodeURIComponent(texto);
  abrirWhatsApp(url);
}

// ---------- CARRITO ----------
// El cliente puede agregar varios productos (de distinto tipo, o el mismo con
// distinto calibre) antes de mandar un único pedido con todo junto.
function agregarAlCarrito(productoId) {
  const p = productos.find(function (x) { return x.id === productoId; });
  if (!p) return;
  if (calibreRequeridoYFaltante(p)) {
    alert('Por favor elegí primero el calibre / pieza que querés antes de agregarlo al carrito.');
    return;
  }
  const calibre = obtenerCalibreSeleccionado(p);
  const clave = p.id + '|' + calibre;
  const existente = carrito.find(function (item) { return item.clave === clave; });
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      clave: clave,
      productoId: p.id,
      nombre: p.nombre,
      calibre: calibre,
      enFeria: p.enFeria,
      precioVigente: p.precioVigente,
      precioEfectivo: p.precioEfectivo,
      cantidad: 1
    });
  }
  actualizarBadgeCarrito();
  mostrarToast('Se agregó "' + p.nombre + '" al carrito');
}

function actualizarBadgeCarrito() {
  const totalUnidades = carrito.reduce(function (acc, item) { return acc + item.cantidad; }, 0);
  document.getElementById('cartCount').textContent = totalUnidades;
  document.getElementById('btnCarrito').style.display = totalUnidades > 0 ? 'flex' : 'none';
}

let toastTimeout = null;
function mostrarToast(texto) {
  const toast = document.getElementById('toast');
  toast.textContent = texto;
  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function () { toast.classList.remove('show'); }, 2200);
}

function calcularTotalCarrito() {
  return carrito.reduce(function (acc, item) { return acc + item.cantidad * item.precioVigente; }, 0);
}

function abrirCarrito() {
  renderizarCarrito();
  document.getElementById('modalCarrito').classList.add('open');
}

function cerrarCarrito() {
  document.getElementById('modalCarrito').classList.remove('open');
}

function renderizarCarrito() {
  const cont = document.getElementById('carritoItems');
  const totalRow = document.getElementById('carritoTotalRow');
  const btnContinuar = document.getElementById('btnContinuarPedido');
  if (!carrito.length) {
    cont.innerHTML = '<div class="cart-empty">Todavía no agregaste productos.</div>';
    totalRow.style.display = 'none';
    btnContinuar.disabled = true;
    return;
  }
  btnContinuar.disabled = false;
  totalRow.style.display = 'flex';
  cont.innerHTML = carrito.map(function (item, i) {
    return '<div class="cart-item-row">' +
      '<div class="cart-item-info">' +
        '<div class="nombre">' + escapeHtml(item.nombre) + '</div>' +
        (item.calibre ? '<div class="detalle">Calibre: ' + escapeHtml(item.calibre) + '</div>' : '') +
        '<div class="detalle">' + formatoPrecio(item.precioVigente) + ' c/u' + (item.enFeria ? ' (precio de feria, todos los medios de pago)' : '') + '</div>' +
      '</div>' +
      '<div class="cart-qty">' +
        '<button onclick="cambiarCantidadCarrito(' + i + ', -1)">−</button>' +
        '<span>' + item.cantidad + '</span>' +
        '<button onclick="cambiarCantidadCarrito(' + i + ', 1)">+</button>' +
      '</div>' +
      '<button class="secondary" style="padding:6px 10px; font-size:12px;" onclick="quitarDelCarrito(' + i + ')">Quitar</button>' +
    '</div>';
  }).join('');
  document.getElementById('carritoTotal').textContent = formatoPrecio(calcularTotalCarrito());
}

function cambiarCantidadCarrito(i, delta) {
  carrito[i].cantidad += delta;
  if (carrito[i].cantidad <= 0) carrito.splice(i, 1);
  actualizarBadgeCarrito();
  renderizarCarrito();
}

function quitarDelCarrito(i) {
  carrito.splice(i, 1);
  actualizarBadgeCarrito();
  renderizarCarrito();
}

function vaciarCarrito() {
  if (!carrito.length) return;
  if (!confirm('¿Vaciar todo el carrito?')) return;
  carrito = [];
  actualizarBadgeCarrito();
  renderizarCarrito();
}

// ---------- MODAL DE PEDIDO (a partir del carrito) ----------
function continuarPedido() {
  if (!carrito.length) return;
  cerrarCarrito();
  document.getElementById('modalResumenPedido').innerHTML = carrito.map(function (item) {
    return '<div>• ' + escapeHtml(item.nombre) +
      (item.calibre ? ' (Calibre: ' + escapeHtml(item.calibre) + ')' : '') +
      ' x' + item.cantidad + ' — ' + formatoPrecio(item.precioVigente * item.cantidad) + '</div>';
  }).join('');
  document.getElementById('modalMsg').innerHTML = '';
  document.getElementById('pedMetodoEntrega').value = 'Envio';
  actualizarFormularioPedido();
  document.getElementById('modalPedido').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modalPedido').classList.remove('open');
  ['pedNombre', 'pedTelefono', 'pedDireccion', 'pedCodigoPostal', 'pedDetalles', 'pedHorario'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
}

// Ajusta el formulario según si es envío o retiro: la dirección solo hace
// falta con envío, y el pago en efectivo solo está disponible retirando
// en el punto de entrega. También avisa si la compra ya llega al envío gratis.
function actualizarFormularioPedido() {
  const esRetiro = document.getElementById('pedMetodoEntrega').value === 'Retiro';
  document.getElementById('filaDireccion').style.display = esRetiro ? 'none' : 'block';
  document.getElementById('filaCodigoPostal').style.display = esRetiro ? 'none' : 'block';
  document.getElementById('notaRetiro').style.display = esRetiro ? 'block' : 'none';

  const notaEnvio = document.getElementById('notaEnvio');
  if (esRetiro) {
    notaEnvio.style.display = 'none';
  } else {
    const totalCarrito = calcularTotalCarrito();
    notaEnvio.style.display = 'block';
    notaEnvio.innerHTML = totalCarrito >= 200000
      ? 'Tu compra (' + formatoPrecio(totalCarrito) + ') ya llega al envío gratis.'
      : 'Envío gratis a partir de $200.000 de compra. Con tu compra actual (' + formatoPrecio(totalCarrito) + '), el costo de envío se define según tu dirección — te lo confirmamos por WhatsApp.';
  }

  const selectPago = document.getElementById('pedMetodoPago');
  const opcionEfectivo = selectPago.querySelector('option[value="Efectivo"]');
  opcionEfectivo.disabled = !esRetiro;
  if (!esRetiro && selectPago.value === 'Efectivo') {
    selectPago.value = 'Lista/Transferencia';
  }

  // El descuento en efectivo es siempre sobre el precio de lista: los productos con
  // precio de feria activo pagan ese mismo precio con cualquier medio de pago.
  const notaPago = document.getElementById('notaMetodoPago');
  const esEfectivo = selectPago.value === 'Efectivo';
  const hayFeria = carrito.some(function (item) { return item.enFeria; });
  const hayLista = carrito.some(function (item) { return !item.enFeria; });
  if (esEfectivo && hayFeria) {
    notaPago.style.display = 'block';
    notaPago.textContent = hayLista
      ? 'El 10% de descuento en efectivo se aplica solo a los productos sin precio de feria. Los que tienen precio de feria pagan ese mismo precio en efectivo, transferencia o tarjeta.'
      : 'Los productos de tu pedido tienen precio de feria: ese precio ya es el mismo para cualquier medio de pago, no se le suma un descuento adicional por pagar en efectivo.';
  } else {
    notaPago.style.display = 'none';
  }
}

function enviarPedido() {
  const nombre = document.getElementById('pedNombre').value.trim();
  const telefono = document.getElementById('pedTelefono').value.trim();
  const metodoEntrega = document.getElementById('pedMetodoEntrega').value;
  const esRetiro = metodoEntrega === 'Retiro';
  const direccion = esRetiro ? '' : document.getElementById('pedDireccion').value.trim();
  const codigoPostal = esRetiro ? '' : document.getElementById('pedCodigoPostal').value.trim();
  const detallesEntrega = document.getElementById('pedDetalles').value.trim();
  const horario = document.getElementById('pedHorario').value.trim();
  const metodoPago = document.getElementById('pedMetodoPago').value;

  if (!carrito.length) {
    document.getElementById('modalMsg').innerHTML = '<div class="msg err">Tu carrito está vacío.</div>';
    return;
  }
  if (!nombre || !telefono) {
    document.getElementById('modalMsg').innerHTML = '<div class="msg err">Completá al menos tu nombre y teléfono.</div>';
    return;
  }
  if (!esRetiro && !direccion) {
    document.getElementById('modalMsg').innerHTML = '<div class="msg err">Completá la dirección de envío, o elegí "Retiro en punto de entrega".</div>';
    return;
  }

  const esEfectivo = metodoPago === 'Efectivo';
  // El descuento en efectivo es siempre sobre el precio de lista. Los productos con
  // precio de feria activo pagan ese mismo precio con cualquier medio de pago.
  const items = carrito.map(function (item) {
    return {
      productoId: item.productoId,
      productoNombre: item.nombre,
      calibre: item.calibre,
      cantidad: item.cantidad,
      precioUnitario: (!item.enFeria && esEfectivo) ? item.precioEfectivo : item.precioVigente
    };
  });
  const total = items.reduce(function (acc, it) { return acc + it.cantidad * it.precioUnitario; }, 0);

  const pedido = {
    items: items,
    nombre: nombre,
    telefono: telefono,
    metodoEntrega: esRetiro ? 'Retiro en Armería Parabellum' : 'Envío a domicilio',
    direccion: direccion,
    codigoPostal: codigoPostal,
    detallesEntrega: detallesEntrega,
    horario: horario,
    metodoPago: metodoPago
  };

  let texto = 'Hola! Quiero hacer este pedido de Iron Target:\n\n';
  items.forEach(function (it) {
    texto += '• ' + it.productoNombre +
      (it.calibre ? ' (Calibre: ' + it.calibre + ')' : '') +
      ' x' + it.cantidad + ' — ' + formatoPrecio(it.precioUnitario * it.cantidad) + '\n';
  });
  texto += '\nTotal: ' + formatoPrecio(total) + (esEfectivo ? ' (efectivo)' : ' (transferencia/tarjeta)') + '\n';
  texto += 'Entrega: ' + pedido.metodoEntrega + '\n\n';
  texto +=
    'Mis datos:\n' +
    'Nombre: ' + nombre + '\n' +
    'Teléfono: ' + telefono + '\n';
  if (!esRetiro) {
    texto += 'Dirección: ' + direccion + '\n' + 'Código postal: ' + codigoPostal + '\n';
  }
  texto +=
    'Detalles de entrega: ' + detallesEntrega + '\n' +
    'Horario preferido: ' + horario + '\n' +
    'Método de pago: ' + metodoPago;
  const url = 'https://wa.me/' + NUMERO_WHATSAPP + '?text=' + encodeURIComponent(texto);

  // Guardamos el pedido en la planilla en segundo plano, PERO sin esperar a que
  // termine para abrir WhatsApp: si el envío queda atado a una llamada asíncrona,
  // algunos navegadores (sobre todo el de Instagram) bloquean la apertura porque
  // ya no la consideran una acción directa del click del cliente. Por eso abrimos
  // WhatsApp en el mismo instante del click, y el guardado sigue su curso aparte.
  llamarApi('pedido', { pedido: JSON.stringify(pedido) }).catch(function () {
    // Aunque falle el guardado en la planilla, el pedido ya se mandó por WhatsApp.
  });

  abrirWhatsApp(url);
  carrito = [];
  actualizarBadgeCarrito();
  cerrarModal();
}

cargar();
