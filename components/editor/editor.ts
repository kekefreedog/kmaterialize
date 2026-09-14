import { SpreadsheetView, parseColumns, type EditorSpreadsheetColumn, type EditorSpreadsheetResult } from './spreadsheet-view';
import type { HelperDelegate } from 'handlebars';
import type * as Prism from 'prismjs';
import { TomSelectField, type TomSelectFieldOptions } from '../tom-select/tom-select-field';
import { loadPeer } from '../../src/peer-loader';

export type EditorData = Record<string, unknown> | Record<string, unknown>[];
export interface EditorDataSource { id: string; label: string; data?: EditorData }
export interface EditorTemplate { id: string; label: string; template?: string; columns?: EditorSpreadsheetColumn[] }
export type EditorSelectSettings = Omit<NonNullable<TomSelectFieldOptions['settings']>, 'options' | 'items' | 'load' | 'valueField' | 'labelField' | 'maxItems' | 'create' | 'dropdownParent'>;
/** Pass a Handlebars environment to supply your own helpers and partials. */
export type EditorHelpers = Record<string, HelperDelegate>;
export interface EditorEngine { compile(template: string, options?: { noEscape?: boolean }): (data: EditorData, options?: { helpers?: EditorHelpers }) => string }
export interface EditorOptions {
  variant?: 'handlebars' | 'spreadsheet';
  columns?: EditorSpreadsheetColumn[];
  onColumnsChange?: (columns: EditorSpreadsheetColumn[]) => void;
  onSpreadsheetRender?: (result: EditorSpreadsheetResult) => void;
  template?: string;
  data?: EditorData;
  sources?: EditorDataSource[];
  sourceId?: string;
  templates?: EditorTemplate[];
  templateId?: string;
  /** Tom Select settings; false hides the corresponding selector. IDs and labels use id/label fields. */
  templateSelect?: EditorSelectSettings | false;
  sourceSelect?: EditorSelectSettings | false;
  loadTemplates?: (query: string, signal: AbortSignal) => Promise<EditorTemplate[]>;
  loadSources?: (query: string, signal: AbortSignal) => Promise<EditorDataSource[]>;
  /** Called only when the selected entry has no cached content. */
  loadTemplate?: (id: string, signal: AbortSignal) => Promise<string | EditorSpreadsheetColumn[]>;
  loadData?: (id: string, signal: AbortSignal) => Promise<EditorData>;
  onTemplateChange?: (id: string) => void;
  onSourceChange?: (id: string) => void;
  debounce?: number;
  readOnly?: boolean;
  /** Prism HTML, CSS and Handlebars syntax highlighting. Defaults to true. */
  highlight?: boolean;
  engine?: EditorEngine;
  /** Per-editor Handlebars helpers; never registered globally. */
  helpers?: EditorHelpers;
  onChange?: (template: string) => void;
  onRender?: (html: string) => void;
  onError?: (error: Error) => void;
}

interface EditorSnapshot { mapping?: { column: number; start: number; end: number }; value: string; start: number; end: number; direction: 'forward' | 'backward' | 'none'; top: number; left: number }
interface EditorEdit { before: EditorSnapshot; after: EditorSnapshot }

const blockedKeys = new Set(['__proto__', 'constructor', 'prototype']);
const tokenMime = 'application/x-kmaterialize-editor-token';
const helperMime = 'application/x-kmaterialize-editor-helper';
let sequence = 0;
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Handlebars template workspace with a data browser and isolated HTML preview. */
export class Editor {
  private static instances = new WeakMap<HTMLElement, Editor>();
  readonly ready: Promise<void>;
  private engine?: EditorEngine;
  private spreadsheetView?: SpreadsheetView;
  private downloadQueue: Promise<void> = Promise.resolve();
  private source = make('textarea', 'editor-source');
  private lines = make('pre', 'editor-lines');
  private highlight = make('pre', 'editor-highlight');
  private highlightCode = make('code', 'editor-highlight-code');
  private prism?: typeof Prism;
  private dropCaret = make('span', 'editor-drop-caret');
  private dragPoint?: { x: number; y: number };
  private helpers: EditorHelpers;
  private undoStack: EditorEdit[] = [];
  private redoStack: EditorEdit[] = [];
  private currentSnapshot!: EditorSnapshot;
  private pendingInput?: EditorSnapshot;
  private composition?: EditorSnapshot;
  private lastTyping?: { type: string; time: number };

  private tree = make('div', 'editor-token-tree');
  private search = make('input', 'editor-token-search');
  private selector = make('select', 'editor-source-select tomselected no-autoinit');
  private templateSelector = make('select', 'editor-template-select tomselected no-autoinit');
  private sourceField?: TomSelectField;
  private templateField?: TomSelectField;
  private templates: EditorTemplate[];
  private activeTemplate: EditorTemplate;
  private drafts = new Map<string, { snapshot: EditorSnapshot; undo: EditorEdit[]; redo: EditorEdit[] }>();
  private templateRequest?: AbortController;
  private dataRequest?: AbortController;
  private listRequests = new Map<string, AbortController>();
  private status = make('span', 'editor-status', 'Loading Handlebars…');
  private error = make('div', 'editor-error');
  private frame = make('iframe', 'editor-preview');
  private wrapper = make('div', 'editor-workspace');
  private controller = new AbortController();
  private originalNodes: Node[];
  private hadClass: boolean;
  private sources: EditorDataSource[];
  private activeSource: EditorDataSource;
  private html = '';
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  private version = 0;
  private tokens = new Map<string, string[]>();
  private compiled?: { source: string; render: (data: EditorData, options?: { helpers?: EditorHelpers }) => string };

