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
    shape: string('round', ['round', 'box', 'square', 'round-left', 'round-right']),
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
    'aria-controls': string(), 'aria-pressed': string(),
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
    // Resolve asymmetric shapes independently from the legacy square aliases.
    const shapeClass = ['round-left', 'round-right'].includes(String(a.shape))
      ? `btn-${a.shape}` : a.shape !== 'round' ? 'btn-square' : '';

    // Combine the chosen shape with the existing button variants.
    const classes = rail ? 'btn btn-rail' : ['btn', 'btn-expressive', variant === 'standard' ? 'btn-icon-standard' : variant,
      `btn-${sizes[String(a.size)] || a.size}`, shapeClass,
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
      ${a.toggle ? `aria-pressed="${a.pressed}"` : a['aria-pressed'] ? `aria-pressed="${escape(a['aria-pressed'])}"` : ''}
      ${a['aria-controls'] && !menu ? `aria-controls="${escape(a['aria-controls'])}"` : ''} ${menu ? menuAttrs : ''}>${content}</${tag}>`;
    return a.split && a['menu-target']
      ? `<span class="btn-split">${button}<button type="button" class="${escape(classes)} btn-icon btn-menu-trigger dropdown-trigger no-autoinit" ${menuAttrs} aria-label="${escape(a['menu-label'])}" ${a.disabled ? 'disabled' : ''}><i class="material-icons" aria-hidden="true">arrow_drop_down</i></button></span>`
      : button;
  }

  postRender(): void {
    // Read the current component attributes.
    const a = this.prepareContext().attributes;
    // Locate the rendered native control.
    const button = this.querySelector<HTMLElement>('[part="button"]')!;
    // Apply caller colors to each rendered control.
    for (const el of this.querySelectorAll<HTMLElement>('.btn')) {
      // Respect disabled state when customizing the cursor.
      if (!a.disabled && a.cursor)
        // Let CSSOM validate the supplied cursor value.
        el.style.cursor = String(a.cursor);
      // Apply the background color before restoring focus.
      this.applyColor(el, String(a['color-primary']), false);
      // Apply the foreground and outline color.
      this.applyColor(el, String(a['color-secondary']), true);
    }
    // Restore focus after styles are applied to avoid a color transition.
    if (this.restoreFocus) {
      // Return keyboard focus to the rebuilt control.
      button.focus();
      // Clear the pending focus restoration.
      this.restoreFocus = false;
    }
    // Give icon-only controls an accessible visual tooltip.
    if (['floating', 'icon', 'fab'].includes(String(a.type)) && a.label) {
      // Track the optional tooltip instance.
      let tooltip: Instance | undefined;
      // Track asynchronous cleanup.
      let cancelled = false;
      // Dispose tooltips when the control rerenders.
      this.onCleanup(() => {
        // Prevent late tooltip creation.
        cancelled = true;
        // Release an already-created tooltip.
        tooltip?.destroy();
      });
      // Load the tooltip peer on demand.
      this.tooltipReady = loadTooltipPeer().then(peer => {
        // Create tooltips only for the current render.
        if (!cancelled)
          // Attach the configured label and placement.
          tooltip = createTooltipWith(peer.create, peer.fill, button, a['tooltip-style'] as TooltipStyle, {
            content: String(a.label), placement: a['tooltip-position'] as Placement,
          });
      });
      // Keep optional tooltip failures from becoming unhandled page errors.
      void this.tooltipReady.catch(() => {
        // Preserve a visual label when the tooltip peer is unavailable.
        if (!cancelled)
          // Fall back to the browser tooltip without changing the accessible name.
          button.title = String(a.label);
      });
    }
    // Handle native activation through one public custom event.
    const click = () => {
      // Ignore disabled controls.
      if (!this.getProperty('disabled')) {
        // Update optional toggle state.
        if (this.getProperty('toggle')) {
          // Find an owning selection group.
          const group = this.closest('[data-selection]');
          // Enforce exclusive selection where configured.
          if (group?.getAttribute('data-selection') === 'single') {
            // Update toggle controls in the same group.
            group.querySelectorAll<CrazyButton>('crazy-button, regular-btn').forEach(peer => {
              // Exclude nested groups and non-toggle controls.
              if (peer.closest('[data-selection]') === group && peer.getProperty('toggle'))
                // Select this control and release its peers.
                peer.setProperty('pressed', peer === this);
            });
          } else
            // Toggle independent controls directly.
            this.setProperty('pressed', !this.getProperty('pressed'));
        }
        // Emit the existing public activation event.
        this.dispatchEvent(new CustomEvent('buttonaction', { bubbles: true, composed: true, detail: {
          action: this.getProperty('action') || this.getProperty('label'),
          pressed: this.getProperty('toggle') ? String(this.getProperty('pressed')) : null,
        } }));
      }
    };
    // Listen to the rendered native button.
    button.addEventListener('click', click);
    // Preserve focus and release the listener on rerender.
    this.onCleanup(() => {
      // Remember whether this render owned keyboard focus.
      this.restoreFocus = document.activeElement === button;
      // Release the old native control.
      button.removeEventListener('click', click);
    });
    // Resolve an optional dropdown trigger.
    const trigger = this.querySelector<HTMLElement>('.dropdown-trigger');
    // Read its external menu identifier.
    const menuTarget = String(a['menu-target'] ?? '');
    // Resolve the authored menu node.
    const menu = trigger && menuTarget ? document.getElementById(menuTarget) : null;
    // Initialize an enabled menu control.
    if (trigger && menu && !a.disabled) {
      // Preserve the original menu location.
      const parent = menu.parentNode;
      // Preserve its position among siblings.
      const next = menu.nextSibling;
      // Keep the menu outside light-DOM slots and scrolling toolbar clipping.
      const dropdown = Dropdown.init(trigger, {
        container: this.closest('dialog') || this.ownerDocument.body,
        alignment: 'right', constrainWidth: false, coverTrigger: false, closeOnClick: true,
        onOpenStart: () => trigger.setAttribute('aria-expanded', 'true'),
        onCloseEnd: () => trigger.setAttribute('aria-expanded', 'false'),
      });
      // Avoid duplicate activation from Enter's native default.
      const keydown = (event: KeyboardEvent) => {
        // Handle only the menu activation key.
        if (event.key === 'Enter')
          // Let Dropdown own keyboard activation.
          event.preventDefault();
      };
      // Observe menu keys before default button activation.
      menu.addEventListener('keydown', keydown, true);
      // Restore caller-owned menu nodes on rerender or disconnection.
      this.onCleanup(() => {
        // Release dropdown behavior and positioning.
        dropdown.destroy();
        // Remove this render's keyboard listener.
        menu.removeEventListener('keydown', keydown, true);
        // Restore the menu's authored location when available.
        if (parent)
          // Keep external menus out of subsequent slot projection.
          parent.insertBefore(menu, next?.parentNode === parent ? next : null);
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
