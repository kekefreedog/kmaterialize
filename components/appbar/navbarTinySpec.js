describe('Tiny navbar', function () {
  let host, nav, instance;
  beforeEach(function () {
    host = document.createElement('div');
    host.innerHTML = '<nav class="navbar navbar-tiny"><div class="nav-wrapper"><p class="navbar-tiny-content">An update</p><ul><li><a href="#guide">Guide</a></li></ul></div></nav><button class="restore">Show navbar</button>';
    document.body.append(host); nav = host.querySelector('nav');
  });
  afterEach(function () { M.TinyNavbar.getInstance(nav)?.destroy(); host.remove(); });
  it('defaults to compact inline navigation without a close button', function () {
    instance = M.TinyNavbar.init(nav);
    expect(instance.getPosition()).toBe('inline'); expect(instance.isOpen).toBeTrue();
    expect(nav.querySelector('.navbar-tiny-close')).toBeNull();
    expect(nav.getBoundingClientRect().height).toBeLessThan(50);
  });
  it('reads top, bottom, and dismissible classes through AutoInit', function () {
    nav.classList.add('navbar-tiny-bottom', 'navbar-tiny-dismissible'); M.AutoInit(host);
    instance = M.TinyNavbar.getInstance(nav);
    expect(instance.getPosition()).toBe('bottom'); expect(nav.querySelector('.navbar-tiny-close')).not.toBeNull();
    expect(getComputedStyle(nav).position).toBe('fixed'); expect(getComputedStyle(nav).bottom).toBe('0px');
    expect(Math.abs(nav.getBoundingClientRect().bottom - innerHeight)).toBeLessThan(1);
  });
  it('moves between viewport edges and inline without replacing content', function () {
    instance = M.TinyNavbar.init(nav, { position: 'top' }); const link = nav.querySelector('a');
    expect(nav.getBoundingClientRect().top).toBe(0);
    instance.setPosition('bottom'); expect(nav.classList.contains('navbar-tiny-top')).toBeFalse();
    expect(Math.abs(nav.getBoundingClientRect().bottom - innerHeight)).toBeLessThan(1);
    instance.setPosition('inline'); expect(getComputedStyle(nav).position).not.toBe('fixed');
    expect(nav.querySelector('a')).toBe(link);
  });
  it('lets options override class-derived placement and dismissibility', function () {
    nav.classList.add('navbar-tiny-bottom', 'navbar-tiny-dismissible');
    instance = M.TinyNavbar.init(nav, { position: 'top', dismissible: false });
    expect(instance.getPosition()).toBe('top'); expect(nav.classList.contains('navbar-tiny-bottom')).toBeFalse();
    expect(nav.querySelector('.navbar-tiny-close')).toBeNull();
  });
  it('closes only its own bar, reports once, returns focus, and can reopen', function () {
    const callback = jasmine.createSpy('close'), restore = host.querySelector('.restore');
    instance = M.TinyNavbar.init(nav, { dismissible: true, closeLabel: 'Close quick links', returnFocus: restore, onClose: callback });
    const button = nav.querySelector('.navbar-tiny-close'); expect(button.getAttribute('aria-label')).toBe('Close quick links');
    button.focus(); button.click(); expect(instance.isOpen).toBeFalse(); expect(getComputedStyle(nav).display).toBe('none');
    expect(document.activeElement).toBe(restore); expect(callback).toHaveBeenCalledOnceWith(instance);
    instance.close(); expect(callback).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('scroll')); expect(instance.isOpen).toBeFalse();
    instance.open(); expect(instance.isOpen).toBeTrue(); expect(nav.querySelector('.navbar-tiny-close')).toBe(button);
  });
  it('finds a focus destination when returnFocus is omitted', function () {
    instance = M.TinyNavbar.init(nav, { dismissible: true });
    nav.querySelector('.navbar-tiny-close').focus(); instance.close(); expect(document.activeElement).toBe(host.querySelector('.restore'));
  });
  it('keeps other navbars open when one is dismissed', function () {
    const other = nav.cloneNode(true); host.append(other);
    instance = M.TinyNavbar.init(nav, { dismissible: true }); const second = M.TinyNavbar.init(other, { dismissible: true });
    instance.close(); expect(second.isOpen).toBeTrue(); second.destroy();
  });
  it('does not reopen a closed navbar when its placement changes', function () {
    instance = M.TinyNavbar.init(nav); instance.close(); instance.setPosition('bottom'); expect(instance.isOpen).toBeFalse();
    instance.open(); expect(instance.getPosition()).toBe('bottom');
  });
  it('restores authored state and removes generated controls and listeners on destroy', function () {
    nav.classList.remove('navbar-tiny'); nav.hidden = true;
    const html = nav.innerHTML; instance = M.TinyNavbar.init(nav, { position: 'bottom', dismissible: true });
    instance.open(); const oldButton = nav.querySelector('.navbar-tiny-close'); instance.destroy();
    expect(nav.hidden).toBeTrue(); expect(nav.innerHTML).toBe(html); expect(nav.className).toBe('navbar');
    nav.hidden = false; oldButton.click(); expect(nav.hidden).toBeFalse();
  });
  it('reinitializes without duplicate buttons and honors no-autoinit', function () {
    nav.classList.add('navbar-tiny-dismissible'); M.AutoInit(host); M.AutoInit(host);
    expect(nav.querySelectorAll('.navbar-tiny-close').length).toBe(1);
    M.TinyNavbar.getInstance(nav).destroy(); nav.classList.add('no-autoinit'); M.AutoInit(host);
    expect(M.TinyNavbar.getInstance(nav)).toBeUndefined();
  });
  it('rejects invalid positions before changing an existing instance', function () {
    instance = M.TinyNavbar.init(nav, { position: 'top' });
    expect(() => instance.setPosition('left')).toThrow(); expect(() => M.TinyNavbar.init(nav, { position: 'left' })).toThrow();
    expect(M.TinyNavbar.getInstance(nav)).toBe(instance); expect(instance.getPosition()).toBe('top');
  });
});
