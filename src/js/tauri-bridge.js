// Puente con Tauri. Si la app corre en un navegador normal (sin Tauri),
// todo cae al comportamiento original (pdf.save, alert, confirm).
(function () {
  const T = window.__TAURI__;
  window.IS_TAURI = !!(T && T.core);
  if (!window.IS_TAURI) return;

  const dialog = T.dialog;

  // alert() / confirm() nativos de Tauri (más confiables que los de la webview).
  window.alert = function (msg) {
    dialog.message(String(msg), { title: 'Editor de Impresión' });
  };
  window.askConfirm = function (msg) {
    return dialog.ask(String(msg), { title: 'Editor de Impresión', kind: 'warning' });
  };

  // Guardar PDF con el diálogo "Guardar como" de macOS.
  window.savePdfNative = async function (pdf, defaultName) {
    const path = await dialog.save({
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (!path) return false; // el usuario canceló
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    await T.fs.writeFile(path, bytes);
    return true;
  };

  // Abrir el PDF en Vista Previa para imprimir (Cmd+P).
  window.printPdfNative = async function (pdf) {
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    await T.core.invoke('open_pdf_for_print', bytes);
  };
})();
if (!window.askConfirm) {
  window.askConfirm = async (msg) => confirm(msg);
}
