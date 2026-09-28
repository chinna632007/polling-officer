/**
 * Shared helper: download a protected report/Excel file. Auth rides on the
 * HttpOnly session cookie (credentials: 'include' also covers a direct
 * cross-origin API base URL; plain <a href> navigation is not used, so the
 * 401 handler stays in control).
 * The saved filename comes from the server's Content-Disposition header
 * when available, with a URL-based fallback.
 */
export async function docDownload(url, fallbackName = 'report') {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    alert('Report could not be downloaded. Please try again.');
    return;
  }

  const blob = await response.blob();
  let filename = '';
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match) {
    filename = decodeURIComponent(match[1].replace(/"/g, ''));
  }
  if (!filename) {
    filename = url.split('/').filter(Boolean).pop() || fallbackName || 'report';
    // Bare fallback names are the legacy Excel reports; a fallback that
    // already carries an extension (e.g. "ID-Card-OFF001.pdf") is kept as-is.
    if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
      filename = `${filename}.xlsx`;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default docDownload;