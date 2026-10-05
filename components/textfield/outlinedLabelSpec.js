describe('Outlined input label activation', () => {
  let field;
  beforeEach(() => {
    field = document.createElement('div');
    field.className = 'input-field outlined';
    document.body.append(field);
  });
  afterEach(() => field.remove());

  for (const control of ['input', 'textarea']) {
    it(`focuses a dynamically inserted ${control} through an unassociated label`, () => {
      field.innerHTML = `<${control} placeholder=" "></${control}><label><span>Label</span></label>`;
      field.querySelector('span').click();
      expect(document.activeElement).toBe(field.firstElementChild);
    });
  }

  it('focuses associated labels without duplicating native activation', () => {
    field.innerHTML = '<input id="outlined-label-test" placeholder=" "><label for="outlined-label-test">Label</label>';
    const activate = jasmine.createSpy('activate');
    field.firstElementChild.addEventListener('click', activate);
    field.querySelector('label').click();
    expect(document.activeElement).toBe(field.firstElementChild);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('allows readonly fields to receive focus', () => {
    field.innerHTML = '<input readonly value="Read only"><label>Label</label>';
    field.querySelector('label').click();
    expect(document.activeElement).toBe(field.firstElementChild);
  });

  it('does not focus disabled fields', () => {
    field.innerHTML = '<input disabled><label>Label</label>';
    field.querySelector('label').click();
    expect(document.activeElement).not.toBe(field.firstElementChild);
  });

  it('respects canceled label clicks', () => {
    field.innerHTML = '<input><label>Label</label>';
    const label = field.querySelector('label');
    label.addEventListener('click', event => event.preventDefault());
    label.click();
    expect(document.activeElement).not.toBe(field.firstElementChild);
  });

  it('leaves interactive label content alone', () => {
    field.innerHTML = '<input><label><button type="button">Help</button></label>';
    field.querySelector('button').click();
    expect(document.activeElement).not.toBe(field.firstElementChild);
  });

  it('does not override an explicit association with another control', () => {
    field.innerHTML = '<input><label for="outlined-other-test">Label</label><input id="outlined-other-test">';
    field.querySelector('label').click();
    expect(document.activeElement).toBe(field.lastElementChild);
  });
});
