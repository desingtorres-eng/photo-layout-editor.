// ================== ELEMENTOS ==================
const app = document.querySelector('.app');
const canvas = document.getElementById('printCanvas');
const ctx = canvas?.getContext('2d');
const imageInput = document.getElementById('imageInput');
const exportBtn = document.getElementById('exportBtn');
const thumbnailsContainer = document.getElementById('thumbnails');
const workspace = document.querySelector('.workspace');
const canvasWrapper = document.querySelector('.canvas-wrapper');
const orientationSelect = document.getElementById('orientation');
const lockRatioCheckbox = document.getElementById('lockRatio');
const showBorderCheckbox = document.getElementById('showBorder');
const paperSizeSelect = document.getElementById('paperSize');
const customSizeInputs = document.getElementById('customSizeInputs');
const customWidthInput = document.getElementById('customWidth');
const customHeightInput = document.getElementById('customHeight');

const preImportPanel = document.getElementById('preImportPanel');
const preWidthInput = document.getElementById('preWidth');
const preHeightInput = document.getElementById('preHeight');
const preLockRatioInput = document.getElementById('preLockRatio');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const preImportDropzone = document.getElementById('preImportDropzone');
const openPreImportBtn = document.getElementById('openPreImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const preImportInfo = document.getElementById('preImportInfo');
const preImportPreview = document.getElementById('preImportPreview');

preImportDropzone.addEventListener('click', () => { imageInput.click(); });

if (!canvas || !ctx) console.error("No se pudo obtener el canvas o su contexto 2D");

let baseScale = 1;

function generateId() { return crypto.randomUUID(); }

// ================== STATE ==================
const state = {
  page: { widthCm: 22, heightCm: 32, marginCm: 0.5, dpi: 300 },
  image: { widthCm: 5, heightCm: 5, gapCm: 0.03, showBorder: false },
  files: [], images: [], pages: [], importQueue: [], layers: [],
  selectedImageId: null,
  editMode: false
};

const DPI = 300;
const CM_TO_INCH = 2.54;

// ================== HISTORIAL UNDO ==================
const MAX_HISTORY = 30;
let undoHistory = [];
let isUndoing = false;

function snapshotState() {
  if (isUndoing) return;
  const snap = {
    page: { ...state.page },
    image: { ...state.image },
    images: state.images.map(img => ({ ...img }))
  };
  undoHistory.push(JSON.stringify(snap));
  if (undoHistory.length > MAX_HISTORY) undoHistory.shift();
}

function undoLastChange() {
  if (undoHistory.length === 0) return;
  isUndoing = true;
  const snapStr = undoHistory.pop();
  try {
    const snap = JSON.parse(snapStr);
    state.page = snap.page;
    state.image = snap.image;
    // Restore images preserving imgObject references
    const restoredImages = snap.images.map(snapImg => {
      const existing = state.images.find(i => i.id === snapImg.id);
      return { ...snapImg, imgObject: existing ? existing.imgObject : null };
    }).filter(i => i.imgObject);
    state.images = restoredImages;
    state.selectedImageId = null;
    state.editMode = false;
    updateUI();
    setupCanvas();
    updateThumbnails();
    drawAll();
    saveState();
  } catch(e) { console.error('Error en undo:', e); }
  isUndoing = false;
}

document.addEventListener('keydown', (e) => {
  const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z';
  if (isUndo) {
    e.preventDefault();
    undoLastChange();
  }
});

const LIMITS = {
  minImageSize: 0.1, maxImageSize: 100,
  minPageSize: 1, maxPageSize: 100,
  minMargin: 0, maxMargin: 10,
  minGap: 0, maxGap: 5,
  minPhotoZoom: 0.1, maxPhotoZoom: 8
};

function validateNumber(value, min, max) {
  const num = parseFloat(value);
  if (isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}
// Acepta tanto "6.5" como "6,5" (coma decimal chilena) en cualquier campo numérico.
function parseLocaleNumber(str) {
  if (typeof str !== 'string') return parseFloat(str);
  return parseFloat(str.trim().replace(',', '.'));
}
function cmToPx(cm) { return Math.round((cm / CM_TO_INCH) * DPI); }

// ================== CORRECCIÓN DE ORIENTACIÓN EXIF ==================
// El celular guarda la foto "acostada" y anota en el EXIF cuánto hay que
// girarla para verla derecha. Los navegadores más nuevos (Chrome/Safari/Edge
// actuales) ya aplican ese giro ellos solos, tanto en el <img> como al
// dibujar en canvas — por eso antes esto se veía bien. Pero como no todos los
// navegadores lo hacen (y no hay forma de saberlo de antemano sin probarlo),
// primero probamos con una imagen de prueba minúscula: si el navegador ya
// giró la imagen de prueba solo, no tocamos nada (para no volver a girar algo
// que el navegador ya giró, lo que dejaba la foto de costado otra vez); si no
// la giró, corregimos nosotros a mano el EXIF de cada foto, como antes.
//
// Imagen de prueba: 16x8 px, mitad izquierda roja / mitad derecha azul,
// EXIF Orientation=6 (girar 90°). Si el navegador ya corrigió, esta imagen
// se reporta como 8x16 (alto y ancho invertidos); si no, se reporta 16x8 tal
// cual viene guardada.
const EXIF_TEST_IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAIABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8X6/ynP8Av4PyHr/1UD/zXz//2Q==';
const EXIF_TEST_RAW_WIDTH = 16, EXIF_TEST_RAW_HEIGHT = 8;

let _canvasHandlesExifPromise = null;
function browserHandlesExifItself() {
  if (_canvasHandlesExifPromise) return _canvasHandlesExifPromise;
  _canvasHandlesExifPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Si el navegador ya giró la imagen de prueba sola, sus medidas quedan
      // invertidas (16x8 -> 8x16). Si no la tocó, siguen siendo 16x8.
      resolve(img.naturalWidth === EXIF_TEST_RAW_HEIGHT && img.naturalHeight === EXIF_TEST_RAW_WIDTH);
    };
    img.onerror = () => resolve(false); // ante la duda, corregimos nosotros (opción más segura)
    img.src = EXIF_TEST_IMAGE;
  });
  return _canvasHandlesExifPromise;
}

function getExifOrientation(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xFFD8) return 1; // no es JPEG
  const length = view.byteLength;
  let offset = 2;
  while (offset < length - 1) {
    const marker = view.getUint16(offset, false);
    if (marker === 0xFFE1) { // segmento APP1 (EXIF)
      const segLength = view.getUint16(offset + 2, false);
      const exifStart = offset + 4;
      if (exifStart + 4 > length || view.getUint32(exifStart, false) !== 0x45786966) {
        offset += 2 + segLength; continue; // no dice "Exif", seguimos buscando
      }
      const tiffOffset = exifStart + 6;
      if (tiffOffset + 8 > length) return 1;
      const little = view.getUint16(tiffOffset, false) === 0x4949;
      const firstIFDOffset = view.getUint32(tiffOffset + 4, little);
      const dirOffset = tiffOffset + firstIFDOffset;
      if (dirOffset + 2 > length) return 1;
      const entries = view.getUint16(dirOffset, little);
      for (let i = 0; i < entries; i++) {
        const entryOffset = dirOffset + 2 + i * 12;
        if (entryOffset + 10 > length) break;
        if (view.getUint16(entryOffset, little) === 0x0112) { // tag "Orientation"
          return view.getUint16(entryOffset + 8, little);
        }
      }
      return 1;
    } else if ((marker & 0xFF00) !== 0xFF00) {
      break; // ya no estamos en un marcador JPEG válido
    } else {
      offset += 2 + view.getUint16(offset + 2, false);
    }
  }
  return 1;
}

// Carga el archivo tal cual, sin tocar nada (para cuando el navegador ya
// corrige el EXIF solo, o cuando la foto ya viene derecha).
function loadImageAsIs(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ src: reader.result, imgObject: img });
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

// Dado un archivo, devuelve { src, imgObject } ya con la rotación/espejo del
// EXIF "horneada" en los píxeles (orientación 1 = normal). Solo se usa en
// navegadores que NO corrigen el EXIF solos (ver browserHandlesExifItself).
function bakeExifOrientation(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      let orientation = 1;
      try { orientation = getExifOrientation(buffer); } catch (e) { orientation = 1; }
      const blob = new Blob([buffer], { type: file.type || 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      const rawImg = new Image();
      rawImg.onload = () => {
        if (orientation <= 1) {
          // Ya viene derecha: usamos el archivo tal cual, sin recomprimir.
          const fr2 = new FileReader();
          fr2.onload = () => { URL.revokeObjectURL(blobUrl); resolve({ src: fr2.result, imgObject: rawImg }); };
          fr2.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('No se pudo leer la imagen')); };
          fr2.readAsDataURL(blob);
          return;
        }
        const swap = orientation >= 5 && orientation <= 8;
        const w = rawImg.width, h = rawImg.height;
        const canvas = document.createElement('canvas');
        canvas.width = swap ? h : w;
        canvas.height = swap ? w : h;
        const ctx = canvas.getContext('2d');
        switch (orientation) {
          case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
          case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
          case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
          case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
          case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
          case 7: ctx.transform(0, -1, -1, 0, h, w); break;
          case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
        }
        ctx.drawImage(rawImg, 0, 0);
        URL.revokeObjectURL(blobUrl);
        // Calidad alta para no perder detalle de cara a la impresión.
        const mime = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
        const correctedSrc = canvas.toDataURL(mime, 0.95);
        const correctedImg = new Image();
        correctedImg.onload = () => resolve({ src: correctedSrc, imgObject: correctedImg });
        correctedImg.onerror = () => reject(new Error('No se pudo re-generar la imagen corregida'));
        correctedImg.src = correctedSrc;
      };
      rawImg.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('No se pudo leer la imagen')); };
      rawImg.src = blobUrl;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

