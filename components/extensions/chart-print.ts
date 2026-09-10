export interface ChartPrintOptions {
  /** PDF-only theme. Does not change the application theme. Defaults to light. */
  theme?: 'light' | 'dark';
}

/** Print a full-size snapshot, without changing the live chart or its zoom. */
export async function printChart(stage: HTMLElement, title: string, options: ChartPrintOptions = {}): Promise<void> {
  const theme = options.theme ?? 'light';
  if (theme !== 'light' && theme !== 'dark') throw new TypeError('Invalid PDF theme.');
  // Open synchronously from the button click so popup blockers allow the preview.
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('Allow popups to open the PDF print preview.');
  const doc = preview.document;
  doc.title = title;
  doc.documentElement.setAttribute('theme', theme);
  doc.documentElement.style.colorScheme = theme;
  doc.documentElement.style.fontSize = getComputedStyle(document.documentElement).fontSize;
  const snapshot = stage.cloneNode(true) as HTMLElement;
  const sourceStyle = getComputedStyle(stage);
  // Keep both Materialize palettes, then select the requested one in the preview.
  // Do not freeze computed card colors: that would bake in the screen's dark mode.
  for (const property of Array.from(sourceStyle)) {
    if (!property.startsWith('--md-')) continue;
    doc.body.style.setProperty(property, sourceStyle.getPropertyValue(property));
  }
  for (const property of Array.from(sourceStyle)) {
    if (property.startsWith('--md-sys-color-') && property.endsWith(`-${theme}`)) {
      doc.body.style.setProperty(property.slice(0, -theme.length - 1), sourceStyle.getPropertyValue(property));
    }
  }
  doc.body.style.fontFamily = sourceStyle.fontFamily;
  doc.body.style.fontSize = sourceStyle.fontSize;
  doc.body.style.lineHeight = sourceStyle.lineHeight;
  // Inline item overrides remain on the clone; theme-based colors resolve afresh.
  [snapshot, ...snapshot.querySelectorAll('*')].forEach(node => node.removeAttribute('id'));
  // Keep stylesheets for pseudo-elements (edge accents) and web fonts.
  const resources = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(node => {
    const clone = node.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
    if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
    const ready = clone instanceof HTMLLinkElement
      ? new Promise<void>(resolve => { clone.onload = () => resolve(); clone.onerror = () => resolve(); })
      : Promise.resolve();
    doc.head.append(clone);
    return ready;
  });
  const width = stage.offsetWidth, height = stage.offsetHeight;
  // A3 landscape, 10 mm margins. Shrink large charts to one page.
  const scale = Math.min(1, (400 * 96 / 25.4) / width, (277 * 96 / 25.4) / height);
  const style = doc.createElement('style');
  style.textContent = `@page { size: A3 landscape; margin: 10mm; } html, body { margin: 0; padding: 0; } body { background: ${theme === 'light' ? 'white' : 'var(--md-sys-color-surface)'}; color: var(--md-sys-color-on-surface); } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }`;
  doc.head.append(style);
  snapshot.style.setProperty('zoom', '1');
  snapshot.style.transform = `scale(${scale})`;
  snapshot.style.transformOrigin = 'top left';
  snapshot.style.position = 'absolute';
  snapshot.style.left = '0'; snapshot.style.top = '0';
  snapshot.querySelectorAll<HTMLElement>('.card-drag-handle, .org-chart-drag-icon, .org-chart-connect-port, .org-chart-link-remove, .org-chart-connection-preview').forEach(handle => {
    // Opacity hides descendants too, even with their copied visibility styles.
    handle.style.opacity = '0';
  });
  const page = doc.createElement('div');
  page.style.cssText = `position:relative;width:${width * scale}px;height:${height * scale}px;overflow:hidden`;
  page.append(snapshot);
  doc.body.replaceChildren(page);
  await Promise.all(resources);
  await doc.fonts.ready;
  if (!preview.closed) { preview.focus(); preview.print(); }
}
