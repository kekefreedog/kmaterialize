import type Quill from 'quill';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';

type ToolbarItem = string | Record<string, unknown>;
export interface RichTextareaOptions extends BaseOptions {
  /** Native textarea serialization. HTML preserves formatting; text stores plain text. */
  valueFormat?: 'html' | 'text';
  toolbar?: false | Array<ToolbarItem | ToolbarItem[]>;
  formats?: string[];
  placeholder?: string;
  label?: string;
}
let sequence = 0;
function uniqueId() {
  let id: string;
  do { id = `m-rich-textarea-${++sequence}`; } while (document.getElementById(id));
  return id;
}

/** Quill enhancement of a native textarea, including form value synchronization. */
export class RichTextarea extends Component<RichTextareaOptions> {
  declare el: HTMLTextAreaElement;
  quill?: Quill;
  ready: Promise<void>;
  private _wrapper?: HTMLDivElement;
  private _error?: HTMLDivElement;
  private _observer?: MutationObserver;
  private _form: HTMLFormElement | null;
  private _labels: HTMLLabelElement[] = [];
  private _labelIds: Array<{ label: HTMLLabelElement; id: string }> = [];
  private _hidden: string | null;
  private _ariaHidden: string | null;
  private _destroyed = false;
  private _updating = false;
  private _dirty = false;
  private _invalid = false;
  private _lastValue = '';
  private _resetTimer?: ReturnType<typeof setTimeout>;
  private _blurTimer?: ReturnType<typeof setTimeout>;

