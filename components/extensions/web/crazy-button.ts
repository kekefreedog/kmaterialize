import Kmcomponent, { type KmcomponentProperties } from './kmcomponent';
import { Dropdown } from '../../dropdown/dropdown';
import type { Instance, Placement } from 'tippy.js';
import { createTooltipWith, type TooltipStyle } from '../tooltip-factory';
import { loadTooltipPeer } from '../tooltip-peer';

const string = (value = '', select?: string[]) => ({ type: 'string' as const, default: value, select });
const boolean = () => ({ type: 'boolean' as const, default: false, reflect: true });
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const sizes = { small: 'xs', normal: 'sm', large: 'md', 'extra-large': 'lg' };

// Palette names from sass/_colors.scss take precedence over CSS named colors.
const paletteColors = new Set([
  'materialize-red', 'red', 'pink', 'purple', 'deep-purple', 'indigo',
  'blue', 'light-blue', 'cyan', 'teal', 'green', 'light-green', 'lime',
  'yellow', 'amber', 'orange', 'deep-orange', 'brown', 'blue-grey',
  'grey', 'gold', 'black', 'white', 'transparent',
]);

/** RegularBtn's attribute API, backed by the renamed Crazycomponent2 runtime. */
export default class CrazyButton extends Kmcomponent {
  static properties: KmcomponentProperties = {
    type: string('floating', ['floating', 'extended', 'icon', 'fab', 'extended-fab', 'rail']),
    depth: string('flat', ['flat', 'outlined', '1', '2', '3', '4', '5']),
    shape: string('round', ['round', 'box', 'square']),
    size: string('large', ['small', 'normal', 'large', 'extra-large', 'xs', 'sm', 'md', 'lg', 'xl']),
    wave: string('light', ['light', 'dark', 'false']),
    'tooltip-style': string('classic', ['classic', 'material']),
    'tooltip-position': string('top', ['top', 'right', 'bottom', 'left']),
    cursor: string(),
    label: string(), 'icon-class': string('material-icons'), 'icon-text': string(),
    'icon-image': string(), 'icon-image-style': string(),
    'icon-position': string('right', ['left', 'right']),
    'color-primary': string(), 'color-secondary': string(),
    'data-view': string(), 'aria-current': string(),
    href: string(), target: string('_self', ['_self', '_blank']),
    variant: string('', ['', 'filled', 'tonal', 'outlined', 'elevated', 'text', 'standard']),
    disabled: boolean(), toggle: boolean(), pressed: boolean(),
    'icon-width': string('normal', ['normal', 'narrow', 'wide']),
    'fab-color': string('primary', ['primary', 'secondary', 'tertiary']),
    'fab-size': string('normal', ['small', 'normal', 'large']),
    'menu-target': string(), split: boolean(), 'menu-label': string('More options'),
    'aria-label': string(), 'button-type': string('button', ['button', 'submit', 'reset']),
    name: string(), value: string(), form: string(), action: string(),
  };

  /** Resolves when the current render’s optional tooltip has initialized. */
  public tooltipReady: Promise<void> = Promise.resolve();

  getCurrentAttribute(name: string): unknown { return this.getProperty(name); }
  hasCurrentAttribute(name: string): boolean { return Boolean(this.getProperty(name)); }

  render(): string {
    const a = this.prepareContext().attributes;
    const rail = a.type === 'rail';
    const iconOnly = ['floating', 'icon', 'fab'].includes(String(a.type));
    const fab = ['fab', 'extended-fab'].includes(String(a.type));
    const variant = a.variant || (a.depth === 'flat' ? 'text' : a.depth === 'outlined' ? 'outlined' : 'elevated');
    const classes = rail ? 'btn btn-rail' : ['btn', 'btn-expressive', variant === 'standard' ? 'btn-icon-standard' : variant,
      `btn-${sizes[String(a.size)] || a.size}`, a.shape !== 'round' ? 'btn-square' : '',
      iconOnly ? 'btn-icon' : '', a.toggle ? 'btn-toggle' : '',
      a['icon-width'] !== 'normal' ? `btn-icon-${a['icon-width']}` : '',
      fab ? `btn-fab fab-${a['fab-color']} fab-${a['fab-size']}` : '',
      a.type === 'extended-fab' ? 'btn-fab-extended' : '',
      a.wave !== 'false' ? `waves-effect ${a.wave === 'light' ? 'waves-light' : ''}` : '',
      /^[1-5]$/.test(String(a.depth)) ? `z-depth-${a.depth}` : '',
    ].filter(Boolean).join(' ');
    const icon = a['icon-image']
      ? `<img src="${escape(a['icon-image'])}" alt="" style="${escape(a['icon-image-style'])}">`
      : a['icon-text'] ? `<i class="${escape(a['icon-class'])}" aria-hidden="true">${escape(a['icon-text'])}</i>` : '';
    const label = iconOnly ? '' : `<slot>${escape(a.label)}</slot>`;
    const content = rail
      ? `<span class="m3-rail-icon">${icon}</span><span>${label}</span>`
      : a['icon-position'] === 'left' ? icon + label : label + icon;
    const menu = a['menu-target'] && !a.split;
    // A disabled link becomes a native disabled button, including keyboard behavior.
    const link = a.href && !a.disabled;
    const tag = link ? 'a' : 'button';
    const attributes = link
      ? `href="${escape(a.href)}" target="${escape(a.target)}"${a.target === '_blank' ? ' rel="noopener noreferrer"' : ''}`
      : `type="${escape(a['button-type'])}" ${a.disabled ? 'disabled' : ''} name="${escape(a.name)}" value="${escape(a.value)}"${a.form ? ` form="${escape(a.form)}"` : ''}`;
    const menuAttrs = `data-target="${escape(a['menu-target'])}" aria-haspopup="true" aria-expanded="false" aria-controls="${escape(a['menu-target'])}"`;
    const button = `<${tag} part="button" class="${escape(classes)}${menu ? ' dropdown-trigger no-autoinit btn-menu-trigger' : ''}" ${attributes}
      ${a['aria-label'] || iconOnly ? `aria-label="${escape(a['aria-label'] || a.label || a['icon-text'] || 'Button')}"` : ''}
      ${a['data-view'] ? `data-view="${escape(a['data-view'])}"` : ''}
      ${a['aria-current'] ? `aria-current="${escape(a['aria-current'])}"` : ''}
      ${a.toggle ? `aria-pressed="${a.pressed}"` : ''} ${menu ? menuAttrs : ''}>${content}</${tag}>`;
    return a.split && a['menu-target']
      ? `<span class="btn-split">${button}<button type="button" class="${escape(classes)} btn-icon btn-menu-trigger dropdown-trigger no-autoinit" ${menuAttrs} aria-label="${escape(a['menu-label'])}" ${a.disabled ? 'disabled' : ''}><i class="material-icons" aria-hidden="true">arrow_drop_down</i></button></span>`
      : button;
  }

