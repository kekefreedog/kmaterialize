import type Jspreadsheet from 'kspreadsheet';
import type { EditorEngine, EditorHelpers } from './editor';
import { loadPeer } from '../../src/peer-loader';

export interface EditorSpreadsheetColumn {
  header: string;
  value: string;
  /** Output cell type. Text is the default; numeric and checkbox preserve typed values. */
  type?: 'text' | 'numeric' | 'checkbox';
  width?: number;
}
export interface EditorSpreadsheetResult { headers: string[]; rows: Jspreadsheet.CellValue[][] }

export function parseColumns(template: string): EditorSpreadsheetColumn[] {
  const columns: unknown = JSON.parse(template);
  if (!Array.isArray(columns) || !columns.length || columns.length > 100 || columns.some(column =>
    !column || typeof column.header !== 'string' || typeof column.value !== 'string' ||
    (column.type !== undefined && !['text', 'numeric', 'checkbox'].includes(column.type)) ||
    (column.width !== undefined && (typeof column.width !== 'number' || !Number.isFinite(column.width) || column.width < 40)))) {
    throw new TypeError('Spreadsheet templates require 1–100 columns with header and value strings.');
  }
  return columns.map(({ header, value, type, width }) => ({ header, value, ...(type ? { type } : {}), ...(width ? { width } : {}) }));
}

interface ViewCallbacks {
  beforeInput: (event: InputEvent) => void;
  input: (event?: InputEvent) => void;
  keydown: (event: KeyboardEvent) => void;
  compositionStart: () => void;
  compositionEnd: () => void;
  drop: (event: DragEvent, input: HTMLTextAreaElement) => void;
  drag: (event: DragEvent, input: HTMLTextAreaElement) => { left: number; top: number; height: number } | undefined;
}

/** Mapping-table view and the real kspreadsheet preview; shared Editor owns tokens, history and selectors. */
export class SpreadsheetView {
  readonly mapping = document.createElement('div');
  readonly preview = document.createElement('div');
  private grid = document.createElement('div');
  private scroller = document.createElement('div');
  private table = document.createElement('table');
  private columns: EditorSpreadsheetColumn[] = [];
  private inputs: HTMLTextAreaElement[] = [];
  private headers: HTMLInputElement[] = [];
  activeInput?: HTMLTextAreaElement;
  private spreadsheet?: typeof Jspreadsheet;
  worksheet?: Jspreadsheet.WorksheetInstance;
  private signature = '';
  private compiled?: { signature: string; render: ReturnType<EditorEngine['compile']>[] };
  private observer: ResizeObserver;
  private destroyed = false;
  private rowController = new AbortController();
  result: EditorSpreadsheetResult = { headers: [], rows: [] };

  constructor(private readonly readOnly: boolean, private readonly callbacks: ViewCallbacks, signal: AbortSignal) {
    this.mapping.className = 'editor-mapping';
    this.scroller.className = 'editor-mapping-scroll';
    this.table.className = 'editor-mapping-table';
    this.table.setAttribute('aria-label', 'Spreadsheet template: headers and row values');
    this.scroller.append(this.table);
    const actions = document.createElement('div'); actions.className = 'editor-mapping-actions';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn text btn-small'; add.textContent = 'Add column'; add.disabled = readOnly;
    add.addEventListener('click', () => {
      if (this.columns.length >= 100) return;
      this.callbacks.beforeInput(new InputEvent('beforeinput'));
      this.setColumns([...this.getColumns(), { header: `Column ${this.columns.length + 1}`, value: '' }]);
      this.activeInput = this.inputs[this.inputs.length - 1]; this.activeInput.focus();
      this.callbacks.input();
    }, { signal });
    const help = document.createElement('span'); help.textContent = 'One output row per data item.';
    actions.append(add, help); this.mapping.append(this.scroller, actions);
    this.preview.className = 'editor-sheet-preview';
    this.grid.className = 'editor-sheet-grid'; this.preview.append(this.grid);
    this.mapping.addEventListener('beforeinput', event => callbacks.beforeInput(event as InputEvent), { signal });
    this.mapping.addEventListener('input', event => callbacks.input(event as InputEvent), { signal });
    this.mapping.addEventListener('keydown', event => callbacks.keydown(event), { signal });
    this.mapping.addEventListener('compositionstart', () => callbacks.compositionStart(), { signal });
    this.mapping.addEventListener('compositionend', () => callbacks.compositionEnd(), { signal });
    this.observer = new ResizeObserver(() => {
      const content = this.grid.querySelector<HTMLElement>('.jss_content');
      if (content) content.style.height = `${Math.max(100, this.preview.clientHeight - 4)}px`;
    });
    this.observer.observe(this.preview);
  }

