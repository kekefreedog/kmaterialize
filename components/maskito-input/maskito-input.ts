import type { Maskito, MaskitoOptions } from '@maskito/core';
import type { MaskitoDateParams, MaskitoNumberParams, MaskitoTimeParams } from '@maskito/kit';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';
import { NumberInput } from '../number-input/number-input';

type MaskitoCore = typeof import('@maskito/core');
type MaskitoKit = typeof import('@maskito/kit');
export interface MaskitoInputOptions extends BaseOptions {
  preset?: 'pattern' | 'number' | 'date' | 'time';
  /** # = digit, A = ASCII letter, * = alphanumeric. Backslash escapes literals. */
  pattern?: string;
  number?: MaskitoNumberParams;
  date?: MaskitoDateParams;
  time?: MaskitoTimeParams;
  /** Native Maskito options, including regex/dynamic masks, processors and plugins. */
  maskOptions?: Partial<MaskitoOptions>;
}

/** Optional Maskito enhancement for native text inputs. */
export class MaskitoInput extends Component<MaskitoInputOptions> {
  declare el: HTMLInputElement;
  mask?: Maskito;
  ready: Promise<void>;
  private _core?: MaskitoCore;
  private _maskOptions?: MaskitoOptions;
  private _destroyed = false;
  private _form: HTMLFormElement | null;
  private _resetTimer?: ReturnType<typeof setTimeout>;

  constructor(el: HTMLInputElement, options: Partial<MaskitoInputOptions>) {
    if (!['text', 'tel', 'search', 'url', 'password'].includes(el.type)) {
      throw new TypeError('MaskitoInput requires a text, tel, search, url, or password input. Use inputmode for a numeric keyboard.');
    }
    const markup = MaskitoInput._readMarkup(el);
    super(el, options, MaskitoInput);
    this.el['M_MaskitoInput'] = this;
    this.options = { ...MaskitoInput.defaults, ...markup, ...options };
    this._form = el.form;
    this.ready = this._setup().catch(error => { this.destroy(); throw error; });
  }
  static get defaults(): MaskitoInputOptions { return { preset: 'pattern' }; }
  static init(el: HTMLInputElement, options?: Partial<MaskitoInputOptions>): MaskitoInput;
  static init(els: InitElements<HTMLInputElement | MElement>, options?: Partial<MaskitoInputOptions>): MaskitoInput[];
  static init(els: HTMLInputElement | InitElements<HTMLInputElement | MElement>, options: Partial<MaskitoInputOptions> = {}): MaskitoInput | MaskitoInput[] {
    return super.init(els, options, MaskitoInput);
  }
  static getInstance(el: HTMLInputElement): MaskitoInput { return el['M_MaskitoInput']; }
  private static _readMarkup(el: HTMLInputElement): Partial<MaskitoInputOptions> {
    let json: Partial<MaskitoInputOptions> = {};
    if (el.dataset.maskitoOptions) {
      const value = JSON.parse(el.dataset.maskitoOptions);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('data-maskito-options must be a JSON object.');
      json = value;
    }
    return {
      preset: (el.dataset.maskito || 'pattern') as MaskitoInputOptions['preset'],
      pattern: el.dataset.maskitoPattern,
      ...json
    };
  }
  private async _options(): Promise<MaskitoOptions> {
    const custom = this.options.maskOptions;
    let base: MaskitoOptions;
    if (custom?.mask !== undefined) {
      base = { mask: custom.mask };
    } else if (this.options.preset === 'pattern') {
      if (!this.options.pattern) throw new TypeError('Provide a pattern or maskOptions.mask for MaskitoInput.');
      const tokens: Record<string, RegExp> = { '#': /\d/, A: /[a-zA-Z]/, '*': /[a-zA-Z0-9]/ };
      const expression: Array<string | RegExp> = [];
      let escaped = false;
      for (const character of this.options.pattern) {
        if (escaped) { expression.push(character); escaped = false; }
        else if (character === '\\') escaped = true;
        else expression.push(tokens[character] || character);
      }
      if (escaped) throw new TypeError('A Maskito pattern cannot end with an unpaired backslash.');
      base = { mask: expression };
    } else {
      if (!['number', 'date', 'time'].includes(this.options.preset || '')) throw new TypeError(`Unknown MaskitoInput preset: ${this.options.preset}`);
      const kit = await loadPeer<MaskitoKit>({
        specifier: '@maskito/kit', globalName: 'MaskitoKit', feature: 'MaskitoInput number/date/time presets',
        cdnHint: 'Bundle @maskito/kit with your application, or expose its exports as window.MaskitoKit.'
      }, () => import('@maskito/kit'));
      if (this.options.preset === 'number') base = kit.maskitoNumber(this.options.number ?? {});
      else if (this.options.preset === 'date') base = kit.maskitoDate(this.options.date ?? { mode: 'dd/mm/yyyy', separator: '/' });
      else base = kit.maskitoTime(this.options.time ?? { mode: 'HH:MM' });
    }
    return {
      ...base, ...custom,
      preprocessors: [...(custom?.preprocessors || []), ...(base.preprocessors || [])],
      postprocessors: [...(base.postprocessors || []), ...(custom?.postprocessors || [])],
      plugins: [...(base.plugins || []), ...(custom?.plugins || [])]
    };
  }
  private async _setup() {
    const core = await loadPeer<MaskitoCore>({
      specifier: '@maskito/core', globalName: 'MaskitoCore', feature: 'MaskitoInput',
      cdnHint: 'Bundle @maskito/core with your application, or expose its exports as window.MaskitoCore.'
    }, () => import('@maskito/core'));
    if (this._destroyed) return;
    const options = await this._options();
    if (this._destroyed) return;
    // An explicitly selected Maskito input must have only one masking engine.
    NumberInput.getInstance(this.el)?.destroy();
    this._core = core;
    this._maskOptions = options;
    this.el.value = core.maskitoTransform(this.el.value, options);
    this.mask = new core.Maskito(this.el, options);
    this._form?.addEventListener('reset', this._onReset);
  }
  /** Set and format a value, emitting a normal input event by default. */
  async setValue(value: string, emit = true): Promise<void> {
    await this.ready;
    if (this._destroyed) return;
    const formatted = this._core!.maskitoTransform(value, this._maskOptions!);
    if (emit) this._core!.maskitoUpdateElement(this.el, formatted);
    else this.el.value = formatted;
  }
  /** Normalize a value assigned through input.value without emitting input. */
  async refresh(): Promise<void> { await this.setValue(this.el.value, false); }
  /** The native, formatted string. Use Maskito kit parsers for typed values. */
  getValue(): string { return this.el.value; }
  private _onReset = () => {
    clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(() => {
      if (!this._destroyed) this.el.value = this._core!.maskitoTransform(this.el.value, this._maskOptions!);
    }, 0);
  };
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._resetTimer);
    this._form?.removeEventListener('reset', this._onReset);
    this.mask?.destroy();
    this.mask = undefined;
    if (MaskitoInput.getInstance(this.el) === this) this.el['M_MaskitoInput'] = undefined;
  }
}
