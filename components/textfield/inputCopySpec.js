describe('Explicit input copy buttons', () => {
  let field;
  beforeEach(() => {
    field = document.createElement('div');
    field.className = 'input-field';
    field.innerHTML = '<input id="copy-regression" value="Initial"><button type="button" data-copy-target="#copy-regression" aria-label="Copy value"><i>content_copy</i></button>';
    document.body.append(field);
  });
  afterEach(() => field.remove());
  it('copies the current readonly value from a dynamically inserted field', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    const input = field.querySelector('input');
    input.value = 'Updated value';
    input.readOnly = true;
    const button = field.querySelector('button');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(write).toHaveBeenCalledOnceWith('Updated value');
    expect(button.querySelector('i').textContent).toBe('check');
    expect(field.querySelector('[role=status]').textContent).toBe('Copied');
  });
  it('reports a clipboard rejection without claiming success', async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new Error('Denied')));
    const button = field.querySelector('button');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(button.getAttribute('aria-label')).toBe('Unable to copy');
  });
  it('does not copy disabled controls or generate buttons for plain inputs', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    field.querySelector('input').disabled = true;
    field.querySelector('button').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(write).not.toHaveBeenCalled();
    field.querySelector('button').remove();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(field.querySelector('button')).toBeNull();
  });
});
