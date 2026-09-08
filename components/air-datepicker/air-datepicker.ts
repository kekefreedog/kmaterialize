import type AirDatepickerCtor from 'air-datepicker';
import type { AirDatepickerOptions } from 'air-datepicker';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';

export interface AirDatepickerFieldOptions extends BaseOptions {
  locale?: unknown;
}

const _defaults: AirDatepickerFieldOptions = {};
let activeAirDatepickerField: AirDatepickerField | undefined;

// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/Date.ts
// Enhances `<input type="text" data-type="date" data-date-picker="air-datepicker">`
// with the air-datepicker calendar/range picker - deliberately separate from
// kmaterialize's own native `components/datepicker/` (a different, already
// existing class-based component); this one is opted into per-input via the
// `data-date-picker` attribute so it never collides with `.datepicker`
// elements. The `multiple` attribute switches the picker into range mode,
// `data-date-format`/`data-date-lang` (only "fr-FR" ported so far) mirror
// CrazyPHP's own dataset convention.
//
// air-datepicker is an optional peerDependency, loaded on demand via
// peer-loader. Its own base stylesheet (air-datepicker/air-datepicker.css)
// must be imported separately by the consumer - see the docs page.
export class AirDatepickerField extends Component<AirDatepickerFieldOptions> {
  declare el: HTMLInputElement;
  picker: AirDatepickerCtor | undefined;
  ready: Promise<void>;
  private _triggers: HTMLElement[];
  private _handleOutsideClick = (e: MouseEvent) => {
    const calendarEl = document.querySelector('.air-datepicker');
    const clickedTrigger = this._triggers.some(trigger => trigger.contains(e.target as Node));
    if (
      calendarEl instanceof HTMLElement &&
      !calendarEl.contains(e.target as Node) &&
      !this.el.contains(e.target as Node) &&
      !clickedTrigger
    ) {
      this.picker?.hide();
    }
  };

  constructor(el: HTMLInputElement, options: Partial<AirDatepickerFieldOptions>) {
    super(el, options, AirDatepickerField);
    (this.el as any).M_AirDatepickerField = this;

    this.options = {
      ...AirDatepickerField.defaults,
      ...options
    };

    const labels = Array.from(document.querySelectorAll('label')).filter(
      label => label.htmlFor === this.el.id
    );
    const icons = Array.from(
      this.el.parentElement?.querySelectorAll<HTMLElement>('.prefix, .suffix') ?? []
    );
    this._triggers = [...labels, ...icons];
    this._triggers.forEach(trigger => trigger.addEventListener('click', this._handleTriggerClick));
    this.ready = this._setup();
  }

  static get defaults(): AirDatepickerFieldOptions {
    return _defaults;
  }

  static init(el: HTMLInputElement, options?: Partial<AirDatepickerFieldOptions>): AirDatepickerField;
  static init(
    els: InitElements<HTMLInputElement | MElement>,
    options?: Partial<AirDatepickerFieldOptions>
  ): AirDatepickerField[];
  static init(
    els: HTMLInputElement | InitElements<HTMLInputElement | MElement>,
    options: Partial<AirDatepickerFieldOptions> = {}
  ): AirDatepickerField | AirDatepickerField[] {
    return super.init(els, options, AirDatepickerField);
  }

  static getInstance(el: HTMLInputElement): AirDatepickerField {
    return (el as any).M_AirDatepickerField;
  }

  destroy() {
    document.removeEventListener('click', this._handleOutsideClick);
    this._triggers.forEach(trigger => trigger.removeEventListener('click', this._handleTriggerClick));
    this.picker?.destroy();
    if (activeAirDatepickerField === this) activeAirDatepickerField = undefined;
    (this.el as any).M_AirDatepickerField = undefined;
  }

  private _handleTriggerClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    void this.ready.then(() => this.picker?.show());
  };

  async _setup(): Promise<void> {
    const AirDatepicker = await loadPeer<typeof AirDatepickerCtor>(
      {
        specifier: 'air-datepicker',
        globalName: 'AirDatepicker',
        feature: 'Date input (air-datepicker) enhancement',
        cdnHint:
          '<link rel="stylesheet" href="path/to/air-datepicker.css">\n' +
          '    <script src="path/to/air-datepicker.js"></script>\n' +
          '    (self-hosted - copy from node_modules/air-datepicker/, or a CDN of your choice)'
      },
      () => import('air-datepicker')
    );

    const dataset = this.el.dataset;
    const builtInLocale = dataset.dateLang === 'fr-FR'
      ? (await import('air-datepicker/locale/fr')).default
      : (await import('air-datepicker/locale/en')).default;
    const pickerOptions: AirDatepickerOptions = {
      dateFormat: dataset.dateFormat || 'yyyy-MM-dd',
      autoClose: dataset.dateAutoClose !== 'false',
      locale: (this.options.locale ?? builtInLocale) as AirDatepickerOptions['locale'],
      onShow: isAnimationComplete => {
        if (isAnimationComplete) return;
        if (activeAirDatepickerField && activeAirDatepickerField !== this) {
          activeAirDatepickerField.picker?.hide();
        }
        activeAirDatepickerField = this;
      },
      onHide: isAnimationComplete => {
        if (isAnimationComplete && activeAirDatepickerField === this) {
          activeAirDatepickerField = undefined;
        }
      }
    };

    let multiple = false;
    if (this.el.multiple || dataset.dateRange === 'true') {
      pickerOptions.range = true;
      pickerOptions.multipleDatesSeparator = ' - ';
      multiple = true;
    }

    const initialValue = this.el.getAttribute('value')?.trim();
    if (initialValue) {
      pickerOptions.selectedDates = multiple
        ? initialValue.split(' - ').map(value => value.trim())
        : [initialValue];
    }

    if (dataset.dateTimepicker === 'true') {
      pickerOptions.timepicker = true;
      if (dataset.dateTimeFormat) pickerOptions.timeFormat = dataset.dateTimeFormat;
    }

    const supportedViews = ['days', 'months', 'years'];
    if (supportedViews.includes(dataset.dateView ?? '')) {
      pickerOptions.view = dataset.dateView as AirDatepickerOptions['view'];
    }
    if (supportedViews.includes(dataset.dateMinView ?? '')) {
      pickerOptions.minView = dataset.dateMinView as AirDatepickerOptions['minView'];
    }

    if (dataset.dateMobile === 'true') pickerOptions.isMobile = true;
    if (dataset.datePosition) {
      pickerOptions.position = dataset.datePosition as AirDatepickerOptions['position'];
    }
    if (dataset.dateButtons) {
      const supportedButtons = ['today', 'clear'];
      pickerOptions.buttons = dataset.dateButtons
        .split(',')
        .map(button => button.trim())
        .filter(button => supportedButtons.includes(button)) as AirDatepickerOptions['buttons'];
    }

    if (this.el.hasAttribute('min') && this.el.getAttribute('min')) {
      pickerOptions.minDate = new Date(this.el.getAttribute('min') as string);
    }
    if (this.el.hasAttribute('max') && this.el.getAttribute('max')) {
      pickerOptions.maxDate = new Date(this.el.getAttribute('max') as string);
    }
    if (!this.el.required && !pickerOptions.buttons) {
      pickerOptions.buttons = ['clear'];
    }

    pickerOptions.onSelect = ({ date }: any) => {
      if (multiple && Array.isArray(date) && date.length === 1) return;
      this.el.dispatchEvent(new Event('input', { bubbles: true }));
      this.el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    this.picker = new AirDatepicker(this.el, pickerOptions);
    document.addEventListener('click', this._handleOutsideClick);
  }
}