  async initialize(): Promise<void> {
    this.spreadsheet = await loadPeer<typeof Jspreadsheet>({
      specifier: 'kspreadsheet', globalName: 'jspreadsheet', feature: 'Spreadsheet Editor',
      cdnHint: '<script src="path/to/jsuites.js"></script><script src="path/to/kspreadsheet/dist/index.js"></script>'
    }, () => import('kspreadsheet'));
  }

  getColumns(): EditorSpreadsheetColumn[] {
    return this.columns.map((column, index) => ({ ...column, header: this.headers[index].value, value: this.inputs[index].value }));
  }
  getSelection(): { column: number; start: number; end: number } | undefined {
    if (!this.activeInput) return;
    return { column: this.inputs.indexOf(this.activeInput), start: this.activeInput.selectionStart, end: this.activeInput.selectionEnd };
  }
  restoreSelection(selection?: { column: number; start: number; end: number }): void {
    this.activeInput = this.inputs[selection?.column ?? 0] ?? this.inputs[0];
    this.activeInput?.focus({ preventScroll: true });
    this.activeInput?.setSelectionRange(selection?.start ?? 0, selection?.end ?? 0);
  }
  setColumns(columns: EditorSpreadsheetColumn[]): void {
    this.rowController.abort(); this.rowController = new AbortController();
    this.columns = columns.map(column => ({ ...column }));
    this.inputs = []; this.headers = [];
    const head = document.createElement('thead'), body = document.createElement('tbody');
    const titles = document.createElement('tr'), values = document.createElement('tr');
    const titleLabel = document.createElement('th'); titleLabel.scope = 'row'; titleLabel.textContent = 'Header';
    const valueLabel = document.createElement('th'); valueLabel.scope = 'row'; valueLabel.textContent = 'Value';
    titles.append(titleLabel); values.append(valueLabel);
    columns.forEach((column, index) => {
      const heading = document.createElement('th'); heading.scope = 'col';
      const header = document.createElement('input'); header.type = 'text'; header.value = column.header;
      header.setAttribute('aria-label', `Column ${index + 1} header`); header.readOnly = this.readOnly;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'editor-column-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove column ${index + 1}`); remove.disabled = this.readOnly || columns.length <= 1;
      remove.addEventListener('click', () => {
        this.callbacks.beforeInput(new InputEvent('beforeinput'));
        this.setColumns(this.getColumns().filter((_, position) => position !== index));
        this.callbacks.input();
      }, { signal: this.rowController.signal });
      heading.append(header, remove); titles.append(heading); this.headers.push(header);
      const cell = document.createElement('td');
      const input = document.createElement('textarea'); input.className = 'editor-mapping-value'; input.value = column.value;
      input.setAttribute('aria-label', `Column ${index + 1} value expression`); input.placeholder = 'Drop a token or function';
      input.spellcheck = false; input.wrap = 'off'; input.readOnly = this.readOnly;
      input.addEventListener('focus', () => { this.activeInput = input; }, { signal: this.rowController.signal });
      const caret = document.createElement('span'); caret.className = 'editor-drop-caret'; caret.hidden = true; caret.setAttribute('aria-hidden', 'true');
      input.addEventListener('dragover', event => {
        const position = this.callbacks.drag(event, input);
        if (!position) return;
        this.activeInput = input; caret.hidden = false;
        caret.style.left = `${position.left}px`; caret.style.top = `${position.top}px`; caret.style.height = `${position.height}px`;
        cell.classList.add('is-drop-target');
      }, { signal: this.rowController.signal });
      const clear = () => { caret.hidden = true; cell.classList.remove('is-drop-target'); };
      input.addEventListener('dragleave', clear, { signal: this.rowController.signal });
      input.addEventListener('drop', event => { clear(); this.activeInput = input; this.callbacks.drop(event, input); }, { signal: this.rowController.signal });
      cell.append(input, caret); values.append(cell); this.inputs.push(input);
    });
    head.append(titles); body.append(values); this.table.replaceChildren(head, body);
    this.activeInput = this.inputs[0]; this.scroller.scrollTop = this.scroller.scrollLeft = 0;
  }

