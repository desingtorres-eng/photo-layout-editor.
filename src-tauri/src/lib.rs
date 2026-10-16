use std::process::Command;
use tauri::ipc::{InvokeBody, Request};

/// Recibe los bytes de un PDF (cuerpo "raw" de la llamada), los guarda en la
/// carpeta temporal y los abre en Vista Previa, desde donde se imprime con Cmd+P
/// eligiendo la impresora (por ejemplo la Sharp MX-3050V) y sus opciones.
#[tauri::command]
fn open_pdf_for_print(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("Se esperaban los bytes del PDF".into());
    };

    let path = std::env::temp_dir().join("editor-impresion.pdf");
    std::fs::write(&path, data).map_err(|e| format!("No se pudo guardar el PDF temporal: {e}"))?;

    let status = Command::new("open")
        .arg("-a")
        .arg("Preview")
        .arg(&path)
        .status()
        .map_err(|e| format!("No se pudo abrir Vista Previa: {e}"))?;

    if !status.success() {
        return Err("Vista Previa no pudo abrir el PDF".into());
    }
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_pdf_for_print])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