function loadNormalizedImage(file) {
  return browserHandlesExifItself().then(alreadyHandled => {
    return alreadyHandled ? loadImageAsIs(file) : bakeExifOrientation(file);
  });
}

let debounceTimer;
function debounce(callback, delay = 300) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(callback, delay);
}

// ================== PERSISTENCIA ==================
// La configuración de página/imagen (liviana) va en localStorage.
// Las imágenes (pesadas, en base64) van en IndexedDB: localStorage tiene
// un límite fijo del navegador de ~5-10MB que no se puede ampliar desde el
// código, mientras que IndexedDB da cientos de MB o más según el navegador.
const STORAGE_KEY = 'printLayoutState';
const IDB_NAME = 'printLayoutDB';
const IDB_VERSION = 1;
const IDB_STORE = 'images';
const IDB_IMAGES_KEY = 'currentImages';

function openImagesDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSetImages(value) {
  return openImagesDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, IDB_IMAGES_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGetImages() {
  return openImagesDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_IMAGES_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function idbClearImages() {
  return openImagesDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// ================== ORIGINALES EN ALTA CALIDAD ==================
// Para que la app sea fluida con muchas fotos pesadas, en pantalla se trabaja
// con una copia liviana de cada foto (la "vista previa", que es la que va en
// state.images[].src / imgObject). La foto ORIGINAL se guarda aparte, como Blob,
// en IndexedDB (clave "full:<id>") y solo se vuelve a leer al exportar el PDF,
// de a una foto por vez para no llenar la memoria.
const FULL_PREFIX = 'full:';
const fullBlobs = new Map(); // id -> Blob (original)

function idbSetKey(key, value) {
  return openImagesDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}
function idbGetKey(key) {
  return openImagesDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function idbDeleteKey(key) {
  return openImagesDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}
function forgetFullImage(id) {
  fullBlobs.delete(id);
  idbDeleteKey(FULL_PREFIX + id).catch(() => {});
}

// Lado largo de la vista previa: 2x el marco más grande (para poder hacer zoom
// a la foto sin que se pixele en pantalla), entre 1000 y 2400 px.
const PREVIEW_MIN = 1000, PREVIEW_MAX = 2400;
function previewLongSide() {
  const wCm = Math.max(parseLocaleNumber(preWidthInput.value) || 0, state.image.widthCm || 0);
  const hCm = Math.max(parseLocaleNumber(preHeightInput.value) || 0, state.image.heightCm || 0);
  const framePx = Math.max(cmToPx(wCm), cmToPx(hCm));
  return Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, Math.round(framePx * 2)));
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob());
}

// Dado { src, imgObject } de la foto completa, devuelve la vista previa liviana
// y (si la foto era más grande) el Blob del original. Si la foto ya es chica,
// se usa tal cual y no hace falta guardar un original aparte.
function fileToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
}

// Lee la foto para importarla. En navegadores que ya corrigen el EXIF solos se
// decodifica directo desde el archivo (rápido, sin pasar por base64); si no, se
// usa la ruta anterior que corrige la orientación a mano.
async function loadForImport(file) {
  if (await browserHandlesExifItself()) {
    const url = URL.createObjectURL(file);
    try {
      const imgObject = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('No se pudo leer la imagen'));
        im.src = url;
      });
      return { src: null, imgObject, blob: file };
    } finally { URL.revokeObjectURL(url); }
  }
  const full = await loadNormalizedImage(file);
  return { src: full.src, imgObject: full.imgObject, blob: null };
}

async function buildPreview(full, mime) {
  const w = full.imgObject.naturalWidth || full.imgObject.width;
  const h = full.imgObject.naturalHeight || full.imgObject.height;
  const k = Math.min(1, previewLongSide() / Math.max(w, h));
  if (k >= 1) {
    // Foto chica: se usa tal cual, no hace falta guardar un original aparte.
    const src = full.src || await fileToDataURL(full.blob);
    return { src, imgObject: full.imgObject, fullBlob: null };
  }

  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(full.imgObject, 0, 0, cw, ch);
  const src = mime === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
  c.width = c.height = 0;
  const imgObject = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('No se pudo generar la vista previa'));
    im.src = src;
  });
  const fullBlob = full.blob || await dataUrlToBlob(full.src);
  return { src, imgObject, fullBlob };
}

// Lee un original (Blob) como imagen. Se usa solo al exportar.
function loadFullImage(id) {
  return (async () => {
    let blob = fullBlobs.get(id);
    if (!blob) { try { blob = await idbGetKey(FULL_PREFIX + id); } catch (e) { blob = null; } }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      im.src = url;
    });
  })();
}

// Estado del procesamiento de fotos al importar (una por una, con progreso).
let importChain = Promise.resolve();
let importEpoch = 0;   // sube cada vez que se cierra el panel: descarta lo que quedó a medias
let importTotal = 0, importDone = 0;
function updateImportStatus() {
  const pending = importTotal - importDone;
  confirmImportBtn.disabled = pending > 0 || state.importQueue.length === 0;
  if (pending > 0) {
    preImportInfo.textContent = `Procesando fotos... ${importDone} de ${importTotal}`;
  } else if (state.importQueue.length > 0) {
    preImportInfo.textContent = `${state.importQueue.length} imagen(es) lista(s) para importar`;
  } else {
    preImportInfo.textContent = 'No has agregado imagenes';
  }
}

function saveState() {
  try {
    const stateToSave = { page: state.page, image: state.image };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (e) { console.error('Error al guardar configuración:', e); }

  const imagesToSave = state.images.map(img => ({
    id: img.id, src: img.src, name: img.name, hasFull: !!img.hasFull,
    widthCm: img.widthCm, heightCm: img.heightCm,
    imageRotation: img.imageRotation,
    hasManualRotation: !!img.hasManualRotation,
    cropX: img.cropX, cropY: img.cropY,
    cropWidth: img.cropWidth, cropHeight: img.cropHeight,
    keepAspectRatio: img.keepAspectRatio,
    zoomX: img.zoomX, zoomY: img.zoomY,
    posX: img.posX, posY: img.posY
  }));
  idbSetImages(imagesToSave).catch(e => console.error('Error al guardar imágenes (IndexedDB):', e));
}

function loadState() {
  let hasConfig = false;
  try {
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    if (savedConfig) {
      const loaded = JSON.parse(savedConfig);
      state.page = { ...state.page, ...loaded.page };
      state.image = { ...state.image, ...loaded.image };
      hasConfig = true;
    }
  } catch (e) { console.error('Error al cargar configuración:', e); }

  idbGetImages().then(savedImages => {
    if (!savedImages || !savedImages.length) { updateUI(); drawAll(); updateThumbnails(); return; }
    const imagePromises = savedImages.map(imgData => new Promise((resolve) => {
      const img = new Image();
      img.src = imgData.src;
      img.onload = () => { state.images.push({ ...imgData, imgObject: img }); resolve(); };
      img.onerror = () => resolve();
    }));
    Promise.all(imagePromises).then(() => { updateUI(); drawAll(); updateThumbnails(); });
  }).catch(e => {
    console.error('Error al cargar imágenes (IndexedDB):', e);
    updateUI(); drawAll(); updateThumbnails();
  });

  return hasConfig;
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    idbClearImages().catch(e => console.error('Error al limpiar imágenes guardadas:', e));
    state.images = []; state.pages = []; fullBlobs.clear();
    state.selectedImageId = null; state.editMode = false;
    if (typeof resetView === 'function') resetView();
    drawAll(); updateThumbnails(); adjustCanvasScale();
  } catch (e) { console.error('Error al limpiar estado:', e); }
}

// ================== ESCALADO VISUAL ==================
function adjustCanvasScale() {
  if (!canvasWrapper || !canvas) return;
  requestAnimationFrame(() => {
    const workspaceEl = canvasWrapper.parentElement;
    if (!workspaceEl) return;
    const padding = 140;
    const availableHeight = workspaceEl.clientHeight - padding;
    const availableWidth  = workspaceEl.clientWidth  - padding;
    if (canvas.height === 0 || canvas.width === 0) return;
    if (availableHeight <= 0 || availableWidth <= 0) return;
    const scaleH = availableHeight / canvas.height;
    const scaleW = availableWidth  / canvas.width;
    baseScale = Math.min(scaleH, scaleW);
    if (typeof applyTransform === 'function') applyTransform();
  });
}

