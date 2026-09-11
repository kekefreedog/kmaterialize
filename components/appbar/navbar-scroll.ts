const instances = new WeakMap<HTMLElement, () => void>();

/** Initialize navbar overflow fades. Returns cleanup; safe to reinitialize. */
export function initNavbarScroll(navbar: HTMLElement): () => void {
  instances.get(navbar)?.();
  const row = navbar.querySelector<HTMLElement>(':scope > .nav-wrapper');
  if (!row) return () => {};
  const left = document.createElement('span');
  const right = document.createElement('span');
  left.className = 'navbar-scroll-fade navbar-scroll-fade-left';
  right.className = 'navbar-scroll-fade navbar-scroll-fade-right';
  left.setAttribute('aria-hidden', 'true');
  right.setAttribute('aria-hidden', 'true');
  navbar.append(left, right);
  const previous = ['--scroll-left-fade', '--scroll-right-fade'].map(name => ({
    name, value: navbar.style.getPropertyValue(name), priority: navbar.style.getPropertyPriority(name)
  }));
  const start = navbar.classList.contains('is-scroll-start');
  const end = navbar.classList.contains('is-scroll-end');
  let disposed = false;
  const update = () => {
    if (disposed) return;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    const rtl = getComputedStyle(row).direction === 'rtl';
    const offset = Math.min(max, Math.max(0, rtl ? -row.scrollLeft : row.scrollLeft));
    const atLeft = max <= 1 || (rtl ? offset >= max - 1 : offset <= 1);
    const atRight = max <= 1 || (rtl ? offset <= 1 : offset >= max - 1);
    navbar.classList.toggle('is-scroll-start', atLeft);
    navbar.classList.toggle('is-scroll-end', atRight);
    navbar.style.setProperty('--scroll-left-fade', atLeft ? '0' : '1');
    navbar.style.setProperty('--scroll-right-fade', atRight ? '0' : '1');
    left.classList.toggle('is-hidden', atLeft);
    right.classList.toggle('is-hidden', atRight);
  };
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
  const observeSizes = () => {
    resize?.disconnect();
    resize?.observe(row);
    Array.from(row.children).forEach(child => resize?.observe(child));
    update();
  };
  const mutation = new MutationObserver(observeSizes);
  mutation.observe(row, { childList: true, subtree: true, characterData: true });
  row.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  document.fonts?.ready.then(update);
  observeSizes();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    row.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    resize?.disconnect();
    mutation.disconnect();
    left.remove();
    right.remove();
    navbar.classList.toggle('is-scroll-start', start);
    navbar.classList.toggle('is-scroll-end', end);
    previous.forEach(({ name, value, priority }) => {
      if (value) navbar.style.setProperty(name, value, priority);
      else navbar.style.removeProperty(name);
    });
    if (instances.get(navbar) === dispose) instances.delete(navbar);
  };
  instances.set(navbar, dispose);
  return dispose;
}
