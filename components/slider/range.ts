import { Component, BaseOptions, InitElements, MElement } from '../../src/component';

export interface RangeOptions extends BaseOptions {
  /** Show a value indicator during pointer or keyboard interaction. */
  showValue: boolean;
  /** Show ticks at step intervals (dense intervals are thinned to at most 101). */
  showTicks: boolean;
  /** Add one editable number field on the left of a single slider. */
  showInput?: boolean;
  /** Accessible name for the single slider's numeric field. */
  inputLabel?: string;
  /** Optional plain-text value indicator and accessible value formatting. */
  formatValue?: (value: number) => string;
}
/** Keep the decimal point stable without changing the submitted range value. */
function formatRangeNumber(input:HTMLInputElement):string {
    if(input.step === 'any') return input.value;
    const precision = (text:string) => {
        const [coefficient, exponent = '0'] = text.toLowerCase().split('e');
        if(!Number.isFinite(Number(text))) return 0;
        return Math.max(0, (coefficient.split('.')[1]?.length || 0) - Number(exponent));
    };
    const digits = Math.min(20, Math.max(precision(input.step || '1'), precision(input.min || '0')));
    return input.valueAsNumber.toFixed(digits);
}

const rangeReadouts = new WeakMap<HTMLInputElement, HTMLElement>();

/** Decorative rolling display; the native number input remains the editable control. */
function createRangeReadout(field:HTMLInputElement):HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'range-control-number';
    const readout = document.createElement('span');
    readout.className = 'range-control-readout';
    readout.setAttribute('aria-hidden', 'true');
    rangeReadouts.set(field, readout);
    wrapper.append(field, readout);
    return wrapper;
}

function updateRangeReadout(field:HTMLInputElement, value:string){
    field.value = value;
    const readout = rangeReadouts.get(field);
    if(!readout || readout.dataset.value === value) return;
    const previous = readout.dataset.value;
    readout.dataset.value = value;
    readout.getAnimations({subtree: true}).forEach(animation => animation.cancel());
    const strip = document.createElement('span');
    strip.className = 'range-control-reel';
    const animate = previous !== undefined && document.activeElement !== field && !field.disabled
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const increasing = Number(value) >= Number(previous);
    const values = animate ? (increasing ? [previous, value] : [value, previous]) : [value];
    values.forEach(text => {
        const row = document.createElement('span');
        row.textContent = text;
        strip.append(row);
    });
    readout.replaceChildren(strip);
    if(animate){
        const from = increasing ? 'translateY(0)' : 'translateY(-30px)';
        const to = increasing ? 'translateY(-30px)' : 'translateY(0)';
        strip.style.transform = to;
        // Blur only the moving reel; each update settles back to a sharp number.
        strip.animate([
            {transform: from, filter: 'blur(0px)'},
            {filter: 'blur(1.4px)', offset: .35},
            {transform: to, filter: 'blur(0px)'}
        ], {duration: 140, easing: 'cubic-bezier(.2,.7,.2,1)'});
    }
}

function clearRangeReadout(field:HTMLInputElement){
    rangeReadouts.get(field)?.getAnimations({subtree: true}).forEach(animation => animation.cancel());
    rangeReadouts.delete(field);
}

const _defaults: RangeOptions = { showValue: true, showTicks: false };

