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
});