function setupCanvas(resetZoom = false) {
  canvas.width = cmToPx(state.page.widthCm);
  canvas.height = cmToPx(state.page.heightCm);
  if (resetZoom && typeof resetView === 'function') resetView();
  drawAll(); adjustCanvasScale();
}

function updateUI() {
  const w = state.page.widthCm, h = state.page.heightCm;
  const knownSizes = {
    '22x32': [22, 32], '32x45': [32, 45], '32x48': [32, 48],
    'a4': [21, 29.7], 'a3': [29.7, 42], 'letter': [21.6, 27.9]
  };
  let matched = 'custom';
  for (const [key, [kw, kh]] of Object.entries(knownSizes)) {
    if (Math.abs(w - kw) < 0.01 && Math.abs(h - kh) < 0.01) { matched = key; break; }
  }
  paperSizeSelect.value = matched;
  customSizeInputs.style.display = matched === 'custom' ? 'block' : 'none';
  customWidthInput.value = w; customHeightInput.value = h;
  if (showBorderCheckbox) showBorderCheckbox.checked = !!state.image.showBorder;
  document.getElementById('imgWidth').value = state.image.widthCm;
  document.getElementById('imgHeight').value = state.image.heightCm;
  document.getElementById('margin').value = state.page.marginCm;
  document.getElementById('gap').value = state.image.gapCm;
}

// ================== PRE-IMPORT PANEL ==================
function openPreImportPanel() {
  preWidthInput.value = state.image.widthCm;
  preHeightInput.value = state.image.heightCm;
  preLockRatioInput.checked = lockRatioCheckbox.checked;
  preImportInfo.textContent = 'No has agregado imagenes';
  preImportPreview.innerHTML = '';
  preImportPanel.classList.remove('hidden');
  confirmImportBtn.disabled = state.importQueue.length === 0;
}
function closePreImportPanel() {
  preImportPanel.classList.add('hidden');
  importEpoch++; importTotal = 0; importDone = 0;
  state.importQueue = []; preImportInfo.textContent = '';
  preImportPreview.innerHTML = ''; imageInput.value = "";
}

confirmImportBtn.addEventListener('click', () => {
  let width = validateNumber(parseLocaleNumber(preWidthInput.value), LIMITS.minImageSize, LIMITS.maxImageSize);
  let height = validateNumber(parseLocaleNumber(preHeightInput.value), LIMITS.minImageSize, LIMITS.maxImageSize);
  if (state.importQueue.length === 0) { alert("No has agregado imagenes"); return; }
  snapshotState();
  state.image.widthCm = width; state.image.heightCm = height;
  if (showBorderCheckbox) showBorderCheckbox.checked = !!state.image.showBorder;
  document.getElementById('imgWidth').value = width;
  document.getElementById('imgHeight').value = height;
  lockRatioCheckbox.checked = preLockRatioInput.checked;
  state.importQueue.forEach(item => { state.files.push(item); });
  state.importQueue.forEach(item => {
    const newId = generateId();
    if (item.fullBlob) {
      fullBlobs.set(newId, item.fullBlob);
      idbSetKey(FULL_PREFIX + newId, item.fullBlob)
        .catch(e => console.error('No se pudo guardar el original (se mantiene en memoria):', e));
    }
    state.images.push({
      id: newId, src: item.src, name: item.name, imgObject: item.imgObject, hasFull: !!item.fullBlob,
      // La orientación de la FOTO dentro del marco la decide el motor de acomodo
      // (chooseBestPhotoRotation) para maximizar el área visible. El usuario puede
      // sobreescribirla después con el handle de giro (hasManualRotation = true).
      widthCm: width, heightCm: height, imageRotation: 0, hasManualRotation: false,
      cropX: 0, cropY: 0, cropWidth: item.imgObject.width, cropHeight: item.imgObject.height,
      keepAspectRatio: preLockRatioInput.checked,
      zoomX: 1, zoomY: 1, posX: 0, posY: 0
    });
  });
  closePreImportPanel(); drawAll(); updateThumbnails(); saveState();
});
cancelImportBtn.addEventListener('click', () => { closePreImportPanel(); });

// ============== LAYOUT ENGINE ===========
// 1) Orientación de marco ÚNICA para todo el trabajo:
//    Con el tamaño de hoja + tamaño de foto + margen + espaciado, se calcula UNA
//    sola vez si conviene más poner todos los marcos "parados" (w x h) o todos
//    "acostados" (h x w). Esa orientación se aplica a TODOS los marcos en TODAS
//    las hojas. Nunca se mezclan orientaciones de marco dentro de una hoja ni
//    entre hojas.
// 2) Ajuste automático de cada foto DENTRO de su marco:
//    Una vez fijo el tamaño/orientación del marco, para cada foto se elige
//    automáticamente si conviene dejarla tal cual o girarla 90° dentro del
//    marco para mostrar la mayor área posible de la foto (menos recorte).
//    El usuario solo afina con zoom/arrastre; el giro lo hace el sistema.
//    Si el usuario gira a mano después, se respeta (hasManualRotation).

function chooseBestPhotoRotation(imgObject, frameW, frameH) {
  if (!imgObject || !imgObject.width || !imgObject.height || frameW <= 0 || frameH <= 0) return 0;
  const photoW = imgObject.width;
  const photoH = imgObject.height;
  // Fracción visible = área del marco / (área foto * coverScale²)
  // Mayor fracción = menos recorte = mejor.
  const scale0 = Math.max(frameW / photoW, frameH / photoH);
  const visible0 = (frameW * frameH) / (photoW * photoH * scale0 * scale0);
  const scale90 = Math.max(frameW / photoH, frameH / photoW);
  const visible90 = (frameW * frameH) / (photoW * photoH * scale90 * scale90);
  return (visible90 > visible0 + 1e-9) ? 90 : 0;
}

function getSimImages(images) {
  return images.map(image => {
    // userRotation = giro de la FOTO dentro del marco (auto o manual).
    // El tamaño del marco (w/h) lo fija el motor de acomodo de forma global.
    const userRot = image.imageRotation || 0;
    return {
      img: image.imgObject,
      w: cmToPx(image.widthCm),
      h: cmToPx(image.heightCm),
      userRotation: userRot, layoutRotation: 0, id: image.id,
      zoomX: image.zoomX || 1, zoomY: image.zoomY || 1,
      posX: image.posX || 0, posY: image.posY || 0,
      _pinX: image._pinX, _pinY: image._pinY
    };
  });
}

function simulatePage(images, pageConfig) {
  const { pageWidth, pageHeight, margin, gap } = pageConfig;
  let cursorX = margin, cursorY = margin, rowHeight = 0;
  const placed = []; let usedArea = 0;
  for (const img of images) {
    const actualW = img.w, actualH = img.h;
    let px, py;
    if (img._pinX !== undefined && img._pinY !== undefined) {
      px = img._pinX; py = img._pinY;
    } else {
      if (cursorX + actualW > pageWidth - margin) {
        cursorX = margin; cursorY += rowHeight + gap; rowHeight = 0;
      }
      if (cursorY + actualH > pageHeight - margin) break;
      px = cursorX; py = cursorY;
      cursorX += actualW + gap; rowHeight = Math.max(rowHeight, actualH);
    }
    placed.push({
      img: img.img, x: px, y: py, w: actualW, h: actualH,
      userRotation: img.userRotation || 0, layoutRotation: img.layoutRotation || 0,
      zoomX: img.zoomX || 1, zoomY: img.zoomY || 1,
      posX: img.posX || 0, posY: img.posY || 0, id: img.id
    });
    usedArea += actualW * actualH;
  }
  const usableArea = (pageWidth - margin * 2) * (pageHeight - margin * 2);
  return { placed, count: placed.length, waste: usableArea - usedArea };
}