  render(columns: EditorSpreadsheetColumn[], data: Record<string, unknown>[], engine: EditorEngine, helpers: EditorHelpers): EditorSpreadsheetResult {
    const signature = JSON.stringify(columns);
    if (this.compiled?.signature !== signature) this.compiled = { signature, render: columns.map(column => engine.compile(column.value, { noEscape: true })) };
    const rows = data.map((item, row) => columns.map((column, index) => {
      try {
        const value = this.compiled!.render[index](item, { helpers });
        if (column.type === 'numeric') {
          if (!value.trim()) return null;
          const number = Number(value); if (!Number.isFinite(number)) throw new TypeError(`Expected a number, got "${value}".`);
          return number;
        }
        if (column.type === 'checkbox') {
          if (/^(true|1)$/i.test(value.trim())) return true;
          if (/^(false|0)?$/i.test(value.trim())) return false;
          throw new TypeError(`Expected true or false, got "${value}".`);
        }
        return value;
      } catch (reason) { throw new Error(`Row ${row + 1}, ${column.header || `column ${index + 1}`}: ${reason instanceof Error ? reason.message : String(reason)}`); }
    }));
    // Compilers may parse lazily; validate empty-data templates without invoking application helpers.
    if (!data.length) columns.forEach((column, index) => {
      const safeHelpers = Object.fromEntries(Object.keys(helpers).map(name => [name, () => '']));
      this.compiled!.render[index]({}, { helpers: safeHelpers });
    });
    if (!this.spreadsheet || this.destroyed) return this.result;
    const layout = JSON.stringify(columns.map(({ header, type, width }) => ({ header, type, width })));
    if (!this.worksheet || this.signature !== layout) {
      if (this.worksheet) this.spreadsheet.destroy(this.worksheet.parent.el);
      this.grid.replaceChildren();
      this.worksheet = this.spreadsheet(this.grid, {
        tabs: false, toolbar: false, parseHTML: false, parseFormulas: false, contextMenu: () => [],
        worksheets: [{
          worksheetName: 'Generated spreadsheet', data: rows.map(row => [...row]),
          columns: columns.map(column => ({ type: column.type ?? 'text', title: column.header, width: column.width ?? 160, readOnly: true })),
          editable: false, allowInsertColumn: false, allowDeleteColumn: false, allowRenameColumn: false,
          allowInsertRow: false, allowDeleteRow: false, allowManualInsertColumn: false, allowManualInsertRow: false,
          columnSorting: false, columnDrag: false, rowDrag: false, tableOverflow: true,
          tableWidth: '100%', tableHeight: `${Math.max(100, this.preview.clientHeight - 4)}px`,
          minDimensions: [columns.length, 1]
        }]
      })[0];
      this.signature = layout;
    } else this.worksheet.setData(rows.map(row => [...row]));
    this.result = { headers: columns.map(column => column.header), rows };
    return this.result;
  }
  clearDropCarets(): void {
    this.mapping.querySelectorAll<HTMLElement>('.editor-drop-caret').forEach(caret => { caret.hidden = true; });
    this.mapping.querySelectorAll('.is-drop-target').forEach(cell => cell.classList.remove('is-drop-target'));
  }
  destroy(): void {
    this.destroyed = true; this.rowController.abort(); this.observer.disconnect();
    if (this.worksheet) this.spreadsheet?.destroy(this.worksheet.parent.el);
  }
}
