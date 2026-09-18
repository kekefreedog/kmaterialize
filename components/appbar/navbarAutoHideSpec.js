describe('Navbar hide on scroll', function () {
  let host, nav, instance;
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  async function scroll(y) { host.scrollTop = y; host.dispatchEvent(new Event('scroll')); await frame(); }
  const hidden = () => nav.classList.contains('is-navbar-hidden');
  beforeEach(function () {
    host = document.createElement('div'); host.style.cssText = 'height:200px; width:600px; overflow:auto;';
    host.innerHTML = '<nav class="navbar appbar-bordered navbar-hide-on-scroll"><div class="nav-wrapper"><a href="#">Home</a></div></nav><div style="height:1200px"></div>';
    document.body.append(host); nav = host.querySelector('nav');
    instance = M.NavbarAutoHide.init(nav, { scrollTarget: host });
  });
  afterEach(function () { M.NavbarAutoHide.getInstance(nav)?.destroy(); host.remove(); });
  it('hides on downward scroll and reveals on upward scroll and at the top', async function () {
    expect(hidden()).toBeFalse(); await scroll(20); expect(hidden()).toBeTrue();
    await scroll(80); expect(hidden()).toBeTrue(); await scroll(70); expect(hidden()).toBeFalse();
    await scroll(100); expect(hidden()).toBeTrue(); await scroll(0); expect(hidden()).toBeFalse();
  });
  it('accumulates small movements and ignores direction jitter below tolerance', async function () {
    await scroll(1); await scroll(2); await scroll(3); expect(hidden()).toBeFalse();
    await scroll(4); expect(hidden()).toBeTrue();
    await scroll(3); await scroll(4); await scroll(3); expect(hidden()).toBeTrue();
    await scroll(0); expect(hidden()).toBeFalse();
  });
  it('honors offset and immediate zero-tolerance scrolling', async function () {
    instance = M.NavbarAutoHide.init(nav, { scrollTarget: host, offset: 40, tolerance: 0 });
    await scroll(30); expect(hidden()).toBeFalse(); await scroll(40); expect(hidden()).toBeFalse();
    await scroll(41); expect(hidden()).toBeTrue(); await scroll(40); expect(hidden()).toBeFalse();
  });
  it('ignores horizontal-only and unchanged vertical scroll events', async function () {
    await scroll(30); expect(hidden()).toBeTrue();
    host.scrollLeft = 50; host.dispatchEvent(new Event('scroll')); await frame(); expect(hidden()).toBeTrue();
  });
  it('reveals on focus and does not hide while navigation is in use', async function () {
    await scroll(50); expect(hidden()).toBeTrue(); nav.querySelector('a').focus({ preventScroll: true });
    expect(hidden()).toBeFalse(); await scroll(100); expect(hidden()).toBeFalse();
    nav.querySelector('a').blur(); await scroll(120); expect(hidden()).toBeTrue();
  });
  it('starts visible at a restored scroll position and resets on pageshow and resize', async function () {
    await scroll(100); instance = M.NavbarAutoHide.init(nav, { scrollTarget: host });
    expect(hidden()).toBeFalse(); await scroll(120); expect(hidden()).toBeTrue();
    window.dispatchEvent(new Event('pageshow')); expect(hidden()).toBeFalse();
    await scroll(140); expect(hidden()).toBeTrue(); window.dispatchEvent(new Event('resize')); expect(hidden()).toBeFalse();
  });
  it('initializes through AutoInit and honors no-autoinit', async function () {
    instance.destroy(); nav.classList.add('no-autoinit'); M.AutoInit(host, { NavbarAutoHide: { scrollTarget: host } });
    expect(M.NavbarAutoHide.getInstance(nav)).toBeUndefined();
    nav.classList.remove('no-autoinit'); M.AutoInit(host, { NavbarAutoHide: { scrollTarget: host } });
    expect(M.NavbarAutoHide.getInstance(nav)).toBeDefined(); await scroll(20); expect(hidden()).toBeTrue();
  });
  it('restores authored classes and removes listeners and queued work on destroy', async function () {
    instance.destroy(); nav.classList.remove('navbar-hide-on-scroll');
    instance = M.NavbarAutoHide.init(nav, { scrollTarget: host });
    host.scrollTop = 100; host.dispatchEvent(new Event('scroll')); instance.destroy(); await frame();
    expect(hidden()).toBeFalse(); expect(nav.classList.contains('navbar-hide-on-scroll')).toBeFalse();
    await scroll(120); expect(hidden()).toBeFalse(); expect(M.NavbarAutoHide.getInstance(nav)).toBeUndefined();
  });
  it('rejects invalid options without destroying a working instance', function () {
    for (const options of [{ tolerance: -1 }, { tolerance: NaN }, { offset: Infinity }, { offset: -1 }, { scrollTarget: 'body' }]) {
      expect(() => M.NavbarAutoHide.init(nav, options)).toThrow();
      expect(M.NavbarAutoHide.getInstance(nav)).toBe(instance);
    }
  });
  it('keeps sticky layout space and supports the existing fixed wrapper', async function () {
    expect(getComputedStyle(nav).position).toBe('sticky');
    nav.classList.add('navbar-scroll'); expect(getComputedStyle(nav).position).toBe('sticky');
    const height = host.scrollHeight; await scroll(50); expect(host.scrollHeight).toBe(height);
    host.classList.add('navbar-fixed'); expect(getComputedStyle(nav).position).toBe('fixed');
  });
  it('stays visible when the container has no scrollable content', async function () {
    host.lastElementChild.remove(); await scroll(100); expect(hidden()).toBeFalse();
  });
});
