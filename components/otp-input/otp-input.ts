import type { MaskitoOptions } from '@maskito/core';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { MaskitoInput } from '../maskito-input/maskito-input';

export interface OtpInputOptions extends BaseOptions {
  /** Number of editable slots (1–32); inferred when pattern is supplied. */
  length?: number;
  characters?: 'digits' | 'alphanumeric';
  /** # = digit, A = ASCII letter, * = alphanumeric; backslash escapes literals. */
  pattern?: string;
  /** Maskito processing and overwrite behavior. The slot pattern owns the mask. */
  maskOptions?: Partial<Omit<MaskitoOptions, 'mask'>>;
  /** Visually group slots without adding separators to the submitted value. */
  groupSize?: number;
  /** Hide entered characters, using a native password input. */
  masked?: boolean;
  onComplete?: (value: string, instance: OtpInput) => void;
}

type Slot = { index: number; expression: string; literal?: string };
const tokenExpressions: Record<string, string> = { '#': '[0-9]', A: '[a-zA-Z]', '*': '[a-zA-Z0-9]' };
const escapePattern = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/\-]/g, '\\$&');

/** A single accessible native input, rendered as Material OTP/PIN slots. Requires @maskito/core. */
export class OtpInput extends Component<OtpInputOptions> {
  declare el: HTMLInputElement;
  ready: Promise<void>;
  private _mask?: MaskitoInput;
  private _wrapper?: HTMLDivElement;
  private _cells: Array<{ slot: Slot; el: HTMLSpanElement }> = [];
  private _slots: Slot[];
  private _attributes = new Map<string, string | null>();
  private _observer?: MutationObserver;
  private _form: HTMLFormElement | null;
  private _resetTimer?: ReturnType<typeof setTimeout>;
  private _destroyed = false;
  private _lastComplete = '';
  private _hadClass: boolean;