  constructor(el: HTMLTextAreaElement, options: Partial<RichTextareaOptions>) {
    super(el, options, RichTextarea);
    this.el['M_RichTextarea'] = this;
    this.options = {
      ...RichTextarea.defaults,
      valueFormat: el.dataset.valueFormat === 'text' ? 'text' : 'html',
      ...options
    };
    this._form = el.form;
    this._hidden = el.getAttribute('hidden');
    this._ariaHidden = el.getAttribute('aria-hidden');
    this.ready = this._setup().catch(error => { this.destroy(); throw error; });
  }
  static get defaults(): RichTextareaOptions {
    return {
      valueFormat: 'html',
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'link', 'clean']
      ],
      formats: ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'blockquote', 'link']
    };
  }
  static init(el: HTMLTextAreaElement, options?: Partial<RichTextareaOptions>): RichTextarea;
  static init(els: InitElements<HTMLTextAreaElement | MElement>, options?: Partial<RichTextareaOptions>): RichTextarea[];
  static init(els: HTMLTextAreaElement | InitElements<HTMLTextAreaElement | MElement>, options: Partial<RichTextareaOptions> = {}): RichTextarea | RichTextarea[] {
    return super.init(els, options, RichTextarea);
  }
  static getInstance(el: HTMLTextAreaElement): RichTextarea { return el['M_RichTextarea']; }

  private async _setup() {
    const QuillCtor = await loadPeer<typeof Quill>({
      specifier: 'quill', globalName: 'Quill', feature: 'RichTextarea',
      cdnHint: '<link rel="stylesheet" href="path/to/quill.snow.css"> (before materialize.css)\n<script src="path/to/quill.js"></script>'
    }, () => import('quill'));
    if (this._destroyed) return;
    const wrapper = document.createElement('div');
    this._wrapper = wrapper;
    wrapper.className = 'rich-textarea';
    const editor = document.createElement('div');
    const error = document.createElement('div');
    this._error = error;
    error.className = 'rich-textarea-error';
    error.id = uniqueId();
    error.hidden = true;
    error.setAttribute('role', 'alert');
    wrapper.append(editor, error);
    this.el.after(wrapper);
    this.quill = new QuillCtor(editor, {
      theme: 'snow', bounds: wrapper,
      placeholder: this.options.placeholder ?? this.el.placeholder,
      formats: this.options.formats,
      modules: { toolbar: this.options.toolbar, history: { userOnly: true } }
    });
    this._labels = Array.from(this.el.labels || []);
    this._labels.forEach(label => {
      if (!label.id) {
        label.id = uniqueId();
        this._labelIds.push({ label, id: label.id });
      }
      label.addEventListener('click', this._onLabelClick);
    });
    this._labelToolbar();
    this.quill.root.setAttribute('role', 'textbox');
    this.quill.root.setAttribute('aria-multiline', 'true');
    this.quill.on('text-change', this._onTextChange);
    wrapper.addEventListener('focusout', this._onBlur);
    this.el.addEventListener('input', this._onNativeInput);
    this.el.addEventListener('change', this._onNativeInput);
    this.el.addEventListener('invalid', this._onInvalid);
    this._form?.addEventListener('reset', this._onReset);
    this._observer = new MutationObserver(() => this.refresh());
    this._observer.observe(this.el, { attributes: true, attributeFilter: [
      'disabled', 'readonly', 'required', 'placeholder', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-invalid'
    ] });
    let ancestor = this.el.parentElement;
    while (ancestor) {
      if (ancestor instanceof HTMLFieldSetElement) this._observer.observe(ancestor, { attributes: true, attributeFilter: ['disabled'] });
      ancestor = ancestor.parentElement;
    }
    this.setValue(this.el.value, false);
    this.quill.history.clear();
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.refresh();
  }
  private _labelToolbar() {
    const toolbar = this._wrapper?.querySelector<HTMLElement>('.ql-toolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('select').forEach(select => select.classList.add('no-autoinit'));
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Text formatting');
    const names: Record<string, string> = { header: 'Heading', bold: 'Bold', italic: 'Italic', underline: 'Underline', strike: 'Strikethrough', list: 'List', blockquote: 'Block quote', link: 'Insert link', clean: 'Clear formatting' };
    toolbar.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      const format = Array.from(button.classList).find(name => name.startsWith('ql-'))?.slice(3) || 'format';
      const label = `${names[format] || format}${button.value ? `: ${button.value}` : ''}`;
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
    });
    toolbar.querySelectorAll<HTMLElement>('.ql-picker').forEach(picker => {
      const format = Array.from(picker.classList).find(name => name !== 'ql-picker' && name.startsWith('ql-'))?.slice(3) || 'format';
      picker.querySelector('.ql-picker-label')?.setAttribute('aria-label', names[format] || format);
      picker.querySelectorAll<HTMLElement>('.ql-picker-item').forEach(item => {
        item.setAttribute('aria-label', item.dataset.label || (item.dataset.value ? `${names[format] || format} ${item.dataset.value}` : 'Normal text'));
      });
    });
  }
  /** Refresh native value, state and accessible labels after programmatic changes. */
  refresh() {
    if (!this.quill || this._destroyed) return;
    if (this.el.value !== this._lastValue) this.setValue(this.el.value, false);
    const disabled = this.el.matches(':disabled');
    const readOnly = this.el.readOnly;
    this.quill.enable(!disabled && !readOnly);
    this._wrapper!.classList.toggle('is-disabled', disabled);
    this._wrapper!.classList.toggle('is-readonly', readOnly);
    const toolbar = this._wrapper!.querySelector<HTMLElement>('.ql-toolbar');
    if (toolbar) { toolbar.inert = disabled || readOnly; toolbar.setAttribute('aria-disabled', String(disabled || readOnly)); }
    const root = this.quill.root;
    root.setAttribute('aria-disabled', String(disabled));
    root.setAttribute('aria-readonly', String(readOnly));
    root.setAttribute('aria-required', String(this.el.required));
    root.setAttribute('tabindex', disabled ? '-1' : '0');
    const labelledBy = this.el.getAttribute('aria-labelledby') || (!this.options.label && !this.el.hasAttribute('aria-label') ? this._labels.map(label => label.id).join(' ') : '');
    if (labelledBy) { root.setAttribute('aria-labelledby', labelledBy); root.removeAttribute('aria-label'); }
    else { root.removeAttribute('aria-labelledby'); root.setAttribute('aria-label', this.options.label || this.el.getAttribute('aria-label') || 'Rich text editor'); }
    root.setAttribute('aria-describedby', [this.el.getAttribute('aria-describedby'), this._error!.id].filter(Boolean).join(' '));
    root.dataset.placeholder = this.options.placeholder ?? this.el.placeholder;
    this._updateValidity();
  }
  /** Set serialized content. Call after ready to update both editor and textarea. */
  setValue(value: string, emit = true) {
    this.el.value = value;
    if (!this.quill || this._destroyed) return;
    if (this.options.valueFormat === 'text') this.quill.setText(value, 'silent');
    else this.quill.setContents(this.quill.clipboard.convert({ html: value }), 'silent');
    this._sync(emit);
  }
  getValue(): string { return this.el.value; }
  getHTML(): string { return this.quill ? this._isEmpty() ? '' : this.quill.getSemanticHTML() : ''; }
  getText(): string { return this.quill?.getText().replace(/\n$/, '') || ''; }
  focus() { if (!this.el.matches(':disabled')) this.quill?.focus(); }
  private _isEmpty() {
    return !this.quill!.getText().trim() && !this.quill!.getContents().ops.some(op => typeof op.insert === 'object');
  }
  private _sync(emit: boolean) {
    if (!this.quill || this._destroyed) return;
    this.el.value = this._isEmpty() ? '' : this.options.valueFormat === 'text' ? this.getText() : this.quill.getSemanticHTML();
    this._lastValue = this.el.value;
    this._updateValidity();
    if (emit) {
      this._dirty = true;
      this._updating = true;
      try { this.el.dispatchEvent(new Event('input', { bubbles: true })); }
      finally { this._updating = false; }
    }
  }
  private _updateValidity() {
    if (!this.quill || !this._error) return;
    if (this.el.validity.valid) this._invalid = false;
    const invalid = this._invalid || this.el.getAttribute('aria-invalid') === 'true';
    this.quill.root.setAttribute('aria-invalid', String(invalid));
    this._wrapper!.classList.toggle('is-invalid', invalid);
    this._error.textContent = this._invalid ? this.el.validationMessage : '';
    this._error.hidden = !this._error.textContent;
  }
  private _onTextChange = () => this._sync(true);
  private _onNativeInput = () => { if (!this._updating) this.setValue(this.el.value, false); };
  private _onLabelClick = (event: MouseEvent) => {
    if (event.target instanceof Node && this._wrapper?.contains(event.target)) return;
    event.preventDefault(); this.focus();
  };
  private _onInvalid = (event: Event) => {
    event.preventDefault();
    this._invalid = true;
    this._updateValidity();
    this.focus();
  };
  private _onBlur = () => {
    clearTimeout(this._blurTimer);
    this._blurTimer = setTimeout(() => {
      if (!this._dirty || this._wrapper?.contains(document.activeElement)) return;
      this._dirty = false;
      this._updating = true;
      try { this.el.dispatchEvent(new Event('change', { bubbles: true })); }
      finally { this._updating = false; }
    }, 0);
  };
  private _onReset = () => {
    clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(() => {
      if (this._destroyed) return;
      this._invalid = false;
      this._dirty = false;
      this.setValue(this.el.value, false);
      this.quill?.history.clear();
    }, 0);
  };
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._resetTimer); clearTimeout(this._blurTimer);
    this._observer?.disconnect();
    this.quill?.off('text-change', this._onTextChange);
    this.quill?.disable();
    // Quill has no destroy API. Detach Parchment's observer and remove owned DOM.
    this.quill?.scroll.detach();
    this._wrapper?.removeEventListener('focusout', this._onBlur);
    this._wrapper?.remove();
    this.el.removeEventListener('input', this._onNativeInput);
    this.el.removeEventListener('change', this._onNativeInput);
    this.el.removeEventListener('invalid', this._onInvalid);
    this._form?.removeEventListener('reset', this._onReset);
    this._labels.forEach(label => label.removeEventListener('click', this._onLabelClick));
    this._labelIds.forEach(({ label, id }) => { if (label.id === id) label.removeAttribute('id'); });
    if (this._hidden === null) this.el.removeAttribute('hidden'); else this.el.setAttribute('hidden', this._hidden);
    if (this._ariaHidden === null) this.el.removeAttribute('aria-hidden'); else this.el.setAttribute('aria-hidden', this._ariaHidden);
    if (RichTextarea.getInstance(this.el) === this) this.el['M_RichTextarea'] = undefined;
    this.quill = undefined;
  }
}