  constructor(readonly el: HTMLElement, readonly options: EditorOptions = {}) {
    if (options.variant && !['handlebars', 'spreadsheet'].includes(options.variant)) throw new TypeError('Unsupported Editor variant.');
    this.helpers = { ...options.helpers };
    this.sources = options.sources?.length ? options.sources.map(source => ({ ...source })) : [{ id: 'data', label: 'Template data', data: options.data ?? (options.variant === 'spreadsheet' ? [] : {}) }];
    const ids = this.sources.map(source => source.id);
    if (new Set(ids).size !== ids.length) throw new TypeError('Editor source IDs must be unique.');
    this.activeSource = this.sources.find(source => source.id === (options.sourceId ?? ids[0]));
    if (!this.activeSource) throw new TypeError('Unknown Editor source ID.');
    this.templates = options.templates?.length ? options.templates.map(template => ({ ...template, ...(template.columns ? { template: JSON.stringify(template.columns) } : {}) })) : [{ id: 'template', label: 'Template', template: options.template ?? (options.variant === 'spreadsheet' ? JSON.stringify(options.columns ?? [{ header: 'Column 1', value: '' }]) : '') }];
    if (options.variant === 'spreadsheet') {
      this.templates.forEach(template => { if (template.template !== undefined) parseColumns(template.template); });
      this.sources.forEach(source => { if (source.data !== undefined) this.validateData(source.data); });
    }
    if (new Set(this.templates.map(template => template.id)).size !== this.templates.length) throw new TypeError('Editor template IDs must be unique.');
    if ([...this.templates, ...this.sources].some(entry => !entry.id || blockedKeys.has(entry.id))) throw new TypeError('Invalid Editor entry ID.');
    this.activeTemplate = this.templates.find(template => template.id === (options.templateId ?? this.templates[0].id));
    if (!this.activeTemplate) throw new TypeError('Unknown Editor template ID.');
    Editor.getInstance(el)?.destroy();
    this.originalNodes = Array.from(el.childNodes);
    this.hadClass = el.classList.contains('editor');
    el.classList.add('editor');
    Editor.instances.set(el, this);
    this.build();
    this.ready = this.initialize();
    // Also surface failures in the workspace for consumers who do not await ready.
    void this.ready.catch(() => {});
  }

  static init(el: HTMLElement, options: EditorOptions = {}): Editor { return new Editor(el, options); }
  static getInstance(el: HTMLElement): Editor | undefined { return this.instances.get(el); }

