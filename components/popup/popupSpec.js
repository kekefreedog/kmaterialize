describe('Popup', function () {
  let script;
  let style;
  let trigger;

  beforeAll(async function () {
    // Exercise the same optional global fallback as plain-script consumers.
    style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/__spec__/node_modules/sweetalert2/dist/sweetalert2.min.css';
    script = document.createElement('script');
    script.src = '/__spec__/node_modules/sweetalert2/dist/sweetalert2.min.js';
    await Promise.all([style, script].map(element => new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = () => reject(new Error('Could not load SweetAlert2 test dependency'));
      document.head.appendChild(element);
    })));
  });

  beforeEach(function () {
    trigger = document.createElement('button');
    trigger.textContent = 'Open popup';
    document.body.appendChild(trigger);
    trigger.focus();
  });

  afterEach(async function () {
    await M.Popup.close();
    trigger.remove();
  });

  afterAll(function () {
    script.remove();
    style.remove();
  });

  async function open(options = {}) {
    let result;
    const el = await new Promise((resolve, reject) => {
      result = M.Popup.fire({
        showClass: { popup: '' },
        hideClass: { popup: '' },
        ...options,
        didOpen: resolve
      });
      result.catch(reject);
    });
    return { el, result };
  }

  it('opens a themed dialog and returns confirmation without interpreting plain text as HTML', async function () {
    const { el, result } = await open({ titleText: '<strong>Title</strong>', text: 'Details' });
    expect(el.classList.contains('popup')).toBeTrue();
    expect(el.parentElement.classList.contains('popup-container')).toBeTrue();
    expect(el.querySelector('.swal2-title').textContent).toBe('<strong>Title</strong>');
    expect(el.querySelector('.swal2-title strong')).toBeNull();
    const confirm = el.querySelector('.swal2-confirm');
    expect(confirm.classList.contains('btn')).toBeTrue();
    expect(confirm.classList.contains('filled')).toBeTrue();
    expect(confirm.classList.contains('swal2-styled')).toBeFalse();
    confirm.click();
    expect((await result).isConfirmed).toBeTrue();
  });

  it('returns cancellation and supports focusing the cancel action', async function () {
    const { el, result } = await open({ showCancelButton: true, focusCancel: true });
    const cancel = el.querySelector('.swal2-cancel');
    expect(document.activeElement).toBe(cancel);
    cancel.click();
    const response = await result;
    expect(response.isConfirmed).toBeFalse();
    expect(response.dismiss).toBe('cancel');
  });

  it('validates input and resolves with the entered value', async function () {
    const { el, result } = await open({
      input: 'text',
      inputLabel: 'Workspace name',
      inputValidator: value => value.trim() ? undefined : 'Enter a name.'
    });
    const input = el.querySelector('.swal2-input');
    el.querySelector('.swal2-confirm').click();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(el.querySelector('.swal2-validation-message').textContent).toBe('Enter a name.');
    expect(el.isConnected).toBeTrue();
    const bounds = input.getBoundingClientRect();
    const popupBounds = el.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThan(popupBounds.left);
    expect(bounds.right).toBeLessThan(popupBounds.right);
    input.value = 'Studio';
    el.querySelector('.swal2-confirm').click();
    expect((await result).value).toBe('Studio');
  });

  it('preserves theme classes and callback options without mutating caller options', async function () {
    const options = { customClass: { popup: ['custom-popup'], confirmButton: 'btn tonal' }, willOpen: jasmine.createSpy('willOpen') };
    const { el, result } = await open(options);
    expect(el.classList.contains('popup')).toBeTrue();
    expect(el.classList.contains('custom-popup')).toBeTrue();
    expect(options.willOpen).toHaveBeenCalled();
    expect(options.customClass.popup).toEqual(['custom-popup']);
    expect(el.querySelector('.swal2-confirm').classList.contains('filled')).toBeFalse();
    el.querySelector('.swal2-confirm').click();
    await result;
    expect(M.Popup.defaults.customClass.confirmButton).toBe('btn filled');
  });

  it('shows a loader while preConfirm is pending and resolves its value', async function () {
    let complete;
    const { el, result } = await open({
      showLoaderOnConfirm: true,
      preConfirm: () => new Promise(resolve => { complete = resolve; })
    });
    el.querySelector('.swal2-confirm').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getComputedStyle(el.querySelector('.swal2-loader')).display).not.toBe('none');
    complete('Preview ready');
    expect((await result).value).toBe('Preview ready');
  });

  it('confirms programmatically through validation and preConfirm', async function () {
    const { el, result } = await open({
      input: 'text',
      inputValidator: value => value.trim() ? undefined : 'Enter a name.',
      preConfirm: value => value.toUpperCase()
    });
    await M.Popup.clickConfirm();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(el.querySelector('.swal2-validation-message').textContent).toBe('Enter a name.');
    expect(el.isConnected).toBeTrue();
    el.querySelector('.swal2-input').value = 'Studio';
    await M.Popup.clickConfirm();
    const response = await result;
    expect(response.isConfirmed).toBeTrue();
    expect(response.value).toBe('STUDIO');
  });

  it('closes a dialog programmatically and resolves its pending result', async function () {
    const { el, result } = await open();
    await M.Popup.close();
    expect((await result).isDismissed).toBeTrue();
    expect(el.isConnected).toBeFalse();
  });

  it('renders native select, radio, and checkbox inputs visibly', async function () {
    for (const type of ['select', 'radio', 'checkbox']) {
      const { el, result } = await open({ input: type, inputOptions: { one: 'One', two: 'Two' } });
      const input = el.querySelector(type === 'select' ? 'select' : `input[type="${type}"]`);
      const computed = getComputedStyle(input);
      expect(computed.display).not.toBe('none');
      expect(computed.opacity).toBe('1');
      expect(computed.pointerEvents).not.toBe('none');
      await M.Popup.close();
      await result;
    }
  });

  for (const titleText of ['', 'Welcome Mail']) {
    it(`fills a fullscreen popup with bottom tabs ${titleText ? 'with' : 'without'} a title`, async function () {
      const { el, result } = await open({
        grow: 'fullscreen',
        titleText,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: { htmlContainer: 'popup-content-fill' },
        html: `<div class="tabs-fill" data-tab-position="bottom">
          <ul class="tabs tabs-fixed-width">
            <li class="tab"><a class="active" href="#popup-layout-first">First</a></li>
            <li class="tab"><a href="#popup-layout-second">Second</a></li>
          </ul>
          <div id="popup-layout-first" class="tabs-fill-panel"><div style="height: 1600px">Long content</div></div>
          <div id="popup-layout-second" class="tabs-fill-panel">Editor</div>
        </div>`
      });
      const navigation = el.querySelector('.tabs');
      const tabs = M.Tabs.init(navigation, { duration: 0 });
      try {
        const popup = el.getBoundingClientRect();
        const content = el.querySelector('.swal2-html-container').getBoundingClientRect();
        const bar = navigation.getBoundingClientRect();
        const title = el.querySelector('.swal2-title').getBoundingClientRect();
        expect(popup.bottom).toBeLessThanOrEqual(window.innerHeight);
        expect(content.top - (titleText ? title.bottom : popup.top)).toBeLessThan(3);
        expect(Math.abs(content.bottom - bar.bottom)).toBeLessThan(2);
        expect(Math.abs(popup.bottom - bar.bottom)).toBeLessThan(3);
        expect(Math.abs(content.left - popup.left)).toBeLessThan(3);
        const first = el.querySelector('#popup-layout-first');
        expect(first.scrollHeight).toBeGreaterThan(first.clientHeight);
        expect(first.getBoundingClientRect().bottom).toBeLessThanOrEqual(bar.top + 1);
        first.scrollTop = 200;
        expect(first.scrollTop).toBe(200);
        tabs.select('popup-layout-second');
        const second = el.querySelector('#popup-layout-second').getBoundingClientRect();
        expect(Math.abs(second.top - content.top)).toBeLessThan(2);
        expect(Math.abs(second.bottom - bar.top)).toBeLessThan(2);
        expect(Math.abs(el.getBoundingClientRect().height - popup.height)).toBeLessThan(2);
        el.querySelector('.tabs-fill').dataset.tabPosition = 'top';
        expect(Math.abs(navigation.getBoundingClientRect().top - content.top)).toBeLessThan(2);
      } finally {
        tabs.destroy();
        el.querySelector('.swal2-close').click();
        expect((await result).isDismissed).toBeTrue();
      }
    });
  }

  it('keeps ordinary fill-content popups at their requested size', async function () {
    const { el } = await open({
      width: 640,
      customClass: { htmlContainer: 'popup-content-fill' },
      html: '<div class="tabs-fill" style="height: 400px">Content</div>'
    });
    expect(el.querySelector('.tabs-fill').getBoundingClientRect().height).toBe(400);
    expect(el.getBoundingClientRect().width).toBeLessThanOrEqual(640);
    expect(el.querySelector('.swal2-confirm').getBoundingClientRect().height).toBeGreaterThan(0);
    expect(getComputedStyle(el).overflow).toBe('hidden');
  });
  async function waitUntil(predicate) {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for stepper state');
  }

  it('waits for custom input, validates safely, and returns ordered step results', async function () {
    const input = document.createElement('input');
    input.type = 'text';
    const next = jasmine.createSpy('next').and.returnValue('rendered');
    const result = M.Popup.steps({ title: 'Interactive', steps: [
      { title: 'Assets', run: () => 'ready' },
      { title: 'Input', run: ({ waitForConfirmation }) => waitForConfirmation({
        content: input,
        confirmButtonText: 'Continue',
        readValue: () => {
          if (!input.value.trim()) throw new Error('<strong>Enter a title</strong>');
          return input.value.trim();
        }
      }) },
      { title: 'Render', run: next }
    ] });
    await waitUntil(() => document.querySelector('[data-state="waiting"]'));
    expect(next).not.toHaveBeenCalled();
    expect(document.querySelector('progress').value).toBe(1);
    expect(document.querySelector('.popup-stepper-list').hasAttribute('aria-busy')).toBeFalse();
    await M.Popup.clickConfirm();
    await waitUntil(() => !document.querySelector('.popup-stepper-validation').hidden);
    expect(document.querySelector('.popup-stepper-validation').textContent).toBe('<strong>Enter a title</strong>');
    expect(document.querySelector('.popup-stepper-validation strong')).toBeNull();
    input.value = 'Review cut';
    await M.Popup.clickConfirm();
    await waitUntil(() => document.querySelector('progress').value === 3);
    expect(next).toHaveBeenCalledTimes(1);
    expect(input.isConnected).toBeFalse();
    await M.Popup.clickConfirm();
    expect((await result).value).toEqual(['ready', 'Review cut', 'rendered']);
  });

  it('prevents duplicate async confirmation and retains a custom final result', async function () {
    const content = document.createElement('div');
    content.textContent = 'Custom result';
    let resolveValue;
    const read = jasmine.createSpy('read').and.callFake(() => new Promise(resolve => { resolveValue = resolve; }));
    const result = M.Popup.steps({ title: 'Review', steps: [{ title: 'Approve', run: ({ waitForConfirmation }) =>
      waitForConfirmation({ content, readValue: read })
    }] });
    await waitUntil(() => document.querySelector('[data-state="waiting"]'));
    await M.Popup.clickConfirm();
    await M.Popup.clickConfirm();
    expect(read).toHaveBeenCalledTimes(1);
    resolveValue('approved');
    await waitUntil(() => document.querySelector('progress').value === 1);
    expect(content.isConnected).toBeTrue();
    expect(document.querySelector('.swal2-confirm').disabled).toBeFalse();
    await M.Popup.clickConfirm();
    expect((await result).value).toEqual(['approved']);
  });

  it('aborts a pending interaction and ignores late validation after replacement', async function () {
    let signal, resolveValue;
    const next = jasmine.createSpy('next');
    const result = M.Popup.steps({ title: 'Cancel', steps: [{ title: 'Input', run: context => {
      signal = context.signal;
      return context.waitForConfirmation({ content: document.createElement('input'),
        readValue: () => new Promise(resolve => { resolveValue = resolve; }) });
    } }, { title: 'Next', run: next }] });
    await waitUntil(() => document.querySelector('[data-state="waiting"]'));
    await M.Popup.clickConfirm();
    await waitUntil(() => !document.querySelector('.swal2-cancel').disabled);
    document.querySelector('.swal2-cancel').click();
    expect((await result).isConfirmed).toBeFalse();
    expect(signal.aborted).toBeTrue();
    const replacement = await open({ titleText: 'Replacement' });
    resolveValue('too late');
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(next).not.toHaveBeenCalled();
    expect(replacement.el.querySelector('.swal2-title').textContent).toBe('Replacement');
    replacement.el.querySelector('.swal2-confirm').click();
    await replacement.result;
  });

  it('retries failed work without repeating completed user interaction', async function () {
    const read = jasmine.createSpy('read').and.returnValue('title');
    let attempts = 0;
    const result = M.Popup.steps({ title: 'Retry', steps: [
      { title: 'Input', run: ({ waitForConfirmation }) => waitForConfirmation({
        content: document.createElement('input'), readValue: read
      }) },
      { title: 'Work', run: () => { if (attempts++ === 0) throw new Error('Try again'); return 'ready'; } }
    ] });
    await waitUntil(() => document.querySelector('[data-state="waiting"]'));
    await M.Popup.clickConfirm();
    await waitUntil(() => document.querySelector('[data-state="error"]'));
    await M.Popup.clickConfirm();
    await waitUntil(() => document.querySelector('progress').value === 2);
    expect(read).toHaveBeenCalledTimes(1);
    await M.Popup.clickConfirm();
    expect((await result).value).toEqual(['title', 'ready']);
  });

});
