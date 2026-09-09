import { BaseOptions, Component, InitElements, MElement } from '../../src/component';

export interface LoadingOptions extends BaseOptions {
  /** Start animating immediately. */
  active: boolean;
  /** Accessible status while work is in progress. */
  label: string;
  /** Accessible status when work has finished. */
  completeLabel: string;
}

const _defaults: LoadingOptions = {
  active: true,
  label: 'Loading…',
  completeLabel: 'Ready'
};

/** A circular loading indicator with an optional centered logo or icon. */
export class Loading extends Component<LoadingOptions> {
  private _originalAttributes: Record<string, string | null> = {};
  private _originalActive: boolean;
  private _originalLoading: boolean;
  private _generatedSpinner: HTMLElement | null = null;

  constructor(el: HTMLElement, options: Partial<LoadingOptions> = {}) {
    super(el, options, Loading);
    this.options = { ...Loading.defaults, ...options };
    this.el['M_Loading'] = this;
    this._originalActive = this.el.classList.contains('active');
    this._originalLoading = this.el.classList.contains('loading');
    for (const name of ['role', 'aria-live', 'aria-busy', 'aria-label']) {
      this._originalAttributes[name] = this.el.getAttribute(name);
    }
    // Preserve an accessible name supplied in the markup unless overridden.
    if (options.label === undefined && this.el.hasAttribute('aria-label')) {
      this.options.label = this.el.getAttribute('aria-label');
    }
    this.el.classList.add('loading');
    // Reuse authored Preloader markup; generate it for the compact JS API.
    if (!this.el.querySelector(':scope > .preloader-wrapper')) {
      this._generatedSpinner = document.createElement('div');
      this._generatedSpinner.className = 'preloader-wrapper active';
      this._generatedSpinner.setAttribute('aria-hidden', 'true');
      this._generatedSpinner.innerHTML = `<div class="spinner-layer">
        <div class="circle-clipper left"><div class="circle"></div></div>
        <div class="gap-patch"><div class="circle"></div></div>
        <div class="circle-clipper right"><div class="circle"></div></div>
      </div>`;
      this.el.appendChild(this._generatedSpinner);
    }
    if (!this.el.hasAttribute('role')) this.el.setAttribute('role', 'status');
    if (!this.el.hasAttribute('aria-live')) this.el.setAttribute('aria-live', 'polite');
    if (this.options.active) this.start();
    else this.stop();
  }

  static get defaults(): LoadingOptions {
    return _defaults;
  }

  static init(el: HTMLElement, options?: Partial<LoadingOptions>): Loading;
  static init(els: InitElements<MElement>, options?: Partial<LoadingOptions>): Loading[];
  static init(
    els: HTMLElement | InitElements<MElement>,
    options: Partial<LoadingOptions> = {}
  ): Loading | Loading[] {
    return super.init(els, options, Loading);
  }

  static getInstance(el: HTMLElement): Loading {
    return el['M_Loading'];
  }

  get isActive(): boolean {
    return this.el.classList.contains('active');
  }

  /** Show the animated ring and announce the loading status. */
  start(label: string = this.options.label): void {
    this.el.setAttribute('aria-label', label);
    this.el.setAttribute('aria-busy', 'true');
    this.el.classList.add('active');
  }

  /** Hide the ring, keeping the centered content visible. */
  stop(label: string = this.options.completeLabel): void {
    this.el.setAttribute('aria-label', label);
    this.el.setAttribute('aria-busy', 'false');
    this.el.classList.remove('active');
  }

  /** Restore the original markup state and remove the instance. */
  destroy(): void {
    this._generatedSpinner?.remove();
    this._generatedSpinner = null;
    for (const [name, value] of Object.entries(this._originalAttributes)) {
      if (value === null) this.el.removeAttribute(name);
      else this.el.setAttribute(name, value);
    }
    this.el.classList.toggle('active', this._originalActive);
    this.el.classList.toggle('loading', this._originalLoading);
    delete this.el['M_Loading'];
  }
}
