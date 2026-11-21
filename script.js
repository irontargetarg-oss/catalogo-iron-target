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
// <API-A-START>
// ⚠️ PASO OBLIGATORIO: pegá acá abajo la URL de tu Apps Script publicado
// (la misma que usás para entrar al panel de administrador, pero SIN el
// "?page=admin" al final). La sacás de Apps Script → Implementar →
// Administrar implementaciones. Termina en "/exec".
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx5hpXTY918A06JXsgeRn02wx2NKIi3AFVnp78wKVC2xvsa3mpklB6reQa8Yi7g37cg/exec';
// <API-A-END>

let productos = [];
let carrito = [];
const NUMERO_WHATSAPP = '5492215774834';
let lineaActiva = '';

// Íconos de línea (mismo estilo en toda la página)
const ICONO_MIRA = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/></svg>';
const ICONO_CARRITO = '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
const ICONO_WHATSAPP = '<svg class="i" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

// <API-B-START>
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
    }, 25000);

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
// <API-B-END>

function cargar() {
  const estado = document.getElementById('estado');
  estado.style.display = 'block';
  estado.innerHTML = 'Cargando catálogo... puede tardar unos segundos.';
  llamarApi('productos').then(function (data) {
    productos = (data && data.productos) || [];
    estado.style.display = 'none';
    poblarFiltroLineas();
    renderizar(productos);
    actualizarBadgeCarrito();
  }).catch(function () {
    estado.innerHTML = 'No se pudo cargar el catálogo. Puede que Google esté tardando más de lo normal.<br>' +
      '<button class="secondary" style="margin-top:10px;" onclick="cargar()">Reintentar</button>';
  });
}


