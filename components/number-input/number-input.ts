import type IMaskCtor from 'imask';
import type { MaskedNumberOptions, InputMask } from 'imask';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';

export interface NumberInputOptions extends BaseOptions {
  thousandsSeparator: string;
  radix: string;
  mapToRadix: string[];
  min?: number;
  max?: number;
  scale?: number;
  /** Opt in to left/right fine and coarse increment controls. */
  controls?: boolean;
  /** Fine increment; otherwise read step, falling back to 1. */
  step?: number;
  /** Coarse increment; otherwise data-number-large-step or ten fine increments. */
  largeStep?: number;
}

const _defaults: NumberInputOptions = {
  thousandsSeparator: ' ',
  radix: '.',
  mapToRadix: [',']
};

// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/Number.ts
// Masked/formatted numeric input via IMask (thousands separator, decimal
// scale, min/max) - deliberately opts in on `type="text" data-type="number"`
// rather than `type="number"`, so IMask can format the display value
// (thousands separators etc.) that a native number input wouldn't allow.
//
// IMask is an optional peerDependency, loaded on demand via peer-loader -
// see that file for the bundler/no-bundler resolution strategy.
export class NumberInput extends Component<NumberInputOptions> {
  declare el: HTMLInputElement;
  mask: InputMask<MaskedNumberOptions> | undefined;
  ready: Promise<void>;

  constructor(el: HTMLInputElement, options: Partial<NumberInputOptions>) {
    super(el, options, NumberInput);
    (this.el as any).M_NumberInput = this;

    this.options = {
      ...NumberInput.defaults,
      ...options
    };

    this.ready = this._setup();
  }

  static get defaults(): NumberInputOptions {
    return _defaults;
  }

  static init(el: HTMLInputElement, options?: Partial<NumberInputOptions>): NumberInput;
  static init(
    els: InitElements<HTMLInputElement | MElement>,
    options?: Partial<NumberInputOptions>
  ): NumberInput[];
  static init(
    els: HTMLInputElement | InitElements<HTMLInputElement | MElement>,
    options: Partial<NumberInputOptions> = {}
  ): NumberInput | NumberInput[] {
    return super.init(els, options, NumberInput);
  }

  static getInstance(el: HTMLInputElement): NumberInput {
    return (el as any).M_NumberInput;
  }

  destroy() {
    this._destroyed = true;
    this._events?.abort();
    this._observer?.disconnect();
    this.mask?.off('accept', this.syncControls);
    this.mask?.destroy();
    if (this._controls) {
      this._controls.replaceWith(this.el);
      this._controls = undefined;
    }
    for (const [name, value] of this._originalAttributes) {
      if (value === null) this.el.removeAttribute(name);
      else this.el.setAttribute(name, value);
    }
    (this.el as any).M_NumberInput = undefined;
  }

  private _destroyed = false;
  private _controls: HTMLElement | undefined;
  private _events: AbortController | undefined;
  private _observer: MutationObserver | undefined;
  private _originalAttributes = new Map<string, string | null>();

