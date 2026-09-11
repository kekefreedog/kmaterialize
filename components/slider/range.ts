import { Component, BaseOptions, InitElements, MElement } from '../../src/component';

export interface RangeOptions extends BaseOptions {
  /** Show a value indicator during pointer or keyboard interaction. */
  showValue: boolean;
  /** Show ticks at step intervals (dense intervals are thinned to at most 101). */
  showTicks: boolean;
  /** Optional plain-text value indicator and accessible value formatting. */
  formatValue?: (value: number) => string;
}
const _defaults: RangeOptions = { showValue: true, showTicks: false };

/** Material-styled native range input. */
export class Range extends Component<RangeOptions> {
  declare el: HTMLInputElement;
  value: HTMLElement;
  thumb: HTMLElement;
  private _ticks: HTMLElement;
  private _tickValues: number[] = [];
  private _pointerDown = false;
  private _disposed = false;
  private _resize?: ResizeObserver;
  private _attributes: MutationObserver;
  private _form: HTMLFormElement | null;
  private _resetTimer?: ReturnType<typeof setTimeout>;
  private _originalProgress: string;
  private _originalPriority: string;
  private _originalValueText: string | null;

  constructor(el: HTMLInputElement, options: Partial<RangeOptions>) {
    super(el, options, Range);
    this.el['M_Range'] = this;
    this.options = { ...Range.defaults, ...options };
    this._originalProgress = el.style.getPropertyValue('--range-progress');
    this._originalPriority = el.style.getPropertyPriority('--range-progress');
    this._originalValueText = el.getAttribute('aria-valuetext');
    this.thumb = document.createElement('span');
    this.thumb.className = 'thumb';
    this.thumb.setAttribute('aria-hidden', 'true');
    this.value = document.createElement('span');
    this.value.className = 'value';
    this.thumb.append(this.value);
    this._ticks = document.createElement('span');
    this._ticks.className = 'range-ticks';
    this._ticks.setAttribute('aria-hidden', 'true');
    el.after(this.thumb, this._ticks);
    el.addEventListener('input', this._handleInput);
    el.addEventListener('change', this._handleInput);
    el.addEventListener('pointerdown', this._handleDown);
    el.addEventListener('focus', this._handleFocus);
    el.addEventListener('blur', this._handleBlur);
    document.addEventListener('pointerup', this._handleUp);
    document.addEventListener('pointercancel', this._handleUp);
    window.addEventListener('blur', this._handleBlur);
    window.addEventListener('resize', this.update);
    this._form = el.form;
    this._form?.addEventListener('reset', this._handleReset);
    this._attributes = new MutationObserver(() => { this._buildTicks(); this.update(); });
    this._attributes.observe(el, {
      attributes: true, attributeFilter: ['min', 'max', 'step', 'value', 'disabled', 'dir', 'data-ticks', 'data-value-label']
    });
    if (typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver(this.update);
      this._resize.observe(el);
      if (el.parentElement) this._resize.observe(el.parentElement);
    }
    this._buildTicks();
    this.update();
  }
  static get defaults(): RangeOptions { return { ..._defaults }; }
  static init(el: HTMLInputElement, options?: Partial<RangeOptions>): Range;
  static init(els: InitElements<HTMLInputElement | MElement>, options?: Partial<RangeOptions>): Range[];
  static init(els: HTMLInputElement | InitElements<HTMLInputElement | MElement>, options: Partial<RangeOptions> = {}): Range | Range[] {
    return super.init(els, options, Range);
  }
  static getInstance(el: HTMLInputElement): Range { return el['M_Range']; }