// ================== DIBUJO DE IMAGEN ==================
// Modelo tipo "pegar dentro" (Affinity): la foto es un objeto libre — se dibuja
// completa, a su tamaño y posición actuales — y el recuadro solo actúa como
// máscara de recorte (clip). No hay "crop de origen" ni límites de paneo: por
// eso siempre se puede arrastrar la foto a cualquier parte del recuadro,
// esté agrandada o achicada.
//
// IMPORTANTE: layoutRotation NUNCA rota el dibujo (ni la foto ni el borde) —
// solo cambia qué lado del marco (w o h) es el ancho y cuál el alto, para que
// el marco ocupe menos espacio en la hoja cuando conviene. Así el marco y la
// foto SIEMPRE se ven derechos en pantalla; lo único que puede rotar la foto
// es userRotation (el giro manual que el usuario aplica a mano con el ícono).
function drawImageItem(targetCtx, item, offsetX, offsetY) {
  const { img, x, y, w, h, userRotation = 0, layoutRotation = 0, zoomX = 1, zoomY = 1, posX = 0, posY = 0 } = item;
  const layoutRot = layoutRotation % 360;
  const cx = x + offsetX + w / 2;
  const cy = y + offsetY + h / 2;

  // El marco (w x h del item) ya viene con el ancho/alto que corresponde según
  // layoutRotation (el motor de acomodo ya los intercambió si hacía falta) —
  // acá se usa tal cual, sin ninguna rotación de dibujo.
  const containerW = w;
  const containerH = h;

  // Si el usuario giró la foto a mano 90/270, el espacio disponible para ella se invierte
  const userRotated = (userRotation === 90 || userRotation === 270);
  const photoSpaceW = userRotated ? containerH : containerW;
  const photoSpaceH = userRotated ? containerW : containerH;

  // Escala "cover": la mínima que hace que la foto cubra completo el espacio disponible.
  // zoomX/zoomY son multiplicadores sobre esa base: 1 = cubre justo el recuadro (default
  // al importar), más de 1 = más grande/zoom in, menos de 1 = más chica/zoom out.
  const coverScale = Math.max(photoSpaceW / img.width, photoSpaceH / img.height);
  const dispW = img.width * coverScale * zoomX;
  const dispH = img.height * coverScale * zoomY;

  targetCtx.save();
  targetCtx.translate(cx, cy);
  // Clip fijo = el rectangulo del contenedor, nunca cambia
  targetCtx.beginPath();
  targetCtx.rect(-containerW / 2, -containerH / 2, containerW, containerH);
  targetCtx.clip();
  // Rotar la foto dentro del contenedor (solo giro manual del usuario)
  if (userRotation !== 0) targetCtx.rotate(userRotation * Math.PI / 180);
  // Se dibuja la imagen completa a su tamaño (dispW x dispH), centrada + desplazada por
  // posX/posY. posX/posY están en el mismo espacio (ya rotado por userRotation), así que
  // mover el mouse mueve la foto siempre en la dirección esperada, sin importar su rotación.
  targetCtx.drawImage(img, -dispW / 2 + posX, -dispH / 2 + posY, dispW, dispH);
  targetCtx.restore();

  if (showBorderCheckbox && showBorderCheckbox.checked) {
    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.strokeStyle = 'rgba(0,0,0,0.85)';
    targetCtx.lineWidth = Math.max(1, Math.min(containerW, containerH) * 0.001);
    targetCtx.strokeRect(-containerW / 2, -containerH / 2, containerW, containerH);
    targetCtx.restore();
  }
}

// ================== DIBUJO DE HANDLES ==================
function getHandleRadius(w, h) {
  return Math.max(8, Math.min(w, h) * 0.04);
}

// Determina el punto de anclaje del handle de giro en el borde real del contenedor,
// siguiendo la orientación actual de la foto (0/90/180/270): si la foto está girada,
// el control se mueve al borde correspondiente para que se vea hacia dónde se giró.
// Si ese borde queda pegado arriba del área visible del canvas, usa el lado opuesto.
function getRotHandleAnchor(item, offsetX, offsetY) {
  const { w, h, userRotation = 0 } = item;
  const rot = ((userRotation % 360) + 360) % 360;
  let dirX = 0, dirY = -1; // 0°: arriba
  if (rot === 90)  { dirX = 1;  dirY = 0; }  // 90°: derecha
  if (rot === 180) { dirX = 0;  dirY = 1; }  // 180°: abajo
  if (rot === 270) { dirX = -1; dirY = 0; }  // 270°: izquierda

  let edgeX = dirX * w / 2;
  let edgeY = dirY * h / 2;

  const R = getHandleRadius(w, h);
  const clearance = R * 4 + R;
  const topEdgeCanvas = item.y + offsetY;
  if (edgeY < 0 && topEdgeCanvas < clearance) {
    edgeX = -edgeX; edgeY = -edgeY; dirX = -dirX; dirY = -dirY;
  }
  return { x: edgeX, y: edgeY, dirX, dirY };
}

function drawHandles(targetCtx, item, offsetX, offsetY) {
  const { x, y, w, h } = item;
  const cx = x + offsetX + w / 2;
  const cy = y + offsetY + h / 2;
  const R = getHandleRadius(w, h);

  targetCtx.save();
  targetCtx.translate(cx, cy);

  // Selection border
  targetCtx.strokeStyle = '#1d6ef5';
  targetCtx.lineWidth = Math.max(2, Math.min(w, h) * 0.007);
  targetCtx.setLineDash([]);
  targetCtx.strokeRect(-w / 2, -h / 2, w, h);

  // Scale handles
  const positions = [
    [-w/2, -h/2], [0, -h/2], [w/2, -h/2],
    [-w/2,  0],               [w/2,  0],
    [-w/2,  h/2], [0,  h/2], [w/2,  h/2]
  ];
  positions.forEach(([hx, hy]) => {
    targetCtx.beginPath();
    targetCtx.arc(hx, hy, R, 0, Math.PI * 2);
    targetCtx.fillStyle = '#ffffff';
    targetCtx.fill();
    targetCtx.strokeStyle = '#1d6ef5';
    targetCtx.lineWidth = Math.max(1.5, R * 0.35);
    targetCtx.stroke();
  });

  // Rotate handle: el punto de anclaje sigue la rotación actual de la foto (item.userRotation),
  // así que al girarla el control se mueve con ella (arriba/derecha/abajo/izquierda).
  const anchor = getRotHandleAnchor(item, offsetX, offsetY);
  const rotHandleX = anchor.x + anchor.dirX * R * 4;
  const rotHandleY = anchor.y + anchor.dirY * R * 4;

  targetCtx.beginPath();
  targetCtx.moveTo(anchor.x, anchor.y);
  targetCtx.lineTo(rotHandleX, rotHandleY);
  targetCtx.strokeStyle = '#1d6ef5';
  targetCtx.lineWidth = Math.max(1.5, R * 0.35);
  targetCtx.stroke();

  targetCtx.beginPath();
  targetCtx.arc(rotHandleX, rotHandleY, R, 0, Math.PI * 2);
  targetCtx.fillStyle = '#1d6ef5';
  targetCtx.fill();
  targetCtx.strokeStyle = '#ffffff';
  targetCtx.lineWidth = Math.max(1.5, R * 0.35);
  targetCtx.stroke();

  // Icono de giro (arco con flecha), orientado para que siempre "mire" hacia afuera del marco
  const iconAngle = Math.atan2(anchor.dirY, anchor.dirX) + Math.PI / 2;
  targetCtx.save();
  targetCtx.translate(rotHandleX, rotHandleY);
  targetCtx.rotate(iconAngle);
  targetCtx.beginPath();
  targetCtx.arc(0, 0, R * 0.55, -Math.PI * 0.7, Math.PI * 0.3);
  targetCtx.strokeStyle = '#ffffff';
  targetCtx.lineWidth = Math.max(1, R * 0.25);
  targetCtx.stroke();
  targetCtx.restore();

  targetCtx.restore();
}

// El motor de layout acomoda las imágenes desde la esquina superior izquierda
// (fila por fila), así que si no llenan toda la hoja quedan pegadas arriba/izquierda
// con espacio vacío a la derecha o abajo. Esta función centra el bloque completo
// de imágenes ya ubicadas dentro del área imprimible (hoja menos márgenes).
function centerPlacedItems(placed, pageWidth, pageHeight, margin) {
  if (placed.length === 0) return placed;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  placed.forEach(it => {
    minX = Math.min(minX, it.x);
    minY = Math.min(minY, it.y);
    maxX = Math.max(maxX, it.x + it.w);
    maxY = Math.max(maxY, it.y + it.h);
  });
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const areaW = pageWidth - margin * 2;
  const areaH = pageHeight - margin * 2;
  const offsetX = margin + (areaW - contentW) / 2 - minX;
  const offsetY = margin + (areaH - contentH) / 2 - minY;
  return placed.map(it => ({ ...it, x: it.x + offsetX, y: it.y + offsetY }));
}

