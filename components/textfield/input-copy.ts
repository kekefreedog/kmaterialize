/** Opt-in copy action for explicitly authored text-field buttons. */
let initialized = false;
export function initInputCopyButtons() {
  if (typeof document === 'undefined' || initialized) return;
  initialized = true;
  const pending = new WeakSet<HTMLButtonElement>();
  const feedback = new WeakMap<HTMLButtonElement, () => void>();
  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('button[data-copy-target]');
    if (!button || button.disabled) return;
    event.preventDefault();
    if (pending.has(button)) return;
    let input: Element;
    try { input = document.querySelector(button.dataset.copyTarget); } catch { return; }
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.disabled) return;
    pending.add(button);
    feedback.get(button)?.();
    const icon = button.querySelector('i');
    const originalIcon = icon?.textContent;
    const originalLabel = button.getAttribute('aria-label');
    let success = false;
    try {
      await navigator.clipboard.writeText(input.value);
      success = true;
    } catch {
      // Report failure without displaying or logging the field's contents.
    } finally {
      pending.delete(button);
    }
    if (!button.isConnected) return;
    const message = success ? 'Copied' : 'Unable to copy';
    button.setAttribute('aria-label', message);
    if (icon) icon.textContent = success ? 'check' : 'error_outline';
    const status = document.createElement('span');
    status.className = 'input-copy-status';
    status.setAttribute('role', 'status');
    button.after(status);
    status.textContent = message;
    const restore = () => {
      clearTimeout(timer);
      if (icon) icon.textContent = originalIcon;
      if (originalLabel === null) button.removeAttribute('aria-label');
      else button.setAttribute('aria-label', originalLabel);
      status.remove();
      feedback.delete(button);
    };
    const timer = setTimeout(restore, 2000);
    feedback.set(button, restore);
    button.dispatchEvent(new CustomEvent('inputcopy', { bubbles: true, detail: { success } }));
  });
}
