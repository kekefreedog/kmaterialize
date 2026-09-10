
interface CardHandleOptions {
  cardSelector: string;
  dropSelector: string;
  enabled: (card: HTMLElement) => boolean;
  onMove: (card: HTMLElement, from: HTMLElement, to: HTMLElement) => void;
}

/** Pointer-based handles keep ordinary swipes available for page scrolling. */
export function enableCardHandles(root: HTMLElement, options: CardHandleOptions): () => void {
  const events = new AbortController();
  const handles: HTMLButtonElement[] = [];
  let drag: { card: HTMLElement; from: HTMLElement; handle: HTMLButtonElement; pointer: number; ghost: HTMLElement; placeholder: HTMLElement; x: number; y: number } | undefined;
  let frame = 0;
  const targets = () => Array.from(root.querySelectorAll<HTMLElement>(options.dropSelector));
  const cards = (parent: HTMLElement) => Array.from(parent.querySelectorAll<HTMLElement>(options.cardSelector)).filter(card => card !== drag?.card);
  root.addEventListener('carddragcancel', () => end(false), { signal: events.signal });
  function locate() {
    if (!drag) return;
    drag.ghost.style.left = `${drag.x + 12}px`;
    drag.ghost.style.top = `${drag.y + 12}px`;
    const target = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLElement>(options.dropSelector);
    if (!target || !root.contains(target)) { drag.placeholder.remove(); return; }
    const before = cards(target).find(card => {
      const box = card.getBoundingClientRect();
      return drag!.y < box.top + box.height / 2;
    });
    target.insertBefore(drag.placeholder, before || null);
  }
  function scroll() {
    if (!drag) return;
    const box = root.getBoundingClientRect();
    const velocity = (value: number, start: number, end: number) => value < start + 40 ? -8 : value > end - 40 ? 8 : 0;
    root.scrollLeft += velocity(drag.x, box.left, Math.min(box.right, innerWidth));
    root.scrollTop += velocity(drag.y, Math.max(box.top, 0), Math.min(box.bottom, innerHeight));
    window.scrollBy(0, velocity(drag.y, 0, innerHeight));
    locate();
    frame = requestAnimationFrame(scroll);
  }
  function end(commit: boolean) {
    if (!drag) return;
    const current = drag;
    drag = undefined;
    cancelAnimationFrame(frame);
    const to = current.placeholder.parentElement;
    const oldNext = current.card.nextElementSibling;
    if (commit && to) to.insertBefore(current.card, current.placeholder);
    current.placeholder.remove(); current.ghost.remove();
    current.card.classList.remove('card-handle-dragging');
    if (current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    current.handle.focus({ preventScroll: true });
    if (commit && to && (to !== current.from || current.card.nextElementSibling !== oldNext)) options.onMove(current.card, current.from, to);
  }
  root.querySelectorAll<HTMLElement>(options.cardSelector).forEach(card => {
    if (!options.enabled(card)) return;
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = 'card-drag-handle';
    handle.setAttribute('aria-label', `Move ${card.querySelector('strong, h4')?.textContent || 'card'}. Drag, or use arrow keys.`);
    const icon = document.createElement('i'); icon.className = 'material-icons'; icon.textContent = 'drag_indicator'; icon.setAttribute('aria-hidden', 'true');
    handle.append(icon); card.prepend(handle); handles.push(handle);
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag || !options.enabled(card)) return;
      event.preventDefault(); event.stopPropagation();
      handle.focus({ preventScroll: true });
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      ghost.classList.add('card-drag-ghost'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      // The ghost lives outside the zoomed board; the placeholder stays inside.
      const scale = card.getBoundingClientRect().width / card.offsetWidth;
      ghost.style.width = `${card.offsetWidth}px`;
      ghost.style.transform = `scale(${scale})`;
      ghost.style.transformOrigin = 'top left';
      document.body.append(ghost);
      const placeholder = document.createElement('div'); placeholder.className = 'card-drag-placeholder'; placeholder.setAttribute('aria-hidden', 'true');
      placeholder.style.height = `${card.offsetHeight}px`;
      drag = { card, from: card.parentElement!, handle, pointer: event.pointerId, ghost, placeholder, x: event.clientX, y: event.clientY };
      card.classList.add('card-handle-dragging');
      handle.setPointerCapture(event.pointerId); locate(); scroll();
    }, { signal: events.signal });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY; locate();
    }, { signal: events.signal });
    handle.addEventListener('pointerup', event => { if (drag?.pointer === event.pointerId) end(true); }, { signal: events.signal });
    handle.addEventListener('pointercancel', event => { if (drag?.pointer === event.pointerId) end(false); }, { signal: events.signal });
    handle.addEventListener('lostpointercapture', () => end(false), { signal: events.signal });
    handle.addEventListener('keydown', event => {
      if (event.key === 'Escape') { end(false); return; }
      if (!options.enabled(card) || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const from = card.parentElement!;
      const columns = targets();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const to = columns[columns.indexOf(from) + (event.key === 'ArrowLeft' ? -1 : 1)];
        if (!to) return;
        to.append(card); options.onMove(card, from, to);
      } else {
        const siblings = cards(from);
        const index = siblings.indexOf(card);
        const adjacent = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (!adjacent) return;
        from.insertBefore(card, event.key === 'ArrowUp' ? adjacent : adjacent.nextSibling);
        options.onMove(card, from, from);
      }
      if (handle.isConnected) handle.focus();
    }, { signal: events.signal });
  });
  // The rest of a Kanban card retains its native desktop drag behavior.
  root.addEventListener('dragstart', event => {
    if (drag || (event.target as HTMLElement).closest('.card-drag-handle')) event.preventDefault();
  }, { capture: true, signal: events.signal });
  return () => { end(false); events.abort(); handles.forEach(handle => handle.remove()); };
}
