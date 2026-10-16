// Evita abrir una consola extra en Windows en modo release (no afecta a macOS).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    editor_impresion_lib::run()
}
