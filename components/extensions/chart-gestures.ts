/** Two-finger pinch and Ctrl/trackpad wheel zoom; ordinary wheel keeps scrolling. */
export function enableChartGestures(root: HTMLElement, getZoom: () => number, setZoom: (zoom: number) => void, cancelDrag: () => void): () => void {
  const events = new AbortController();
  const signal = events.signal;
  const oldTouchAction = root.style.touchAction;
  root.style.touchAction = 'none';
  let previous: { x: number; y: number; distance: number } | undefined;
  let panning = false;
  const position = (touches: TouchList) => {
    const first = touches[0], second = touches[1] || first;
    return { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2,
      distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) };
  };
  const zoomAt = (value: number, x: number, y: number, oldX = x, oldY = y) => {
    const rect = root.getBoundingClientRect();
    const localX = x - rect.left - root.clientLeft, localY = y - rect.top - root.clientTop;
    const worldX = (root.scrollLeft + oldX - rect.left - root.clientLeft) / getZoom();
    const worldY = (root.scrollTop + oldY - rect.top - root.clientTop) / getZoom();
    setZoom(value);
    root.scrollLeft = worldX * getZoom() - localX;
    root.scrollTop = worldY * getZoom() - localY;
  };
  root.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    cancelDrag();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1);
    zoomAt(getZoom() * Math.exp(-delta * 0.01), event.clientX, event.clientY);
  }, { passive: false, signal });
  root.addEventListener('touchstart', event => {
    previous = position(event.touches);
    panning = event.touches.length > 1 || !(event.target as Element).closest('.card-drag-handle, [data-team], button, input, a, .org-chart-link-label, .org-chart-link-remove');
    if (event.touches.length > 1) {
      event.preventDefault();
      cancelDrag();
    }
  }, { passive: false, capture: true, signal });
  root.addEventListener('touchmove', event => {
    if (!previous || !panning) return;
    event.preventDefault();
    const next = position(event.touches);
    if (event.touches.length > 1 && previous.distance > 0) {
      zoomAt(getZoom() * next.distance / previous.distance, next.x, next.y, previous.x, previous.y);
    } else {
      root.scrollLeft += previous.x - next.x;
      root.scrollTop += previous.y - next.y;
    }
    previous = next;
  }, { passive: false, signal });
  const end = (event: TouchEvent) => {
    previous = event.touches.length ? position(event.touches) : undefined;
    if (!previous) panning = false;
  };
  root.addEventListener('touchend', end, { signal });
  root.addEventListener('touchcancel', end, { signal });
  return () => { events.abort(); root.style.touchAction = oldTouchAction; };
}
