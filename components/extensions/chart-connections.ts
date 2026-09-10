export interface ChartEndpoint { id: string; type: 'person' | 'team' }

/** Drag a connection port without moving the underlying card or team. */
export function enableChartConnections(
  root: HTMLElement, stage: HTMLElement, getZoom: () => number,
  canConnect: (from: ChartEndpoint, to: ChartEndpoint) => boolean,
  connect: (from: ChartEndpoint, to: ChartEndpoint) => void,
) {
  const events = new AbortController();
  const signal = events.signal;
  const ns = 'http://www.w3.org/2000/svg';
  let active: { pointer: number; handle: HTMLElement; from: ChartEndpoint; target?: HTMLElement; to?: ChartEndpoint; svg: SVGSVGElement; path: SVGPathElement } | undefined;
  const endpoint = (node: HTMLElement): ChartEndpoint => node.dataset.orgPerson !== undefined
    ? { id: node.dataset.orgPerson, type: 'person' }
    : { id: node.dataset.orgTeam!, type: 'team' };
  const cancel = () => {
    if (!active) return;
    const previous = active;
    active = undefined;
    previous.target?.classList.remove('org-chart-connect-target');
    previous.svg.remove();
    if (previous.handle.hasPointerCapture(previous.pointer)) previous.handle.releasePointerCapture(previous.pointer);
  };
  const move = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointer) return;
    event.preventDefault(); event.stopPropagation();
    active.target?.classList.remove('org-chart-connect-target');
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-org-person], [data-org-team]');
    const to = target && root.contains(target) ? endpoint(target) : undefined;
    active.to = to && canConnect(active.from, to) ? to : undefined;
    active.target = active.to ? target! : undefined;
    active.target?.classList.add('org-chart-connect-target');
    const origin = stage.getBoundingClientRect(), port = active.handle.getBoundingClientRect();
    const zoom = getZoom();
    const x = (port.left + port.width / 2 - origin.left) / zoom;
    const y = (port.top + port.height / 2 - origin.top) / zoom;
    const endX = (event.clientX - origin.left) / zoom, endY = (event.clientY - origin.top) / zoom;
    const bend = Math.max(40, Math.abs(endX - x) / 2);
    active.path.setAttribute('d', `M ${x} ${y} C ${x + bend} ${y}, ${endX - bend} ${endY}, ${endX} ${endY}`);
  };
  root.addEventListener('pointerdown', event => {
    const handle = (event.target as Element).closest<HTMLElement>('.org-chart-connect-port');
    if (!handle || event.button !== 0 || active) return;
    event.preventDefault(); event.stopPropagation();
    root.dispatchEvent(new Event('carddragcancel'));
    const node = handle.closest<HTMLElement>('[data-org-person], [data-org-team]')!;
    const svg = document.createElementNS(ns, 'svg'), path = document.createElementNS(ns, 'path');
    svg.classList.add('org-chart-connection-preview');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(path); stage.append(svg);
    active = { pointer: event.pointerId, handle, from: endpoint(node), svg, path };
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    move(event);
  }, { capture: true, signal });
  root.addEventListener('pointermove', move, { capture: true, signal });
  root.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.pointer) return;
    move(event);
    const { from, to } = active;
    cancel();
    if (to) connect(from, to);
  }, { capture: true, signal });
  const lost = (event: PointerEvent) => { if (event.pointerId === active?.pointer) cancel(); };
  root.addEventListener('pointercancel', lost, { capture: true, signal });
  root.addEventListener('lostpointercapture', lost, { capture: true, signal });
  document.addEventListener('keydown', event => {
    if (active && event.key === 'Escape') { event.preventDefault(); cancel(); }
  }, { signal });
  return { cancel, destroy: () => { cancel(); events.abort(); } };
}
