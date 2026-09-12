describe('Outlined field background-independent notch', () => {
  let field;
  const settle = () => new Promise(resolve => setTimeout(resolve, 60));
  beforeEach(async () => {
    field = document.createElement('div');
    field.className = 'input-field outlined';
    field.style.background = 'linear-gradient(to right, #30393d, #546e7a)';
    field.innerHTML = '<input id="notch-regression" placeholder=" "><label for="notch-regression">Email subject</label>';
    document.body.append(field);
    await settle();
  });
  afterEach(() => field.remove());
  it('keeps the accessible label and opens a real notch on focus', async () => {
    const input = field.querySelector('input');
    const label = field.querySelector('label');
    const outline = field.querySelector('.input-outline');
    expect(input.labels[0]).toBe(label);
    expect(outline.getAttribute('aria-hidden')).toBe('true');
    expect(outline.querySelector('legend').getBoundingClientRect().width).toBeLessThan(1);
    input.focus();
    await settle();
    expect(outline.querySelector('legend').getBoundingClientRect().width).toBeGreaterThan(10);
    expect(getComputedStyle(label).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(input).borderTopColor).toBe('rgba(0, 0, 0, 0)');
  });
  it('updates label text and removes the outline when switching to a filled field', async () => {
    field.querySelector('label').textContent = 'New label';
    await settle();
    expect(field.querySelector('legend').textContent).toBe('New label');
    expect(field.querySelectorAll('.input-outline').length).toBe(1);
    field.classList.remove('outlined');
    await settle();
    expect(field.querySelector('.input-outline')).toBeNull();
  });
});
