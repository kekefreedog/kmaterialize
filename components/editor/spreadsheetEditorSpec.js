describe('Editor spreadsheet variant', function () {
  let host, editor;
  const load = file => new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/__spec__/node_modules/' + file;
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Could not load ' + file)); document.head.append(script);
  });
  beforeAll(async function () {
    if (!window.Handlebars) await load('handlebars/dist/handlebars.js');
    if (!window.jSuites) await load('jsuites/dist/jsuites.js');
    if (!window.jspreadsheet) await load('kspreadsheet/dist/index.js');
    if (!window.TomSelect) await load('tom-select/dist/js/tom-select.complete.min.js');
  });
  beforeEach(function () { host = document.createElement('div'); host.style.width = '1000px'; document.body.append(host); });
  afterEach(function () { editor?.destroy(); host.remove(); });
  async function start(options = {}) {
    editor = M.Editor.init(host, { variant: 'spreadsheet', engine: window.Handlebars.create(), ...options });
    await editor.ready;
  }
  it('generates a real worksheet row for each item with literal text and typed numeric/boolean cells', async function () {
    await start({ columns: [
      { header: 'Artist', value: '{{artist.name}}' }, { header: 'Days', value: '{{days}}', type: 'numeric' }, { header: 'Ready', value: '{{ready}}', type: 'checkbox' },
    ], data: [{ artist: { name: '<Ada & Co>' }, days: 2.5, ready: true }, { artist: { name: '=1+1' }, days: 3, ready: false }] });
    expect(editor.getSpreadsheetData()).toEqual({ headers: ['Artist', 'Days', 'Ready'], rows: [['<Ada & Co>', 2.5, true], ['=1+1', 3, false]] });
    expect(editor.getWorksheet().getData()[0][0]).toBe('<Ada & Co>');
    expect(host.querySelector('.jss_worksheet')).not.toBeNull();
    expect(host.querySelector('.editor-sheet-preview ada')).toBeNull();
    expect(host.querySelector('[aria-label="Insert artist.name"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Insert 0.artist.name"]')).toBeNull();
    expect(editor.getWorksheet().options.editable).toBeFalse();
  });
  it('drops helpers and tokens into the selected mapping cell and restores that cell on undo', async function () {
    await start({ columns: [{ header: 'Constant', value: 'Keep' }, { header: 'Name', value: '' }], data: [{ person: { name: 'Ada' } }, { person: { name: 'Grace' } }], helpers: { uppercase: value => typeof value === 'string' ? value.toUpperCase() : '' } });
    const input = host.querySelectorAll('.editor-mapping-value')[1];
    for (const selector of ['[data-editor-helper="uppercase"]', '[aria-label="Insert person.name"]']) {
      const transfer = new DataTransfer();
      host.querySelector(selector).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      input.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
    expect(editor.getColumns()[1].value).toBe('{{uppercase person.name}}');
    await editor.render(); expect(editor.getSpreadsheetData().rows).toEqual([['Keep', 'ADA'], ['Keep', 'GRACE']]);
    editor.undo(); expect(editor.getColumns()[1].value).toBe('{{uppercase }}');
    expect(document.activeElement).toBe(host.querySelectorAll('.editor-mapping-value')[1]);
    editor.insertToken('person.name'); expect(editor.getColumns()[1].value).toBe('{{uppercase person.name}}');
    expect(editor.getColumns()[0].value).toBe('Keep');
  });
  it('updates headers and mapping expressions live, and adds/removes columns with undo', async function () {
    const onColumnsChange = jasmine.createSpy('onColumnsChange');
    await start({ columns: [{ header: 'Name', value: '{{name}}' }], data: [{ name: 'Ada' }], onColumnsChange });
    const header = host.querySelector('.editor-mapping-table input');
    header.dispatchEvent(new InputEvent('beforeinput', { bubbles: true })); header.value = 'Artist'; header.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    await editor.render(); expect(editor.getSpreadsheetData().headers).toEqual(['Artist']);
    host.querySelector('.editor-mapping-actions button').click();
    editor.insertToken('name');
    await editor.render(); expect(editor.getSpreadsheetData().rows).toEqual([['Ada', 'Ada']]);
    host.querySelectorAll('.editor-column-remove')[1].click();
    await editor.render(); expect(editor.getSpreadsheetData().rows).toEqual([['Ada']]);
    editor.undo(); expect(editor.getColumns().length).toBe(2);
    expect(onColumnsChange).toHaveBeenCalled();
  });
  it('keeps the last valid worksheet after expression errors and supports empty or shorter datasets', async function () {
    await start({ columns: [{ header: 'Name', value: '{{name}}' }], data: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Sam' }] });
    editor.setColumns([{ header: 'Name', value: '{{#each' }]);
    await editor.render(); expect(editor.getSpreadsheetData().rows.length).toBe(3);
    expect(host.querySelector('.editor-error').hidden).toBeFalse();
    editor.undo(); editor.setData([{ name: 'Short' }]); await editor.render();
    expect(editor.getSpreadsheetData().rows).toEqual([['Short']]);
    expect(editor.getWorksheet().getData().length).toBe(1);
    editor.setData([]); await editor.render(); expect(editor.getSpreadsheetData().rows).toEqual([]);
    expect(host.querySelector('.editor-error').hidden).toBeTrue();
  });
  it('switches column templates and array sources while retaining independent drafts', async function () {
    await start({ templates: [{ id: 'name', label: 'Name', columns: [{ header: 'Name', value: '{{name}}' }] }, { id: 'role', label: 'Role', columns: [{ header: 'Role', value: '{{role}}' }] }], sources: [{ id: 'a', label: 'A', data: [{ name: 'Ada', role: 'Artist' }] }, { id: 'b', label: 'B', data: [{ name: 'Grace', role: 'Lead' }] }] });
    editor.setColumns([{ header: 'Person', value: '{{name}}' }]);
    await editor.selectTemplate('role'); await editor.setSource('b'); await editor.render();
    expect(editor.getSpreadsheetData().rows).toEqual([['Lead']]);
    await editor.selectTemplate('name'); expect(editor.getColumns()[0].header).toBe('Person');
    editor.undo(); expect(editor.getColumns()[0].header).toBe('Name');
  });
  it('loads column definitions and arrays from backend callbacks', async function () {
    await start({ templates: [{ id: 'report', label: 'Report' }], sources: [{ id: 'remote', label: 'Remote' }],
      loadTemplate: async () => [{ header: 'Name', value: '{{name}}' }], loadData: async () => [{ name: 'Ada' }] });
    expect(editor.getSpreadsheetData()).toEqual({ headers: ['Name'], rows: [['Ada']] });
  });
  it('rejects invalid data and mappings without changing the current report', async function () {
    await start({ columns: [{ header: 'Name', value: '{{name}}' }], data: [{ name: 'Ada' }] });
    expect(() => editor.setData({ name: 'Not an array' })).toThrowError(/array of objects/);
    expect(() => editor.setColumns([])).toThrowError(/1–100 columns/);
    expect(() => editor.setTemplate('not json')).toThrow();
    expect(editor.getSpreadsheetData().rows).toEqual([['Ada']]);
  });
  it('downloads CSV with headers, escaped text, and the latest pending mapping edits', async function () {
    await start({ columns: [{ header: 'Old', value: '{{name}}' }], data: [{ name: 'Zoë "Q", Artist\nTeam', days: 2.5 }] });
    let blob;
    spyOn(URL, 'createObjectURL').and.callFake(value => { blob = value; return 'blob:editor-test'; });
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    editor.setColumns([{ header: 'Artist, name', value: '{{name}}' }, { header: 'Days', value: '{{days}}', type: 'numeric' }]);
    await editor.download('csv', 'report.csv');
    expect(click.calls.mostRecent().object.download).toBe('report.csv');
    const csv = (await blob.text()).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    expect(csv).toContain('"Artist, name",Days');
    expect(csv).toContain('"Zoë ""Q"", Artist\nTeam",2.5');
    expect(editor.getWorksheet().options.csvFileName).toBeUndefined();
  });
  it('downloads a real XLSX workbook preserving headers, numbers, booleans and literal text', async function () {
    if (!window.ExcelJS) await load('exceljs/dist/exceljs.min.js');
    await start({ templates: [{ id: 'report', label: 'Artist report', columns: [
      { header: 'Artist', value: '{{name}}' }, { header: 'Days', value: '{{days}}', type: 'numeric' }, { header: 'Ready', value: '{{ready}}', type: 'checkbox' }
    ] }], data: [{ name: 'Ada', days: 2.5, ready: true }, { name: '=1+1', days: 3, ready: false }] });
    let blob;
    spyOn(URL, 'createObjectURL').and.callFake(value => { blob = value; return 'blob:editor-test'; });
    spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    await editor.download('xlsx');
    expect(click.calls.mostRecent().object.download).toBe('Artist report.xlsx');
    const workbook = new window.ExcelJS.Workbook(); await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).values.slice(1)).toEqual(['Artist', 'Days', 'Ready']);
    expect(sheet.getRow(2).values.slice(1)).toEqual(['Ada', 2.5, true]);
    expect(sheet.getRow(3).values.slice(1)).toEqual(['=1+1', 3, false]);
  });
  it('rejects invalid or destroyed exports and recovers after fixing the mapping', async function () {
    await start({ columns: [{ header: 'Name', value: '{{name}}' }], data: [{ name: 'Ada' }] });
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    await expectAsync(editor.download('pdf')).toBeRejectedWithError(/csv or xlsx/);
    editor.setColumns([{ header: 'Name', value: '{{#each' }]);
    await expectAsync(editor.download('csv')).toBeRejected();
    expect(click).not.toHaveBeenCalled();
    editor.undo();
    const worksheet = editor.getWorksheet(); const originalName = worksheet.options.csvFileName;
    spyOn(worksheet, 'download').and.returnValue(Promise.reject(new Error('Export failed')));
    await expectAsync(editor.download('xlsx', 'temporary')).toBeRejectedWithError('Export failed');
    expect(worksheet.options.csvFileName).toBe(originalName);
    worksheet.download.and.returnValue(Promise.resolve());
    await editor.download('xlsx', 'recovered');
    expect(worksheet.download.calls.mostRecent().args).toEqual([true, false, 'xlsx']);
    editor.destroy();
    await expectAsync(editor.download('csv')).toBeRejectedWithError(/destroyed/);
  });
  it('does not change read-only mappings, and releases its worksheet on destroy', async function () {
    await start({ readOnly: true, columns: [{ header: 'Name', value: '{{name}}' }], data: [{ name: 'Ada' }] });
    expect(host.querySelector('.editor-mapping-value').readOnly).toBeTrue();
    editor.insertToken('name'); expect(editor.getColumns()[0].value).toBe('{{name}}');
    editor.destroy(); expect(host.querySelector('.jss_worksheet')).toBeNull(); expect(M.Editor.getInstance(host)).toBeUndefined();
  });
});
