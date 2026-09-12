describe('FormSelect dropdown ownership', () => {
  [false, true].forEach(multiple => {
    it(`keeps its dropdown instance during generic initialization (multiple=${multiple})`, async () => {
      const field = document.createElement('div');
      field.className = 'input-field outlined';
      field.innerHTML = `<select ${multiple ? 'multiple' : ''}><option value="1">One</option><option value="2">Two</option></select>`;
      document.body.append(field);
      const select = field.querySelector('select');
      const instance = M.FormSelect.init(select, { dropdownOptions: { inDuration: 0, outDuration: 0 } });
      try {
        M.Dropdown.init(field.querySelectorAll('.dropdown-trigger:not(.no-autoinit)'));
        expect(M.Dropdown.getInstance(instance.input)).toBe(instance.dropdown);
        instance.input.click();
        await new Promise(resolve => setTimeout(resolve, 30));
        instance.dropdownOptions.querySelectorAll('li')[1].click();
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(instance.getSelectedValues()).toContain('2');
        expect(instance.dropdown.isOpen).toBe(multiple);
        expect(getComputedStyle(instance.dropdownOptions).display === 'none').toBe(!multiple);
      } finally {
        instance.destroy();
        field.remove();
      }
    });
  });
});