  private get stepSize(): number {
    const value = this.options.step ?? Number(this.el.getAttribute('step') || 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  private get largeStepSize(): number {
    const value = this.options.largeStep ?? Number(this.el.dataset.numberLargeStep || this.stepSize * 10);
    return Number.isFinite(value) && value > 0 ? value : this.stepSize * 10;
  }

  private bound(name: 'min' | 'max'): number | undefined {
    const value = this.options[name] ?? (this.el.hasAttribute(name) ? Number(this.el.getAttribute(name)) : undefined);
    return Number.isFinite(value) ? value : undefined;
  }

  private decimalPlaces(value: number): number {
    const [coefficient, exponent = '0'] = String(value).split('e');
    return Math.max(0, (coefficient.split('.')[1]?.length || 0) - Number(exponent));
  }

  /** Increase by the fine step, or the coarse step when large is true. */
  increment(large = false): void { this.adjust(large ? this.largeStepSize : this.stepSize); }

  /** Decrease by the fine step, or the coarse step when large is true. */
  decrement(large = false): void { this.adjust(-(large ? this.largeStepSize : this.stepSize)); }

  private adjust(delta: number): void {
    if (!this.mask || this._destroyed || this.el.matches(':disabled') || this.el.readOnly) return;
    const current = Number(this.mask.typedValue) || 0;
    // Round decimal steps before formatting: 0.2 + 0.1 must display 0.3.
    const precision = Math.min(15, Math.max(this.decimalPlaces(current), this.decimalPlaces(delta)));
    let next = Number((current + delta).toFixed(precision));
    next = Math.max(this.bound('min') ?? -Infinity, Math.min(this.bound('max') ?? Infinity, next));
    if (!Number.isFinite(next)) return;
    if (next === current && this.el.value !== '') return;
    this.mask.typedValue = next;
    this.syncControls();
    this.el.dispatchEvent(new Event('input', { bubbles: true }));
    this.el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private setupControls(): void {
    this._events = new AbortController();
    const signal = this._events.signal;
    for (const name of ['role', 'inputmode', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow']) {
      this._originalAttributes.set(name, this.el.getAttribute(name));
    }
    this.el.setAttribute('role', 'spinbutton');
    this.el.setAttribute('inputmode', 'decimal');
    const wrapper = document.createElement('div');
    wrapper.className = 'number-input-stepper';
    this.el.before(wrapper);
    wrapper.append(this.el);
    this._controls = wrapper;
    const makeButton = (direction: -1 | 1, large: boolean) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.direction = String(direction);
      button.dataset.large = String(large);
      button.innerHTML = `<span aria-hidden="true">${direction < 0 ? large ? '«' : '‹' : large ? '»' : '›'}</span><small aria-hidden="true"></small>`;
      button.addEventListener('click', () => {
        this.adjust(direction * (large ? this.largeStepSize : this.stepSize));
      }, { signal });
      return button;
    };
    wrapper.prepend(makeButton(-1, true), makeButton(-1, false));
    wrapper.append(makeButton(1, false), makeButton(1, true));
    this.el.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) return;
      event.preventDefault();
      const large = event.shiftKey || event.key.startsWith('Page');
      if (event.key === 'ArrowUp' || event.key === 'PageUp') this.increment(large);
      else this.decrement(large);
    }, { signal });
    this.el.addEventListener('change', () => { this.mask?.updateValue(); this.syncControls(); }, { signal });
    this.mask!.on('accept', this.syncControls);
    this._observer = new MutationObserver(() => {
      this.mask?.updateOptions({ min: this.bound('min'), max: this.bound('max') });
      this.syncControls();
    });
    this._observer.observe(this.el, { attributes: true, attributeFilter: ['disabled', 'readonly', 'min', 'max', 'step', 'data-number-large-step'] });
    for (let parent = this.el.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLFieldSetElement) this._observer.observe(parent, { attributes: true, attributeFilter: ['disabled'] });
    }
    this.el.form?.addEventListener('reset', () => {
      queueMicrotask(() => { if (!this._destroyed) { this.mask?.updateValue(); this.syncControls(); } });
    }, { signal });
    this.syncControls();
  }

  private syncControls = (): void => {
    if (!this._controls || !this.mask) return;
    const value = Number(this.mask.typedValue) || 0;
    const min = this.bound('min');
    const max = this.bound('max');
    for (const [name, bound] of [['aria-valuemin', min], ['aria-valuemax', max]] as const) {
      if (bound === undefined) this.el.removeAttribute(name);
      else this.el.setAttribute(name, String(bound));
    }
    if (this.el.value === '') this.el.removeAttribute('aria-valuenow');
    else this.el.setAttribute('aria-valuenow', String(value));
    this._controls.querySelectorAll('button').forEach(button => {
      const direction = Number(button.dataset.direction);
      const step = button.dataset.large === 'true' ? this.largeStepSize : this.stepSize;
      button.setAttribute('aria-label', `${direction < 0 ? 'Decrease' : 'Increase'} by ${step}`);
      button.title = button.getAttribute('aria-label')!;
      button.querySelector('small')!.textContent = String(step);
      button.disabled = this.el.matches(':disabled') || this.el.readOnly ||
        (this.el.value !== '' && (direction < 0 ? min !== undefined && value <= min : max !== undefined && value >= max));
    });
  };

  async _setup(): Promise<void> {
    const IMask = await loadPeer<typeof IMaskCtor>(
      {
        specifier: 'imask',
        globalName: 'IMask',
        feature: 'Number input (IMask) enhancement',
        cdnHint: '<script src="path/to/imask.min.js"></script> (self-hosted - copy from node_modules/imask/dist/imask.min.js, or a CDN of your choice)'
      },
      () => import('imask')
    );

    if (this._destroyed) return;

    const maskOptions: MaskedNumberOptions = {
      mask: Number,
      skipInvalid: true,
      thousandsSeparator: this.options.thousandsSeparator,
      radix: this.options.radix,
      mapToRadix: this.options.mapToRadix,
      autofix: true
    };

    const max = this.options.max ?? (this.el.hasAttribute('max') ? Number(this.el.getAttribute('max')) : undefined);
    if (max !== undefined && !Number.isNaN(max)) maskOptions.max = max;

    const min = this.options.min ?? (this.el.hasAttribute('min') ? Number(this.el.getAttribute('min')) : undefined);
    if (min !== undefined && !Number.isNaN(min)) maskOptions.min = min;

    const step = this.el.getAttribute('step');
    const controls = this.options.controls ?? (this.el.hasAttribute('data-number-controls') && this.el.dataset.numberControls !== 'false');
    const scale = this.options.scale ?? (controls ? Math.max(this.decimalPlaces(this.stepSize), this.decimalPlaces(this.largeStepSize)) : step?.includes('.') ? step.split('.').at(-1)?.length : undefined);
    if (scale !== undefined) maskOptions.scale = scale;

    this.mask = IMask(this.el, maskOptions) as InputMask<MaskedNumberOptions>;
    if (controls) this.setupControls();
  }
}