/** Material-styled native range input. */
export class Range extends Component<RangeOptions> {
  declare el: HTMLInputElement;
  value: HTMLElement;
  thumb: HTMLElement;
  private _control?: HTMLElement;
  private _numberField?: HTMLInputElement;
  private _editingNumber = false;
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
    if (!el.closest('.range-interval') && (this.options.showInput || el.hasAttribute('data-range-inputs'))) this._createNumberField();
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
    if (this._numberField) {
      this._numberField.min = String(min);
      this._numberField.max = String(max);
      this._numberField.step = this.el.step || '1';
      this._numberField.disabled = this.el.matches(':disabled');
      if (!this._editingNumber) updateRangeReadout(this._numberField, formatRangeNumber(this.el));
    }
  };
  private _createNumberField() {
    this._control = document.createElement('div');
    this._control.className = 'range-control range-control-single';
    this._control.dataset.rangeVariant = this.el.dataset.rangeVariant || 'filled';
    const track = document.createElement('div');
    track.className = 'range-field range-control-track';
    const label = document.createElement('label');
    label.className = 'range-control-value';
    const caption = document.createElement('span');
    caption.textContent = this.options.inputLabel || this.el.getAttribute('aria-label') || this.el.labels?.[0]?.textContent?.trim() || 'Value';
    this._numberField = document.createElement('input');
    this._numberField.type = 'number';
    this._numberField.setAttribute('aria-label', caption.textContent);
    this._numberField.addEventListener('input', this._handleNumber);
    this._numberField.addEventListener('change', this._handleNumber);
    this._numberField.addEventListener('blur', this._handleNumberBlur);
    label.append(caption, createRangeReadout(this._numberField));
    this.el.before(this._control);
    track.append(this.el);
    this._control.append(label, track);
  }
  private _handleNumber = (event: Event) => {
    event.stopPropagation();
    if (this.el.matches(':disabled')) return;
    this._editingNumber = event.type === 'input';
    if (Number.isFinite(this._numberField.valueAsNumber)) {
      this.el.valueAsNumber = this._numberField.valueAsNumber;
      this.el.dispatchEvent(new Event(event.type, { bubbles: true }));
    } else if (event.type === 'change') this.update();
    this._editingNumber = false;
  };
  private _handleNumberBlur = () => { this._editingNumber = false; this.update(); };
  private _showValue() {
    return !this.el.closest('.range-control') && this.options.showValue && this.el.dataset.valueLabel !== 'false';
  }
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
    if (this._control) {
      clearRangeReadout(this._numberField);
      this._numberField.removeEventListener('input', this._handleNumber);
      this._numberField.removeEventListener('change', this._handleNumber);
      this._numberField.removeEventListener('blur', this._handleNumberBlur);
      this._control.replaceWith(this.el);
      this._control = undefined;
      this._numberField = undefined;
    }
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
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLElement>('.range-interval:not(.no-autoinit)').forEach(el => {
      if (!RangeInterval.getInstance(el)) RangeInterval.init(el);
    });
    document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(el => {
      if (!Range.getInstance(el)) Range.init(el);
    });
  }
}

export interface RangeIntervalOptions extends RangeOptions {
    /** Generate editable numeric in/out fields around the slider. */
    showInputs:boolean;
    /** Visible and accessible labels for the generated fields. */
    startLabel:string;
    endLabel:string;
}

/** Two native sliders sharing a track. The first input defines min, max and step. */
export class RangeInterval extends Component<RangeIntervalOptions> {
    readonly start:HTMLInputElement;
    readonly end:HTMLInputElement;
    private _ranges:Range[];
    private _control?:HTMLElement;
    private _fields:HTMLInputElement[] = [];
    private _editing?:HTMLInputElement;
    private _attributes:MutationObserver;
    private _resize?:ResizeObserver;
    private _form:HTMLFormElement|null;
    private _resetTimer?:ReturnType<typeof setTimeout>;
    private _disposed = false;
    private _originalAttributes:Map<HTMLInputElement, Map<string, string|null>>;
    private _originalStyle:string|null;