// ================== DIBUJO PRINCIPAL ==================
// ================== CÁLCULO DE LAYOUT (bin-packing) ==================
// Corre el motor de acomodo de imágenes en las hojas. Solo hace falta recalcularlo
// cuando cambia la composición (se agrega/quita una imagen, cambia su tamaño en cm, o
// el tamaño/margen/espacio de la página) — nunca por mover, girar o hacerle zoom a una
// foto DENTRO de su propio recuadro, que no afecta el acomodo entre recuadros.
function computeLayout() {
  state.pages = [];
  const gap = cmToPx(state.image.gapCm);
  const margin = cmToPx(state.page.marginCm);
  const pageWidth = cmToPx(state.page.widthCm);
  const pageHeight = cmToPx(state.page.heightCm);
  const pageConfig = { pageWidth, pageHeight, margin, gap };

  const frameW0 = cmToPx(state.image.widthCm);
  const frameH0 = cmToPx(state.image.heightCm);

  // --- 1. Decidir UNA sola orientación de marco para todo el trabajo ---
  // Probamos las dos opciones (tal cual / intercambiada) empacando el set completo
  // y elegimos la que coloca más fotos en total, o a igualdad la que usa menos
  // hojas, o a igualdad la de menor desperdicio. Empate final → se queda la original.
  const base = getSimImages(state.images);
  const variantA = base.map(img => ({ ...img, w: frameW0, h: frameH0, layoutRotation: 0 }));
  const variantB = base.map(img => ({ ...img, w: frameH0, h: frameW0, layoutRotation: 90 }));

  function fullPackStats(variant) {
    let rem = variant.slice();
    let pagesCount = 0, totalPlaced = 0, totalWaste = 0;
    while (rem.length > 0) {
      const sim = simulatePage(rem, pageConfig);
      if (sim.count === 0) break;
      pagesCount++;
      totalPlaced += sim.count;
      totalWaste += sim.waste;
      rem = rem.slice(sim.count);
    }
    return { pagesCount, totalPlaced, totalWaste };
  }

  const statsA = fullPackStats(variantA);
  const statsB = fullPackStats(variantB);

  let useSwap = false;
  if (statsB.totalPlaced > statsA.totalPlaced) useSwap = true;
  else if (statsB.totalPlaced === statsA.totalPlaced) {
    if (statsB.pagesCount < statsA.pagesCount) useSwap = true;
    else if (statsB.pagesCount === statsA.pagesCount && statsB.totalWaste < statsA.totalWaste) useSwap = true;
  }

  const chosenFW = useSwap ? frameH0 : frameW0;
  const chosenFH = useSwap ? frameW0 : frameH0;
  const globalLayoutRot = useSwap ? 90 : 0;

  // --- 2. Auto-orientar cada foto dentro del marco elegido (si el usuario no giró a mano) ---
  state.images.forEach(image => {
    if (!image.hasManualRotation) {
      image.imageRotation = chooseBestPhotoRotation(image.imgObject, chosenFW, chosenFH);
    }
  });

  // --- 3. Empacar con el tamaño de marco global fijo ---
  let remaining = getSimImages(state.images).map(img => ({
    ...img,
    w: chosenFW,
    h: chosenFH,
    layoutRotation: globalLayoutRot
  }));

  while (remaining.length > 0) {
    const sim = simulatePage(remaining, pageConfig);
    if (sim.count === 0) break;
    state.pages.push(centerPlacedItems(sim.placed, pageWidth, pageHeight, margin));
    remaining = remaining.slice(sim.count);
  }
}

// ================== DIBUJO EN CANVAS ==================
// Solo dibuja lo que ya está calculado en state.pages — no vuelve a correr el acomodo.
// Esto es lo que se usa en cada frame mientras se arrastra/gira/hace zoom a una imagen,
// para que se sienta fluido en vez de recalcular el bin-packing 60 veces por segundo.
function renderCanvas() {
  const pageWidth = cmToPx(state.page.widthCm);
  const pageHeight = cmToPx(state.page.heightCm);
  const pageGap = cmToPx(2);
  const cols = Math.max(1, Math.ceil(Math.sqrt(state.pages.length)));
  const rows = Math.max(1, Math.ceil(state.pages.length / cols));

  if (state.pages.length === 0) {
    canvas.width = pageWidth; canvas.height = pageHeight;
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pageWidth, pageHeight);
    adjustCanvasScale(); return;
  }

  canvas.width = cols * (pageWidth + pageGap) - pageGap;
  canvas.height = rows * (pageHeight + pageGap) - pageGap;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2a2a2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);

  state.pages.forEach((page, index) => {
    const col = index % cols, row = Math.floor(index / cols);
    const offsetX = col * (pageWidth + pageGap);
    const offsetY = row * (pageHeight + pageGap);
    ctx.fillStyle = "#fff"; ctx.fillRect(offsetX, offsetY, pageWidth, pageHeight);
    page.forEach(item => { drawImageItem(ctx, item, offsetX, offsetY); });
  });

  // Draw handles overlay for selected image in edit mode
  if (state.editMode && state.selectedImageId) {
    const editItem = findPlacedItem(state.selectedImageId);
    if (editItem) drawHandles(ctx, editItem.item, editItem.offsetX, editItem.offsetY);
  }

  adjustCanvasScale();
  // Limpiar pins de rotación (solo válidos por un ciclo de dibujo)
  state.images.forEach(img => { delete img._pinX; delete img._pinY; });
}

function drawAll() {
  computeLayout();
  renderCanvas();
}

// Actualiza, dentro del layout YA calculado, los datos "en vivo" de una imagen puntual
// (zoom, posición, rotación) sin volver a correr el motor de acomodo completo — para
// que arrastrar/girar/hacer zoom se sienta instantáneo.
function syncItemIntoPages(imgId) {
  const img = state.images.find(i => i.id === imgId);
  if (!img || !state.pages) return;
  for (const page of state.pages) {
    const item = page.find(it => it.id === imgId);
    if (item) {
      item.userRotation = img.imageRotation || 0;
      item.zoomX = img.zoomX || 1;
      item.zoomY = img.zoomY || 1;
      item.posX = img.posX || 0;
      item.posY = img.posY || 0;
      break;
    }
  }
}

// ================== THUMBNAILS (2 por fila) ==================
function updateThumbnails() {
  thumbnailsContainer.innerHTML = '';
  state.images.forEach((file, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumbnail';
    if (state.selectedImageId === file.id) thumb.classList.add('selected');

    const img = document.createElement('img');
    img.src = file.src;
    thumb.appendChild(img);

    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.title = 'Eliminar';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      snapshotState();
      state.images.splice(i, 1);
      forgetFullImage(file.id);
      if (state.selectedImageId === file.id) { state.selectedImageId = null; state.editMode = false; }
      drawAll(); updateThumbnails(); saveState();
    };
    thumb.appendChild(delBtn);

    thumb.addEventListener('click', () => {
      if (state.selectedImageId === file.id) {
        state.selectedImageId = null; state.editMode = false;
      } else {
        state.selectedImageId = file.id; state.editMode = false;
      }
      updateThumbnails(); updateEditPanel(); drawAll();
    });

    thumbnailsContainer.appendChild(thumb);
  });
  updateEditPanel();
}

// ================== PANEL DE EDICIÓN INDIVIDUAL ==================
function updateEditPanel() {
  let editPanel = document.getElementById('editImagePanel');
  if (!editPanel) {
    editPanel = document.createElement('div');
    editPanel.id = 'editImagePanel';
    editPanel.className = 'edit-image-panel';
    const rightPanel = document.getElementById('rightPanel');
    rightPanel.appendChild(editPanel);
  }

  const img = state.selectedImageId ? state.images.find(i => i.id === state.selectedImageId) : null;

  if (!img || !state.editMode) {
    editPanel.style.display = 'none';
    return;
  }

  editPanel.style.display = 'block';
  editPanel.innerHTML = `
    <div class="edit-panel-title">Tamaño de esta imagen</div>
    <div class="edit-panel-row">
      <label>Ancho (cm)</label>
      <input type="text" inputmode="decimal" id="editImgWidth" value="${img.widthCm}">
    </div>
    <div class="edit-panel-row">
      <label>Alto (cm)</label>
      <input type="text" inputmode="decimal" id="editImgHeight" value="${img.heightCm}">
    </div>
    <label class="checkbox-row" style="margin-top:6px; font-size:11px; color:var(--text-muted);">
      <input type="checkbox" id="editLockRatio" ${img.keepAspectRatio ? 'checked' : ''}>
      &nbsp;Mantener proporción
    </label>
  `;

  const wInput = editPanel.querySelector('#editImgWidth');
  const hInput = editPanel.querySelector('#editImgHeight');
  const lockInput = editPanel.querySelector('#editLockRatio');

  let editRatio = img.widthCm / img.heightCm;

  wInput.addEventListener('input', () => {
    const parsed = parseLocaleNumber(wInput.value);
    if (isNaN(parsed)) return; // a mitad de escribir un decimal (ej. "6," o "6.") — esperamos
    snapshotState();
    const val = validateNumber(parsed, LIMITS.minImageSize, LIMITS.maxImageSize);
    img.widthCm = val;
    if (lockInput.checked && editRatio) {
      img.heightCm = parseFloat((val / editRatio).toFixed(2));
      hInput.value = img.heightCm;
    }
    debounce(() => { drawAll(); saveState(); }, 200);
  });
  wInput.addEventListener('blur', () => { wInput.value = img.widthCm; });

  hInput.addEventListener('input', () => {
    const parsed = parseLocaleNumber(hInput.value);
    if (isNaN(parsed)) return;
    snapshotState();
    const val = validateNumber(parsed, LIMITS.minImageSize, LIMITS.maxImageSize);
    img.heightCm = val;
    if (lockInput.checked && editRatio) {
      img.widthCm = parseFloat((val * editRatio).toFixed(2));
      wInput.value = img.widthCm;
    }
    debounce(() => { drawAll(); saveState(); }, 200);
  });
  hInput.addEventListener('blur', () => { hInput.value = img.heightCm; });

  lockInput.addEventListener('change', () => {
    img.keepAspectRatio = lockInput.checked;
    if (lockInput.checked) editRatio = img.widthCm / img.heightCm;
  });
}