  private validateData(data: EditorData): void {
    if (this.options.variant === 'spreadsheet') {
      if (!Array.isArray(data) || data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new TypeError('Spreadsheet Editor data must be an array of objects.');
    } else if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Editor data must be an object.');
  }

  private async initialize(): Promise<void> {
    try {
      this.engine = this.options.engine ?? await loadPeer<EditorEngine>({
        specifier: 'handlebars', globalName: 'Handlebars', feature: 'Editor',
        cdnHint: '<script src="path/to/handlebars.js"></script>'
      }, () => import('handlebars'));
      await this.initializeSelectors();
      if (this.spreadsheetView) await this.spreadsheetView.initialize();
      if (this.destroyed) return;
      await Promise.all([this.selectTemplate(this.activeTemplate.id), this.setSource(this.activeSource.id)]);
      if (this.destroyed) return;
      if (!this.spreadsheetView && this.options.highlight !== false) {
        this.prism = await loadPeer<typeof Prism>({
          specifier: 'prismjs', globalName: 'Prism', feature: 'Editor syntax highlighting',
          cdnHint: '<script src="path/to/prism.js" data-manual></script> (include markup, CSS, markup-templating and Handlebars grammars)'
        }, async () => {
          // Opt a newly loaded Prism instance out of document-wide highlighting.
          // The Editor owns only its mirror; surrounding docs may use another highlighter.
          const scope = window as Window & { Prism?: typeof Prism | { manual: boolean } };
          const placeholder = { manual: true };
          const created = !scope.Prism;
          if (created) scope.Prism = placeholder;
          try { return await import('prismjs'); }
          catch (reason) { if (created && scope.Prism === placeholder) delete scope.Prism; throw reason; }
        });
        if (!this.prism.languages.handlebars) {
          await import('prismjs/components/prism-markup-templating.js');
          await import('prismjs/components/prism-handlebars.js');
        }
      }
    } catch (reason) {
      if (!this.destroyed) this.showError(reason);
      throw reason;
    }
    if (!this.destroyed) {
      this.source.parentElement!.classList.toggle('is-highlighted', !!this.prism);
      this.updateHighlight();
      this.renderNow();
    }
  }

  private build(): void {
    const id = `m-editor-${++sequence}`;
    const left = make('div', 'editor-input-pane');
    const sourcePanel = make('section', 'editor-source-panel');
    const header = make('div', 'editor-pane-header');
    const label = make('label', 'editor-pane-title', this.options.variant === 'spreadsheet' ? 'Spreadsheet' : 'Handlebars');
    label.htmlFor = this.source.id = `${id}-source`;
    header.append(label);
    this.templateSelector.id = `${id}-template`;
    this.templateSelector.setAttribute('aria-label', 'Template');
    if (this.options.templateSelect !== false && (this.options.templates?.length || this.options.loadTemplates)) {
      this.addSelectOptions(this.templateSelector, this.templates, this.activeTemplate.id);
      header.append(this.templateSelector);
    } else header.append(make('span', 'editor-language', 'HTML + Handlebars'));
    const code = make('div', 'editor-code');
    this.lines.setAttribute('aria-hidden', 'true');
    this.source.value = this.activeTemplate.template ?? (this.options.variant === 'spreadsheet' ? '[{"header":"Column 1","value":""}]' : '');
    this.currentSnapshot = this.snapshot();
    this.source.spellcheck = false;
    this.source.wrap = 'off';
    this.source.readOnly = this.options.readOnly ?? false;
    this.source.setAttribute('autocapitalize', 'off');
    this.source.setAttribute('autocomplete', 'off');
    this.source.setAttribute('aria-describedby', `${id}-help ${id}-error`);
    this.source.placeholder = 'Write an HTML template, then insert tokens from your data.';
    this.dropCaret.hidden = true;
    this.dropCaret.setAttribute('aria-hidden', 'true');
    this.highlight.hidden = true;
    this.highlight.setAttribute('aria-hidden', 'true');
    this.highlight.append(this.highlightCode);
    code.append(this.lines, this.highlight, this.source, this.dropCaret);
    sourcePanel.append(header, code);
    if (this.options.variant === 'spreadsheet') {
      label.removeAttribute('for'); code.hidden = true;
      this.el.classList.add('editor-spreadsheet');
      this.spreadsheetView = new SpreadsheetView(this.source.readOnly, {
        beforeInput: event => {
          if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
            event.preventDefault(); if (event.inputType === 'historyUndo') this.undo(); else this.redo();
          } else this.pendingInput = this.snapshot();
        },
        input: event => this.commitSpreadsheet(event?.inputType),
        keydown: event => {
          if (event.isComposing || this.composition || event.altKey) return;
          const key = event.key.toLowerCase();
          if ((event.ctrlKey || event.metaKey) && (key === 'z' || (key === 'y' && !event.shiftKey))) {
            event.preventDefault(); if (key === 'y' || event.shiftKey) this.redo(); else this.undo();
          } else if (event.key.startsWith('Arrow') || ['Home', 'End', 'Tab'].includes(event.key)) this.lastTyping = undefined;
        },
        compositionStart: () => { this.lastTyping = undefined; this.composition = this.snapshot(); },
        compositionEnd: () => { if (this.composition) this.recordEdit(this.composition); this.composition = this.pendingInput = undefined; },
        drag: (event, input) => {
          if (this.source.readOnly || !event.dataTransfer?.types.some(type => type === tokenMime || type === helperMime)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
          return this.positionAt(event.clientX, event.clientY, input);
        },
        drop: (event, input) => this.dropSpreadsheetToken(event, input)
      }, this.controller.signal);
      this.spreadsheetView.setColumns(parseColumns(this.source.value || '[{"header":"Column 1","value":""}]'));
      sourcePanel.append(this.spreadsheetView.mapping);
    }
    const tokenPanel = make('section', 'editor-tokens');
    const tokenHeader = make('div', 'editor-pane-header');
    const sourceLabel = make('label', 'editor-pane-title', 'Tokens');
    sourceLabel.htmlFor = this.selector.id = `${id}-data`;
    this.selector.setAttribute('aria-label', 'Token data source');
    this.addSelectOptions(this.selector, this.sources, this.activeSource.id);
    tokenHeader.append(sourceLabel);
    if (this.options.sourceSelect !== false && (this.options.sources?.length || this.options.loadSources)) tokenHeader.append(this.selector);
    else sourceLabel.removeAttribute('for');
    this.search.type = 'search';
    this.search.placeholder = 'Search tokens…';
    this.search.setAttribute('aria-label', 'Search tokens');
    const help = make('p', 'editor-token-help', this.options.readOnly ? 'Browse the data used by this template.' : (this.spreadsheetView ? 'Fields from the first data item. Drop into a Value cell to apply to every row.' : 'Drag a token into the template, or click to insert at the cursor.'));
    help.id = `${id}-help`;
    tokenPanel.append(tokenHeader, this.search, help, this.tree);
    left.append(sourcePanel, tokenPanel);
    const preview = make('section', 'editor-preview-pane');
    const previewHeader = make('div', 'editor-pane-header');
    this.status.setAttribute('role', 'status');
    previewHeader.append(make('span', 'editor-pane-title', 'Preview'), this.status);
    this.frame.title = 'Rendered template preview';
    this.frame.setAttribute('sandbox', '');
    this.frame.referrerPolicy = 'no-referrer';
    this.error.id = `${id}-error`;
    this.error.hidden = true;
    this.error.setAttribute('role', 'alert');
    preview.append(previewHeader, this.error, this.spreadsheetView?.preview ?? this.frame);
    this.wrapper.append(left, preview);
    this.el.replaceChildren(this.wrapper);
    const signal = this.controller.signal;
    this.source.addEventListener('beforeinput', event => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        if (event.inputType === 'historyUndo') this.undo(); else this.redo();
        return;
      }
      this.pendingInput = this.snapshot();
    }, { signal });
    this.source.addEventListener('input', event => {
      if (!this.composition) this.recordEdit(this.pendingInput ?? this.currentSnapshot, (event as InputEvent).inputType);
      this.pendingInput = undefined;
      this.changed();
    }, { signal });
    this.source.addEventListener('compositionstart', () => {
      this.lastTyping = undefined;
      this.composition = this.snapshot();
    }, { signal });
    this.source.addEventListener('compositionend', () => {
      if (this.composition) this.recordEdit(this.composition);
      this.composition = this.pendingInput = undefined;
    }, { signal });
    this.source.addEventListener('blur', () => { this.lastTyping = undefined; }, { signal });
    this.source.addEventListener('keydown', event => {
      if (event.isComposing || this.composition || event.altKey) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || (key === 'y' && !event.shiftKey))) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) this.redo(); else this.undo();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
        this.lastTyping = undefined;
      }
    }, { signal });
    this.source.addEventListener('scroll', () => { this.lines.scrollTop = this.source.scrollTop; this.syncHighlight(); if (this.dragPoint) this.showDropCaret(); }, { signal });
    this.selector.addEventListener('change', () => { void this.setSource(this.selector.value || this.activeSource.id).catch(() => {}); }, { signal });
    this.templateSelector.addEventListener('change', () => { void this.selectTemplate(this.templateSelector.value || this.activeTemplate.id).catch(() => {}); }, { signal });
    this.search.addEventListener('input', () => this.renderTokens(), { signal });
    this.tree.addEventListener('click', event => {
      const token = (event.target as Element).closest<HTMLButtonElement>('[data-editor-token]');
      if (token && !token.disabled) this.insertToken(this.tokens.get(token.dataset.editorToken)!);
      const helper = (event.target as Element).closest<HTMLButtonElement>('[data-editor-helper]');
      if (helper && !helper.disabled) this.insertHelper(helper.dataset.editorHelper!);
    }, { signal });
    this.tree.addEventListener('dragstart', event => {
      const token = (event.target as Element).closest<HTMLButtonElement>('[data-editor-token]');
      const helper = (event.target as Element).closest<HTMLButtonElement>('[data-editor-helper]');
      if (helper && !helper.disabled && event.dataTransfer) {
        event.dataTransfer.setData(helperMime, helper.dataset.editorHelper!);
        event.dataTransfer.setData('text/plain', `{{${helper.dataset.editorHelper} }}`);
        event.dataTransfer.effectAllowed = 'copy';
        return;
      }
      if (!token || token.disabled || !event.dataTransfer) return;
      const path = this.tokens.get(token.dataset.editorToken)!;
      event.dataTransfer.setData(tokenMime, JSON.stringify(path));
      event.dataTransfer.setData('text/plain', this.expression(path));
      event.dataTransfer.effectAllowed = 'copy';
    }, { signal });
    this.source.addEventListener('dragover', event => {
      if (!this.source.readOnly && event.dataTransfer?.types.some(type => type === tokenMime || type === helperMime)) {
        event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
        code.classList.add('is-drop-target');
        this.dragPoint = { x: event.clientX, y: event.clientY };
        const bounds = this.source.getBoundingClientRect();
        if (event.clientY < bounds.top + 20) this.source.scrollTop -= 16;
        else if (event.clientY > bounds.bottom - 20) this.source.scrollTop += 16;
        this.showDropCaret();
      }
    }, { signal });
    const clearDrop = () => {
      this.spreadsheetView?.clearDropCarets();
      code.classList.remove('is-drop-target');
      this.dropCaret.hidden = true;
      this.dragPoint = undefined;
    };
    this.source.addEventListener('dragleave', clearDrop, { signal });
    document.addEventListener('dragend', clearDrop, { signal });
    document.addEventListener('drop', clearDrop, { signal });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') clearDrop(); }, { signal });
    this.source.addEventListener('drop', event => {
      clearDrop();
      const payload = event.dataTransfer?.getData(tokenMime);
      const helper = event.dataTransfer?.getData(helperMime);
      if ((!payload && !helper) || this.source.readOnly) return;
      event.preventDefault();
      let path: unknown;
      if (helper) {
        if (!Object.prototype.hasOwnProperty.call(this.helpers, helper) || typeof this.helpers[helper] !== 'function') return;
      } else {
        try { path = JSON.parse(payload); } catch { return; }
        if (!Array.isArray(path) || !path.length || !path.every(key => typeof key === 'string' && !blockedKeys.has(key))) return;
      }
      if (event.clientX || event.clientY) {
        const offset = this.positionAt(event.clientX, event.clientY).offset;
        this.source.setSelectionRange(offset, offset);
      }
      if (helper) this.insertHelper(helper);
      else this.insertToken(path as string[]);
    }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.updateHighlight());
    this.resizeObserver.observe(this.source);
    this.updateLines();
    this.renderTokens();
  }

  private expression(path: string[]): string {
    // Segment literals preserve dotted keys and numeric array indices.
    if (path.some(key => key.includes(']') || key.includes('[') || key === '')) {
      let value = 'this';
      path.forEach(key => { value = `(lookup ${value} ${JSON.stringify(key)})`; });
      return `{{${value.slice(1, -1)}}}`;
    }
    return '{{' + path.map(key => /^[A-Za-z_$][\w$]*$/.test(key) && !['true', 'false', 'null', 'undefined', 'this'].includes(key) ? key : `[${key}]`).join('.') + '}}';
  }

  private renderTokens(): void {
    const filter = this.search.value.trim().toLowerCase();
    const open = new Set(Array.from(this.tree.querySelectorAll<HTMLDetailsElement>('details[open]')).map(el => el.dataset.path));
    this.tokens.clear();
    const ancestors = new Set<object>();
    let count = 0;
    const visit = (value: unknown, path: string[], depth: number): HTMLElement | null => {
      if (count >= 1000 || depth > 12) return null;
      count++;
      const object = value !== null && typeof value === 'object';
      const circular = object && ancestors.has(value);
      const label = path[path.length - 1];
      const type = value === null ? 'null' : Array.isArray(value) ? `[array] · ${value.length}` : object ? '[object]' : typeof value;
      const preview = object ? type : String(value);
      const matches = `${path.join('.')} ${preview}`.toLowerCase().includes(filter);
      const children: HTMLElement[] = [];
      if (object && !circular) {
        ancestors.add(value);
        for (const key of Object.keys(value)) {
          if (blockedKeys.has(key)) continue;
          const child = visit((value as Record<string, unknown>)[key], [...path, key], depth + 1);
          if (child) {
            if (Array.isArray(value)) child.classList.add('editor-array-item');
            children.push(child);
          }
          if (count >= 1000) break;
        }
        ancestors.delete(value);
      }
      if (filter && !matches && !children.length) return null;
      const row = make('div', 'editor-token-row');
      const button = make('button', 'editor-token', label);
      button.type = 'button'; button.draggable = !this.source.readOnly;
      button.disabled = this.source.readOnly || circular;
      const key = JSON.stringify(path);
      button.dataset.editorToken = key;
      button.title = `Insert ${this.expression(path)}`;
      button.setAttribute('aria-label', `Insert ${path.join('.')}`);
      this.tokens.set(key, path);
      const sample = make(object && !circular ? 'em' : 'span', 'editor-token-value', circular ? 'Circular reference' : preview);
      sample.title = preview;
      row.append(button, sample);
      if (children.length) {
        const details = make('details', 'editor-token-branch');
        details.dataset.path = key;
        details.open = !!filter || open.has(key) || (depth === 0 && !this.tree.childElementCount);
        const summary = make('summary', 'editor-token-summary');
        summary.append(make('span', '', label), make(object ? 'em' : 'span', 'editor-token-type', type));
        details.append(summary, row, ...children);
        return details;
      }
      return row;
    };
    const nodes: HTMLElement[] = [];
    const tokenData = this.spreadsheetView ? (this.activeSource.data as Record<string, unknown>[])?.[0] ?? {} : this.activeSource.data ?? {};
    for (const key of Object.keys(tokenData)) {
      if (blockedKeys.has(key)) continue;
      const node = visit(tokenData[key], [key], 0);
      if (node) nodes.push(node);
    }
    if (!nodes.length) nodes.push(make('p', 'editor-empty', filter ? 'No matching tokens.' : 'No tokens yet. Add template data to get started.'));
    if (count >= 1000) nodes.push(make('p', 'editor-empty', 'Showing the first 1,000 data entries. Use a smaller data source to explore more.'));
    const functions = Object.keys(this.helpers).filter(name => !blockedKeys.has(name) && /^[A-Za-z_$][\w$-]*$/.test(name) && typeof this.helpers[name] === 'function');
    const functionRows = functions.filter(name => name.toLowerCase().includes(filter)).map(name => {
      const row = make('div', 'editor-token-row');
      const button = make('button', 'editor-token editor-helper', `${name}()`);
      button.type = 'button'; button.disabled = this.source.readOnly; button.draggable = !this.source.readOnly;
      button.dataset.editorHelper = name;
      button.setAttribute('aria-label', `Insert function ${name}`);
      button.title = `Insert {{${name} }}`;
      row.append(button, make('em', 'editor-token-value', '[function]'));
      return row;
    });
    if (functionRows.length) nodes.push(make('h4', 'editor-token-heading', 'Functions'), ...functionRows);
    this.tree.replaceChildren(...nodes);
  }

  /** Resolve a drop point in the unwrapped, monospace textarea, including scroll offset. */
  private positionAt(x: number, y: number, input = this.source): { offset: number; left: number; top: number; height: number } {
    const style = getComputedStyle(input), bounds = input.getBoundingClientRect();
    const lines = input.value.split('\n');
    const row = Math.max(0, Math.min(lines.length - 1, Math.floor((y - bounds.top - parseFloat(style.paddingTop) + input.scrollTop) / parseFloat(style.lineHeight))));
    const target = Math.max(0, x - bounds.left - parseFloat(style.paddingLeft) + input.scrollLeft);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = `${style.fontSize} ${style.fontFamily}`;
    let column = 0, visualColumn = 0, width = 0;
    for (const character of lines[row]) {
      const cells = character === '\t' ? 4 - (visualColumn % 4) : 1;
      const next = context.measureText(character === '\t' ? ' '.repeat(cells) : character).width;
      if (width + next / 2 > target) break;
      width += next; column += character.length; visualColumn += cells;
    }
    const parent = input.parentElement!.getBoundingClientRect();
    return {
      offset: lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0) + column,
      left: bounds.left - parent.left + parseFloat(style.paddingLeft) + width - input.scrollLeft,
      top: bounds.top - parent.top + parseFloat(style.paddingTop) + row * parseFloat(style.lineHeight) - input.scrollTop,
      height: parseFloat(style.lineHeight)
    };
  }

  private showDropCaret(): void {
    if (!this.dragPoint) return;
    const position = this.positionAt(this.dragPoint.x, this.dragPoint.y);
    this.dropCaret.hidden = false;
    this.dropCaret.style.left = `${Math.max(this.source.offsetLeft, position.left)}px`;
    this.dropCaret.style.top = `${position.top}px`;
    this.dropCaret.style.height = `${position.height}px`;
  }

  private syncHighlight(): void {
    this.highlight.scrollTop = this.source.scrollTop;
    this.highlight.scrollLeft = this.source.scrollLeft;
  }
  private updateHighlight(): void {
    if (!this.prism?.languages.handlebars) return;
    this.highlightCode.innerHTML = this.prism.highlight(this.source.value + '\n', this.prism.languages.handlebars, 'handlebars');
    this.highlight.hidden = false;
    // Match the textarea's visible area, excluding native scrollbar gutters.
    this.highlight.style.left = `${this.source.offsetLeft}px`;
    this.highlight.style.width = `${this.source.clientWidth}px`;
    this.highlight.style.height = `${this.source.clientHeight}px`;
    this.syncHighlight();
  }

  private updateLines(): void {
    this.lines.textContent = this.source.value.split('\n').map((_, index) => index + 1).join('\n');
    this.lines.scrollTop = this.source.scrollTop;
  }
  private snapshot(): EditorSnapshot {
    return { mapping: this.spreadsheetView?.getSelection(), value: this.source.value, start: this.source.selectionStart, end: this.source.selectionEnd,
      direction: this.source.selectionDirection, top: this.source.scrollTop, left: this.source.scrollLeft };
  }
  private recordEdit(before: EditorSnapshot, inputType?: string): void {
    const after = this.snapshot();
    if (before.value === after.value) return;
    const previous = this.undoStack[this.undoStack.length - 1];
    const time = Date.now();
    const typing = ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(inputType);
    const merge = typing && this.lastTyping?.type === inputType && time - this.lastTyping.time < 750 &&
      previous?.after.mapping?.column === before.mapping?.column && previous?.after.value === before.value && previous.after.start === before.start && previous.after.end === before.end && before.start === before.end;
    if (merge) previous.after = after;
    else {
      this.undoStack.push({ before, after });
      if (this.undoStack.length > 100) this.undoStack.shift();
    }
    this.redoStack = [];
    this.currentSnapshot = after;
    this.lastTyping = typing ? { type: inputType, time } : undefined;
  }
  private restoreSnapshot(snapshot: EditorSnapshot): void {
    this.lastTyping = this.pendingInput = undefined;
    this.source.value = snapshot.value;
    if (this.spreadsheetView) {
      this.spreadsheetView.setColumns(parseColumns(snapshot.value));
      this.spreadsheetView.restoreSelection(snapshot.mapping);
    } else this.source.focus({ preventScroll: true });
    this.source.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction);
    this.source.scrollTop = snapshot.top;
    this.source.scrollLeft = snapshot.left;
    this.currentSnapshot = this.snapshot();
    this.changed();
  }
  /** Undo the latest source edit. Returns false when there is nothing to undo or editing is disabled. */
  undo(): boolean {
    if (this.destroyed || this.source.readOnly || this.composition) return false;
    const edit = this.undoStack.pop();
    if (!edit) return false;
    this.redoStack.push(edit);
    this.restoreSnapshot(edit.before);
    return true;
  }
  /** Restore the latest undone source edit. A new source edit clears redo history. */
  redo(): boolean {
    if (this.destroyed || this.source.readOnly || this.composition) return false;
    const edit = this.redoStack.pop();
    if (!edit) return false;
    this.undoStack.push(edit);
    this.restoreSnapshot(edit.after);
    return true;
  }
  private changed(): void {
    this.activeTemplate.template = this.source.value;
    if (this.spreadsheetView) this.options.onColumnsChange?.(this.getColumns());
    this.updateLines();
    this.updateHighlight();
    this.status.textContent = 'Updating…';
    this.version++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.render(); }, Math.max(0, this.options.debounce ?? 180));
    this.options.onChange?.(this.source.value);
    this.el.dispatchEvent(new CustomEvent('editorchange', { bubbles: true, detail: { template: this.source.value } }));
  }
  private showError(reason: unknown): void {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.error.textContent = error.message;
    this.error.hidden = false;
    this.source.setAttribute('aria-invalid', 'true');
    this.status.textContent = 'Template error · showing last valid preview';
    this.options.onError?.(error);
  }
  private renderNow(): string {
    try {
      if (this.spreadsheetView) {
        const result = this.spreadsheetView.render(this.getColumns(), this.activeSource.data as Record<string, unknown>[] ?? [], this.engine!, this.helpers);
        this.error.hidden = true; this.source.removeAttribute('aria-invalid');
        this.status.textContent = `${result.rows.length} ${result.rows.length === 1 ? 'row' : 'rows'} · ${result.headers.length} columns`;
        this.options.onSpreadsheetRender?.(result);
        return '';
      }
      const source = this.source.value;
      if (this.compiled?.source !== source) this.compiled = { source, render: this.engine!.compile(source) };
      const html = this.compiled.render(this.activeSource.data ?? {}, { helpers: this.helpers });
      // The policy precedes all authored content; scripts and remote requests are blocked.
      this.frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'"><style>html{color-scheme:light}body{margin:24px;font:15px/1.6 system-ui,sans-serif;color:#202124;background:#fff;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${html}</body></html>`;
      this.html = html;
      this.error.hidden = true;
      this.source.removeAttribute('aria-invalid');
      this.status.textContent = 'Up to date';
      this.options.onRender?.(html);
      return html;
    } catch (reason) { this.showError(reason); return this.html; }
  }

  /** Spreadsheet column definitions; use setColumns to update them. */
  getColumns(): EditorSpreadsheetColumn[] {
    if (!this.spreadsheetView) throw new TypeError('Columns are available only in the spreadsheet variant.');
    return parseColumns(this.source.value);
  }
  setColumns(columns: EditorSpreadsheetColumn[]): void {
    if (!this.spreadsheetView) throw new TypeError('Columns are available only in the spreadsheet variant.');
    this.setTemplate(JSON.stringify(columns));
  }
  getSpreadsheetData(): EditorSpreadsheetResult {
    const result = this.spreadsheetView?.result;
    if (!result) throw new TypeError('Spreadsheet data is available only in the spreadsheet variant.');
    return { headers: [...result.headers], rows: result.rows.map(row => [...row]) };
  }
  getWorksheet() { return this.spreadsheetView?.worksheet; }
  /** Refresh and download the generated worksheet, including column headers. */
  download(format: 'csv' | 'xlsx' = 'csv', filename?: string): Promise<void> {
    if (!this.spreadsheetView) return Promise.reject(new TypeError('Downloads are available only in the spreadsheet variant.'));
    if (format !== 'csv' && format !== 'xlsx') return Promise.reject(new TypeError('Editor download format must be csv or xlsx.'));
    const run = this.downloadQueue.catch(() => {}).then(async () => {
      await this.ready;
      if (this.destroyed) throw new Error('Cannot download from a destroyed Editor.');
      await this.render();
      if (this.destroyed) throw new Error('Cannot download from a destroyed Editor.');
      if (!this.error.hidden) throw new Error(this.error.textContent || 'Fix the template before downloading.');
      const worksheet = this.spreadsheetView!.worksheet;
      if (!worksheet) throw new Error('The spreadsheet preview is not ready.');
      if (worksheet.parent.config.allowExport === false) throw new Error('Spreadsheet export is disabled.');
      const name = (filename ?? this.activeTemplate.label).replace(/\.(csv|xlsx)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'spreadsheet';
      if (format === 'csv') {
        // kspreadsheet's CSV exporter does not escape headers and defaults to tab separators.
        const { headers, rows } = this.getSpreadsheetData();
        const csv = [headers, ...rows].map(row => row.map(value => {
          const text = String(value ?? '');
          return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a'); link.href = url; link.download = `${name}.csv`; link.hidden = true;
        try { document.body.append(link); link.click(); }
        finally { link.remove(); URL.revokeObjectURL(url); }
        return;
      }
      const originalName = worksheet.options.csvFileName;
      worksheet.options.csvFileName = name;
      try { await worksheet.download(true, false, format); }
      finally { worksheet.options.csvFileName = originalName; }
    });
    this.downloadQueue = run;
    return run;
  }

  private commitSpreadsheet(inputType?: string): void {
    const before = this.pendingInput ?? this.currentSnapshot;
    this.source.value = JSON.stringify(this.spreadsheetView!.getColumns());
    if (!this.composition) this.recordEdit(before, inputType);
    this.pendingInput = undefined; this.changed();
  }
  private dropSpreadsheetToken(event: DragEvent, input: HTMLTextAreaElement): void {
    if (this.source.readOnly) return;
    const helper = event.dataTransfer?.getData(helperMime), payload = event.dataTransfer?.getData(tokenMime);
    if (!helper && !payload) return;
    event.preventDefault();
    let path: unknown;
    if (helper) {
      if (!Object.prototype.hasOwnProperty.call(this.helpers, helper) || typeof this.helpers[helper] !== 'function') return;
    } else {
      try { path = JSON.parse(payload); } catch { return; }
      if (!Array.isArray(path) || !path.length || !path.every(key => typeof key === 'string' && !blockedKeys.has(key))) return;
    }
    if (event.clientX || event.clientY) { const offset = this.positionAt(event.clientX, event.clientY, input).offset; input.setSelectionRange(offset, offset); }
    if (helper) this.insertHelper(helper); else this.insertToken(path as string[]);
  }
  private editingSource(): HTMLTextAreaElement { return this.spreadsheetView?.activeInput ?? this.source; }

  getTemplateId(): string { return this.activeTemplate.id; }
  getTemplate(): string { return this.source.value; }
  getHtml(): string { return this.html; }
  getSource(): string { return this.activeSource.id; }
  setTemplate(template: string): void {
    if (this.destroyed) return;
    const columns = this.spreadsheetView ? parseColumns(template) : undefined;
    const before = this.snapshot();
    this.source.value = template;
    if (columns) this.spreadsheetView!.setColumns(columns);
    this.recordEdit(before);
    this.changed();
  }
  /** Replace this editor's helpers and refresh the preview. */
  setHelpers(helpers: EditorHelpers): void {
    if (this.destroyed) return;
    this.helpers = { ...helpers };
    this.renderTokens();
    void this.render();
  }
  setData(data: EditorData): void {
    if (this.destroyed) return;
    this.validateData(data);
    this.dataRequest?.abort(); this.setLoading(this.sourceField, false);
    this.activeSource.data = data; this.renderTokens(); void this.render();
  }
  /** Select a data source, loading its content once when omitted from the entry. */
  async setSource(id: string): Promise<void> {
    if (this.destroyed) return;
    const source = this.sources.find(source => source.id === id);
    if (!source) throw new TypeError(`Unknown Editor source: ${id}`);
    this.dataRequest?.abort();
    const request = this.dataRequest = new AbortController();
    try {
      if (source.data === undefined) {
        if (!this.options.loadData) throw new TypeError('Provide data or an Editor loadData callback.');
        this.setLoading(this.sourceField, true);
        const data = await this.options.loadData(id, request.signal);
        if (request.signal.aborted || this.destroyed) return;
        this.validateData(data);
        source.data = data;
      }
      if (request.signal.aborted || this.destroyed) return;
      this.validateData(source.data);
      const changed = this.activeSource.id !== id;
      this.activeSource = source;
      this.selector.value = id; this.sourceField?.tomSelect?.setValue(id, true);
      this.renderTokens();
      if (this.engine) void this.render();
      if (changed) this.options.onSourceChange?.(id);
    } catch (reason) {
      if (request.signal.aborted || this.destroyed) return;
      this.sourceField?.tomSelect?.setValue(this.activeSource.id, true);
      this.selector.value = this.activeSource.id;
      this.showLoadError(reason);
      throw reason;
    } finally { if (this.dataRequest === request) this.setLoading(this.sourceField, false); }
  }
  /** Switch templates at the start of the document, retaining each template's local edits and undo history. */
  async selectTemplate(id: string): Promise<void> {
    if (this.destroyed) return;
    const template = this.templates.find(template => template.id === id);
    if (!template) throw new TypeError(`Unknown Editor template: ${id}`);
    this.templateRequest?.abort();
    const request = this.templateRequest = new AbortController();
    try {
      if (template.template === undefined) {
        if (!this.options.loadTemplate) throw new TypeError('Provide template content or an Editor loadTemplate callback.');
        this.setLoading(this.templateField, true);
        const content = await this.options.loadTemplate(id, request.signal);
        if (request.signal.aborted || this.destroyed) return;
        const text = Array.isArray(content) && this.spreadsheetView ? JSON.stringify(content) : content;
        if (typeof text !== 'string') throw new TypeError('Editor template content must be a string (or spreadsheet columns).');
        if (this.spreadsheetView) parseColumns(text);
        if (template.template === undefined) template.template = text;
      }
      if (request.signal.aborted || this.destroyed) return;
      if (this.spreadsheetView) parseColumns(template.template);
      const changed = this.activeTemplate.id !== id;
      if (changed) this.drafts.set(this.activeTemplate.id, { snapshot: this.snapshot(), undo: this.undoStack, redo: this.redoStack });
      this.activeTemplate = template;
      this.templateSelector.value = id; this.templateField?.tomSelect?.setValue(id, true);
      if (changed || this.source.value !== template.template) {
        const draft = this.drafts.get(id);
        this.undoStack = draft?.undo ?? []; this.redoStack = draft?.redo ?? [];
        this.pendingInput = this.composition = this.lastTyping = undefined;
        this.source.value = draft?.snapshot.value ?? template.template;
        if (this.spreadsheetView) this.spreadsheetView.setColumns(parseColumns(this.source.value));
        this.source.setSelectionRange(0, 0);
        this.source.scrollTop = 0; this.source.scrollLeft = 0;
        this.currentSnapshot = this.snapshot();
        this.changed();
      }
      if (changed) this.options.onTemplateChange?.(id);
    } catch (reason) {
      if (request.signal.aborted || this.destroyed) return;
      this.templateField?.tomSelect?.setValue(this.activeTemplate.id, true);
      this.templateSelector.value = this.activeTemplate.id;
      this.showLoadError(reason);
      throw reason;
    } finally { if (this.templateRequest === request) this.setLoading(this.templateField, false); }
  }
  private addSelectOptions(select: HTMLSelectElement, entries: { id: string; label: string }[], selected: string): void {
    for (const entry of entries) select.add(new Option(entry.label, entry.id));
    select.value = selected;
  }
  private async initializeSelectors(): Promise<void> {
    const setup = async (kind: 'template' | 'source') => {
      const select = kind === 'template' ? this.templateSelector : this.selector;
      if (!select.isConnected || this.destroyed) return;
      const custom = (kind === 'template' ? this.options.templateSelect : this.options.sourceSelect) || {};
      const loader = kind === 'template' ? this.options.loadTemplates : this.options.loadSources;
      const entries = kind === 'template' ? this.templates : this.sources;
      const field = TomSelectField.init(select, { settings: {
        preload: !!loader, ...custom,
        valueField: 'id', labelField: 'label', searchField: custom.searchField ?? ['label'], maxItems: 1, create: false,
        options: entries, dropdownParent: 'body',
        ...(loader ? { load: (query, callback) => {
          this.listRequests.get(kind)?.abort();
          const request = new AbortController(); this.listRequests.set(kind, request);
          Promise.resolve().then(() => loader(query, request.signal)).then(results => {
            if (request.signal.aborted || this.destroyed) { callback(); return; }
            if (!Array.isArray(results) || results.some(entry => !entry || typeof entry.id !== 'string' || !entry.id || blockedKeys.has(entry.id) || typeof entry.label !== 'string')) throw new TypeError('Editor list entries require an id and label.');
            for (const entry of results) {
              // Retain cached content and local edits when a search returns an existing ID.
              if (!entries.some(existing => existing.id === entry.id)) entries.push({ ...entry, ...('columns' in entry && entry.columns ? { template: JSON.stringify(entry.columns) } : {}) });
            }
            callback(results);
          }).catch(reason => {
            callback();
            if (!request.signal.aborted && !this.destroyed) this.showLoadError(reason);
          });
        } } : {})
      } });
      if (kind === 'template') this.templateField = field; else this.sourceField = field;
      await field.ready;
      if (this.destroyed) { field.destroy(); return; }
      field.tomSelect.dropdown.classList.add('editor-select-dropdown');
      field.tomSelect.control_input.setAttribute('aria-label', kind === 'template' ? 'Template' : 'Token data source');
    };
    await Promise.all([setup('template'), setup('source')]);
  }
  private setLoading(field: TomSelectField | undefined, loading: boolean): void {
    field?.tomSelect?.wrapper.setAttribute('aria-busy', String(loading));
    field?.tomSelect?.wrapper.classList.toggle('loading', loading);
  }
  private showLoadError(reason: unknown): void {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.error.textContent = error.message; this.error.hidden = false;
    this.status.textContent = 'Could not load selection';
    this.options.onError?.(error);
  }
  /** Find the expression around the selection, ignoring braces inside quoted arguments. */
  private expressionContext(): { start: number; end: number } | undefined {
    const input = this.editingSource();
    const source = input.value, selection = input.selectionStart;
    let opening: RegExpExecArray | null, start = -1;
    const pattern = /\{\{\{?/g;
    while ((opening = pattern.exec(source)) && opening.index < selection) start = opening.index + opening[0].length;
    if (start < 0 || /^[!/>]/.test(source.slice(start).trimStart())) return;
    let quote = '', bracket = false;
    for (let index = start; index < source.length; index++) {
      const character = source[index];
      if (quote) {
        if (character === '\\') index++;
        else if (character === quote) quote = '';
      } else if (bracket) {
        if (character === ']') bracket = false;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '[') bracket = true;
      else if (source.startsWith('}}', index)) {
        if (selection >= start && input.selectionEnd <= index) return { start, end: index };
        return;
      }
    }
  }

  /** Replace an argument under the pointer, or add a space-delimited argument. */
  private argumentInsertion(value: string, context: { start: number; end: number }): { value: string; start: number; end: number } {
    const input = this.editingSource();
    const source = input.value;
    let start = input.selectionStart, end = input.selectionEnd;
    const body = source.slice(context.start, context.end);
    const operands = [...body.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\[[^\]]*\]|[^\s()\[\]])+/g)];
    const first = operands[0];
    const helper = first && (Object.prototype.hasOwnProperty.call(this.helpers, first[0]) || first[0].startsWith('#') || operands.length > 1);
    if (helper && start <= context.start + first.index! + first[0].length) {
      start = end = context.start + first.index! + first[0].length;
    } else if (start === end) {
      const operand = operands.find(operand => start >= context.start + operand.index! && start <= context.start + operand.index! + operand[0].length);
      if (operand) { start = context.start + operand.index!; end = start + operand[0].length; }
    }
    const before = start > context.start && !/[\s(]/.test(source[start - 1]) ? ' ' : '';
    const after = end < context.end && !/[\s)]/.test(source[end]) ? ' ' : '';
    return { value: before + value + after, start, end };
  }

  insertToken(path: string | string[]): void {
    if (this.destroyed || this.source.readOnly) return;
    const input = this.editingSource();
    const parts = typeof path === 'string' ? path.split('.') : path;
    if (!parts.length || parts.some(key => blockedKeys.has(key))) throw new TypeError('Invalid token path.');
    const token = this.expression(parts), context = this.expressionContext();
    let insertion = { value: token, start: input.selectionStart, end: input.selectionEnd };
    if (context) {
      const pathExpression = token.slice(2, -2);
      insertion = this.argumentInsertion(pathExpression.startsWith('lookup ') ? `(${pathExpression})` : pathExpression, context);
    }
    const before = this.snapshot();
    input.focus({ preventScroll: true });
    input.setRangeText(insertion.value, insertion.start, insertion.end, 'end');
    if (this.spreadsheetView) this.source.value = JSON.stringify(this.spreadsheetView.getColumns());
    this.recordEdit(before);
    this.changed();
  }
  /** Insert a configured helper and leave the caret in its argument slot. */
  insertHelper(name: string): void {
    if (this.destroyed || this.source.readOnly) return;
    const input = this.editingSource();
    if (!/^[A-Za-z_$][\w$-]*$/.test(name) || !Object.prototype.hasOwnProperty.call(this.helpers, name) || typeof this.helpers[name] !== 'function') throw new TypeError('Unknown or invalid Editor helper.');
    const context = this.expressionContext();
    const insertion = context ? this.argumentInsertion(`(${name} )`, context) : {
      value: `{{${name} }}`, start: input.selectionStart, end: input.selectionEnd
    };
    const before = this.snapshot();
    input.focus({ preventScroll: true });
    input.setRangeText(insertion.value, insertion.start, insertion.end, 'end');
    const slot = insertion.start + insertion.value.indexOf(name) + name.length + 1;
    input.setSelectionRange(slot, slot);
    if (this.spreadsheetView) this.source.value = JSON.stringify(this.spreadsheetView.getColumns());
    this.recordEdit(before);
    this.changed();
  }
  async render(): Promise<string> {
    clearTimeout(this.timer);
    const version = ++this.version;
    try { await this.ready; } catch { return this.html; }
    return this.destroyed || version !== this.version ? this.html : this.renderNow();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.version++;
    this.templateRequest?.abort(); this.dataRequest?.abort();
    this.listRequests.forEach(request => request.abort()); this.listRequests.clear();
    this.spreadsheetView?.destroy();
    this.el.classList.remove('editor-spreadsheet');
    this.templateField?.destroy(); this.sourceField?.destroy(); this.drafts.clear();
    this.undoStack = []; this.redoStack = [];
    this.pendingInput = this.composition = this.lastTyping = undefined;
    clearTimeout(this.timer); this.controller.abort(); this.resizeObserver?.disconnect();
    this.el.replaceChildren(...this.originalNodes);
    if (!this.hadClass) this.el.classList.remove('editor');
    Editor.instances.delete(this.el);
  }
}
