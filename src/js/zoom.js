// zoom.js — maneja zoom y pan del workspace
// applyTransform() es llamada tanto por zoom.js como por adjustCanvasScale() en app.js

let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// Resetea zoom y pan al estado inicial (centrado)
function resetView() {
  zoom = 1;
  panX = 0;
  panY = 0;
}

// applyTransform centra el canvas y luego aplica pan/zoom encima.
function applyTransform() {
  if (!canvasWrapper || !canvas) return;
  const workspaceEl = canvasWrapper.parentElement;
  if (!workspaceEl) return;
  // El centrado se calcula sobre el alto/ancho TOTAL del área de trabajo.
  // El padding solo se usa (en adjustCanvasScale) para que la hoja no toque
  // los bordes al calcular su tamaño; no debe restarse otra vez acá, o el
  // resultado queda corrido hacia arriba-izquierda en vez de centrado.
  const scaledW = canvas.width * baseScale * zoom;
  const scaledH = canvas.height * baseScale * zoom;
  const centerX = Math.max(0, (workspaceEl.clientWidth - scaledW) / 2);
  const centerY = Math.max(0, (workspaceEl.clientHeight - scaledH) / 2);
  canvasWrapper.style.transformOrigin = 'top left';
  canvasWrapper.style.transform =
    `translate(${centerX + panX}px, ${centerY + panY}px) scale(${baseScale * zoom})`;
}

// Aplica un paso de zoom centrado en el medio del workspace visible (no en
// el mouse, porque estos botones/atajos deben funcionar sin importar dónde
// esté el cursor — ese es justamente el problema que resuelven).
function zoomByStep(delta) {
  if (!canvasWrapper) return;
  const workspaceEl = canvasWrapper.parentElement;
  if (!workspaceEl) return;
  const prevZoom = zoom;
  zoom = Math.max(0.1, Math.min(10, zoom + delta));
  if (zoom === 1) {
    panX = 0; panY = 0;
  } else {
    // Mantiene centrado el punto medio del workspace mientras se hace zoom.
    const midX = workspaceEl.clientWidth / 2;
    const midY = workspaceEl.clientHeight / 2;
    const scaleChange = zoom / prevZoom;
    panX -= (midX * (scaleChange - 1));
    panY -= (midY * (scaleChange - 1));
  }
  applyTransform();
}

// Vuelve a mostrar la hoja completa, sin importar cuánto zoom/pan se haya
// acumulado. Es la "salida de emergencia": no depende de la posición del
// mouse, así que funciona incluso si la hoja ocupa toda la pantalla y no
// queda zona oscura visible donde hacer scroll.
function zoomToFit() {
  resetView();
  applyTransform();
}

// initZoom() es llamado desde initApp() en app.js,
// asegurando que canvas, canvasWrapper, state y baseScale ya existen.
function initZoom() {
  const workspaceEl = canvasWrapper.parentElement;

  // ── Controles fijos (botones) y atajos de teclado ───────────────────────
  // Siempre accesibles, independientemente de dónde esté el cursor o cuánto
  // zoom tenga la hoja actualmente.
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomByStep(-0.25));
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomByStep(0.25));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => zoomToFit());

  document.addEventListener('keydown', (e) => {
    // Se ignoran mientras se escribe en un input/select para no interferir.
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && (e.key === '0')) { e.preventDefault(); zoomToFit(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomByStep(0.25); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomByStep(-0.25); }
    else if (e.key === 'Escape' && state) {
      state.selectedImageId = null; state.editMode = false;
      if (typeof updateThumbnails === 'function') updateThumbnails();
      if (typeof updateEditPanel === 'function') updateEditPanel();
      if (typeof drawAll === 'function') drawAll();
    }
  });

  // ── Zoom con rueda del mouse ──────────────────────────────────────────────
  // Capturamos en el workspace completo (fondo gris + canvas).
  // Si el puntero está sobre el canvas Y hay imagen seleccionada,
  // el listener del canvas en app.js maneja el zoom de imagen → saltamos.
  workspaceEl.addEventListener('wheel', (e) => {
    e.preventDefault();

    // Solo cedemos el control a app.js (zoom de la foto individual) cuando
    // realmente estamos en modo edición con una imagen seleccionada — que es
    // la misma condición que usa el listener de wheel sobre el canvas en
    // app.js. Antes acá solo se chequeaba "selectedImageId", así que con una
    // imagen apenas seleccionada (sin editar) el zoom de la hoja ya se
    // rompía apenas el mouse pasaba sobre el canvas.
    if (e.target === canvas && state && state.editMode && state.selectedImageId) return;

    // deltaY varía mucho entre mouse físico (~100) y trackpad (~3-10)
    // Normalizamos para que el paso sea siempre suave (~3% por tick de mouse)
    const rawDelta = e.deltaY;
    const normalized = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 100) / 100;
    const zoomStep = 0.06 * Math.abs(normalized);   // máx 6% por evento

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / (baseScale * zoom);
    const mouseY = (e.clientY - rect.top) / (baseScale * zoom);
    const prevZoom = zoom;

    if (rawDelta < 0) {
      zoom = Math.min(10, zoom + zoomStep);
    } else {
      zoom = Math.max(0.1, zoom - zoomStep);
    }

    if (zoom === 1) {
      panX = 0;
      panY = 0;
    } else {
      const scaleChange = zoom / prevZoom;
      panX -= (mouseX * (scaleChange - 1)) * baseScale * prevZoom;
      panY -= (mouseY * (scaleChange - 1)) * baseScale * prevZoom;
    }

    applyTransform();
  }, { passive: false });

  // ── Pan con click y arrastre ──────────────────────────────────────────────
  // Capturamos en workspaceEl Y en el canvas para que el área blanca de la hoja
  // también permita arrastrar (el canvas intercepta el evento antes que el workspace).
  function startPan(e) {
    if (e.button !== 0) return;
    // Si estamos en modo edición con una imagen seleccionada y se hace click
    // en el canvas, es drag de imagen (mover/escalar/rotar) → no pan de la
    // hoja. Misma condición que el wheel de arriba.
    if (e.target === canvas && state && state.editMode && state.selectedImageId) return;
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    workspaceEl.style.cursor = 'grabbing';
    e.preventDefault();
  }

  workspaceEl.addEventListener('mousedown', startPan);
  canvas.addEventListener('mousedown', startPan);

  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX += e.clientX - startX;
    panY += e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    workspaceEl.style.cursor = 'grab';
  });
}