    constructor(el:HTMLElement, options:Partial<RangeIntervalOptions> = {}){

        const inputs = el.querySelectorAll<HTMLInputElement>('input[type="range"]');
        if(inputs.length !== 2 || Array.from(inputs).some(input => input.parentElement !== el))
            throw new Error('RangeInterval requires exactly two direct range input children.');
        super(el, options, RangeInterval);
        this.start = inputs[0];
        this.end = inputs[1];
        this.options = {...RangeInterval.defaults, ...options, showTicks: false};
        this._originalStyle = el.getAttribute('style');
        this._originalAttributes = new Map(Array.from(inputs, input => [input, new Map(
            (input === this.end ? ['min', 'max', 'step', 'aria-valuemin', 'aria-valuemax'] : ['aria-valuemin', 'aria-valuemax']).map(name => [name, input.getAttribute(name)])
        )]));
        el['M_RangeInterval'] = this;
        this._syncBounds();
        this._ranges = Array.from(inputs, input => Range.init(input, this.options));
        // Capture clamps before the individual Range and application listeners read the value.
        el.addEventListener('input', this._handleInput, true);
        el.addEventListener('change', this._handleInput, true);
        this._form = this.start.form;
        this._form?.addEventListener('reset', this._handleReset);
        this._attributes = new MutationObserver(this.update);
        inputs.forEach(input => this._attributes.observe(input, {
            attributes: true, attributeFilter: ['min', 'max', 'step', 'value', 'disabled', 'dir']
        }));
        if(typeof ResizeObserver !== 'undefined'){
            this._resize = new ResizeObserver(this.update);
            this._resize.observe(el);
        }
        window.addEventListener('resize', this.update);
        if(this.options.showInputs || el.hasAttribute('data-range-inputs')) this._createFields();
        this.update();

    }

    static get defaults():RangeIntervalOptions {
        return {...Range.defaults, showInputs: false, startLabel: 'In', endLabel: 'Out'};
    }
    static init(el:HTMLElement, options?:Partial<RangeIntervalOptions>):RangeInterval;
    static init(els:InitElements<MElement>, options?:Partial<RangeIntervalOptions>):RangeInterval[];
    static init(els:HTMLElement|InitElements<MElement>, options:Partial<RangeIntervalOptions> = {}):RangeInterval|RangeInterval[] {
        return super.init(els, options, RangeInterval);
    }
    static getInstance(el:HTMLElement):RangeInterval { return el['M_RangeInterval']; }

    /** Read the numeric in/out values in ascending order. */
    getValues():[number, number] { return [this.start.valueAsNumber, this.end.valueAsNumber]; }

    /** Set both values, applying native bounds/step rounding. Does not dispatch input/change. */
    setValues(start:number, end:number){

        if(!Number.isFinite(start) || !Number.isFinite(end))
            throw new TypeError('RangeInterval values must be finite numbers.');
        this._syncBounds();
        this.start.valueAsNumber = Math.min(start, end);
        this.end.valueAsNumber = Math.max(start, end);
        this.update();

    }

    private _syncBounds(){

        for(const name of ['min', 'max', 'step']){
            const value = this.start.getAttribute(name);
            if(this.end.getAttribute(name) === value) continue;
            if(value === null) this.end.removeAttribute(name);
            else this.end.setAttribute(name, value);
        }

    }

    /** Refresh after programmatic changes. The first input owns the shared bounds and step. */
    update = () => {

        if(this._disposed) return;
        this._syncBounds();
        if(this.start.valueAsNumber > this.end.valueAsNumber){
            const start = this.start.value;
            this.start.value = this.end.value;
            this.end.value = start;
        }
        this._ranges.forEach(range => range.update());
        const [start, end] = this.getValues();
        const numeric = (value:string, fallback:number) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback;
        const min = numeric(this.start.min, 0);
        const max = Math.max(min, numeric(this.start.max, 100));
        this.start.setAttribute('aria-valuemin', String(min));
        this.start.setAttribute('aria-valuemax', String(end));
        this.end.setAttribute('aria-valuemin', String(start));
        this.end.setAttribute('aria-valuemax', String(max));
        const handleSize = parseFloat(getComputedStyle(this.start).getPropertyValue('--range-handle-size')) || 20;
        this.el.style.setProperty('--range-edge', `${handleSize / 2}px`);
        this.el.style.setProperty('--range-start', this.start.style.getPropertyValue('--range-progress'));
        this.el.style.setProperty('--range-end', this.end.style.getPropertyValue('--range-progress'));
        // At the maximum the in handle must remain reachable when both handles coincide.
        this.el.style.setProperty('--range-start-layer', start === max ? '2' : '1');
        this._fields.forEach((field, index) => {
            const input = index === 0 ? this.start : this.end;
            field.min = String(index === 0 ? min : start);
            field.max = String(index === 0 ? end : max);
            field.step = this.start.step || '1';
            field.disabled = input.matches(':disabled');
            if(field !== this._editing) updateRangeReadout(field, formatRangeNumber(input));
        });

    };

