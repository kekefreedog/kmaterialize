describe('Tabs with no tab links', () => {
  let element;
  let instance;

  beforeEach(() => {
    element = document.createElement('ul');
    element.className = 'tabs';
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (instance) instance.destroy();
    instance = null;
    element.remove();
  });

  [false, true].forEach((swipeable) => {
    it(`handles an empty list with swipeable=${swipeable}`, () => {
      instance = M.Tabs.init(element, { swipeable });
      expect(M.Tabs.getInstance(element)).toBe(instance);
      expect(instance.index).toBe(-1);
      expect(element.querySelector('.indicator')).toBeNull();
      expect(() => {
        instance.updateTabIndicator();
        instance.select('missing');
        window.dispatchEvent(new Event('resize'));
        element.click();
        instance.destroy();
      }).not.toThrow();
      expect(M.Tabs.getInstance(element)).toBeUndefined();
      instance = null;
    });
  });

  it('ignores placeholder markup without tab anchors', () => {
    element.innerHTML = '<li class="tab">Loading…</li>';
    instance = M.Tabs.init(element);
    expect(instance.index).toBe(-1);
  });

  it('can initialize normally after links are added', () => {
    instance = M.Tabs.init(element);
    element.innerHTML = '<li class="tab"><a href="#missing-panel">First</a></li>';
    instance = M.Tabs.init(element);
    expect(instance.index).toBe(0);
    expect(element.querySelector('a').classList.contains('active')).toBeTrue();
    expect(element.querySelector('.indicator')).not.toBeNull();
    expect(() => instance.updateTabIndicator()).not.toThrow();
  });
});
