import { BaseOptions, Component, InitElements, MElement } from '../../src/component';

export type TinyNavbarPosition = 'inline' | 'top' | 'bottom';
export interface TinyNavbarOptions extends BaseOptions {
  position: TinyNavbarPosition;
  dismissible: boolean;
  closeLabel: string;
  /** Optional control to focus after closing from inside the navbar. */
  returnFocus: HTMLElement | null;
  onClose: ((navbar: TinyNavbar) => void) | null;
}

/** Compact navigation or announcement bar, optionally fixed to either viewport edge. */
export class TinyNavbar extends Component<TinyNavbarOptions> {
  private _closeButton: HTMLButtonElement | null = null;
  private _originalClasses: string[];
  private _originalHidden: boolean;
  private static _classes = ['navbar-tiny', 'navbar-tiny-top', 'navbar-tiny-bottom', 'navbar-tiny-dismissible'];

  constructor(el: HTMLElement, options: Partial<TinyNavbarOptions> = {}) {
    const settings = { ...TinyNavbar.defaults,
      position: el.classList.contains('navbar-tiny-bottom') ? 'bottom' : el.classList.contains('navbar-tiny-top') ? 'top' : 'inline',
      dismissible: el.classList.contains('navbar-tiny-dismissible'), ...options } as TinyNavbarOptions;
    TinyNavbar._validatePosition(settings.position);
    super(el, options, TinyNavbar);
    this.options = settings;
    this._originalClasses = TinyNavbar._classes.filter(name => el.classList.contains(name));
    this._originalHidden = el.hidden;
    el.classList.add('navbar-tiny');
    el.classList.toggle('navbar-tiny-dismissible', settings.dismissible);
    this.setPosition(settings.position);
    if (settings.dismissible) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'navbar-tiny-close';
      button.setAttribute('aria-label', settings.closeLabel); button.title = settings.closeLabel;
      const icon = document.createElement('i'); icon.className = 'material-icons'; icon.textContent = 'close';
      icon.setAttribute('aria-hidden', 'true'); button.append(icon);
      button.addEventListener('click', this.close); el.append(button); this._closeButton = button;
    }
    el['M_TinyNavbar'] = this;
  }

  static get defaults(): TinyNavbarOptions {
    return { position: 'inline', dismissible: false, closeLabel: 'Close navigation', returnFocus: null, onClose: null };
  }
  static init(el: HTMLElement, options?: Partial<TinyNavbarOptions>): TinyNavbar;
  static init(els: InitElements<MElement>, options?: Partial<TinyNavbarOptions>): TinyNavbar[];
  static init(els: HTMLElement | InitElements<MElement>, options: Partial<TinyNavbarOptions> = {}): TinyNavbar | TinyNavbar[] {
    return super.init(els, options, TinyNavbar);
  }
  static getInstance(el: HTMLElement): TinyNavbar { return el['M_TinyNavbar']; }
  private static _validatePosition(position: TinyNavbarPosition): void {
    if (!['inline', 'top', 'bottom'].includes(position)) throw new Error('Tiny navbar position must be inline, top, or bottom.');
  }
  get isOpen(): boolean { return !this.el.hidden; }
  getPosition(): TinyNavbarPosition { return this.options.position; }
  setPosition(position: TinyNavbarPosition): void {
    TinyNavbar._validatePosition(position);
    this.options.position = position;
    this.el.classList.toggle('navbar-tiny-top', position === 'top');
    this.el.classList.toggle('navbar-tiny-bottom', position === 'bottom');
  }
  open(): void { this.el.hidden = false; }
  close = (): void => {
    if (!this.isOpen) return;
    const moveFocus = this.el.contains(document.activeElement);
    this.el.hidden = true;
    if (moveFocus) {
      const available = (node: HTMLElement) => node.isConnected && !this.el.contains(node) && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0;
      const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]'))
        .filter(node => node.tabIndex >= 0 && available(node));
      const preferred = this.options.returnFocus;
      const target = preferred && available(preferred) ? preferred
        : controls.find(node => !!(this.el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) || controls[controls.length - 1];
      if (target) target.focus({ preventScroll: true });
      else {
        const parent = this.el.parentElement;
        if (parent) {
          const tabindex = parent.getAttribute('tabindex'); parent.setAttribute('tabindex', '-1'); parent.focus({ preventScroll: true });
          if (tabindex === null) parent.removeAttribute('tabindex'); else parent.setAttribute('tabindex', tabindex);
        }
      }
    }
    this.options.onClose?.(this);
  };
  destroy(): void {
    this._closeButton?.removeEventListener('click', this.close); this._closeButton?.remove();
    for (const name of TinyNavbar._classes) this.el.classList.toggle(name, this._originalClasses.includes(name));
    this.el.hidden = this._originalHidden;
    delete this.el['M_TinyNavbar'];
  }
}