// ================== HELPERS ==================
function findPlacedItem(imageId) {
  const pageWidth = cmToPx(state.page.widthCm);
  const pageHeight = cmToPx(state.page.heightCm);
  const pageGap = cmToPx(2);
  const cols = Math.max(1, Math.ceil(Math.sqrt(state.pages.length)));
  for (let index = 0; index < state.pages.length; index++) {
    const page = state.pages[index];
    const col = index % cols, row = Math.floor(index / cols);
    const offsetX = col * (pageWidth + pageGap);
    const offsetY = row * (pageHeight + pageGap);
    const item = page.find(it => it.id === imageId);
    if (item) return { item, offsetX, offsetY };
  }
  return null;
}

function hitTestCanvas(canvasX, canvasY) {
  const pageWidth = cmToPx(state.page.widthCm);
  const pageHeight = cmToPx(state.page.heightCm);
  const pageGap = cmToPx(2);
  const cols = Math.max(1, Math.ceil(Math.sqrt(state.pages.length)));
  for (let index = state.pages.length - 1; index >= 0; index--) {
    const page = state.pages[index];
    const col = index % cols, row = Math.floor(index / cols);
    const offsetX = col * (pageWidth + pageGap);
    const offsetY = row * (pageHeight + pageGap);
    for (let i = page.length - 1; i >= 0; i--) {
      const item = page[i];
      const lx = canvasX - offsetX - item.x;
      const ly = canvasY - offsetY - item.y;
      if (lx >= 0 && lx <= item.w && ly >= 0 && ly <= item.h) return { item, offsetX, offsetY };
    }
  }
  return null;
}

function hitTestHandles(canvasX, canvasY) {
  if (!state.editMode || !state.selectedImageId) return null;
  const found = findPlacedItem(state.selectedImageId);
  if (!found) return null;
  const { item, offsetX, offsetY } = found;
  const { x, y, w, h } = item;
  const cx = x + offsetX + w / 2;
  const cy = y + offsetY + h / 2;
  const R = getHandleRadius(w, h) * 2.5; // hit area bigger than visual
  const visualR = getHandleRadius(w, h); // usado solo para ubicar el handle de giro, igual que en drawHandles

  const lx = canvasX - cx, ly = canvasY - cy;

  const anchor = getRotHandleAnchor(item, offsetX, offsetY);
  const rotHandleX = anchor.x + anchor.dirX * visualR * 4;
  const rotHandleY = anchor.y + anchor.dirY * visualR * 4;
  const handles = [
    { name: 'tl', hx: -w/2, hy: -h/2 }, { name: 'tm', hx: 0, hy: -h/2 }, { name: 'tr', hx: w/2, hy: -h/2 },
    { name: 'ml', hx: -w/2, hy: 0 },                                       { name: 'mr', hx: w/2, hy: 0 },
    { name: 'bl', hx: -w/2, hy: h/2 },  { name: 'bm', hx: 0, hy: h/2 },  { name: 'br', hx: w/2, hy: h/2 },
    { name: 'rotate', hx: rotHandleX, hy: rotHandleY }
  ];
  for (const handle of handles) {
    if (Math.hypot(lx - handle.hx, ly - handle.hy) <= R) return { handle: handle.name, item, offsetX, offsetY };
  }
  if (lx >= -w/2 && lx <= w/2 && ly >= -h/2 && ly <= h/2) return { handle: 'move', item, offsetX, offsetY };
  return null;
}

function screenToCanvas(screenX, screenY) {
  const rect = canvas.getBoundingClientRect();
  const scaleTotal = baseScale * (typeof zoom !== 'undefined' ? zoom : 1);
  return { x: (screenX - rect.left) / scaleTotal, y: (screenY - rect.top) / scaleTotal };
}

// ================== HANDLE DRAG ==================
let activeHandle = null;
let handleDragStart = null;
let handleImageSnapshot = null;

