import { Component } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';
import { FormSelect } from '../textfield/select';
const _defaults = {};
function readRemoteSpec(el) {
    const raw = el.dataset.selectRemote;
    if (!raw)
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch {
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
export class TomSelectField extends Component {
    tomSelect;
    ready;
    _dependsOnEl = null;
    constructor(el, options) {
        super(el, options, TomSelectField);
        this.el.M_TomSelectField = this;
        FormSelect.getInstance(this.el)?.destroy();
        this.options = {
            remote: readRemoteSpec(this.el),
            ...TomSelectField.defaults,
            ...options
        };
        this.ready = this._setup();
    }
    static get defaults() {
        return _defaults;
    }
    static init(els, options = {}) {
        return super.init(els, options, TomSelectField);
    }
    static getInstance(el) {
        return el.M_TomSelectField;
    }
    destroy() {
        if (this._dependsOnEl)
            this._dependsOnEl.removeEventListener('change', this._handleDependencyChange);
        this.tomSelect?.destroy();
        this.el.M_TomSelectField = undefined;
    }
    _handleDependencyChange = () => {
        this.tomSelect?.clear();
        this.tomSelect?.clearOptions();
        this.tomSelect?.load?.('');
    };
    async _setup() {
        const TomSelect = await loadPeer({
            specifier: 'tom-select',
            globalName: 'TomSelect',
            feature: 'Select (Tom Select) enhancement',
            cdnHint: '<script src="path/to/tom-select.complete.min.js"></script> (self-hosted - copy from node_modules/tom-select/dist/js/, or a CDN of your choice)'
        }, () => import('tom-select'));
        const dataset = this.el.dataset;
        const settings = {
            persist: false,
            createOnBlur: true,
            create: 'selectTag' in dataset,
            plugins: {},
            ...this.options.settings
        };
        if ('selectClear' in dataset) {
            settings.plugins.clear_button = { title: dataset.selectClear || 'Clear' };
        }
        if ('selectTag' in dataset || this.el.multiple) {
            settings.plugins.caret_position = {};
            settings.plugins.drag_drop = {};
        }
        if (this.el.classList.contains('icons')) {
            const renderWithIcon = (data, escape) => {
                const icon = data.icon ? `<img src="${escape(String(data.icon))}" alt="" />` : '';
                return `<div class="ts-option-content">${icon}<span>${escape(String(data.text ?? ''))}</span></div>`;
            };
            settings.render = { ...settings.render, option: renderWithIcon, item: renderWithIcon };
        }
        const remote = this.options.remote;
        if (remote) {
            settings.valueField = remote.value;
            if (remote.search)
                settings.searchField = [remote.search];
            if (remote.label && remote.label.includes('{{') && remote.label.includes('}}')) {
                const renderTemplate = (data, escape) => `<div>${remote.label.replace(/\{\{(.*?)\}\}/g, (_m, key) => escape(String(data[key] ?? '')))}</div>`;
                settings.render = { option: renderTemplate, item: renderTemplate };
            }
            else {
                settings.labelField = remote.label;
            }
            settings.load = (query, callback) => {
                fetch(remote.url)
                    .then((r) => r.json())
                    .then((value) => {
                    const results = remote.dataKey
                        ? remote.dataKey.split('.').reduce((acc, key) => acc && acc[key], value)
                        : value?.results ?? value;
                    callback(Array.isArray(results) ? results : []);
                })
                    .catch(() => callback([]));
            };
        }
        this.tomSelect = new TomSelect(this.el, settings);
        if (dataset.depends) {
            this._dependsOnEl = document.querySelector(dataset.depends);
            this._dependsOnEl?.addEventListener('change', this._handleDependencyChange);
        }
    }
}