function poblarFiltroLineas() {
  const cont = document.getElementById('chips');
  cont.innerHTML = '';
  const lineas = Array.from(new Set(productos.map(function (p) { return (p.linea || '').trim(); }).filter(Boolean))).sort();
  if (!lineas.length) {
    cont.style.display = 'none';
    return;
  }
  ['Todos'].concat(lineas).forEach(function (linea, i) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (i === 0 ? ' active' : '');
    chip.textContent = linea;
    chip.onclick = function () {
      lineaActiva = i === 0 ? '' : linea;
      Array.prototype.forEach.call(cont.children, function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      filtrar();
    };
    cont.appendChild(chip);
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
  document.getElementById('resultCount').textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos');
  if (!lista.length) {
    grid.innerHTML = '<div class="empty">No encontramos productos con esa búsqueda.</div>';
    return;
  }
  lista.forEach(function (p) {
    const card = document.createElement('div');
    card.className = 'card';

    // La foto se ve completa, sin recortar ("contain"). Si el producto no tiene foto
    // se muestra un ícono de mira. (Los videos ya no se usan: solo queda de respaldo
    // para productos viejos que tengan video y no tengan foto.)
    let media;
    if (p.imagenUrl) {
      media = '<img loading="lazy" src="' + p.imagenUrl + '" alt="' + escapeHtml(p.nombre) + '">';
    } else if (p.videoUrl) {
      media = '<iframe src="' + p.videoUrl + '" allow="autoplay" allowfullscreen frameborder="0"></iframe>';
    } else {
      media = '<div class="no-img">' + ICONO_MIRA + '<span>Foto próximamente</span></div>';
    }

    // El precio en efectivo solo se muestra si en el panel de administrador se dejó
    // tildado "Mostrar precio en efectivo" para ese producto.
    const precioBlock =
      '<div class="price-main"><span class="price">' + formatoPrecio(p.precio) + '</span></div>' +
      (p.mostrarEfectivo !== false
        ? '<div class="price-efectivo">Efectivo: ' + formatoPrecio(p.precioEfectivo) + '</div>'
        : '');

    const selectorCalibre = (p.calibres && p.calibres.length)
      ? '<div class="field-block">' +
          '<label for="calibre-' + p.id + '">Calibre / pieza</label>' +
          '<select id="calibre-' + p.id + '">' +
            '<option value="">Elegí una opción</option>' +
            p.calibres.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('') +
          '</select>' +
        '</div>'
      : '';

    // Somos fabricantes: cualquier producto se puede pedir personalizado
    // (espesor de chapa, color, medidas, etc.). Campo libre y opcional, plegado
    // para que la tarjeta se vea limpia. El texto se lee igual aunque esté cerrado.
    const campoPersonalizacion =
      '<details class="custom-opt">' +
        '<summary><span class="plus">+</span> Personalizar este blanco</summary>' +
        '<div class="custom-body field-block">' +
          '<input type="text" id="personalizacion-' + p.id + '" placeholder="Ej: chapa de 6mm, color negro mate...">' +
          '<div class="hint">Espesor, color, medidas, etc. — opcional.</div>' +
        '</div>' +
      '</details>';

    // Somos fabricantes: todos los productos se pueden pedir o consultar siempre.
    const botones =
      '<div class="card-actions">' +
        '<button class="add-cart" onclick="agregarAlCarrito(\'' + p.id + '\')">' + ICONO_CARRITO + ' Agregar al carrito</button>' +
        '<button class="consult" onclick="consultarProducto(\'' + p.id + '\')">' + ICONO_WHATSAPP + ' Consultar</button>' +
      '</div>';

    const descripcion = p.descripcion || '';
    card.innerHTML =
      '<div class="card-media">' + media + '</div>' +
      '<div class="body">' +
        (p.linea ? '<div class="eyebrow">' + escapeHtml(p.linea) + '</div>' : '') +
        '<h3>' + escapeHtml(p.nombre) + '</h3>' +
        (descripcion ? '<p class="desc">' + escapeHtml(descripcion) + '</p>' : '') +
        (descripcion.length > 120 ? '<button type="button" class="link-more" onclick="toggleDesc(this)">Ver más</button>' : '') +
        '<div class="spacer"></div>' +
        '<div class="price-block">' + precioBlock + '</div>' +
        selectorCalibre +
        campoPersonalizacion +
        botones +
      '</div>';
    grid.appendChild(card);
  });
}

function toggleDesc(btn) {
  const desc = btn.previousElementSibling;
  const abierta = desc.classList.toggle('expanded');
  btn.textContent = abierta ? 'Ver menos' : 'Ver más';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}


function filtrar() {
  const q = document.getElementById('buscador').value.toLowerCase();
  const filtrados = productos.filter(function (p) {
    const coincideTexto = (p.nombre || '').toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q);
    const coincideLinea = !lineaActiva || (p.linea || '').trim() === lineaActiva;
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

// ---------- PERSONALIZACIÓN (espesor, color, medidas, etc.) ----------
// Somos fabricantes: cualquier producto se puede pedir personalizado. Campo de
// texto libre y opcional, disponible siempre en cada tarjeta del catálogo.
function obtenerPersonalizacion(p) {
  const input = document.getElementById('personalizacion-' + p.id);
  return input ? input.value.trim() : '';
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
  const personalizacion = obtenerPersonalizacion(p);
  const texto =
    'Hola! Quiero hacer una consulta sobre este producto de Iron Target:\n\n' +
    p.nombre + (calibre ? ' (Calibre: ' + calibre + ')' : '') + ' — ' + formatoPrecio(p.precio) +
    (personalizacion ? '\nPersonalización: ' + personalizacion : '');
  const url = 'https://wa.me/' + NUMERO_WHATSAPP + '?text=' + encodeURIComponent(texto);
  abrirWhatsApp(url);
}

// ---------- CARRITO ----------
// El cliente puede agregar varios productos (de distinto tipo, con distinto
// calibre, o con distinta personalización) antes de mandar un único pedido
// con todo junto. La personalización entra en la "clave" de agrupación para
// que dos pedidos del mismo producto con personalizaciones distintas no se
// mezclen en una sola línea del carrito.
function agregarAlCarrito(productoId) {
  const p = productos.find(function (x) { return x.id === productoId; });
  if (!p) return;
  if (calibreRequeridoYFaltante(p)) {
    alert('Por favor elegí primero el calibre / pieza que querés antes de agregarlo al carrito.');
    return;
  }
  const calibre = obtenerCalibreSeleccionado(p);
  const personalizacion = obtenerPersonalizacion(p);
  const clave = p.id + '|' + calibre + '|' + personalizacion;
  const existente = carrito.find(function (item) { return item.clave === clave; });
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      clave: clave,
      productoId: p.id,
      nombre: p.nombre,
      calibre: calibre,
      personalizacion: personalizacion,
      precioVigente: p.precio,
      cantidad: 1
    });
  }
  actualizarBadgeCarrito();
  mostrarToast('Se agregó "' + p.nombre + '" al carrito');
}


function actualizarBadgeCarrito() {
  const totalUnidades = carrito.reduce(function (acc, item) { return acc + item.cantidad; }, 0);
  document.getElementById('cartCount').textContent = totalUnidades;
  document.getElementById('cartTotalBar').textContent = formatoPrecio(calcularTotalCarrito());
  document.getElementById('btnCarrito').style.display = totalUnidades > 0 ? 'flex' : 'none';
  document.body.classList.toggle('has-cart', totalUnidades > 0);
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
  document.getElementById('toast').classList.remove('show');
  document.getElementById('modalCarrito').classList.add('open');
  sincronizarScroll();
}

// Bloquea el scroll de la página mientras hay una ventana abierta.
function sincronizarScroll() {
  document.body.classList.toggle('modal-open', !!document.querySelector('.modal-overlay.open'));
}


function cerrarCarrito() {
  document.getElementById('modalCarrito').classList.remove('open');
  sincronizarScroll();
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
        (item.personalizacion ? '<div class="detalle">Personalización: ' + escapeHtml(item.personalizacion) + '</div>' : '') +
        '<div class="detalle">' + formatoPrecio(item.precioVigente) + ' c/u</div>' +
      '</div>' +
      '<div class="cart-item-sub">' + formatoPrecio(item.precioVigente * item.cantidad) + '</div>' +
      '<div class="cart-item-tools">' +
        '<div class="cart-qty">' +
          '<button onclick="cambiarCantidadCarrito(' + i + ', -1)" aria-label="Quitar uno">−</button>' +
          '<span>' + item.cantidad + '</span>' +
          '<button onclick="cambiarCantidadCarrito(' + i + ', 1)" aria-label="Agregar uno">+</button>' +
        '</div>' +
        '<button class="link-remove" onclick="quitarDelCarrito(' + i + ')">Quitar</button>' +
      '</div>' +
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
    const detalle = (item.calibre ? 'Calibre: ' + escapeHtml(item.calibre) : '') +
      (item.calibre && item.personalizacion ? ' · ' : '') +
      (item.personalizacion ? 'Personalización: ' + escapeHtml(item.personalizacion) : '');
    return '<div class="line">' +
      '<div class="what">' + escapeHtml(item.nombre) + ' × ' + item.cantidad +
        (detalle ? '<span class="sub">' + detalle + '</span>' : '') + '</div>' +
      '<div class="amount">' + formatoPrecio(item.precioVigente * item.cantidad) + '</div>' +
    '</div>';
  }).join('') +
  '<div class="total-line"><span>Total</span><span>' + formatoPrecio(calcularTotalCarrito()) + '</span></div>';
  document.getElementById('modalMsg').innerHTML = '';
  document.getElementById('toast').classList.remove('show');
  document.getElementById('modalPedido').classList.add('open');
  sincronizarScroll();
}


