/** Direct dependency editing, separate from task movement and resizing. */
export function enableGanttConnections(
  root: HTMLElement,
  enabled: () => boolean,
  canConnect: (from: string, to: string) => boolean,
  connect: (from: string, to: string) => void,
  disconnect: (from: string, to: string) => void,
  announce: (message: string) => void,
) {
  const events = new AbortController(), signal = events.signal;
  let source: string | undefined;
  let gesture: { pointer: number; x: number; y: number; moved: boolean } | undefined;
  let preview: SVGSVGElement | undefined;
  let suppressClick = false;
  const ports = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[data-gantt-connect]'));
  const cancel = () => {
    const pointer = gesture?.pointer;
    source = undefined; gesture = undefined;
    preview?.remove(); preview = undefined;
    root.classList.remove('gantt-connecting');
    root.querySelectorAll('.gantt-connect-target').forEach(node => node.classList.remove('gantt-connect-target'));
    ports().forEach(port => port.setAttribute('aria-pressed', 'false'));
    if (pointer !== undefined && root.hasPointerCapture(pointer)) root.releasePointerCapture(pointer);
  };
  const start = (port: HTMLElement) => {
    cancel(); source = port.dataset.ganttConnect;
    root.classList.add('gantt-connecting');
    port.setAttribute('aria-pressed', 'true');
    port.focus({ preventScroll: true });
    announce('Choose a downstream task. Press Escape to cancel.');
  };
  const target = (node: Element | null) => {
    const bar = node?.closest<HTMLElement>('.gantt-bar');
    return bar && root.contains(bar) ? bar : undefined;
  };
  const finish = (bar?: HTMLElement) => {
    const from = source, to = bar?.dataset.ganttTask;
    if (from !== undefined && to !== undefined && canConnect(from, to)) {
      cancel(); connect(from, to);
      Array.from(root.querySelectorAll<HTMLElement>('.gantt-bar')).find(node => node.dataset.ganttTask === to)?.focus({ preventScroll: true });
      announce('Dependency connected. Dates are unchanged.');
    } else {
      cancel(); announce('No link added. Choose different tasks without an existing link or cycle.');
    }
  };
  root.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (!enabled() || event.button !== 0 || !event.isPrimary) return;
    const node = event.target instanceof Element ? event.target : null;
    const port = node?.closest<HTMLElement>('[data-gantt-connect]');
    if (port) {
      event.preventDefault(); event.stopImmediatePropagation();
      start(port);
      gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      root.setPointerCapture(event.pointerId);
    } else if (source !== undefined || node?.closest('[data-gantt-disconnect]')) {
      // A destination click must not start a date edit or alter selection.
      event.stopImmediatePropagation();
    }
  }, { capture: true, signal });
  const move = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    event.preventDefault(); event.stopImmediatePropagation();
    gesture.moved ||= Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 4;
    if (!gesture.moved) return;
    const bar = target(document.elementFromPoint(event.clientX, event.clientY));
    root.querySelectorAll('.gantt-connect-target').forEach(node => node.classList.remove('gantt-connect-target'));
    if (bar && canConnect(source!, bar.dataset.ganttTask!)) bar.classList.add('gantt-connect-target');
    const table = root.querySelector<HTMLElement>('.gantt-table')!;
    const port = ports().find(node => node.dataset.ganttConnect === source)!;
    if (!preview) {
      preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      preview.classList.add('gantt-connection-preview'); preview.setAttribute('aria-hidden', 'true');
      preview.append(document.createElementNS('http://www.w3.org/2000/svg', 'path')); table.append(preview);
    }
    const rect = table.getBoundingClientRect(), origin = port.getBoundingClientRect();
    const x = origin.left + origin.width / 2 - rect.left, y = origin.top + origin.height / 2 - rect.top;
    const endX = event.clientX - rect.left, endY = event.clientY - rect.top;
    const bend = Math.max(32, Math.abs(endX - x) / 2);
    preview.firstElementChild!.setAttribute('d', `M ${x} ${y} C ${x + bend} ${y}, ${endX - bend} ${endY}, ${endX} ${endY}`);
  };
  root.addEventListener('pointermove', move, { capture: true, signal });
  root.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    move(event);
    const { pointer, moved } = gesture;
    gesture = undefined;
    if (root.hasPointerCapture(pointer)) root.releasePointerCapture(pointer);
    suppressClick = true;
    if (moved) finish(target(document.elementFromPoint(event.clientX, event.clientY)));
  }, { capture: true, signal });
  root.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; return; }
    if (!enabled()) return;
    const node = event.target instanceof Element ? event.target : null;
    const port = node?.closest<HTMLElement>('[data-gantt-connect]');
    const remove = node?.closest<HTMLElement>('[data-gantt-disconnect]');
    if (port || remove || source !== undefined) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (remove) {
        const to = remove.dataset.to!;
        cancel(); disconnect(remove.dataset.from!, to);
        Array.from(root.querySelectorAll<HTMLElement>('.gantt-bar')).find(bar => bar.dataset.ganttTask === to)?.focus({ preventScroll: true });
        announce('Dependency disconnected. Dates are unchanged.');
      } else if (port) {
        if (source === port.dataset.ganttConnect) cancel(); else start(port);
      } else finish(target(node));
    }
  }, { capture: true, signal });
  root.addEventListener('keydown', event => {
    if (source === undefined) return;
    if (event.key === 'Escape') { event.preventDefault(); cancel(); announce('Connection canceled.'); }
    if (event.key.startsWith('Arrow') || event.key === 'Escape') event.stopImmediatePropagation();
  }, { capture: true, signal });
  const lost = (event: PointerEvent) => { if (event.pointerId === gesture?.pointer) cancel(); };
  root.addEventListener('pointercancel', lost, { capture: true, signal });
  root.addEventListener('lostpointercapture', lost, { capture: true, signal });
  root.addEventListener('scroll', () => { if (gesture) cancel(); }, { signal });
  window.addEventListener('blur', cancel, { signal });
  return { cancel, destroy: () => { cancel(); events.abort(); } };
}
