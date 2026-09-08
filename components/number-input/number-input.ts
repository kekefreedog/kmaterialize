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
    this.mask?.destroy();
    (this.el as any).M_NumberInput = undefined;
  }

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
    const scale = this.options.scale ?? (step?.includes('.') ? step.split('.').at(-1)?.length : undefined);
    if (scale !== undefined) maskOptions.scale = scale;

    this.mask = IMask(this.el, maskOptions) as InputMask<MaskedNumberOptions>;
  }
}