// Cierra la ventana del pedido SIN borrar lo que la persona ya escribió.
function cerrarModal() {
  document.getElementById('modalPedido').classList.remove('open');
  sincronizarScroll();
}

// Se usa recién después de mandar el pedido.
function limpiarFormularioPedido() {
  ['pedNombre', 'pedTelefono', 'pedDireccion', 'pedCiudad', 'pedProvincia', 'pedCodigoPostal', 'pedDetalles', 'pedHorario'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
}


function enviarPedido() {
  const nombre = document.getElementById('pedNombre').value.trim();
  const telefono = document.getElementById('pedTelefono').value.trim();
  const direccion = document.getElementById('pedDireccion').value.trim();
  const ciudad = document.getElementById('pedCiudad').value.trim();
  const provincia = document.getElementById('pedProvincia').value.trim();
  const codigoPostal = document.getElementById('pedCodigoPostal').value.trim();
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
  if (!direccion) {
    document.getElementById('modalMsg').innerHTML = '<div class="msg err">Completá la dirección de envío.</div>';
    return;
  }
  if (!ciudad || !provincia) {
    document.getElementById('modalMsg').innerHTML = '<div class="msg err">Completá ciudad y provincia para poder cotizarte el envío.</div>';
    return;
  }

  const items = carrito.map(function (item) {
    return {
      productoId: item.productoId,
      productoNombre: item.nombre,
      calibre: item.calibre,
      personalizacion: item.personalizacion,
      cantidad: item.cantidad,
      precioUnitario: item.precioVigente
    };
  });
  const total = items.reduce(function (acc, it) { return acc + it.cantidad * it.precioUnitario; }, 0);

  const pedido = {
    items: items,
    nombre: nombre,
    telefono: telefono,
    metodoEntrega: 'Envío a domicilio',
    direccion: direccion,
    ciudad: ciudad,
    provincia: provincia,
    codigoPostal: codigoPostal,
    detallesEntrega: detallesEntrega,
    horario: horario,
    metodoPago: metodoPago
  };

  let texto = 'Hola! Quiero hacer este pedido de Iron Target:\n\n';
  items.forEach(function (it) {
    texto += '• ' + it.productoNombre +
      (it.calibre ? ' (Calibre: ' + it.calibre + ')' : '') +
      (it.personalizacion ? ' 🔧 ' + it.personalizacion : '') +
      ' x' + it.cantidad + ' — ' + formatoPrecio(it.precioUnitario * it.cantidad) + '\n';
  });
  texto += '\nTotal: ' + formatoPrecio(total) + ' (transferencia/tarjeta)\n';
  texto += 'Entrega: ' + pedido.metodoEntrega + '\n\n';
  texto +=
    'Mis datos:\n' +
    'Nombre: ' + nombre + '\n' +
    'Teléfono: ' + telefono + '\n' +
    'Dirección: ' + direccion + '\n' +
    'Ciudad: ' + ciudad + '\n' +
    'Provincia: ' + provincia + '\n' +
    'Código postal: ' + codigoPostal + '\n' +
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
  limpiarFormularioPedido();
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { cerrarCarrito(); cerrarModal(); }
});
[['modalCarrito', cerrarCarrito], ['modalPedido', cerrarModal]].forEach(function (par) {
  const el = document.getElementById(par[0]);
  el.addEventListener('click', function (e) { if (e.target === el) par[1](); });
});

cargar();
