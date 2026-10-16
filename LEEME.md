# Editor de Impresión (app para Mac)

Tu editor web envuelto en Tauri. Cambios respecto a la versión web:
- jsPDF va local (`src/vendor/`), funciona sin internet.
- **Exportar** abre el diálogo "Guardar como" de macOS.
- **Imprimir** (botón nuevo) genera el PDF y lo abre en Vista Previa; ahí Cmd+P y eliges la impresora.
- `alert` y `confirm` usan diálogos nativos.

Todo lo demás (`src/index.html`, `src/css`, `src/js/app.js`, `zoom.js`) es tu código original.

## Compilar en la nube (GitHub)
1. Sube todo el contenido de esta carpeta a un repositorio (incluida la carpeta `.github`).
2. Pestaña **Actions** → "Compilar app para Mac" → **Run workflow** (si no parte solo).
3. Cuando termine (10-15 min), abre la ejecución y descarga el instalador desde **Artifacts**:
   - `EditorImpresion-aarch64-apple-darwin` → Macs M1/M2/M3/M4
   - `EditorImpresion-x86_64-apple-darwin` → Macs Intel
4. Descomprime el zip, abre el `.dmg` y arrastra la app a Aplicaciones.

## Primera vez que la abres
La app no está firmada por Apple. Clic derecho sobre la app → **Abrir** → **Abrir**.
Si dice que "está dañada", en Terminal:
`xattr -cr /Applications/EditorImpresion.app`

## Compilar en tu Mac (opcional)
Requiere `xcode-select --install`, Rust (rustup.rs) y Node.
`npm install && npx tauri icon src-tauri/app-icon.png && npm run tauri build`
Para probar sin instalar: `npm run tauri dev`.