canvas.addEventListener('dblclick', (e) => {
  const pos = screenToCanvas(e.clientX, e.clientY);
  const hit = hitTestCanvas(pos.x, pos.y);
  if (hit) {
    state.selectedImageId = hit.item.id;
    state.editMode = true;
    updateThumbnails(); updateEditPanel(); drawAll();
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const pos = screenToCanvas(e.clientX, e.clientY);

  if (state.editMode && state.selectedImageId) {
    const handleHit = hitTestHandles(pos.x, pos.y);
    if (handleHit) {
      snapshotState();
      activeHandle = handleHit.handle;
      handleDragStart = {
        canvasX: pos.x, canvasY: pos.y,
        // Centro del contenedor y su rotación de layout, para calcular el ángulo
        // del mouse respecto al centro mientras se arrastra el control de giro.
        cx: handleHit.item.x + handleHit.offsetX + handleHit.item.w / 2,
        cy: handleHit.item.y + handleHit.offsetY + handleHit.item.h / 2
      };
      const img = state.images.find(i => i.id === state.selectedImageId);
      if (img) {
        handleImageSnapshot = {
          widthCm: img.widthCm, heightCm: img.heightCm,
          posX: img.posX || 0, posY: img.posY || 0,
          zoomX: img.zoomX || 1, zoomY: img.zoomY || 1,
          imageRotation: img.imageRotation || 0
        };
      }
      e.stopPropagation(); e.preventDefault(); return;
    } else {
      // Click outside handles
      const clickedItem = hitTestCanvas(pos.x, pos.y);
      if (!clickedItem || clickedItem.item.id !== state.selectedImageId) {
        state.editMode = false;
        state.selectedImageId = clickedItem ? clickedItem.item.id : null;
        updateThumbnails(); updateEditPanel(); drawAll(); return;
      }
    }
  } else {
    const hit = hitTestCanvas(pos.x, pos.y);
    if (hit) {
      state.selectedImageId = hit.item.id;
      updateThumbnails(); updateEditPanel(); drawAll();
    } else {
      state.selectedImageId = null; state.editMode = false;
      updateThumbnails(); updateEditPanel(); drawAll();
    }
  }
});

document.addEventListener('mousemove', (e) => {
  if (!activeHandle || !handleDragStart || !handleImageSnapshot) return;
  const img = state.images.find(i => i.id === state.selectedImageId);
  if (!img) return;

  const pos = screenToCanvas(e.clientX, e.clientY);
  const dxCanvas = pos.x - handleDragStart.canvasX;
  const dyCanvas = pos.y - handleDragStart.canvasY;
  const snap = handleImageSnapshot;
  const shiftHeld = e.shiftKey;

  // Cuando la foto esta rotada 90 o 270 grados dentro del contenedor,
  // el eje X del canvas corresponde al eje Y de la foto y viceversa.
  // Rotacion 180: ambos ejes se invierten.
  const rot = img.imageRotation || 0;
  let dx, dy;
  if (rot === 90)  { dx =  dyCanvas; dy = -dxCanvas; }
  else if (rot === 180) { dx = -dxCanvas; dy = -dyCanvas; }
  else if (rot === 270) { dx = -dyCanvas; dy =  dxCanvas; }
  else               { dx =  dxCanvas; dy =  dyCanvas; }

  if (activeHandle === 'move') {
    // La foto es un objeto libre: se mueve 1:1 con el mouse, sin recortes ni límites de
    // paneo — se puede arrastrar a cualquier parte del recuadro (o más allá; el marco
    // solo la recorta visualmente). Esto es lo que antes fallaba: al achicar la foto
    // el cálculo de límites se volvía negativo y la dejaba pegada siempre en la misma esquina.
    img.posX = (snap.posX || 0) + dx;
    img.posY = (snap.posY || 0) + dy;

  } else if (activeHandle === 'rotate') {
    // Giro en vivo: se calcula el ángulo del mouse respecto al centro del contenedor
    // y se redondea al múltiplo de 90° más cercano — así la foto (y el control de giro,
    // que sigue esa misma rotación) se ven "girar" mientras arrastrás, como en Affinity.
    const dxc = pos.x - handleDragStart.cx;
    const dyc = pos.y - handleDragStart.cy;
    if (Math.hypot(dxc, dyc) > 4) { // evita saltos cuando el mouse pasa muy cerca del centro
      const angleDeg = Math.atan2(dyc, dxc) * 180 / Math.PI;
      let newRot = Math.round((angleDeg + 90) / 90) * 90;
      newRot = ((newRot % 360) + 360) % 360;
      if (newRot !== (img.imageRotation || 0)) {
        img.imageRotation = newRot;
        img.hasManualRotation = true;
        img.posX = 0; img.posY = 0;
      }
    }

  } else {
    // Scale: tamaño de la foto dentro del contenedor (multiplicador sobre el ajuste "cover")
    const isLeft   = activeHandle.includes('l');
    const isRight  = activeHandle.includes('r');
    const isTop    = activeHandle.startsWith('t');
    const isBottom = activeHandle.startsWith('b');

    // Contenedor siempre widthCm x heightCm
    const boxWpx = cmToPx(img.widthCm);
    const boxHpx = cmToPx(img.heightCm);

    // Sensibilidad basada en el tamanio del contenedor
    const sensitivityX = (snap.zoomX * 2) / boxWpx;
    const sensitivityY = (snap.zoomY * 2) / boxHpx;

    let dzX = 0, dzY = 0;
    if (isRight)  dzX =  dx * sensitivityX;
    if (isLeft)   dzX = -dx * sensitivityX;
    if (isBottom) dzY =  dy * sensitivityY;
    if (isTop)    dzY = -dy * sensitivityY;

    let newZoomX = Math.max(LIMITS.minPhotoZoom, Math.min(LIMITS.maxPhotoZoom, snap.zoomX + dzX));
    let newZoomY = Math.max(LIMITS.minPhotoZoom, Math.min(LIMITS.maxPhotoZoom, snap.zoomY + dzY));

    if (shiftHeld && ['tl','tr','bl','br'].includes(activeHandle)) {
      const dominantDZ = Math.abs(dzX) >= Math.abs(dzY) ? dzX : dzY;
      const avgZoom = (snap.zoomX + snap.zoomY) / 2;
      const newZoom = Math.max(LIMITS.minPhotoZoom, Math.min(LIMITS.maxPhotoZoom, avgZoom + dominantDZ));
      newZoomX = newZoom;
      newZoomY = newZoom;
    }

    if (activeHandle === 'tm' || activeHandle === 'bm') { newZoomX = snap.zoomX; }
    if (activeHandle === 'ml' || activeHandle === 'mr') { newZoomY = snap.zoomY; }

    img.zoomX = newZoomX;
    img.zoomY = newZoomY;
  }

  // Camino rápido: no se recalcula el acomodo de la hoja durante el arrastre (mover,
  // girar y hacer zoom no cambian el tamaño ni la posición del recuadro en la página),
  // solo se sincroniza el dato en vivo y se vuelve a dibujar.
  syncItemIntoPages(img.id);
  renderCanvas();
});

document.addEventListener('mouseup', () => {
  if (activeHandle) {
    // El giro ya se aplicó en vivo durante el arrastre (ver 'rotate' en mousemove);
    // acá solo queda soltar el handle activo.
    activeHandle = null; handleDragStart = null; handleImageSnapshot = null;
    saveState(); drawAll();
  }
});

// Zoom con rueda sobre imagen en edit mode
let wheelSaveTimer;
canvas.addEventListener('wheel', (e) => {
  if (!state.selectedImageId || !state.editMode) return;
  e.preventDefault();
  const image = state.images.find(img => img.id === state.selectedImageId);
  if (!image) return;
  const step = e.ctrlKey ? 0.05 : 0.1;
  const dir = e.deltaY > 0 ? -1 : 1;
  image.zoomX = Math.max(LIMITS.minPhotoZoom, Math.min(LIMITS.maxPhotoZoom, (image.zoomX || 1) + step * dir));
  image.zoomY = image.zoomX;
  // La foto es un objeto libre: no hay recorte de origen que re-limitar al cambiar el
  // zoom, así que su posición (posX/posY) no se toca — el usuario la puede recentrar
  // arrastrándola en cualquier momento, incluso con la foto bien achicada.

  // Camino rápido (igual que en el arrastre): el zoom de la foto no cambia el acomodo
  // de la hoja, así que no hace falta recalcularlo en cada "scroll" de la rueda.
  syncItemIntoPages(image.id);
  renderCanvas();
  // saveState() escribe TODAS las imágenes (con su base64 completo) en
  // IndexedDB — hacerlo en cada tick de la rueda (varias veces por segundo
  // mientras se hace zoom) es lo que volvía lento el scroll con varias fotos
  // cargadas. Se guarda recién 300ms después del último "tick", no en cada
  // uno. Usa su propio timer (no el debounce() compartido con los inputs de
  // texto) para no cancelar un guardado pendiente de otro campo si el
  // usuario escribe y hace zoom casi al mismo tiempo.
  clearTimeout(wheelSaveTimer);
  wheelSaveTimer = setTimeout(() => saveState(), 300);
});

// Cursor dinámico
canvas.addEventListener('mousemove', (e) => {
  if (!state.editMode || !state.selectedImageId) { canvas.style.cursor = ''; return; }
  const pos = screenToCanvas(e.clientX, e.clientY);
  const handleHit = hitTestHandles(pos.x, pos.y);
  if (!handleHit) { canvas.style.cursor = ''; return; }
  const cursors = {
    tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize',
    tm: 'ns-resize', bm: 'ns-resize', ml: 'ew-resize', mr: 'ew-resize',
    rotate: 'crosshair', move: 'move'
  };
  canvas.style.cursor = cursors[handleHit.handle] || 'default';
});

// ================== CARGA IMAGENES ==================
// Procesa un lote de archivos con hasta 3 fotos a la vez (no las 50 juntas: cada
// foto grande decodificada ocupa decenas de MB). El resultado se agrega a la cola
// SIEMPRE en el mismo orden en que se eligieron los archivos.
const IMPORT_CONCURRENCY = 3;
async function processImportBatch(files, epoch) {
  const results = new Array(files.length).fill(null);
  const done = new Array(files.length).fill(false);
  let nextToStart = 0, nextToFlush = 0;

  const flush = () => {
    while (nextToFlush < files.length && done[nextToFlush]) {
      const r = results[nextToFlush];
      if (r) {
        state.importQueue.push(r);
        const preview = document.createElement('img');
        preview.src = r.src;
        preview.style.cssText = 'height:60px; border-radius:4px; object-fit:cover;';
        preImportPreview.appendChild(preview);
      }
      nextToFlush++;
    }
  };

  const worker = async () => {
    while (epoch === importEpoch) {
      const i = nextToStart++;
      if (i >= files.length) return;
      const file = files[i];
      try {
        const full = await loadForImport(file);
        const prev = await buildPreview(full, file.type);
        results[i] = { src: prev.src, name: file.name, imgObject: prev.imgObject, fullBlob: prev.fullBlob };
      } catch (err) {
        console.error('Error al procesar imagen:', err);
        if (epoch === importEpoch) alert(`No se pudo cargar "${file.name}": ${err.message}`);
      }
      done[i] = true;
      if (epoch === importEpoch) { importDone++; flush(); updateImportStatus(); }
    }
  };

  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, worker));
}

imageInput.addEventListener("change", e => {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (!files.length) return;
  const epoch = importEpoch;
  importTotal += files.length;
  updateImportStatus();
  importChain = importChain.then(() => processImportBatch(files, epoch));
});
openPreImportBtn.addEventListener('click', openPreImportPanel);

// ================== CONTROLES GLOBALES ==================
["imgWidth", "imgHeight", "margin", "gap"].forEach(id => {
  const input = document.getElementById(id);
  if (!input) return;
  let inputSnapshotted = false;
  input.addEventListener("focus", () => { inputSnapshotted = false; });
  input.addEventListener("input", () => {
    if (!inputSnapshotted) { snapshotState(); inputSnapshotted = true; }
    // Acepta "6.5" y "6,5". No reescribimos input.value mientras se escribe:
    // hacerlo en cada tecla es lo que le borraba el separador decimal a mitad de escritura.
    const parsed = parseLocaleNumber(input.value);
    if (isNaN(parsed)) return;
    let value = parsed;
    if (id === "imgWidth") {
      value = validateNumber(value, LIMITS.minImageSize, LIMITS.maxImageSize);
      state.image.widthCm = value;
      state.images.forEach(img => { img.widthCm = value; });
    }
    if (id === "imgHeight") {
      value = validateNumber(value, LIMITS.minImageSize, LIMITS.maxImageSize);
      state.image.heightCm = value;
      state.images.forEach(img => { img.heightCm = value; });
    }
    if (id === "margin") {
      value = validateNumber(value, LIMITS.minMargin, LIMITS.maxMargin);
      state.page.marginCm = value;
    }
    if (id === "gap") {
      value = validateNumber(value, LIMITS.minGap, LIMITS.maxGap);
      state.image.gapCm = value;
    }
    debounce(() => { drawAll(); saveState(); }, 300);
  });
  // Al salir del campo, se normaliza el texto visible al valor válido ya aplicado.
  input.addEventListener("blur", () => {
    const value = id === "imgWidth" ? state.image.widthCm
      : id === "imgHeight" ? state.image.heightCm
      : id === "margin" ? state.page.marginCm
      : state.image.gapCm;
    input.value = value;
  });
});

// Flechas subir/bajar de "margen" y "espaciado". Reusan el mismo listener
// "input" de arriba (que valida, guarda estado para el Cmd+Z y persiste),
// así que solo hay que actualizar el valor del campo y disparar ese evento.
const STEPPER_STEP = { margin: 0.1, gap: 0.01 };
document.querySelectorAll('.stepper-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const step = STEPPER_STEP[targetId] || 0.1;
    const dir = btn.dataset.dir === 'up' ? 1 : -1;
    const min = targetId === 'margin' ? LIMITS.minMargin : LIMITS.minGap;
    const max = targetId === 'margin' ? LIMITS.maxMargin : LIMITS.maxGap;
    const current = parseLocaleNumber(input.value);
    const base = isNaN(current) ? min : current;
    // Redondeo para evitar restos de coma flotante tipo 0.30000000000000004
    const next = Math.round((validateNumber(base + step * dir, min, max)) * 100) / 100;
    // El "focus" sintético hace que el listener de abajo tome una foto para el
    // Cmd+Z antes de este cambio puntual, para que cada click de flecha sea un
    // paso de deshacer aparte (igual que si se escribiera y se saliera del campo).
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  });
});

