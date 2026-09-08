import type TomSelectCtor from 'tom-select';
import type { TomSettings } from 'tom-select/dist/esm/types/settings.js';
import type { RecursivePartial } from 'tom-select/dist/esm/types/core.js';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';
import { FormSelect } from '../textfield/select';

export interface RemoteDataSpec {
  url: string;
  value: string;
  label: string;
  search?: string;
  dataKey?: string;
}

export interface TomSelectFieldOptions extends BaseOptions {
  remote?: RemoteDataSpec;
  settings?: RecursivePartial<TomSettings>;
}

const _defaults: TomSelectFieldOptions = {};

function readRemoteSpec(el: HTMLSelectElement): RemoteDataSpec | undefined {
  const raw = el.dataset.selectRemote;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/Select.ts
// Enhances an EXISTING native `<select class="tomselected">` with Tom
// Select - searchable, taggable, remote-loading, dependent-field wiring,
// clear button, drag-drop reorder. Ported in a somewhat scoped form: the
// CrazyPHP source's remote-loading path goes through its own app-specific
// Crazyrequest/Crazyurl HTTP-client and query-param helpers, which have no
// equivalent in a standalone UI library - this version uses a plain
// `fetch()` instead, keeping the same `data-select-remote` JSON shape
// (url/value/label/search/dataKey) and the same `{{field}}` render-template
// convention.
//
// Coexistence with FormSelect: `.tomselected` is a recognized exclusion
// marker in FormSelect's own AutoInit selector (see src/index.ts), so a
// `.tomselected` select is never picked up by FormSelect regardless of
// init ordering. This constructor still defensively tears down any
// FormSelect instance found on the same element, belt-and-suspenders, in
// case that selector rule is ever violated by hand.
//
// Tom Select is an optional peerDependency, loaded on demand via
// peer-loader.
export class TomSelectField extends Component<TomSelectFieldOptions> {
  declare el: HTMLSelectElement;
  tomSelect: TomSelectCtor | undefined;
  ready: Promise<void>;
  private _dependsOnEl: HTMLElement | null = null;

  constructor(el: HTMLSelectElement, options: Partial<TomSelectFieldOptions>) {
    super(el, options, TomSelectField);
    (this.el as any).M_TomSelectField = this;

    FormSelect.getInstance(this.el)?.destroy();

    this.options = {
      remote: readRemoteSpec(this.el),
      ...TomSelectField.defaults,
      ...options
    };

    this.ready = this._setup();
  }

  static get defaults(): TomSelectFieldOptions {
    return _defaults;
  }

  static init(el: HTMLSelectElement, options?: Partial<TomSelectFieldOptions>): TomSelectField;
  static init(
    els: InitElements<HTMLSelectElement | MElement>,
    options?: Partial<TomSelectFieldOptions>
  ): TomSelectField[];
  static init(
    els: HTMLSelectElement | InitElements<HTMLSelectElement | MElement>,
    options: Partial<TomSelectFieldOptions> = {}
  ): TomSelectField | TomSelectField[] {
    return super.init(els, options, TomSelectField);
  }

  static getInstance(el: HTMLSelectElement): TomSelectField {
    return (el as any).M_TomSelectField;
  }

  destroy() {
    if (this._dependsOnEl) this._dependsOnEl.removeEventListener('change', this._handleDependencyChange);
    this.tomSelect?.destroy();
    (this.el as any).M_TomSelectField = undefined;
  }

  _handleDependencyChange = () => {
    this.tomSelect?.clear();
    this.tomSelect?.clearOptions();
    this.tomSelect?.load?.('');
  };

  async _setup(): Promise<void> {
    const TomSelect = await loadPeer<typeof TomSelectCtor>(
      {
        specifier: 'tom-select',
        globalName: 'TomSelect',
        feature: 'Select (Tom Select) enhancement',
        cdnHint: '<script src="path/to/tom-select.complete.min.js"></script> (self-hosted - copy from node_modules/tom-select/dist/js/, or a CDN of your choice)'
      },
      () => import('tom-select')
    );

    const dataset = this.el.dataset;
    const settings: RecursivePartial<TomSettings> = {
      persist: false,
      createOnBlur: true,
      create: 'selectTag' in dataset,
      plugins: {},
      ...this.options.settings
    };

    if ('selectClear' in dataset) {
      (settings.plugins as any).clear_button = { title: dataset.selectClear || 'Clear' };
    }
    if ('selectTag' in dataset || this.el.multiple) {
      (settings.plugins as any).caret_position = {};
      (settings.plugins as any).drag_drop = {};
    }

    if (this.el.classList.contains('icons')) {
      const renderWithIcon = (data: Record<string, any>, escape: (value: string) => string) => {
        const icon = data.icon ? `<img src="${escape(String(data.icon))}" alt="" />` : '';
        return `<div class="ts-option-content">${icon}<span>${escape(String(data.text ?? ''))}</span></div>`;
      };
      settings.render = { ...settings.render, option: renderWithIcon, item: renderWithIcon };
    }

    const remote = this.options.remote;
    if (remote) {
      settings.valueField = remote.value;
      if (remote.search) settings.searchField = [remote.search];

      if (remote.label && remote.label.includes('{{') && remote.label.includes('}}')) {
        const renderTemplate = (data: Record<string, any>, escape: (input: string) => string) =>
          `<div>${remote.label.replace(/\{\{(.*?)\}\}/g, (_m, key) => escape(String(data[key] ?? '')))}</div>`;
        settings.render = { option: renderTemplate, item: renderTemplate };
      } else {
        settings.labelField = remote.label;
      }

      settings.load = (query, callback) => {
        fetch(remote.url)
          .then((r) => r.json())
          .then((value) => {
            const results = remote.dataKey
              ? remote.dataKey.split('.').reduce((acc: any, key: string) => acc && acc[key], value)
              : value?.results ?? value;
            callback(Array.isArray(results) ? results : []);
          })
          .catch(() => callback([]));
      };
    }

    this.tomSelect = new TomSelect(this.el, settings);

    if (dataset.depends) {
      this._dependsOnEl = document.querySelector<HTMLElement>(dataset.depends);
      this._dependsOnEl?.addEventListener('change', this._handleDependencyChange);
    }
  }
}
