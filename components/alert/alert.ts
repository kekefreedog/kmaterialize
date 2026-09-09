import { BaseOptions, Component, InitElements, MElement } from '../../src/component';

export interface AlertOptions extends BaseOptions {
  /** Automatically wire a `.alert-close` button when present. */
  dismissible: boolean;
  /** Called after the alert is dismissed. */
  onDismiss?: (alert: Alert) => void;
}

const _defaults: AlertOptions = {
  dismissible: true
};

/** A persistent, contextual feedback banner. */
export class Alert extends Component<AlertOptions> {
  private _closeButton: HTMLElement | null = null;
  private _onClose = () => this.dismiss();

  constructor(el: HTMLElement, options: Partial<AlertOptions>) {
    super(el, options, Alert);
    this.options = { ...Alert.defaults, ...options };
    this.el['M_Alert'] = this;
    this._bindCloseButton();
  }

  static get defaults(): AlertOptions {
    return _defaults;
  }

  static init(el: HTMLElement, options?: Partial<AlertOptions>): Alert;
  static init(els: InitElements<MElement>, options?: Partial<AlertOptions>): Alert[];
  static init(
    els: HTMLElement | InitElements<MElement>,
    options: Partial<AlertOptions> = {}
  ): Alert | Alert[] {
    return super.init(els, options, Alert);
  }

  static getInstance(el: HTMLElement): Alert {
    return el['M_Alert'];
  }

  private _bindCloseButton() {
    this._closeButton = this.el.querySelector<HTMLElement>('.alert-close');
    if (this.options.dismissible && this._closeButton) {
      this._closeButton.addEventListener('click', this._onClose);
    }
  }

  /** Hide and remove the alert from the document. */
  dismiss() {
    if (!this.el.isConnected) return;
    this.el.classList.add('alert-dismissing');
    const remove = () => {
      this.el.removeEventListener('transitionend', remove);
      this.el.hidden = true;
      this.options.onDismiss?.(this);
    };
    if (getComputedStyle(this.el).transitionDuration === '0s') remove();
    else this.el.addEventListener('transitionend', remove, { once: true });
  }

  /** Show an alert that was previously dismissed. */
  open() {
    this.el.hidden = false;
    this.el.classList.remove('alert-dismissing');
  }

  destroy() {
    this._closeButton?.removeEventListener('click', this._onClose);
    delete this.el['M_Alert'];
  }
}
