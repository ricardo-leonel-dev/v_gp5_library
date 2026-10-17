// F27 `song_preset_duplicate_edit_export` (R37, R38). Trigger a browser
// download of the supplied bytes. Pure DOM API: a Blob, an object URL, a
// temporary `<a download>` click, and a revoke to clean up. No network —
// exporting a draft never sends a request (R38).
//
// The function is the single place that touches the DOM for a download; the
// only callers in production are the song detail page's "Export .prst"
// button. Tests stub `URL.createObjectURL` / `URL.revokeObjectURL` and
// capture the Blob that was passed in to assert on its bytes.
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Some browsers (Firefox in particular) require the anchor to be in the DOM
  // before the synthetic click can trigger a download.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
