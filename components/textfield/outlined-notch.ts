/** Decorative native fieldset notches; the original input and label remain accessible. */
export function initOutlinedNotches() {
  if (typeof document === 'undefined') return;
  const start = () => {
    const selector = '.input-field.outlined, .input-field.outlined > .select-wrapper';
    const entries = new Map<HTMLElement, { input: HTMLElement; outline: HTMLFieldSetElement }>();
    const position = (field: HTMLElement) => {
      const entry = entries.get(field);
      if (!entry) return;
      const { input, outline } = entry;
      outline.style.left = `${input.offsetLeft}px`;
      outline.style.top = `${input.offsetTop - 8}px`;
      outline.style.width = `${input.offsetWidth}px`;
      outline.style.height = `${input.offsetHeight + 8}px`;
    };
    const resize = new ResizeObserver(records => records.forEach(record => {
      const field = (record.target as HTMLElement).parentElement;
      if (field) position(field);
    }));
    const sync = (field: HTMLElement) => {
      const input = field.querySelector<HTMLElement>(':scope > input:not([type=checkbox]):not([type=radio]):not([type=hidden]), :scope > textarea');
      const label = input?.nextElementSibling;
      const old = entries.get(field);
      if (!field.isConnected || !field.matches(selector) || !input || label?.tagName !== 'LABEL') {
        if (old) {
          resize.unobserve(old.input);
          old.outline.remove();
          entries.delete(field);
          field.classList.remove('has-outlined-notch');
        }
        return;
      }
      if (old && old.input !== input) {
        resize.unobserve(old.input);
        old.outline.remove();
        entries.delete(field);
      }
      let entry = entries.get(field);
      if (!entry) {
        const outline = document.createElement('fieldset');
        outline.className = 'input-outline';
        outline.setAttribute('aria-hidden', 'true');
        const legend = document.createElement('legend');
        legend.appendChild(document.createElement('span'));
        outline.appendChild(legend);
        entry = { input, outline };
        entries.set(field, entry);
        field.appendChild(outline);
        field.classList.add('has-outlined-notch');
        resize.observe(input);
      }
      const text = entry.outline.querySelector('span');
      if (text.textContent !== label.textContent) text.textContent = label.textContent;
      position(field);
    };
    document.querySelectorAll<HTMLElement>(selector).forEach(sync);
    const observer = new MutationObserver(records => {
      const fields = new Set<HTMLElement>();
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest('.input-outline')) continue;
        const field = target?.closest<HTMLElement>('.input-field');
        if (field) fields.add(field);
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || node.matches('.input-outline')) continue;
          if (node.matches(selector)) fields.add(node);
          node.querySelectorAll<HTMLElement>(selector).forEach(el => fields.add(el));
        }
      }
      // Release observers for detached partials; reinsertion creates a fresh outline.
      for (const field of entries.keys()) if (!field.isConnected) fields.add(field);
      for (const field of [...fields]) {
        field.querySelectorAll<HTMLElement>(selector).forEach(el => fields.add(el));
      }
      fields.forEach(sync);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'placeholder', 'type'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
