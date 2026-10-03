// Escape text before it goes into an HTML string (MapLibre popups, the
// Analysis panel). Anything from the API, the static data, the address
// search or the user's own pin labels must pass through this — otherwise a
// name like `<img onerror=…>` would run as code.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
