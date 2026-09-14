describe('Editor Handlebars workspace', function () {
  let host, editor;
  beforeAll(function (done) {
    if (window.Handlebars) { done(); return; }
    const script = document.createElement('script');
    script.src = '/__spec__/node_modules/handlebars/dist/handlebars.js';
    script.onload = () => done(); script.onerror = () => done.fail('Could not load Handlebars test dependency');
    document.head.append(script);
  });
  beforeAll(function (done) {
    if (window.TomSelect) { done(); return; }
    const script = document.createElement('script');
    script.src = '/__spec__/node_modules/tom-select/dist/js/tom-select.complete.min.js';
    script.onload = () => done(); script.onerror = () => done.fail('Could not load Tom Select');
    document.head.append(script);
  });
  beforeEach(function () {
    host = document.createElement('div');
    host.style.width = '900px';
    document.body.append(host);
  });
  afterEach(function () { editor?.destroy(); host.remove(); });
  function start(options) {
    editor = M.Editor.init(host, { engine: window.Handlebars.create(), highlight: false, ...options });
    return editor.ready;
  }
  it('renders real nested expressions and each blocks with escaped values', async function () {
    await start({ template: '<h1>{{person.firstname}}</h1>{{#each items}}<li>{{this}}</li>{{/each}}', data: { person: { firstname: '<Ada>' }, items: ['A', 'B'] } });
    expect(editor.getHtml()).toBe('<h1>&lt;Ada&gt;</h1><li>A</li><li>B</li>');
    expect(host.querySelector('iframe').getAttribute('sandbox')).toBe('');
    expect(host.querySelector('iframe').srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(host.querySelector('iframe').srcdoc.indexOf('<h1>'));
  });
  it('replaces selected source text when a token is clicked and retains surrounding HTML', async function () {
    await start({ template: '<p>replace</p>', data: { person: { firstname: 'Ada' } } });
    const input = host.querySelector('textarea');
    input.setSelectionRange(3, 10);
    host.querySelector('[aria-label="Insert person.firstname"]').click();
    expect(editor.getTemplate()).toBe('<p>{{person.firstname}}</p>');
    expect(await editor.render()).toBe('<p>Ada</p>');
  });
  it('drops an actual token at the pointer location, including horizontal scrolling', async function () {
    await start({ template: 'a'.repeat(120) + '\nsecond', data: { name: 'Ada' } });
    const input = host.querySelector('textarea');
    input.scrollLeft = 180;
    const rect = input.getBoundingClientRect(), style = getComputedStyle(input);
    const transfer = new DataTransfer();
    host.querySelector('[aria-label="Insert name"]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    expect(transfer.getData('text/plain')).toBe('{{name}}');
    input.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: rect.left + parseFloat(style.paddingLeft), clientY: rect.top + parseFloat(style.paddingTop) + 5 }));
    const index = editor.getTemplate().indexOf('{{name}}');
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(120);
    expect(editor.getTemplate().endsWith('\nsecond')).toBeTrue();
  });
  it('shows a caret at the drop position and clears it on leave or cancellation', async function () {
    await start({ template: 'first\n\tsecond\tthird', data: { name: 'Ada' } });
    const input = host.querySelector('textarea'), caret = host.querySelector('.editor-drop-caret');
    const bounds = input.getBoundingClientRect(), style = getComputedStyle(input);
    const transfer = new DataTransfer();
    transfer.setData('application/x-kmaterialize-editor-token', JSON.stringify(['name']));
    const point = { clientX: bounds.left + parseFloat(style.paddingLeft), clientY: bounds.top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) + 5 };
    input.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, ...point }));
    expect(caret.hidden).toBeFalse();
    expect(caret.getBoundingClientRect().top).toBeCloseTo(bounds.top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight), 0);
    expect(editor.getTemplate()).toBe('first\n\tsecond\tthird');
    input.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, ...point }));
    expect(editor.getTemplate()).toBe('first\n{{name}}\tsecond\tthird');
    expect(caret.hidden).toBeTrue();
    input.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, ...point }));
    input.dispatchEvent(new DragEvent('dragleave'));
    expect(caret.hidden).toBeTrue();
    input.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, ...point }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(caret.hidden).toBeTrue();
  });
  it('keeps custom helpers isolated and supports helper replacement without recompiling the source', async function () {
    const engine = window.Handlebars.create();
    engine.registerHelper('greeting', name => `Global ${name}`);
    await start({ engine, template: '{{greeting name}}', data: { name: 'Ada' }, helpers: { greeting: name => `<Hello ${name}>` } });
    expect(editor.getHtml()).toBe('&lt;Hello Ada&gt;');
    expect(engine.compile('{{greeting name}}')({ name: 'Ada' })).toBe('Global Ada');
    editor.setHelpers({ greeting: name => `Welcome ${name}` });
    expect(await editor.render()).toBe('Welcome Ada');
    editor.setHelpers({});
    expect(await editor.render()).toBe('Global Ada');
  });
  it('supports block helpers and shows helper errors without discarding the last preview', async function () {
    await start({ template: '{{#visible person}}{{firstname}}{{/visible}}', data: { person: { firstname: 'Ada' } }, helpers: {
      visible: function (value, options) { return options.fn(value); }
    } });
    expect(editor.getHtml()).toBe('Ada');
    editor.setHelpers({ visible: () => { throw new Error('Helper failed'); } });
    await editor.render();
    expect(editor.getHtml()).toBe('Ada');
    expect(host.querySelector('.editor-error').textContent).toBe('Helper failed');
  });
  it('switches dropdown data and refreshes the token tree without changing the template', async function () {
    await start({ template: '{{name}}', sources: [{ id: 'a', label: 'First', data: { name: 'Ada' } }, { id: 'b', label: 'Second', data: { name: 'Grace', role: 'Engineer' } }] });
    const select = host.querySelector('select'); select.value = 'b'; select.dispatchEvent(new Event('change'));
    expect(await editor.render()).toBe('Grace');
    expect(editor.getTemplate()).toBe('{{name}}');
    expect(host.querySelector('[aria-label="Insert role"]')).not.toBeNull();
  });
  it('uses Tom Select for both selectors and keeps template drafts and undo histories separate', async function () {
    await start({ templates: [{ id: 'a', label: 'Card', template: 'A {{name}}' }, { id: 'b', label: 'Email', template: 'B {{name}}' }], sources: [{ id: 'one', label: 'First', data: { name: 'Ada' } }] });
    const templateSelect = host.querySelector('.editor-template-select');
    expect(templateSelect.tomselect).toBeDefined();
    expect(host.querySelector('.editor-source-select').tomselect).toBeDefined();
    editor.setTemplate('Edited A {{name}}');
    await editor.selectTemplate('b');
    expect(editor.getTemplateId()).toBe('b');
    expect(templateSelect.tomselect.getValue()).toBe('b');
    expect(editor.undo()).toBeFalse();
    editor.setTemplate('Edited B {{name}}');
    await editor.selectTemplate('a');
    expect(await editor.render()).toBe('Edited A Ada');
    editor.undo(); expect(editor.getTemplate()).toBe('A {{name}}');
    await editor.selectTemplate('b');
    expect(editor.getTemplate()).toBe('Edited B {{name}}');
    editor.undo(); expect(editor.getTemplate()).toBe('B {{name}}');
    templateSelect.tomselect.setValue('a');
    expect(editor.getTemplateId()).toBe('a');
    templateSelect.tomselect.clear();
    expect(templateSelect.tomselect.getValue()).toBe('a');
  });
  it('loads initial template and data content and caches them on later selections', async function () {
    const loadTemplate = jasmine.createSpy('loadTemplate').and.resolveTo('<p>{{name}}</p>');
    const loadData = jasmine.createSpy('loadData').and.resolveTo({ name: 'Remote Ada' });
    await start({ templates: [{ id: 'remote', label: 'Remote' }, { id: 'local', label: 'Local', template: 'Local' }], sources: [{ id: 'remote', label: 'Remote' }, { id: 'local', label: 'Local', data: {} }], loadTemplate, loadData });
    expect(editor.getHtml()).toBe('<p>Remote Ada</p>');
    await editor.selectTemplate('local'); await editor.setSource('local');
    await editor.selectTemplate('remote'); await editor.setSource('remote');
    expect(loadTemplate.calls.count()).toBe(1); expect(loadData.calls.count()).toBe(1);
  });
  it('ignores stale template/data responses and preserves the current content on load errors', async function () {
    let resolveTemplate, resolveData, templateSignal, dataSignal;
    const onError = jasmine.createSpy('onError');
    await start({ template: '{{name}}', templates: [{ id: 'local', label: 'Local', template: '{{name}}' }, { id: 'slow', label: 'Slow' }, { id: 'bad', label: 'Broken' }], sources: [{ id: 'local', label: 'Local', data: { name: 'Ada' } }, { id: 'slow', label: 'Slow' }],
      loadTemplate: (id, signal) => id === 'bad' ? Promise.reject(new Error('Backend unavailable')) : new Promise(resolve => { resolveTemplate = resolve; templateSignal = signal; }),
      loadData: (id, signal) => new Promise(resolve => { resolveData = resolve; dataSignal = signal; }), onError });
    const pendingTemplate = editor.selectTemplate('slow'), pendingData = editor.setSource('slow');
    await editor.selectTemplate('local'); await editor.setSource('local');
    expect(templateSignal.aborted).toBeTrue(); expect(dataSignal.aborted).toBeTrue();
    resolveTemplate('Stale'); resolveData({ name: 'Stale' });
    await Promise.all([pendingTemplate, pendingData]);
    expect(editor.getTemplateId()).toBe('local'); expect(await editor.render()).toBe('Ada');
    await expectAsync(editor.selectTemplate('bad')).toBeRejectedWithError('Backend unavailable');
    expect(editor.getTemplate()).toBe('{{name}}'); expect(editor.getHtml()).toBe('Ada');
    expect(host.querySelector('.editor-template-select').tomselect.getValue()).toBe('local');
    expect(onError.calls.count()).toBe(1);
  });
  it('loads searchable backend lists into both selectors and uses the selected entry', async function () {
    const loadTemplates = jasmine.createSpy('loadTemplates').and.resolveTo([{ id: 'found', label: 'Found template', template: 'Found {{name}}' }]);
    const loadSources = jasmine.createSpy('loadSources').and.resolveTo([{ id: 'found', label: 'Found data', data: { name: 'Grace' } }]);
    await start({ loadTemplates, loadSources, templateSelect: { preload: false, loadThrottle: null }, sourceSelect: { preload: false, loadThrottle: null } });
    const template = host.querySelector('.editor-template-select').tomselect;
    const source = host.querySelector('.editor-source-select').tomselect;
    const loaded = field => new Promise(resolve => field.on('load', resolve));
    const results = Promise.all([loaded(template), loaded(source)]);
    template.load('found'); source.load('grace'); await results;
    expect(loadTemplates.calls.mostRecent().args[0]).toBe('found');
    expect(loadSources.calls.mostRecent().args[0]).toBe('grace');
    template.setValue('found'); source.setValue('found');
    expect(await editor.render()).toBe('Found Grace');
  });
  it('can hide selectors and cleans up portaled dropdowns and pending requests on destroy', async function () {
    await start({ templates: [{ id: 'a', label: 'A', template: 'A' }], templateSelect: false, sourceSelect: false });
    expect(host.querySelector('.ts-wrapper')).toBeNull();
    editor.destroy();
    let resolve, signal;
    await start({ templates: [{ id: 'a', label: 'A', template: 'A' }, { id: 'remote', label: 'Remote' }], loadTemplate: (id, abortSignal) => new Promise(done => { resolve = done; signal = abortSignal; }) });
    const dropdown = host.querySelector('.editor-template-select').tomselect.dropdown;
    const pending = editor.selectTemplate('remote'); editor.destroy();
    expect(signal.aborted).toBeTrue(); expect(dropdown.isConnected).toBeFalse();
    resolve('Too late'); await pending;
    expect(host.querySelector('.editor-workspace')).toBeNull();
  });
  it('keeps the last valid preview during a syntax error and recovers on edit', async function () {
    await start({ template: '<p>{{name}}</p>', data: { name: 'Ada' } });
    editor.setTemplate('{{#each items}}');
    await editor.render();
    expect(host.querySelector('.editor-error').hidden).toBeFalse();
    expect(editor.getHtml()).toBe('<p>Ada</p>');
    editor.setTemplate('{{name}}');
    expect(await editor.render()).toBe('Ada');
    expect(host.querySelector('.editor-error').hidden).toBeTrue();
  });
  it('inserts nested arrays and literal dotted or bracketed keys accurately', async function () {
    await start({ data: { items: [{ name: 'First' }], 'a.b': { 'c]d': 'Literal' } } });
    editor.insertToken(['items', '0', 'name']);
    expect(await editor.render()).toBe('First');
    editor.setTemplate(''); editor.insertToken(['a.b', 'c]d']);
    expect(await editor.render()).toBe('Literal');
  });
  it('searches nested tokens and gracefully handles empty and circular data', async function () {
    const data = { person: { firstname: 'Ada', lastname: 'Lovelace' } }; data.self = data;
    await start({ data });
    const search = host.querySelector('input[type=search]'); search.value = 'firstname'; search.dispatchEvent(new Event('input'));
    expect(host.querySelector('[aria-label="Insert person.firstname"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Insert person.lastname"]')).toBeNull();
    editor.setData({});
    expect(host.querySelector('.editor-empty').textContent).toContain('No matching');
  });
  it('respects readOnly for token insertion while allowing programmatic template updates', async function () {
    await start({ readOnly: true, template: 'Original', data: { name: 'Ada' } });
    editor.insertToken('name');
    expect(editor.getTemplate()).toBe('Original');
    expect(host.querySelector('[aria-label="Insert name"]').disabled).toBeTrue();
    editor.setTemplate('{{name}}');
    expect(await editor.render()).toBe('Ada');
  });
  it('debounces typing and exposes changes without updating another instance', async function () {
    await start({ template: 'old', debounce: 5 });
    const secondHost = document.createElement('div'); host.after(secondHost);
    const second = M.Editor.init(secondHost, { engine: window.Handlebars, highlight: false, template: 'untouched' });
    try {
      await second.ready;
      const changed = jasmine.createSpy('changed'); host.addEventListener('editorchange', changed);
      const input = host.querySelector('textarea'); input.value = 'new'; input.dispatchEvent(new Event('input'));
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(editor.getHtml()).toBe('new'); expect(changed).toHaveBeenCalled();
      expect(second.getHtml()).toBe('untouched');
    } finally { second.destroy(); secondHost.remove(); }
  });
  it('lists functions and composes a clicked helper with a data token', async function () {
    await start({ template: '', data: { person: { name: 'ada' } }, helpers: { capitalize: value => typeof value === 'string' ? value.toUpperCase() : '' } });
    expect(host.querySelector('.editor-token-heading').textContent).toBe('Functions');
    expect(host.querySelector('[aria-label="Insert person.name"]').compareDocumentPosition(host.querySelector('[data-editor-helper="capitalize"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    host.querySelector('[data-editor-helper="capitalize"]').click();
    host.querySelector('[aria-label="Insert person.name"]').click();
    expect(editor.getTemplate()).toBe('{{capitalize person.name}}');
    expect(await editor.render()).toBe('ADA');
    editor.setHelpers({});
    expect(host.querySelector('[data-editor-helper]')).toBeNull();
  });
  it('composes actual helper and data drops without nested mustaches', async function () {
    await start({ template: '', data: { person: { name: 'ada' } }, helpers: { capitalize: value => typeof value === 'string' ? value.toUpperCase() : '' } });
    const input = host.querySelector('textarea');
    for (const selector of ['[data-editor-helper="capitalize"]', '[aria-label="Insert person.name"]']) {
      const transfer = new DataTransfer();
      host.querySelector(selector).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      input.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }
    expect(editor.getTemplate()).toBe('{{capitalize person.name}}');
    expect(await editor.render()).toBe('ADA');
  });
  it('adds an argument when dropped over the helper name and replaces an existing operand', async function () {
    await start({ template: '{{capitalize}}', data: { person: { name: 'ada', other: 'grace' } }, helpers: { capitalize: value => typeof value === 'string' ? value.toUpperCase() : '' } });
    const input = host.querySelector('textarea'); input.setSelectionRange(5, 5);
    editor.insertToken('person.name');
    expect(editor.getTemplate()).toBe('{{capitalize person.name}}');
    input.setSelectionRange(18, 18); editor.insertToken('person.other');
    expect(editor.getTemplate()).toBe('{{capitalize person.other}}');
    expect(await editor.render()).toBe('GRACE');
  });
  it('preserves existing arguments and inserts lookup paths as subexpressions', async function () {
    await start({ template: '{{join "prefix" }}', data: { 'a]b': 'value' }, helpers: { join: (a, b) => `${a}:${b}` } });
    const input = host.querySelector('textarea'); const point = editor.getTemplate().indexOf('}}');
    input.setSelectionRange(point, point); editor.insertToken(['a]b']);
    expect(editor.getTemplate()).toBe('{{join "prefix" (lookup this "a]b")}}');
    expect(await editor.render()).toBe('prefix:value');
  });
  it('uses italic bracketed object labels', async function () {
    await start({ data: { person: { name: 'Ada' } } });
    expect(host.querySelector('em.editor-token-type').textContent).toBe('[object]');
    expect(host.querySelector('em.editor-token-value').textContent).toBe('[object]');
    expect(getComputedStyle(host.querySelector('em.editor-token-type')).fontStyle).toBe('italic');
  });
  it('highlights HTML, CSS and Handlebars with Prism without changing source or executing HTML', async function () {
    const load = file => new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.dataset.manual = '';
      script.src = '/__spec__/node_modules/prismjs/' + file;
      script.onload = () => resolve(); script.onerror = () => reject(new Error('Failed to load Prism'));
      document.head.append(script);
    });
    await load('prism.js'); await load('components/prism-markup-templating.js'); await load('components/prism-handlebars.js');
    const template = '<h1>{{name}}</h1>\n<style>h1 { color: red; }</style>\n' + 'x'.repeat(200);
    await start({ template, data: { name: 'Ada' }, highlight: true });
    const input = host.querySelector('textarea'), mirror = host.querySelector('.editor-highlight');
    expect(mirror.textContent).toBe(template + '\n');
    expect(mirror.querySelector('.token.tag')).not.toBeNull();
    expect(mirror.querySelector('.token.property')).not.toBeNull();
    expect(mirror.querySelector('h1')).toBeNull();
    expect(editor.getTemplate()).toBe(template);
    input.scrollLeft = 100; input.dispatchEvent(new Event('scroll'));
    expect(mirror.scrollLeft).toBe(input.scrollLeft);
  });
  function type(input, text, inputType = 'insertText') {
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data: text }));
    input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: text }));
  }
  it('undoes token replacement and restores the selection, preview and change event', async function () {
    const onChange = jasmine.createSpy('onChange'), change = jasmine.createSpy('editorchange');
    await start({ template: '<p>replace</p>', data: { name: 'Ada' }, onChange });
    host.addEventListener('editorchange', change);
    const input = host.querySelector('textarea'); input.setSelectionRange(3, 10, 'backward');
    editor.insertToken('name');
    expect(await editor.render()).toBe('<p>Ada</p>');
    expect(editor.undo()).toBeTrue();
    expect(editor.getTemplate()).toBe('<p>replace</p>');
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([3, 10, 'backward']);
    expect(await editor.render()).toBe('<p>replace</p>');
    expect(onChange.calls.mostRecent().args[0]).toBe('<p>replace</p>');
    expect(change.calls.mostRecent().args[0].detail.template).toBe('<p>replace</p>');
    expect(editor.undo()).toBeFalse();
    expect(editor.redo()).toBeTrue();
    expect(editor.getTemplate()).toBe('<p>{{name}}</p>');
    expect(input.selectionStart).toBe(11);
    expect(editor.redo()).toBeFalse();
  });
  it('groups continuous typing and keeps helper and token insertion as separate undo steps', async function () {
    await start({ helpers: { capitalize: value => String(value).toUpperCase() }, data: { name: 'Ada' } });
    const input = host.querySelector('textarea');
    type(input, 'H'); type(input, 'i'); type(input, ' ');
    editor.insertHelper('capitalize'); editor.insertToken('name');
    expect(editor.getTemplate()).toBe('Hi {{capitalize name}}');
    editor.undo(); expect(editor.getTemplate()).toBe('Hi {{capitalize }}');
    editor.undo(); expect(editor.getTemplate()).toBe('Hi ');
    editor.undo(); expect(editor.getTemplate()).toBe('');
    editor.redo(); editor.redo(); editor.redo();
    expect(editor.getTemplate()).toBe('Hi {{capitalize name}}');
    expect(await editor.render()).toBe('Hi ADA');
  });
  it('handles Ctrl/Cmd+Z and both redo shortcuts only within the source', async function () {
    await start({ template: 'original' });
    const input = host.querySelector('textarea');
    for (const modifier of ['ctrlKey', 'metaKey']) {
      editor.setTemplate('changed');
      const undo = new KeyboardEvent('keydown', { key: 'z', [modifier]: true, bubbles: true, cancelable: true });
      input.dispatchEvent(undo);
      expect(undo.defaultPrevented).toBeTrue();
      expect(editor.getTemplate()).toBe('original');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', [modifier]: true, shiftKey: true, cancelable: true }));
      expect(editor.getTemplate()).toBe('changed');
      editor.undo();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, cancelable: true }));
      expect(editor.getTemplate()).toBe('changed');
      editor.undo();
    }
    host.querySelector('.editor-token-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.getTemplate()).toBe('original');
    input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyRedo', cancelable: true }));
    expect(editor.getTemplate()).toBe('changed');
    input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', cancelable: true }));
    expect(editor.getTemplate()).toBe('original');
  });
  it('clears redo after new edits, excludes context changes and ignores identical templates', async function () {
    await start({ template: 'A' });
    editor.setTemplate('B'); editor.setTemplate('B');
    editor.setData({ name: 'Ada' }); editor.setHelpers({ echo: value => value });
    editor.undo(); expect(editor.getTemplate()).toBe('A');
    editor.setTemplate('C'); expect(editor.redo()).toBeFalse();
    editor.undo(); expect(editor.getTemplate()).toBe('A');
    expect(editor.undo()).toBeFalse();
  });
  it('starts a new typing group after moving the cursor and treats composition as one edit', async function () {
    await start({ template: '' });
    const input = host.querySelector('textarea');
    type(input, 'a'); type(input, 'b');
    input.setSelectionRange(0, 0); type(input, 'c');
    editor.undo(); expect(editor.getTemplate()).toBe('ab');
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    type(input, 'に', 'insertCompositionText');
    input.setSelectionRange(2, 3); type(input, '日本', 'insertCompositionText');
    expect(editor.undo()).toBeFalse();
    input.dispatchEvent(new CompositionEvent('compositionend'));
    expect(editor.getTemplate()).toBe('ab日本');
    editor.undo(); expect(editor.getTemplate()).toBe('ab');
    editor.undo(); expect(editor.getTemplate()).toBe('');
  });
  it('does not undo or redo in read-only or destroyed editors', async function () {
    await start({ template: 'A', readOnly: true });
    editor.setTemplate('B');
    expect(editor.undo()).toBeFalse(); expect(editor.redo()).toBeFalse();
    expect(editor.getTemplate()).toBe('B');
    editor.destroy();
    expect(editor.undo()).toBeFalse(); expect(editor.redo()).toBeFalse();
  });
  it('restores original nodes and releases pending rendering on destroy', async function () {
    const original = document.createElement('button'); original.textContent = 'Original'; host.append(original);
    await start({ template: 'initial' });
    editor.setTemplate('pending'); editor.destroy();
    await editor.render();
    expect(host.firstChild).toBe(original);
    expect(M.Editor.getInstance(host)).toBeUndefined();
    expect(host.classList.contains('editor')).toBeFalse();
  });
});
