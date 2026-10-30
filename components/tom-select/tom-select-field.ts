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

    /** Popup whose scrolling must keep a body-mounted menu aligned. */
    private _dropdownScrollParent: HTMLElement | null = null;

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

    /** Release the widget and its dependency and popup listeners. */
    destroy():void {

        // Release the popup scroll listener before removing the dropdown.
        this._dropdownScrollParent?.removeEventListener('scroll', this._handlePopupScroll, true);

        // Release the retained popup after teardown.
        this._dropdownScrollParent = null;

        // Remove the dependency listener when the field owns one.
        if(this._dependsOnEl){

            // Stop reloading choices after destruction.
            this._dependsOnEl.removeEventListener('change', this._handleDependencyChange);

        }

        // Remove the enhanced control and any body-mounted menu.
        this.tomSelect?.destroy();

        // Release the component reference from its native select.
        (this.el as any).M_TomSelectField = undefined;

    }

  _handleDependencyChange = () => {
    this.tomSelect?.clear();
    this.tomSelect?.clearOptions();
    this.tomSelect?.load?.('');
  };

    /** Keep portalled menus aligned with controls inside scrolling popups. */
    private _handlePopupScroll = ():void => {

        // Reposition only while the enhanced select menu is visible.
        if(this.tomSelect?.isOpen){

            // Use Tom Select's body-relative position calculation.
            this.tomSelect.positionDropdown();

        }

    };

    /** Let popup menus escape clipped content without overriding authored settings. */
    private _setupPopupDropdown(settings:RecursivePartial<TomSettings>):void {

        // Locate the popup that owns this field.
        const popup = this.el.closest<HTMLElement>('.swal2-popup');

        // Keep ordinary form fields and explicit dropdown parents unchanged.
        if(popup){

            // Portal popup menus only when the caller did not choose a parent.
            if(settings.dropdownParent === undefined){

                // Render beyond the popup content's scrolling boundary.
                settings.dropdownParent = 'body';

            }

            // Track popup scrolling for both default and explicitly portalled menus.
            if(settings.dropdownParent === 'body'){

                // Retain the event target for deterministic teardown.
                this._dropdownScrollParent = popup;

                // Capture nested scroll events that do not bubble to the window.
                popup.addEventListener('scroll', this._handlePopupScroll, true);

            }

        }

    }

    /** Load the optional peer and enhance the native select. */
    async _setup():Promise<void> {

        // Resolve the optional Tom Select dependency.
        const TomSelect = await loadPeer<typeof TomSelectCtor>(
            {
                specifier: 'tom-select',
                globalName: 'TomSelect',
                feature: 'Select (Tom Select) enhancement',
                cdnHint: '<script src="path/to/tom-select.complete.min.js"></script> (self-hosted - copy from node_modules/tom-select/dist/js/, or a CDN of your choice)'
            },
            () => import('tom-select')
        );

        // Read the native field's enhancement flags.
        const dataset = this.el.dataset;

        // Merge authored settings over the shared defaults.
        const settings:RecursivePartial<TomSettings> = {
            persist: false,
            createOnBlur: true,
            create: 'selectTag' in dataset,
            plugins: {},
            ...this.options.settings
        };

        // Enable the optional clear action.
        if('selectClear' in dataset){

            // Use the authored clear label when supplied.
            (settings.plugins as any).clear_button = {title: dataset.selectClear || 'Clear'};

        }

        // Enable editing and reordering for tag and multiple selectors.
        if('selectTag' in dataset || this.el.multiple){

            // Allow positioning the text cursor between selected items.
            (settings.plugins as any).caret_position = {};

            // Allow reordering selected items.
            (settings.plugins as any).drag_drop = {};

        }

        // Preserve icon rendering for native icon selects.
        if(this.el.classList.contains('icons')){

            // Render escaped option text and an optional icon.
            const renderWithIcon = (data:Record<string, any>, escape:(value:string) => string) => {

                // Prepare result.
                let result = '';

                // Escape the optional image source.
                const icon = data.icon ? `<img src="${escape(String(data.icon))}" alt="" />` : '';

                // Combine the icon with the escaped label.
                result = `<div class="ts-option-content">${icon}<span>${escape(String(data.text ?? ''))}</span></div>`;

                // Return result.
                return result;

            };

            // Apply the same markup to choices and selected values.
            settings.render = {...settings.render, option: renderWithIcon, item: renderWithIcon};

        }

        // Read the optional remote source.
        const remote = this.options.remote;

        // Configure remote choices when a source is provided.
        if(remote){

            // Use the remote identifier field.
            settings.valueField = remote.value;

            // Apply an authored search field when present.
            if(remote.search){

                // Search the configured remote property.
                settings.searchField = [remote.search];

            }

            // Resolve template labels separately from plain property names.
            if(remote.label && remote.label.includes('{{') && remote.label.includes('}}')){

                // Escape substituted remote values in the option template.
                const renderTemplate = (data:Record<string, any>, escape:(input:string) => string) =>
                    `<div>${remote.label.replace(/\{\{(.*?)\}\}/g, (_m, key) => escape(String(data[key] ?? '')))}</div>`;

                // Share the label template between choices and selected items.
                settings.render = {option: renderTemplate, item: renderTemplate};

            }else{

                // Use the configured label property directly.
                settings.labelField = remote.label;

            }

            // Load choices through the optional remote endpoint.
            settings.load = (query, callback) => {

                // Read the remote response without changing the caller's source.
                fetch(remote.url)
                    .then(response => response.json())
                    .then(value => {

                        // Resolve the requested envelope or the conventional results property.
                        const results = remote.dataKey
                            ? remote.dataKey.split('.').reduce((acc:any, key:string) => acc && acc[key], value)
                            : value?.results ?? value;

                        // Supply only array responses to Tom Select.
                        callback(Array.isArray(results) ? results : []);

                    })
                    .catch(() => callback([]));

            };

        }

        // Configure popup positioning before Tom Select mounts its dropdown.
        this._setupPopupDropdown(settings);

        // Enhance the native field using the resolved dropdown parent.
        this.tomSelect = new TomSelect(this.el, settings);

        // Preserve authored validation context on the control that receives focus.
        for(const name of ['aria-invalid', 'aria-describedby', 'aria-errormessage']){

            // Read the native field's validation attribute.
            const value = this.el.getAttribute(name);

            // Copy only explicitly authored attributes.
            if(value !== null){

                // Expose validation context on the focusable text control.
                this.tomSelect.control_input.setAttribute(name, value);

            }

        }

        // Watch the configured dependency after the widget is ready.
        if(dataset.depends){

            // Locate the dependent field.
            this._dependsOnEl = document.querySelector<HTMLElement>(dataset.depends);

            // Reload choices when the dependent field changes.
            this._dependsOnEl?.addEventListener('change', this._handleDependencyChange);

        }

    }
}