    private _handleInput = (event:Event) => {

        if(event.target !== this.start && event.target !== this.end) return;
        if(this.start.valueAsNumber > this.end.valueAsNumber){
            if(event.target === this.start) this.start.value = this.end.value;
            else this.end.value = this.start.value;
        }
        this.update();

    };

    private _createFields(){

        this._control = document.createElement('div');
        this._control.className = 'range-control';
        this._control.dataset.rangeVariant = this.el.dataset.rangeVariant || 'filled';
        // Keep the fields in the same directional context as the slider.
        if(this.el.hasAttribute('dir')) this._control.dir = this.el.dir;
        this.el.before(this._control);
        this._control.append(this.el);
        [this.options.startLabel, this.options.endLabel].forEach((text, index) => {
            const label = document.createElement('label');
            label.className = 'range-control-value';
            const caption = document.createElement('span');
            caption.textContent = text;
            const field = document.createElement('input');
            field.type = 'number';
            field.setAttribute('aria-label', text);
            // The native ranges remain the only named/submitted values.
            field.addEventListener('input', this._handleField);
            field.addEventListener('change', this._handleField);
            field.addEventListener('blur', this._handleFieldBlur);
            label.append(caption, createRangeReadout(field));
            this._fields.push(field);
            if(index === 0) this._control.prepend(label);
            else this._control.append(label);
        });

    }

    private _handleField = (event:Event) => {

        const field = event.currentTarget as HTMLInputElement;
        const input = this._fields.indexOf(field) === 0 ? this.start : this.end;
        event.stopPropagation();
        if(input.matches(':disabled')) return;
        // Allow empty/partial drafts and multi-digit typing; normalize on commit.
        this._editing = event.type === 'input' ? field : undefined;
        if(Number.isFinite(field.valueAsNumber)){
            input.valueAsNumber = field.valueAsNumber;
            input.dispatchEvent(new Event(event.type, {bubbles: true}));
        }else if(event.type === 'change') this.update();
        this._editing = undefined;

    };

    private _handleFieldBlur = () => { this._editing = undefined; this.update(); };

    private _handleReset = () => {
        clearTimeout(this._resetTimer);
        this._resetTimer = setTimeout(this.update, 0);
    };

    destroy(){

        this._disposed = true;
        clearTimeout(this._resetTimer);
        this._attributes.disconnect();
        this._resize?.disconnect();
        this._form?.removeEventListener('reset', this._handleReset);
        window.removeEventListener('resize', this.update);
        this.el.removeEventListener('input', this._handleInput, true);
        this.el.removeEventListener('change', this._handleInput, true);
        this._ranges.forEach(range => range.destroy());
        this._fields.forEach(field => {
            clearRangeReadout(field);
            field.removeEventListener('input', this._handleField);
            field.removeEventListener('change', this._handleField);
            field.removeEventListener('blur', this._handleFieldBlur);
        });
        if(this._control){
            this._control.replaceWith(this.el);
            this._control = undefined;
        }
        this._fields = [];
        this._originalAttributes.forEach((attributes, input) => attributes.forEach((value, name) => {
            if(value === null) input.removeAttribute(name);
            else input.setAttribute(name, value);
        }));
        for(const name of ['--range-start', '--range-end', '--range-start-layer', '--range-edge']){
            const original = document.createElement('div');
            original.setAttribute('style', this._originalStyle || '');
            const value = original.style.getPropertyValue(name);
            if(value) this.el.style.setProperty(name, value, original.style.getPropertyPriority(name));
            else this.el.style.removeProperty(name);
        }
        this.el['M_RangeInterval'] = undefined;

    }
}