  constructor(el: HTMLInputElement, options: Partial<OtpInputOptions> = {}) {
    if (!['text', 'tel', 'password'].includes(el.type)) throw new TypeError('OtpInput requires a text, tel, or password input.');
    const settings = { ...OtpInput.defaults, ...OtpInput._markup(el), ...options };
    if (!['digits', 'alphanumeric'].includes(settings.characters!)) throw new TypeError('Unknown OTP character set.');
    if (!Number.isInteger(settings.groupSize) || settings.groupSize! < 0 || settings.groupSize! > 32) throw new TypeError('OTP groupSize must be an integer between 0 and 32.');
    if (settings.length !== undefined && (!Number.isInteger(settings.length) || settings.length < 1 || settings.length > 32)) throw new TypeError('OTP length must be an integer between 1 and 32.');
    const pattern = settings.pattern ?? (settings.characters === 'alphanumeric' ? '*' : '#').repeat(settings.length ?? 6);
    const slots: Slot[] = [];
    let escaped = false;
    for (const char of pattern) {
      if (!escaped && char === '\\') { escaped = true; continue; }
      const expression = !escaped && tokenExpressions[char];
      if (char.length !== 1) throw new TypeError('OTP patterns support single UTF-16 code-unit characters.');
      slots.push({ index: slots.length, expression: expression || escapePattern(char), ...(!expression ? { literal: char } : {}) });
      escaped = false;
    }
    const length = slots.filter(slot => slot.literal === undefined).length;
    if (escaped || length < 1 || length > 32 || slots.length > 64) throw new TypeError('OTP pattern must contain 1–32 editable slots and at most 64 characters, with paired escapes.');
    if (settings.pattern && settings.length !== undefined && settings.length !== length) throw new TypeError('OTP length must match the editable slots in the pattern.');
    // Validate before replacing an existing instance.
    super(el, options, OtpInput);
    this.el['M_OtpInput'] = this;
    this.options = { ...settings, pattern, length };
    this._slots = slots;
    this._form = el.form;
    this._hadClass = el.classList.contains('otp-input-native');
    this.ready = this._setup().catch(error => { this.destroy(); throw error; });
  }
  static get defaults(): OtpInputOptions { return { characters: 'digits', groupSize: 0 }; }
  static init(el: HTMLInputElement, options?: Partial<OtpInputOptions>): OtpInput;
  static init(els: InitElements<HTMLInputElement | MElement>, options?: Partial<OtpInputOptions>): OtpInput[];
  static init(els: HTMLInputElement | InitElements<HTMLInputElement | MElement>, options: Partial<OtpInputOptions> = {}): OtpInput | OtpInput[] {
    return super.init(els, options, OtpInput);
  }
  static getInstance(el: HTMLInputElement): OtpInput { return el['M_OtpInput']; }
  private static _markup(el: HTMLInputElement): Partial<OtpInputOptions> {
    return {
      ...(el.dataset.otpLength !== undefined ? { length: Number(el.dataset.otpLength) } : {}),
      ...(el.dataset.otpPattern !== undefined ? { pattern: el.dataset.otpPattern } : {}),
      ...(el.dataset.otpGroupSize !== undefined ? { groupSize: Number(el.dataset.otpGroupSize) } : {}),
      ...(el.dataset.otpCharacters ? { characters: el.dataset.otpCharacters as OtpInputOptions['characters'] } : {}),
      ...(el.dataset.otpMasked !== undefined ? { masked: el.dataset.otpMasked !== 'false' } : {})
    };
  }
  private _setAttribute(name: string, value: string) {
    this._attributes.set(name, this.el.getAttribute(name));
    this.el.setAttribute(name, value);
  }
  private async _setup() {
    this._mask = MaskitoInput.init(this.el, {
      preset: 'pattern', pattern: this.options.pattern,
      maskOptions: { overwriteMode: 'replace', ...this.options.maskOptions, mask: this._slots.map(slot => slot.literal ?? new RegExp(slot.expression)) }
    });
    await this._mask.ready;
    if (this._destroyed) return;
    this._setAttribute('maxlength', String(this._slots.length));
    if (!this.el.hasAttribute('pattern')) this._setAttribute('pattern', this._slots.map(slot => slot.expression).join(''));
    if (!this.el.hasAttribute('inputmode')) this._setAttribute('inputmode', this._slots.every(slot => slot.literal !== undefined || slot.expression === '[0-9]') ? 'numeric' : 'text');
    if (this.options.masked !== undefined) this._setAttribute('type', this.options.masked ? 'password' : 'text');
    if (!this.el.hasAttribute('autocomplete')) this._setAttribute('autocomplete', this.el.type === 'password' ? 'off' : 'one-time-code');
    if (!this.el.hasAttribute('spellcheck')) this._setAttribute('spellcheck', 'false');
    if (!this.el.hasAttribute('autocapitalize')) this._setAttribute('autocapitalize', 'off');
    const wrapper = this._wrapper = document.createElement('div');
    wrapper.className = 'otp-input';
    wrapper.dir = 'ltr';
    const cells = document.createElement('div');
    cells.className = 'otp-input-slots';
    cells.setAttribute('aria-hidden', 'true');
    let editableIndex = 0;
    for (const slot of this._slots) {
      const cell = document.createElement('span');
      cell.className = slot.literal !== undefined ? 'otp-input-separator' : 'otp-input-slot';
      if (slot.literal !== undefined) cell.textContent = slot.literal;
      else {
        if (this.options.groupSize && editableIndex && editableIndex % this.options.groupSize === 0) cell.classList.add('otp-input-group-start');
        editableIndex++;
      }
      cells.append(cell);
      this._cells.push({ slot, el: cell });
    }
    this.el.before(wrapper);
    wrapper.append(this.el, cells);
    this.el.classList.add('otp-input-native');
    // Register after Maskito so all displays and completion events see the formatted value.
    this.el.addEventListener('input', this._onInput);
    for (const event of ['focus', 'blur', 'keyup', 'click', 'select']) this.el.addEventListener(event, this._onSelection);
    this.el.addEventListener('invalid', this._onInvalid);
    document.addEventListener('selectionchange', this._onSelection);
    wrapper.addEventListener('pointerdown', this._onPointerDown);
    this._form?.addEventListener('reset', this._onReset);
    this._observer = new MutationObserver(() => this._render(false));
    this._observer.observe(this.el, { attributes: true, attributeFilter: ['type', 'disabled', 'readonly', 'aria-invalid'] });
    this._render(false);
  }
  getValue(): string { return this.el.value; }
  /** Editable characters only; pattern separators are omitted. */
  getUnmaskedValue(): string { return this._slots.filter(slot => slot.literal === undefined).map(slot => this.el.value[slot.index] || '').join(''); }
  isComplete(): boolean { return new RegExp(`^(?:${this._slots.map(slot => slot.expression).join('')})$`).test(this.el.value); }
  async setValue(value: string, emit = true): Promise<void> {
    await this.ready;
    if (this._destroyed) return;
    await this._mask!.setValue(value, emit);
    this._render(false);
  }
  async clear(emit = true): Promise<void> { await this.setValue('', emit); }
  async refresh(): Promise<void> {
    await this.ready;
    if (this._destroyed) return;
    await this._mask!.refresh();
    this._render(false);
  }
  focus(): void { if (!this._destroyed) this.el.focus(); }
  private _onInput = () => {
    if (this._wrapper) this._wrapper.removeAttribute('data-invalid');
    this._render(true);
  };
  private _onSelection = () => { this._render(false); };
  private _onInvalid = () => { this._wrapper?.setAttribute('data-invalid', 'true'); };
  private _onReset = () => {
    clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(() => {
      this._wrapper?.removeAttribute('data-invalid');
      this._render(false);
    }, 0);
  };
  private _onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.el.matches(':disabled')) return;
    const cells = this._cells.filter(cell => cell.slot.literal === undefined);
    let nearest = cells[0], distance = Infinity;
    for (const cell of cells) {
      const rect = cell.el.getBoundingClientRect();
      const next = Math.abs(event.clientX - (rect.left + rect.width / 2)) + Math.abs(event.clientY - (rect.top + rect.height / 2));
      if (next < distance) { nearest = cell; distance = next; }
    }
    event.preventDefault();
    this.el.focus();
    const index = Math.min(nearest.slot.index, this.el.value.length);
    this.el.setSelectionRange(index, Math.min(index + 1, this.el.value.length));
    this._render(false);
  };
  private _render(emit: boolean) {
    if (this._destroyed || !this._wrapper) return;
    const focused = document.activeElement === this.el;
    const start = this.el.selectionStart ?? 0, end = this.el.selectionEnd ?? start;
    const editable = this._cells.filter(cell => cell.slot.literal === undefined);
    const active = editable.find(cell => cell.slot.index >= start) ?? editable[editable.length - 1];
    for (const cell of editable) {
      const value = this.el.value[cell.slot.index] || '';
      cell.el.textContent = value ? (this.el.type === 'password' ? '•' : value) : '';
      cell.el.classList.toggle('is-active', focused && cell === active);
      cell.el.classList.toggle('is-selected', focused && cell.slot.index >= start && cell.slot.index < end);
      cell.el.classList.toggle('is-filled', !!value);
    }
    this._wrapper.classList.toggle('is-complete', this.isComplete());
    const complete = this.isComplete() ? this.el.value : '';
    const changed = complete !== this._lastComplete;
    this._lastComplete = complete;
    if (emit && complete && changed) {
      this.el.dispatchEvent(new CustomEvent('otpcomplete', { bubbles: true, detail: { value: complete, unmaskedValue: this.getUnmaskedValue() } }));
      this.options.onComplete?.(complete, this);
    }
  }
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._resetTimer);
    this._observer?.disconnect();
    this._mask?.destroy();
    this.el.removeEventListener('input', this._onInput);
    for (const event of ['focus', 'blur', 'keyup', 'click', 'select']) this.el.removeEventListener(event, this._onSelection);
    this.el.removeEventListener('invalid', this._onInvalid);
    document.removeEventListener('selectionchange', this._onSelection);
    this._wrapper?.removeEventListener('pointerdown', this._onPointerDown);
    this._form?.removeEventListener('reset', this._onReset);
    if (this._wrapper?.contains(this.el)) this._wrapper.replaceWith(this.el);
    else this._wrapper?.remove();
    if (!this._hadClass) this.el.classList.remove('otp-input-native');
    for (const [name, value] of this._attributes) {
      if (value === null) this.el.removeAttribute(name);
      else this.el.setAttribute(name, value);
    }
    if (OtpInput.getInstance(this.el) === this) this.el['M_OtpInput'] = undefined;
  }
}
