export interface ChartPrintOptions {
  /** PDF-only theme. Does not change the application theme. Defaults to light. */
  theme?: 'light' | 'dark';
  /** Paper format. Defaults to A3. */
  format?: 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'letter' | 'legal' | 'tabloid';
  /** Page orientation. Defaults to landscape. */
  orientation?: 'portrait' | 'landscape';
}

const paperSizes = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420],
  A4: [210, 297], A5: [148, 210], A6: [105, 148],
  letter: [215.9, 279.4], legal: [215.9, 355.6], tabloid: [279.4, 431.8]
} as const;

export function chartPrintLayout(width: number, height: number, options: ChartPrintOptions = {}) {
  const format = options.format ?? 'A3';
  const orientation = options.orientation ?? 'landscape';
  if (!Object.prototype.hasOwnProperty.call(paperSizes, format)) throw new TypeError('Invalid PDF paper format.');
  if (orientation !== 'portrait' && orientation !== 'landscape') throw new TypeError('Invalid PDF orientation.');
  const [short, long] = paperSizes[format];
  const pageWidth = orientation === 'landscape' ? long : short;
  const pageHeight = orientation === 'landscape' ? short : long;
  const printableWidth = (pageWidth - 20) * 96 / 25.4;
  const printableHeight = (pageHeight - 20) * 96 / 25.4;
  const scale = Math.min(1, printableWidth / Math.max(1, width), printableHeight / Math.max(1, height));
  return { format, orientation, scale, printableWidth, printableHeight,
    left: (printableWidth - width * scale) / 2,
    top: (printableHeight - height * scale) / 2 };

}

/** Print a full-size snapshot, without changing the live chart or its zoom. */
export async function printChart(stage: HTMLElement, title: string, options: ChartPrintOptions = {}): Promise<void> {
  const theme = options.theme ?? 'light';
  if (theme !== 'light' && theme !== 'dark') throw new TypeError('Invalid PDF theme.');
  const width = stage.offsetWidth, height = stage.offsetHeight;
  const { format, orientation } = chartPrintLayout(width, height, options);
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
  const style = doc.createElement('style');
  style.textContent = `@page { size: ${format} ${orientation}; margin: 10mm; } html, body { margin: 0; padding: 0; } body { background: ${theme === 'light' ? 'white' : 'var(--md-sys-color-surface)'}; color: var(--md-sys-color-on-surface); } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }`;
  doc.head.append(style);
  snapshot.style.setProperty('zoom', '1');
  snapshot.style.transform = 'none';
  snapshot.style.transformOrigin = 'top left';
  snapshot.style.position = 'absolute';
  snapshot.style.left = '0'; snapshot.style.top = '0';
  snapshot.querySelectorAll<HTMLElement>('.card-drag-handle, .org-chart-drag-icon, .org-chart-connect-port, .org-chart-link-remove, .org-chart-connection-preview').forEach(handle => {
    // Opacity hides descendants too, even with their copied visibility styles.
    handle.style.opacity = '0';
  });
  const page = doc.createElement('div');
  page.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden`;
  page.append(snapshot);
  doc.body.replaceChildren(page);
  await Promise.all(resources);
  await doc.fonts.ready;
  if (!preview.closed) {
    // Center the actual cards and connectors, excluding unused canvas space.
    const boxes = Array.from(snapshot.querySelectorAll<HTMLElement>('.org-chart-team')).map(panel => ({
      x: panel.offsetLeft, y: panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight
    }));
    const links = snapshot.querySelector<SVGSVGElement>('.org-chart-links');
    if (links?.childElementCount) {
      const box = links.getBBox();
      if (box.width > 0 || box.height > 0) boxes.push(box);
    }
    const left = boxes.length ? Math.min(...boxes.map(box => box.x)) - 8 : 0;
    const top = boxes.length ? Math.min(...boxes.map(box => box.y)) - 8 : 0;
    const contentWidth = boxes.length ? Math.max(...boxes.map(box => box.x + box.width)) - left + 8 : width;
    const contentHeight = boxes.length ? Math.max(...boxes.map(box => box.y + box.height)) - top + 8 : height;
    const layout = chartPrintLayout(contentWidth, contentHeight, options);
    // Round down very slightly to avoid a blank second page from print rounding.
    page.style.width = `${Math.floor(layout.printableWidth * 100) / 100}px`;
    page.style.height = `${Math.floor(layout.printableHeight * 100) / 100}px`;
    snapshot.style.transform = `scale(${layout.scale})`;
    snapshot.style.left = `${layout.left - left * layout.scale}px`;
    snapshot.style.top = `${layout.top - top * layout.scale}px`;
    preview.focus();
    preview.print();
  }
}