  postRender(): void {
    const a = this.prepareContext().attributes;
    const button = this.querySelector<HTMLElement>('[part="button"]')!;
    for (const el of this.querySelectorAll<HTMLElement>('.btn')) {
      // CSSOM validates the value and supports keywords, var(), and image URLs.
      // Invalid/empty values fall back to the host cursor; disabled controls keep their default.
      if (!a.disabled && a.cursor) el.style.cursor = String(a.cursor);
      this.applyColor(el, String(a['color-primary']), false);
      this.applyColor(el, String(a['color-secondary']), true);
    }
    // Focus can flush styles: apply custom colors first so a rebuilt button
    // does not transition from its default background when focus is restored.
    if (this.restoreFocus) { button.focus(); this.restoreFocus = false; }
    if (['floating', 'icon', 'fab'].includes(String(a.type)) && a.label) {
      let tooltip: Instance | undefined;
      let cancelled = false;
      this.onCleanup(() => { cancelled = true; tooltip?.destroy(); });
      this.tooltipReady = loadTooltipPeer().then(peer => {
        if (cancelled) return;
        tooltip = createTooltipWith(peer.create, peer.fill, button, a['tooltip-style'] as TooltipStyle, {
          content: String(a.label), placement: a['tooltip-position'] as Placement,
        });
      });
    }
    const click = () => {
      if (this.getProperty('disabled')) return;
      if (this.getProperty('toggle')) {
        const group = this.closest('[data-selection]');
        if (group?.getAttribute('data-selection') === 'single') {
          group.querySelectorAll<CrazyButton>('crazy-button, regular-btn').forEach(peer => {
            if (peer.closest('[data-selection]') === group && peer.getProperty('toggle')) peer.setProperty('pressed', peer === this);
          });
        } else this.setProperty('pressed', !this.getProperty('pressed'));
      }
      this.dispatchEvent(new CustomEvent('buttonaction', { bubbles: true, composed: true, detail: {
        action: this.getProperty('action') || this.getProperty('label'),
        pressed: this.getProperty('toggle') ? String(this.getProperty('pressed')) : null,
      } }));
    };
    button.addEventListener('click', click);
    this.onCleanup(() => {
      this.restoreFocus = document.activeElement === button;
      button.removeEventListener('click', click);
    });
    const trigger = this.querySelector<HTMLElement>('.dropdown-trigger');
    const menuTarget = String(a['menu-target'] ?? '');
    const menu = trigger && menuTarget ? document.getElementById(menuTarget) : null;
    if (trigger && menu && !a.disabled) {
      const parent = menu.parentNode;
      const next = menu.nextSibling;
      const dropdown = Dropdown.init(trigger, {
        alignment: 'right', constrainWidth: false, coverTrigger: false, closeOnClick: true,
        onOpenStart: () => trigger.setAttribute('aria-expanded', 'true'),
        onCloseEnd: () => trigger.setAttribute('aria-expanded', 'false'),
      });
      const keydown = (event: KeyboardEvent) => { if (event.key === 'Enter') event.preventDefault(); };
      menu.addEventListener('keydown', keydown, true);
      this.onCleanup(() => {
        dropdown.destroy();
        menu.removeEventListener('keydown', keydown, true);
        // Dropdown may relocate external menu nodes; retain them across rerenders.
        if (parent) parent.insertBefore(menu, next?.parentNode === parent ? next : null);
      });
    }
  }

  private restoreFocus = false;

  private applyColor(element: HTMLElement, color: string, foreground: boolean): void {
    color = color.trim();
    if (!color || this.getProperty('disabled')) return;
    if (!paletteColors.has(color) && CSS.supports('color', color)) {
      element.style.setProperty(foreground ? 'color' : 'background-color', color);
      if (foreground) element.style.borderColor = color;
    } else {
      // Rodeo accepts Materialize palette classes, e.g. "blue lighten-5".
      element.classList.add(...color.trim().split(/\s+/).map((token, index) => foreground ? index === 0 ? `${token}-text` : `text-${token}` : token));
      if (foreground) element.style.borderColor = 'currentColor';
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('crazy-button')) customElements.define('crazy-button', CrazyButton);
// Native customElements requires a separate constructor for an alias.
if (typeof customElements !== 'undefined' && !customElements.get('regular-btn')) customElements.define('regular-btn', class RegularBtn extends CrazyButton {});
