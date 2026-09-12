describe('Outlined FormSelect notch', () => {
  it('centers the display text and keeps the floating label transparent', async () => {
    const field = document.createElement('div');
    field.className = 'input-field outlined';
    field.innerHTML = '<select id="outlined-select-test"><option value="">Choose your option</option><option value="one">One</option></select><label for="outlined-select-test">Issue type</label>';
    document.body.append(field);
    const select = field.querySelector('select');
    const instance = M.FormSelect.init(select);
    try {
      await new Promise(resolve => setTimeout(resolve, 60));
      const input = field.querySelector('input.select-dropdown');
      const label = field.querySelector('label');
      const outline = field.querySelector('.input-outline');
      expect(getComputedStyle(input).paddingTop).toBe('0px');
      expect(outline).not.toBeNull();
      expect(getComputedStyle(label).backgroundColor).toBe('rgba(0, 0, 0, 0)');
      input.focus();
      expect(getComputedStyle(outline).borderTopWidth).toBe('2px');
      expect(getComputedStyle(label).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    } finally {
      instance.destroy();
      field.remove();
    }
  });
});
