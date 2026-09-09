describe('Loading', function () {
  let fixture;
  let el;

  beforeEach(function () {
    fixture = document.createElement('div');
    fixture.innerHTML = '<div class="loading" aria-label="Fetching assets"><span class="loading-content"><img src="data:," alt=""></span></div>';
    document.body.appendChild(fixture);
    el = fixture.firstElementChild;
  });

  afterEach(function () {
    fixture.querySelectorAll('.loading').forEach(function (element) {
      M.Loading.getInstance(element)?.destroy();
    });
    fixture.remove();
  });

  it('starts and stops without replacing centered content', function () {
    const content = el.firstElementChild;
    const loading = M.Loading.init(el);
    expect(loading.isActive).toBeTrue();
    expect(el.getAttribute('aria-label')).toBe('Fetching assets');
    expect(el.getAttribute('aria-busy')).toBe('true');
    loading.stop('Assets ready');
    expect(loading.isActive).toBeFalse();
    expect(el.getAttribute('aria-label')).toBe('Assets ready');
    expect(el.getAttribute('aria-busy')).toBe('false');
    expect(getComputedStyle(el.querySelector('.preloader-wrapper')).visibility).toBe('hidden');
    expect(getComputedStyle(el.querySelector('.circle')).animationName).toBe('none');
    expect(getComputedStyle(content).visibility).toBe('visible');
    loading.start('Refreshing');
    expect(loading.isActive).toBeTrue();
    expect(el.getAttribute('aria-label')).toBe('Refreshing');
    expect(el.firstElementChild).toBe(content);
  });

  it('supports inactive initialization and customized status labels', function () {
    const loading = M.Loading.init(el, { active: false, label: 'Syncing', completeLabel: 'Synced' });
    expect(loading.isActive).toBeFalse();
    expect(el.getAttribute('aria-label')).toBe('Synced');
    loading.start();
    expect(el.getAttribute('aria-label')).toBe('Syncing');
    loading.stop();
    expect(el.getAttribute('aria-label')).toBe('Synced');
  });

  it('restores original attributes and content when destroyed or reinitialized', function () {
    el.classList.add('active');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-live', 'off');
    el.setAttribute('aria-busy', 'false');
    const original = el.outerHTML;
    const first = M.Loading.init(el, { label: 'First' });
    const second = M.Loading.init(el, { active: false });
    expect(second).not.toBe(first);
    expect(M.Loading.getInstance(el)).toBe(second);
    second.destroy();
    expect(el.outerHTML).toBe(original);
    expect(M.Loading.getInstance(el)).toBeUndefined();
  });

  it('initializes collections and respects the AutoInit opt-out', function () {
    fixture.insertAdjacentHTML('beforeend', '<div class="loading"></div><div class="loading no-autoinit"></div>');
    M.AutoInit(fixture, { Loading: { active: false } });
    expect(M.Loading.getInstance(el).isActive).toBeFalse();
    expect(M.Loading.getInstance(fixture.children[1])).toBeDefined();
    expect(M.Loading.getInstance(fixture.children[2])).toBeUndefined();
    const instances = M.Loading.init(fixture.querySelectorAll('.loading'));
    expect(instances.length).toBe(3);
    expect(instances.every(instance => instance.isActive)).toBeTrue();
  });

  it('uses the same animations as Preloader and preserves authored spinner markup', function () {
    const loading = M.Loading.init(el);
    const spinner = el.querySelector('.preloader-wrapper');
    const reference = spinner.cloneNode(true);
    fixture.appendChild(reference);
    for (const selector of [null, '.spinner-layer', '.circle-clipper.left .circle', '.circle-clipper.right .circle']) {
      const actual = getComputedStyle(selector ? spinner.querySelector(selector) : spinner);
      const expected = getComputedStyle(selector ? reference.querySelector(selector) : reference);
      expect(actual.animationName).toBe(expected.animationName);
      expect(actual.animationDuration).toBe(expected.animationDuration);
      expect(actual.animationTimingFunction).toBe(expected.animationTimingFunction);
    }
    expect(getComputedStyle(el.querySelector('.loading-content')).animationName).toBe('none');
    loading.destroy();
    expect(el.querySelector('.preloader-wrapper')).toBeNull();
    el.appendChild(reference);
    const original = el.outerHTML;
    M.Loading.init(el);
    expect(el.querySelectorAll('.preloader-wrapper').length).toBe(1);
    M.Loading.getInstance(el).destroy();
    expect(el.outerHTML).toBe(original);
  });

  it('keeps hidden indicators hidden', function () {
    M.Loading.init(el);
    el.hidden = true;
    expect(getComputedStyle(el).display).toBe('none');
  });
});