paperSizeSelect.addEventListener("change", () => {
  snapshotState();
  const val = paperSizeSelect.value;
  const sizes = {
    '22x32': [22, 32], '32x45': [32, 45], '32x48': [32, 48],
    'a4': [21, 29.7], 'a3': [29.7, 42], 'letter': [21.6, 27.9]
  };
  if (sizes[val]) {
    [state.page.widthCm, state.page.heightCm] = sizes[val];
    orientationSelect.value = "portrait";
    customSizeInputs.style.display = "none";
  } else { customSizeInputs.style.display = "block"; }
  setupCanvas(true); saveState();
});

orientationSelect.addEventListener("change", () => {
  snapshotState();
  if (orientationSelect.value === "portrait") {
    [state.page.widthCm, state.page.heightCm] = [Math.min(state.page.widthCm, state.page.heightCm), Math.max(state.page.widthCm, state.page.heightCm)];
  } else {
    [state.page.widthCm, state.page.heightCm] = [Math.max(state.page.widthCm, state.page.heightCm), Math.min(state.page.widthCm, state.page.heightCm)];
  }
  setupCanvas(true); updateUI(); saveState();
});

customWidthInput.addEventListener("input", () => {
  // No reescribimos el campo mientras el usuario escribe (eso es lo que borraba
  // el "." o "," antes de poder completar el decimal). Solo actualizamos el
  // estado si ya hay un número válido; el campo se normaliza recién al salir (blur).
  const parsed = parseLocaleNumber(customWidthInput.value);
  if (isNaN(parsed)) return;
  state.page.widthCm = validateNumber(parsed, LIMITS.minPageSize, LIMITS.maxPageSize);
  debounce(() => { setupCanvas(); saveState(); }, 300);
});
customWidthInput.addEventListener("blur", () => { customWidthInput.value = state.page.widthCm; });

customHeightInput.addEventListener("input", () => {
  const parsed = parseLocaleNumber(customHeightInput.value);
  if (isNaN(parsed)) return;
  state.page.heightCm = validateNumber(parsed, LIMITS.minPageSize, LIMITS.maxPageSize);
  debounce(() => { setupCanvas(); saveState(); }, 300);
});
customHeightInput.addEventListener("blur", () => { customHeightInput.value = state.page.heightCm; });

lockRatioCheckbox.addEventListener('change', () => { drawAll(); saveState(); });
showBorderCheckbox.addEventListener('change', () => {
  snapshotState();
  state.image.showBorder = showBorderCheckbox.checked; drawAll(); saveState();
});

// ================== EXPORTAR / IMPRIMIR ==================
const printBtn = document.getElementById("printBtn");

// Genera el PDF con todas las hojas. `btn` muestra el progreso.
async function buildPdf(btn) {
  const missingFull = new Set();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: state.page.widthCm > state.page.heightCm ? 'landscape' : 'portrait',
    unit: 'cm', format: [state.page.widthCm, state.page.heightCm]
  });

  // 200 DPI: suficiente para láser color. cmToPx usa 300dpi internamente.
  const dpiScale = 200 / 300;
  const pxW = Math.round(cmToPx(state.page.widthCm) * dpiScale);
  const pxH = Math.round(cmToPx(state.page.heightCm) * dpiScale);

  function canvasToBase64(cvs) {
    return new Promise((resolve, reject) => {
      cvs.toBlob(blob => {
        if (!blob) { reject(new Error('toBlob falló')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 1.0);
    });
  }

  for (let index = 0; index < state.pages.length; index++) {
    btn.textContent = `Preparando ${index + 1}/${state.pages.length}...`;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = pxW;
    tempCanvas.height = pxH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.scale(dpiScale, dpiScale);
    tempCtx.fillStyle = '#fff';
    tempCtx.fillRect(0, 0, cmToPx(state.page.widthCm), cmToPx(state.page.heightCm));
    for (const item of state.pages[index]) {
      // Se usa el ORIGINAL en alta calidad (una foto a la vez); si por algún motivo
      // no está disponible, se cae a la vista previa y se avisa al final.
      const fullImg = await loadFullImage(item.id);
      if (!fullImg) {
        const meta = state.images.find(i => i.id === item.id);
        if (meta && meta.hasFull) missingFull.add(item.id);
      }
      drawImageItem(tempCtx, fullImg ? { ...item, img: fullImg } : item, 0, 0);
    }
    const b64 = await canvasToBase64(tempCanvas);
    if (index > 0) pdf.addPage();
    pdf.addImage({ imageData: b64, format: 'JPEG', x: 0, y: 0,
                   width: state.page.widthCm, height: state.page.heightCm });
    await new Promise(r => setTimeout(r, 20));
  }
  pdf._missingFull = missingFull.size;
  return pdf;
}

// Envuelve una acción de exportación: valida, bloquea botones y maneja errores.
async function runExportAction(btn, label, action) {
  try {
    if (state.pages.length === 0) { alert("No hay imagenes para exportar"); return; }
    exportBtn.disabled = true;
    if (printBtn) printBtn.disabled = true;
    const pdf = await buildPdf(btn);
    await action(pdf);
    if (pdf._missingFull > 0) alert(`Aviso: ${pdf._missingFull} foto(s) se exportaron en calidad reducida porque no se encontró el original guardado. Vuelve a importarlas si necesitas máxima calidad.`);
  } catch (error) {
    console.error('Error al exportar:', error);
    alert('Error al exportar PDF: ' + (error && error.message ? error.message : error));
  } finally {
    exportBtn.disabled = false; exportBtn.textContent = "Exportar";
    if (printBtn) { printBtn.disabled = false; printBtn.textContent = "Imprimir"; }
  }
}

exportBtn.addEventListener("click", () => {
  runExportAction(exportBtn, "Exportar", async (pdf) => {
    if (window.IS_TAURI) await window.savePdfNative(pdf, 'impresion.pdf');
    else pdf.save('impresion.pdf');
  });
});

if (printBtn) {
  printBtn.addEventListener("click", () => {
    runExportAction(printBtn, "Imprimir", async (pdf) => {
      if (window.IS_TAURI) await window.printPdfNative(pdf);
      else pdf.save('impresion.pdf'); // en navegador: se descarga el PDF
    });
  });
}

// ================== PANEL DERECHO RESIZE ==================
const rightPanel = document.getElementById('rightPanel');
const rightResizer = document.getElementById('rightResizer');
const minCenter = 700;
let isResizing = false;
let rightPanelWidth = 260;

rightResizer.addEventListener('mousedown', () => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const rect = app.getBoundingClientRect();
  const newWidth = rect.right - e.clientX;
  if (newWidth < 160 || newWidth > rect.width - 300 - 6 - minCenter) return;
  rightPanelWidth = newWidth;
  app.style.gridTemplateColumns = `300px 1fr 6px ${rightPanelWidth}px`;
});
document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }
});

// ================== LIMPIAR ==================
const clearBtn = document.getElementById('clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    if (await askConfirm('Seguro que quieres limpiar todo? Se eliminaran todas las imagenes.')) {
      clearState(); updateUI();
    }
  });
}

// ================== INIT ==================
function initApp() {
  if (typeof resetView === 'function') resetView();
  if (typeof initZoom === 'function') initZoom();
  const stateLoaded = loadState();
  if (!stateLoaded) {
    paperSizeSelect.value = "22x32";
    state.page.widthCm = 22; state.page.heightCm = 32;
    customSizeInputs.style.display = "none";
    orientationSelect.value = "portrait";
    if (showBorderCheckbox) showBorderCheckbox.checked = !!state.image.showBorder;
    document.getElementById('imgWidth').value = state.image.widthCm;
    document.getElementById('imgHeight').value = state.image.heightCm;
    document.getElementById('margin').value = state.page.marginCm;
    document.getElementById('gap').value = state.image.gapCm;
    customWidthInput.value = state.page.widthCm;
    customHeightInput.value = state.page.heightCm;
    setupCanvas(true); updateThumbnails();
  }
}

window.addEventListener('resize', adjustCanvasScale);

// Recalcula el ajuste de la hoja cada vez que el área de trabajo cambia de
// tamaño real (resize de ventana, arrastre del panel derecho, etc.) y cada
// vez que la pestaña vuelve a estar visible (si se cargó en segundo plano,
// el cálculo inicial puede haber tomado un alto/ancho incorrecto y quedar
// descentrada verticalmente hasta que algo la recalculara).
if (typeof ResizeObserver !== 'undefined' && workspace) {
  const workspaceResizeObserver = new ResizeObserver(() => adjustCanvasScale());
  workspaceResizeObserver.observe(workspace);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) adjustCanvasScale();
});