  private _bounds() {
    const number = (text: string | null, fallback: number) =>
      text !== null && text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : fallback;
    const min = number(this.el.getAttribute('min'), 0);
    return { min, max: Math.max(min, number(this.el.getAttribute('max'), 100)) };
  }
  private _buildTicks() {
    this._ticks.replaceChildren();
    this._tickValues = [];
    if (!(this.options.showTicks || this.el.hasAttribute('data-ticks')) || this.el.step === 'any') return;
    const { min, max } = this._bounds();
    const step = Number(this.el.step) > 0 ? Number(this.el.step) : 1;
    const count = Math.floor((max - min) / step + 1e-8);
    if (!Number.isFinite(count) || count < 1) return;
    const stride = Math.max(1, Math.ceil(count / 100));
    for (let i = 0; i < count; i += stride) this._tickValues.push(min + i * step);
    this._tickValues.push(min + count * step);
    this._ticks.append(...this._tickValues.map(() => document.createElement('span')));
  }
  /** Refresh after assigning input.value programmatically or changing layout/direction. */
  update = () => {
    if (this._disposed) return;
    const { min, max } = this._bounds();
    const ratio = max > min ? Math.min(1, Math.max(0, (this.el.valueAsNumber - min) / (max - min))) : 0;
    const rect = this.el.getBoundingClientRect();
    const styles = getComputedStyle(this.el);
    const handle = parseFloat(styles.getPropertyValue('--range-handle-size')) || 20;
    const travel = Math.max(0, rect.width - handle);
    const rtl = styles.direction === 'rtl';
    const distance = handle / 2 + ratio * travel;
    this.el.style.setProperty('--range-progress', `${distance}px`);
    this.value.textContent = this.options.formatValue ? this.options.formatValue(this.el.valueAsNumber) : this.el.value;
    if (this.options.formatValue) this.el.setAttribute('aria-valuetext', this.value.textContent);
    const parent = this.thumb.offsetParent as HTMLElement | null;
    const origin = parent?.getBoundingClientRect();
    const left = rect.left - (origin?.left || 0) + (parent?.scrollLeft || 0) - (parent?.clientLeft || 0);
    const top = rect.top - (origin?.top || 0) + (parent?.scrollTop || 0) - (parent?.clientTop || 0);
    // Keep formatted labels within the control at either endpoint.
    this.thumb.style.maxWidth = `${rect.width}px`;
    const labelWidth = this.thumb.offsetWidth;
    const center = left + (rtl ? rect.width - distance : distance);
    const labelCenter = Math.max(left + labelWidth / 2, Math.min(left + rect.width - labelWidth / 2, center));
    this.thumb.style.left = `${labelCenter}px`;
    this.thumb.style.setProperty('--range-label-arrow', `${center - labelCenter + labelWidth / 2}px`);
    this.thumb.style.top = `${top + rect.height / 2 - handle / 2 - 12}px`;
    this._ticks.style.left = `${left}px`;
    this._ticks.style.top = `${top + rect.height / 2 - 2}px`;
    this._ticks.style.width = `${rect.width}px`;
    this._ticks.classList.toggle('is-disabled', this.el.disabled);
    Array.from(this._ticks.children).forEach((tick: HTMLElement, index) => {
      const tickRatio = (this._tickValues[index] - min) / (max - min);
      const position = handle / 2 + tickRatio * travel;
      tick.style.left = `${rtl ? rect.width - position : position}px`;
      tick.style.visibility = Math.abs(position - distance) < handle / 2 ? 'hidden' : '';
      tick.classList.toggle('is-active', this._tickValues[index] <= this.el.valueAsNumber);
    });
    if (this.el.disabled || !this._showValue()) this.thumb.classList.remove('active');
    if (this.el.disabled) { this._pointerDown = false; this.el.classList.remove('active'); }
  };
  private _showValue() { return this.options.showValue && this.el.dataset.valueLabel !== 'false'; }
  private _activate() {
    if (!this.el.disabled && this._showValue()) this.thumb.classList.add('active');
  }
  private _handleInput = () => { this.update(); if (document.activeElement === this.el || this._pointerDown) this._activate(); };
  private _handleDown = () => {
    if (this.el.disabled) return;
    this._pointerDown = true;
    this.el.classList.add('active');
    this.update(); this._activate();
  };
  private _handleUp = () => {
    this._pointerDown = false;
    this.el.classList.remove('active');
    if (!this.el.matches(':focus-visible')) this.thumb.classList.remove('active');
  };
  private _handleFocus = () => { this.update(); if (this.el.matches(':focus-visible')) this._activate(); };
  private _handleBlur = () => { this._pointerDown = false; this.el.classList.remove('active'); this.thumb.classList.remove('active'); };
  private _handleReset = () => {
    clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(this.update, 0);
  };
  destroy() {
    this._disposed = true;
    clearTimeout(this._resetTimer);
    this.el.removeEventListener('input', this._handleInput);
    this.el.removeEventListener('change', this._handleInput);
    this.el.removeEventListener('pointerdown', this._handleDown);
    this.el.removeEventListener('focus', this._handleFocus);
    this.el.removeEventListener('blur', this._handleBlur);
    document.removeEventListener('pointerup', this._handleUp);
    document.removeEventListener('pointercancel', this._handleUp);
    window.removeEventListener('blur', this._handleBlur);
    window.removeEventListener('resize', this.update);
    this._form?.removeEventListener('reset', this._handleReset);
    this._resize?.disconnect();
    this._attributes.disconnect();
    this.thumb.remove(); this._ticks.remove();
    this.el.classList.remove('active');
    if (this._originalProgress) this.el.style.setProperty('--range-progress', this._originalProgress, this._originalPriority);
    else this.el.style.removeProperty('--range-progress');
    if (this.options.formatValue) {
      if (this._originalValueText === null) this.el.removeAttribute('aria-valuetext');
      else this.el.setAttribute('aria-valuetext', this._originalValueText);
    }
    this.el['M_Range'] = undefined;
  }
  /** Initialize uninitialized ranges currently in the document. */
  static Init() {
    if (typeof document !== 'undefined') document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(el => {
      if (!Range.getInstance(el)) Range.init(el);
    });
  }
}
