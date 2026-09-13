describe('Multi autocomplete selected chips', () => {
  it('keeps the menu open after selection and lets a chip remove its value', async () => {
    const field = document.createElement('div');
    field.className = 'input-field';
    field.innerHTML = '<input placeholder=" "><label>Search</label>';
    document.body.append(field);
    const input = field.querySelector('input');
    const instance = M.Autocomplete.init(input, { isMultiSelect: true, minLength: 0, data: [{id:'a',text:'Alpha'}], dropdownOptions: {inDuration:0,outDuration:0} });
    try {
      instance.open();
      await new Promise(resolve => setTimeout(resolve, 50));
      instance.container.querySelector('li').click();
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(instance.dropdown.isOpen).toBeTrue();
      expect(field.querySelector('.autocomplete-selected-chip').textContent).toContain('Alpha');
      field.querySelector('.autocomplete-selected-chip button').click();
      expect(instance.selectedValues.length).toBe(0);
    } finally { instance.destroy(); field.remove(); }
  });
});
