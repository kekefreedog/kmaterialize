import { Component, BaseOptions, InitElements, MElement } from '../../src/component';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PasswordInputOptions extends BaseOptions {}

const _defaults: PasswordInputOptions = {};

// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/Password.ts
// Show/hide toggle for a password input - no third-party dependency, just
// Materialize's own .prefix/.suffix icon-slot convention (see
// components/textfield/_input-fields.scss), so unlike the other new form
// enhancements in this batch this one needs no peer-loader/dynamic import.
export class PasswordInput extends Component<PasswordInputOptions> {
  declare el: HTMLInputElement;
  private _suffixEl: HTMLElement | null;

  constructor(el: HTMLInputElement, options: Partial<PasswordInputOptions>) {
    super(el, options, PasswordInput);
    (this.el as any).M_PasswordInput = this;

    this.options = {
      ...PasswordInput.defaults,
      ...options
    };

    this._suffixEl = this.el.parentElement?.querySelector<HTMLElement>('[data-password-toggle-icon]') ?? null;
    if (!this.el.dataset.passwordVisible) this.el.dataset.passwordVisible = '0';
    this._setupEventHandlers();
  }

  static get defaults(): PasswordInputOptions {
    return _defaults;
  }

  static init(el: HTMLInputElement, options?: Partial<PasswordInputOptions>): PasswordInput;
  static init(
    els: InitElements<HTMLInputElement | MElement>,
    options?: Partial<PasswordInputOptions>
  ): PasswordInput[];
  static init(
    els: HTMLInputElement | InitElements<HTMLInputElement | MElement>,
    options: Partial<PasswordInputOptions> = {}
  ): PasswordInput | PasswordInput[] {
    return super.init(els, options, PasswordInput);
  }

  static getInstance(el: HTMLInputElement): PasswordInput {
    return (el as any).M_PasswordInput;
  }

  destroy() {
    this._removeEventHandlers();
    (this.el as any).M_PasswordInput = undefined;
  }

  _setupEventHandlers() {
    this._suffixEl?.addEventListener('click', this._handleToggleClick);
  }

  _removeEventHandlers() {
    this._suffixEl?.removeEventListener('click', this._handleToggleClick);
  }

  _handleToggleClick = () => {
    const visible = this.el.dataset.passwordVisible === '1';
    this.el.type = visible ? 'password' : 'text';
    this.el.dataset.passwordVisible = visible ? '0' : '1';

    const iconEl = this._suffixEl?.querySelector('i');
    if (iconEl) iconEl.textContent = visible ? 'visibility' : 'visibility_off';
  };
}
