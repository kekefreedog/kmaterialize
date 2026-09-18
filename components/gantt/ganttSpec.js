describe('Gantt timeline', function () {
  let host, chart;
  const task = (extra = {}) => ({ id: 'design', name: 'Design', start: '2026-03-28', end: '2026-03-30', progress: 40, ...extra });
  beforeEach(function () {
    host = document.createElement('div');
    host.style.width = '700px';
    document.body.append(host);
  });
  afterEach(function () { M.Gantt.getInstance(host)?.destroy(); host.remove(); });

  it('uses inclusive calendar days across daylight saving boundaries', function () {
    chart = M.Gantt.init(host, { tasks: [task()] });
    const bar = host.querySelector('.gantt-bar');
    expect(bar.style.width).toBe('138px'); // Three days at 48px, minus gutters.
    expect(bar.getAttribute('aria-label')).toContain('40% progress');
    expect(host.querySelector('.gantt-progress').style.width).toBe('40%');
    expect(host.querySelectorAll('.gantt-tick').length).toBe(7);
    chart.setView('week');
    expect(chart.getView()).toBe('week');
    expect(host.querySelector('.gantt-bar').style.width).toBe('42px');
    expect(host.querySelector('.gantt-tick strong').textContent).toBe('23'); // Monday.
  });

  it('renders single-day tasks and milestones, safely escaping labels', function () {
    chart = M.Gantt.init(host, { tasks: [task({ name: '<img src=x onerror=alert(1)>', end: '2026-03-28' }), task({ id: 'release', name: 'Release', end: '2026-03-28', milestone: true })] });
    expect(host.querySelector('.gantt-bar').style.width).toBe('42px');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('.gantt-task-name').textContent).toContain('<img');
    expect(host.querySelector('.is-milestone').getAttribute('aria-label')).toContain('milestone');
  });

  it('rejects invalid updates without changing the live schedule', function () {
    chart = M.Gantt.init(host, { tasks: [task()] });
    for (const tasks of [
      [task(), task()], [task({ start: '2026-02-30' })],
      [task({ end: '2026-03-01' })], [task({ progress: NaN })],
      [task({ progress: Infinity })], [task({ progress: -1 })], [task({ milestone: true })],
      [task({ start: 'not-a-date' })], [task({ end: '2040-01-01' })],
      [task({ tone: 'unknown' })], [task({ id: '' })]
    ]) expect(() => chart.setTasks(tasks)).toThrow();
    expect(() => chart.setView('month')).toThrow();
    expect(() => M.Gantt.init(host, { tasks: [task({ start: 'bad' })] })).toThrow();
    expect(M.Gantt.getInstance(host)).toBe(chart);
    expect(chart.getTasks()).toEqual([task()]);
    expect(host.querySelectorAll('.gantt-bar').length).toBe(1);
  });

  it('copies data on input, output, and task activation', function () {
    const tasks = [task()];
    const callback = jasmine.createSpy('select').and.callFake(selected => { selected.name = 'Mutated'; });
    chart = M.Gantt.init(host, { tasks, onTaskClick: callback });
    tasks[0].name = 'Changed externally';
    chart.getTasks()[0].name = 'Changed copy';
    host.querySelector('.gantt-bar').click();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(chart.getTasks()[0].name).toBe('Design');
    chart.setTasks([task({ progress: 80 })]);
    expect(host.querySelector('.gantt-progress').style.width).toBe('80%');
  });

  it('keeps focus on a task when changing view or replacing tasks', function () {
    chart = M.Gantt.init(host, { tasks: [task()] });
    host.querySelector('.gantt-bar').focus();
    chart.setView('week');
    expect(document.activeElement.dataset.ganttTask).toBe('design');
    chart.setTasks([task({ progress: 90 })]);
    expect(document.activeElement.dataset.ganttTask).toBe('design');
  });

  it('scrolls the viewport while task labels stay fixed', function () {
    chart = M.Gantt.init(host, { tasks: [task({ end: '2026-04-30' })] });
    const label = host.querySelector('.gantt-label');
    const left = label.getBoundingClientRect().left;
    chart.scrollToDate('2026-04-12');
    expect(host.querySelector('.gantt-viewport').scrollLeft).toBeGreaterThan(0);
    expect(label.getBoundingClientRect().left).toBeCloseTo(left, 0);
    expect(host.scrollWidth).toBeLessThanOrEqual(700);
  });

  it('shows an empty state and restores authored nodes and their listeners', function () {
    const original = document.createElement('button');
    const click = jasmine.createSpy('original click');
    original.addEventListener('click', click);
    host.append(original);
    chart = M.Gantt.init(host, { tasks: [] });
    expect(host.querySelector('[role="status"]').textContent).toBe('No tasks scheduled.');
    chart.setTasks([task()]);
    const oldBar = host.querySelector('.gantt-bar');
    const callback = jasmine.createSpy('old callback');
    chart.options.onTaskClick = callback;
    chart = M.Gantt.init(host, { tasks: [task()] });
    expect(host.querySelectorAll('.gantt-viewport').length).toBe(1);
    oldBar.click();
    expect(callback).not.toHaveBeenCalled();
    chart.destroy();
    expect(host.firstChild).toBe(original);
    expect(host.classList.contains('gantt')).toBeFalse();
    expect(M.Gantt.getInstance(host)).toBeUndefined();
    original.click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('integrates with AutoInit and respects no-autoinit', function () {
    host.innerHTML = '<div class="gantt"></div><div class="gantt no-autoinit"></div>';
    M.AutoInit(host, { Gantt: { tasks: [task()] } });
    const children = host.querySelectorAll('.gantt');
    expect(M.Gantt.getInstance(children[0]).getTasks().length).toBe(1);
    expect(M.Gantt.getInstance(children[1])).toBeUndefined();
    M.Gantt.getInstance(children[0]).destroy();
  });

  it('marks local today only when enabled and within the schedule', function () {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    chart = M.Gantt.init(host, { tasks: [task({ start: today, end: today })] });
    expect(host.querySelector('.gantt-today')).not.toBeNull();
    expect(host.querySelector('.gantt-tick.is-today')).not.toBeNull();
    chart = M.Gantt.init(host, { tasks: chart.getTasks(), showToday: false });
    expect(host.querySelector('.gantt-today')).toBeNull();
    expect(host.querySelector('.gantt-tick.is-today')).toBeNull();
  });
});

describe('Gantt editing and zoom', function () {
  let host, chart, change;
  const task = (extra = {}) => ({ id: 'task', name: 'Design', start: '2026-03-28', end: '2026-03-30', ...extra });
  function start(options = {}) {
    change = jasmine.createSpy('change');
    chart = M.Gantt.init(host, { tasks: [task()], editable: true, onTaskChange: change, ...options });
    // Synthetic pointer events cannot acquire native pointer capture. Actual capture
    // is exercised by the end-to-end Chrome interactions on the docs page.
    spyOn(host.querySelector('.gantt-viewport'), 'setPointerCapture');
  }
  function pointer(type, x, target = host.querySelector('.gantt-viewport')) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: x }));
  }
  function down(selector = '.gantt-bar') { pointer('pointerdown', 400, host.querySelector(selector)); }
  function key(key, selector = '.gantt-bar', shiftKey = false) {
    host.querySelector(selector).dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  }
  beforeEach(function () {
    host = document.createElement('div'); host.style.width = '700px'; document.body.append(host);
  });
  afterEach(function () { M.Gantt.getInstance(host)?.destroy(); host.remove(); });

  it('keeps dates unchanged in view-only mode and enables edits at runtime', function () {
    start({ editable: false });
    expect(host.querySelector('.gantt-resize')).toBeNull();
    key('ArrowRight'); down(); pointer('pointermove', 496); pointer('pointerup', 496);
    expect(chart.getTasks()).toEqual([task()]);
    chart.setEditable(true);
    expect(chart.isEditable()).toBeTrue();
    expect(host.querySelectorAll('.gantt-resize').length).toBe(2);
    key('ArrowRight');
    expect(chart.getTasks()[0].start).toBe('2026-03-29');
    expect(chart.getTasks()[0].end).toBe('2026-03-31');
  });

  it('previews a snapped move then commits once with independent before/after copies', function () {
    const click = jasmine.createSpy('click');
    start({ onTaskClick: click });
    down(); pointer('pointermove', 495);
    expect(chart.getTasks()).toEqual([task()]);
    expect(change).not.toHaveBeenCalled();
    pointer('pointerup', 495);
    expect(chart.getTasks()[0].start).toBe('2026-03-30');
    expect(chart.getTasks()[0].end).toBe('2026-04-01');
    expect(change).toHaveBeenCalledTimes(1);
    const value = change.calls.mostRecent().args[0];
    expect(value.action).toBe('move'); expect(value.previousTask).toEqual(task());
    value.task.start = 'changed'; value.previousTask.start = 'changed';
    expect(chart.getTasks()[0].start).toBe('2026-03-30');
    host.querySelector('.gantt-bar').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(click).not.toHaveBeenCalled();
  });

  it('resizes either end at the current zoom without crossing the opposite end', function () {
    start({ zoom: 2 });
    down('.gantt-resize-end'); pointer('pointermove', 496); pointer('pointerup', 496);
    expect(chart.getTasks()[0].end).toBe('2026-03-31');
    expect(change.calls.mostRecent().args[0].action).toBe('resize-end');
    down('.gantt-resize-start'); pointer('pointermove', 1400); pointer('pointerup', 1400);
    expect(chart.getTasks()[0].start).toBe('2026-03-31');
    expect(chart.getTasks()[0].end).toBe('2026-03-31');
    expect(change.calls.mostRecent().args[0].action).toBe('resize-start');
    down('.gantt-resize-end'); pointer('pointermove', 0); pointer('pointerup', 0);
    expect(chart.getTasks()[0].end).toBe('2026-03-31');
    expect(change).toHaveBeenCalledTimes(2);
  });

  it('snaps to individual days in week view and expands the range for earlier dates', function () {
    start({ view: 'week', zoom: 1.5 });
    down(); pointer('pointermove', 376); pointer('pointerup', 376);
    expect(chart.getTasks()[0].start).toBe('2026-03-27');
    chart.setView('day');
    down(); pointer('pointermove', 40); pointer('pointerup', 40);
    expect(chart.getTasks()[0].start).toBe('2026-03-22');
    expect(parseFloat(host.querySelector('.gantt-bar').style.left)).toBeGreaterThan(0);
  });

  it('cancels with Escape, pointer cancellation, or lost capture', function () {
    start();
    for (const cancel of ['Escape', 'pointercancel', 'lostpointercapture']) {
      down(); pointer('pointermove', 496);
      if (cancel === 'Escape') key('Escape'); else pointer(cancel, 496);
      expect(chart.getTasks()).toEqual([task()]);
      expect(host.classList.contains('gantt-dragging')).toBeFalse();
    }
    expect(change).not.toHaveBeenCalled();
  });

  it('cancels an unfinished edit when zoom, view, edit mode, data or window focus changes', function () {
    start();
    for (const cancel of [() => chart.setZoom(1.5), () => chart.setView('week'), () => chart.setTasks([task()]), () => window.dispatchEvent(new Event('blur')), () => chart.setEditable(false)]) {
      down(); pointer('pointermove', 600); cancel();
      expect(chart.getTasks()).toEqual([task()]);
      expect(host.classList.contains('gantt-dragging')).toBeFalse();
    }
    expect(change).not.toHaveBeenCalled();
  });

  it('ignores no-op gestures and preserves ordinary pointer selection', function () {
    const click = jasmine.createSpy('click'); start({ onTaskClick: click });
    down(); pointer('pointerup', 400);
    expect(click).toHaveBeenCalledTimes(1);
    down(); pointer('pointermove', 448); pointer('pointermove', 400); pointer('pointerup', 400);
    expect(chart.getTasks()).toEqual([task()]);
    expect(change).not.toHaveBeenCalled();
  });

  it('supports keyboard resizing and preserves focus on the same handle', function () {
    start();
    host.querySelector('.gantt-resize-start').focus();
    key('ArrowLeft', '.gantt-resize-start');
    expect(chart.getTasks()[0].start).toBe('2026-03-27');
    expect(document.activeElement.dataset.ganttEdge).toBe('resize-start');
    key('ArrowRight', '.gantt-bar', true);
    expect(chart.getTasks()[0].end).toBe('2026-03-31');
    expect(change.calls.mostRecent().args[0].action).toBe('resize-end');
  });

  it('moves milestones without creating resize handles or changing their duration', function () {
    start({ tasks: [task({ end: '2026-03-28', milestone: true })] });
    expect(host.querySelector('.gantt-resize')).toBeNull();
    key('ArrowRight');
    expect(chart.getTasks()[0].start).toBe('2026-03-29');
    expect(chart.getTasks()[0].end).toBe('2026-03-29');
  });

  it('scales the calendar while keeping the center date and label width fixed', function () {
    start({ tasks: [task({ end: '2026-06-30' })] });
    chart.scrollToDate('2026-04-12');
    const viewport = host.querySelector('.gantt-viewport');
    const labelWidth = host.querySelector('.gantt-label').getBoundingClientRect().width;
    const offset = (viewport.clientWidth - labelWidth) / 2;
    const center = (viewport.scrollLeft + offset) / 48;
    chart.setZoom(2);
    expect(chart.getZoom()).toBe(2);
    expect((viewport.scrollLeft + offset) / 96).toBeCloseTo(center, 1);
    expect(host.querySelector('.gantt-label').getBoundingClientRect().width).toBe(labelWidth);
    chart.setZoom(100); expect(chart.getZoom()).toBe(3);
    chart.setZoom(0.1); expect(chart.getZoom()).toBe(0.5);
    chart.resetZoom(); expect(chart.getZoom()).toBe(1);
    expect(() => chart.setZoom(NaN)).toThrow();
    expect(() => chart.setZoom(0)).toThrow();
    expect(() => M.Gantt.init(host, { minZoom: 3, maxZoom: 1 })).toThrow();
    expect(M.Gantt.getInstance(host)).toBe(chart);
    expect(change).not.toHaveBeenCalled();
  });

  it('cleans up editing state and listeners when destroyed during a gesture', function () {
    start(); down(); pointer('pointermove', 496);
    const viewport = host.querySelector('.gantt-viewport');
    chart.destroy();
    expect(host.children.length).toBe(0);
    expect(host.classList.contains('gantt-editable')).toBeFalse();
    expect(host.classList.contains('gantt-dragging')).toBeFalse();
    pointer('pointerup', 496, viewport);
    expect(change).not.toHaveBeenCalled();
  });
});

describe('Gantt progress colors', function () {
  let host, chart;
  const meter = { low: 30, high: 70, optimum: 100, optimalColor: 'seagreen', suboptimalColor: 'darkorange', criticalColor: 'crimson' };
  const task = (extra = {}) => ({ id: 'task', name: 'Build', start: '2026-03-28', end: '2026-03-30', progress: 25, progressMeter: { ...meter }, ...extra });
  beforeEach(function () { host = document.createElement('div'); document.body.append(host); });
  afterEach(function () { M.Gantt.getInstance(host)?.destroy(); host.remove(); });
  const region = () => host.querySelector('.gantt-progress').dataset.progressRegion;
  const color = () => getComputedStyle(host.querySelector('.gantt-progress')).backgroundColor;

  it('changes the progress color at threshold boundaries while keeping the percentage', function () {
    chart = M.Gantt.init(host, { tasks: [task()] });
    expect(region()).toBe('critical'); expect(color()).toBe('rgb(220, 20, 60)');
    chart.setTasks([task({ progress: 30 })]);
    expect(region()).toBe('suboptimal'); expect(color()).toBe('rgb(255, 140, 0)');
    chart.setTasks([task({ progress: 70 })]);
    expect(region()).toBe('optimal'); expect(color()).toBe('rgb(46, 139, 87)');
    expect(host.querySelector('.gantt-bar').getAttribute('aria-label')).toContain('70% progress, optimal range');
    expect(host.querySelector('.gantt-progress').style.width).toBe('70%');
    chart.setTasks([task({ progress: 0 })]); expect(region()).toBe('critical');
    chart.setTasks([task({ progress: 100 })]); expect(region()).toBe('optimal');
  });

  it('supports low and middle optimum regions', function () {
    chart = M.Gantt.init(host, { tasks: [task()] });
    for (const [optimum, progress, expected] of [[0, 30, 'optimal'], [0, 70, 'suboptimal'], [0, 71, 'critical'], [50, 20, 'suboptimal'], [50, 30, 'optimal'], [50, 70, 'optimal'], [50, 90, 'suboptimal']]) {
      chart.setTasks([task({ progress, progressMeter: { ...meter, optimum } })]);
      expect(region()).toBe(expected);
    }
  });

  it('allows a custom color override, theme variables, and removal of overrides', function () {
    host.style.setProperty('--example-color', 'rgb(10, 20, 30)');
    chart = M.Gantt.init(host, { tasks: [task({ progressColor: 'var(--example-color)' })] });
    expect(color()).toBe('rgb(10, 20, 30)');
    chart.setTasks([task({ progressColor: '#123456' })]); expect(color()).toBe('rgb(18, 52, 86)');
    chart.setTasks([task()]); expect(color()).toBe('rgb(220, 20, 60)');
    chart.setTasks([task({ progressMeter: undefined })]);
    expect(region()).toBe('low');
    expect(host.querySelector('.gantt-progress').style.getPropertyValue('--gantt-progress-color')).toBe('');
  });

  it('rejects invalid colors and thresholds without modifying the current chart', function () {
    chart = M.Gantt.init(host, { tasks: [task()] });
    for (const extra of [{ progressColor: 'not-a-color' }, { progressMeter: { low: 80, high: 20 } }, { progressMeter: { low: -1, high: 70 } }, { progressMeter: { low: 0, high: 101 } }, { progressMeter: { low: 0, high: 70, optimum: NaN } }, { progressMeter: { ...meter, optimalColor: 'url(x)' } }]) {
      expect(() => chart.setTasks([task(extra)])).toThrow();
    }
    expect(chart.getTasks()).toEqual([task()]);
  });

  it('deep-copies meter settings across input, getters, click and edit callbacks', function () {
    const data = task();
    chart = M.Gantt.init(host, { tasks: [data], editable: true,
      onTaskClick: t => { t.progressMeter.low = 90; },
      onTaskChange: change => { change.task.progressMeter.low = 90; change.previousTask.progressMeter.low = 90; }
    });
    data.progressMeter.low = 90;
    chart.getTasks()[0].progressMeter.low = 90;
    host.querySelector('.gantt-bar').click();
    host.querySelector('.gantt-bar').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(chart.getTasks()[0].progressMeter.low).toBe(30);
    expect(region()).toBe('critical');
  });
});


describe('Gantt default progress and overruns', function () {
  let host, chart;
  const task = (progress, extra = {}) => ({ id: 'task', name: 'Build', start: '2026-10-01', end: '2026-10-05', progress, ...extra });
  beforeEach(function () { host = document.createElement('div'); document.body.append(host); });
  afterEach(function () { M.Gantt.getInstance(host)?.destroy(); host.remove(); });
  it('uses blue, green, orange, then red at the exact default boundaries', function () {
    chart = M.Gantt.init(host);
    for (const [value, region, color] of [
      [0, 'low', 'rgb(30, 144, 255)'], [29.9, 'low', 'rgb(30, 144, 255)'],
      [30, 'optimal', 'rgb(46, 139, 87)'], [89.9, 'optimal', 'rgb(46, 139, 87)'],
      [90, 'suboptimal', 'rgb(255, 140, 0)'], [100, 'suboptimal', 'rgb(255, 140, 0)'],
      [100.1, 'critical', 'rgb(220, 20, 60)'], [150, 'critical', 'rgb(220, 20, 60)']
    ]) {
      chart.setTasks([task(value)]);
      const progress = host.querySelector('.gantt-progress');
      expect(progress.dataset.progressRegion).toBe(region);
      expect(getComputedStyle(progress).backgroundColor).toBe(color);
      expect(progress.style.width).toBe(`${Math.min(value, 100)}%`);
      expect(chart.getTasks()[0].progress).toBe(value);
    }
  });
  it('shows the real overrun, retains dates and exposes the full value in callbacks', function () {
    const click = jasmine.createSpy('click');
    chart = M.Gantt.init(host, { tasks: [task(125)], onTaskClick: click, editable: true });
    expect(host.querySelector('.gantt-overrun-text').textContent).toBe('125% · 25% over expected');
    expect(host.querySelector('.gantt-bar').getAttribute('aria-label')).toContain('125% progress, 25% over expected');
    expect(host.querySelector('.gantt-bar').title).toContain('25% over expected');
    host.querySelector('.gantt-bar').click();
    expect(click.calls.mostRecent().args[0].progress).toBe(125);
    chart.setZoom(2); chart.setView('week');
    expect(chart.getTasks()).toEqual([task(125)]);
    chart.setTasks([task(100.1)]);
    expect(host.querySelector('.gantt-overrun-text').textContent).toBe('100.1% · 0.1% over expected');
    chart.setTasks([task(90)]);
    expect(host.querySelector('.gantt-overrun-text')).toBeNull();
  });
  it('marks overruns critical with a custom meter while respecting explicit color overrides', function () {
    const progressMeter = { low: 30, high: 70, optimum: 100, criticalColor: 'red' };
    chart = M.Gantt.init(host, { tasks: [task(120, { progressMeter })] });
    expect(host.querySelector('.gantt-progress').dataset.progressRegion).toBe('critical');
    expect(getComputedStyle(host.querySelector('.gantt-progress')).backgroundColor).toBe('rgb(255, 0, 0)');
    chart.setTasks([task(120, { progressMeter, progressColor: 'blue' })]);
    expect(getComputedStyle(host.querySelector('.gantt-progress')).backgroundColor).toBe('rgb(0, 0, 255)');
    expect(host.querySelector('.gantt-overrun-text')).not.toBeNull();
  });
});

describe('Gantt multi-task selection', function () {
  let host, chart, change;
  const original = [
    { id: 'a', name: 'Design', start: '2026-10-01', end: '2026-10-05', progress: 125 },
    { id: 'b', name: 'Build', start: '2026-10-03', end: '2026-10-04', progress: 50 },
    { id: 'c', name: 'Review', start: '2026-10-05', end: '2026-10-10' },
    { id: 'm', name: 'Launch', start: '2026-10-12', end: '2026-10-12', milestone: true }
  ];
  const button = id => host.querySelector(`.gantt-bar[data-gantt-task="${id}"]`);
  function pointer(type, x, target = host.querySelector('.gantt-viewport'), modifiers = {}) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: x, ...modifiers }));
  }
  function key(name, id = 'a', shiftKey = false) {
    button(id).dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
  }
  beforeEach(function () {
    host = document.createElement('div'); host.style.width = '900px'; document.body.append(host);
    change = jasmine.createSpy('change');
    chart = M.Gantt.init(host, { tasks: original, editable: true, onTaskChange: change });
    spyOn(host.querySelector('.gantt-viewport'), 'setPointerCapture');
  });
  afterEach(function () { chart?.destroy(); host.remove(); });

  it('moves the selection together, preserving durations, offsets, and unselected tasks', function () {
    chart.setSelectedTaskIds(['a', 'b']);
    const snapshots = [];
    chart.options.onTaskChange = value => { change(value); snapshots.push(chart.getTasks()); };
    pointer('pointerdown', 400, button('a')); pointer('pointermove', 496);
    expect(chart.getTasks()).toEqual(original);
    pointer('pointerup', 496);
    const data = chart.getTasks();
    expect(data[0].start).toBe('2026-10-03'); expect(data[0].end).toBe('2026-10-07');
    expect(data[1].start).toBe('2026-10-05'); expect(data[1].end).toBe('2026-10-06');
    expect(data.slice(2)).toEqual(original.slice(2));
    expect(data[0].progress).toBe(125);
    expect(change).toHaveBeenCalledTimes(2);
    expect(snapshots).toEqual([data, data]);
    const first = change.calls.first().args[0]; first.task.name = 'Changed';
    expect(chart.getTasks()[0].name).toBe('Design');
  });

  it('resizes the same edge by a shared delta limited by the shortest duration', function () {
    chart.setSelectedTaskIds(['a', 'b', 'm']);
    pointer('pointerdown', 400, host.querySelector('.gantt-resize-start[data-gantt-task="a"]'));
    pointer('pointermove', 544); pointer('pointerup', 544);
    const data = chart.getTasks();
    expect(data[0].start).toBe('2026-10-02'); expect(data[0].end).toBe('2026-10-05');
    expect(data[1].start).toBe('2026-10-04'); expect(data[1].end).toBe('2026-10-04');
    expect(data[3]).toEqual(original[3]);
    expect(change).toHaveBeenCalledTimes(2);
    key('ArrowLeft', 'a', true); // Cannot shorten any further because B is one day.
    expect(chart.getTasks()).toEqual(data);
    expect(change).toHaveBeenCalledTimes(2);
    key('ArrowRight', 'a', true);
    expect(chart.getTasks()[0].end).toBe('2026-10-06');
    expect(chart.getTasks()[1].end).toBe('2026-10-05');
    expect(chart.getTasks()[3]).toEqual(original[3]);
  });

  it('moves milestones with the group using keyboard controls', function () {
    chart.setSelectedTaskIds(['a', 'm']); key('ArrowRight');
    expect(chart.getTasks()[3].start).toBe('2026-10-13');
    expect(chart.getTasks()[3].end).toBe('2026-10-13');
    expect(chart.getTasks()[0].start).toBe('2026-10-02');
    expect(change).toHaveBeenCalledTimes(2);
  });

  it('supports native checkboxes, Ctrl/Cmd selection, and anchored Shift ranges', function () {
    const select = host.querySelector('[data-gantt-select="a"]');
    expect(select.type).toBe('checkbox');
    expect(select.checked).toBeFalse();
    select.focus(); select.click();
    expect(host.querySelector('[data-gantt-select="a"]').checked).toBeTrue();
    expect(chart.getSelectedTaskIds()).toEqual(['a']);
    expect(document.activeElement.dataset.ganttSelect).toBe('a');
    pointer('pointerdown', 400, button('c'), { ctrlKey: true });
    expect(chart.getSelectedTaskIds()).toEqual(['a', 'c']);
    pointer('pointerdown', 400, button('a'), { metaKey: true });
    expect(chart.getSelectedTaskIds()).toEqual(['c']);
    pointer('pointerdown', 400, button('m'), { shiftKey: true });
    expect(chart.getSelectedTaskIds()).toEqual(['a', 'b', 'c', 'm']);
    pointer('pointerdown', 400, button('b'), { shiftKey: true });
    expect(chart.getSelectedTaskIds()).toEqual(['a', 'b']);
    expect(host.querySelector('[data-gantt-select="b"]').checked).toBeTrue();
    host.querySelector('[data-gantt-select="a"]').click();
    expect(chart.getSelectedTaskIds()).toEqual(['b']);
    expect(host.querySelector('[data-gantt-select="a"]').checked).toBeFalse();
    chart.setSelectedTaskIds([]);
    expect(host.querySelectorAll('.gantt-select:checked').length).toBe(0);
    expect(host.querySelectorAll('.gantt-row.is-selected').length).toBe(0);
  });

  it('cancels all previewed dates together and retains selection through zoom and views', function () {
    chart.setSelectedTaskIds(['a', 'b']);
    pointer('pointerdown', 400, button('b')); pointer('pointermove', 496); key('Escape');
    expect(chart.getTasks()).toEqual(original);
    expect(change).not.toHaveBeenCalled();
    chart.setZoom(2); chart.setView('week');
    expect(chart.getSelectedTaskIds()).toEqual(['a', 'b']);
    pointer('pointerdown', 400, button('a')); pointer('pointermove', 432); pointer('pointerup', 432);
    expect(chart.getTasks()[0].start).toBe('2026-10-02');
    expect(chart.getTasks()[1].start).toBe('2026-10-04');
  });

  it('validates IDs, reports independent selection copies, and prunes removed tasks', function () {
    const selection = jasmine.createSpy('selection').and.callFake(ids => ids.push('mutation'));
    chart.options.onSelectionChange = selection;
    chart.setSelectedTaskIds(['b', 'a', 'a']);
    expect(chart.getSelectedTaskIds()).toEqual(['a', 'b']);
    expect(() => chart.setSelectedTaskIds(['unknown'])).toThrow();
    expect(chart.getSelectedTaskIds()).toEqual(['a', 'b']);
    chart.getSelectedTaskIds().push('mutation');
    chart.setTasks(original.filter(task => task.id !== 'b'));
    expect(chart.getSelectedTaskIds()).toEqual(['a']);
    expect(selection).toHaveBeenCalledTimes(2);
    chart.setTasks([]);
    expect(chart.getSelectedTaskIds()).toEqual([]);
  });
});

describe('Gantt overlapping dependency links', function () {
  let host, chart, changes;
  const original = () => [
    { id: 'a', name: 'Planning', start: '2026-10-01', end: '2026-10-07' },
    { id: 'b', name: 'Implementation', start: '2026-10-03', end: '2026-10-12', progress: 40, dependencies: ['a'] },
    { id: 'c', name: 'Testing', start: '2026-10-10', end: '2026-10-15', progress: 0, dependencies: ['b'] },
    { id: 'm', name: 'Release', start: '2026-10-18', end: '2026-10-18', milestone: true, dependencies: ['c'] },
    { id: 'u', name: 'Unrelated', start: '2026-10-01', end: '2026-10-05' }
  ];
  function key(id, key = 'ArrowRight', shiftKey = false) {
    host.querySelector(`.gantt-bar[data-gantt-task="${id}"]`).dispatchEvent(new KeyboardEvent('keydown', {key, shiftKey, bubbles: true, cancelable: true}));
  }
  function pointer(type, x, target = host.querySelector('.gantt-viewport')) {
    target.dispatchEvent(new PointerEvent(type, {bubbles:true,pointerId:1,isPrimary:true,button:0,clientX:x}));
  }
  beforeEach(function () {
    host = document.createElement('div'); host.style.width = '900px'; document.body.append(host);
    changes = jasmine.createSpy('changes');
    chart = M.Gantt.init(host, {tasks:original(),editable:true,onTaskChange:changes});
    spyOn(host.querySelector('.gantt-viewport'),'setPointerCapture');
  });
  afterEach(function () { chart.destroy(); host.remove(); });
  it('keeps supplied overlaps and draws one directed connector per dependency', function () {
    expect(chart.getTasks()).toEqual(original());
    expect(host.querySelectorAll('.gantt-dependency').length).toBe(3);
    const edge = host.querySelector('.gantt-dependency');
    expect(edge.dataset.from).toBe('a'); expect(edge.dataset.to).toBe('b');
    expect(edge.getAttribute('d')).not.toContain('NaN');
    expect(host.querySelector('.gantt-bar[data-gantt-task="b"]').getAttribute('aria-label')).toContain('linked from Planning');
    expect(changes).not.toHaveBeenCalled();
  });
  it('moves only downstream tasks and extends started work without changing its start', function () {
    const snapshots = []; chart.options.onTaskChange = event => { changes(event); snapshots.push(chart.getTasks()); };
    key('a');
    const tasks = chart.getTasks();
    expect(tasks[0].start).toBe('2026-10-02'); expect(tasks[0].end).toBe('2026-10-08');
    expect(tasks[1].start).toBe('2026-10-03'); expect(tasks[1].end).toBe('2026-10-13');
    expect(tasks[1].progress).toBe(40);
    expect(tasks[2].start).toBe('2026-10-11'); expect(tasks[2].end).toBe('2026-10-16');
    expect(tasks[3].start).toBe('2026-10-19'); expect(tasks[3].end).toBe('2026-10-19');
    expect(tasks[4]).toEqual(original()[4]);
    expect(changes).toHaveBeenCalledTimes(4);
    expect(changes.calls.allArgs().map(args=>args[0].action)).toEqual(['move','resize-end','move','move']);
    snapshots.forEach(snapshot=>expect(snapshot).toEqual(tasks));
    expect(chart.getSelectedTaskIds()).toEqual(['a']);
  });
  it('leaves started successors unchanged when moving earlier but continues the move downstream', function () {
    key('a','ArrowLeft'); const tasks = chart.getTasks();
    expect(tasks[0].start).toBe('2026-09-30');
    expect(tasks[1]).toEqual(original()[1]);
    expect(tasks[2].start).toBe('2026-10-09'); expect(tasks[3].start).toBe('2026-10-17');
    expect(tasks[4]).toEqual(original()[4]);
    expect(changes).toHaveBeenCalledTimes(3);
  });
  it('does not move predecessors when moving a middle task directly', function () {
    key('b'); const tasks = chart.getTasks();
    expect(tasks[0]).toEqual(original()[0]);
    expect(tasks[1].start).toBe('2026-10-04'); expect(tasks[1].end).toBe('2026-10-13');
    expect(tasks[2].start).toBe('2026-10-11');
  });
  it('does not propagate trimming or programmatic date changes', function () {
    key('a','ArrowRight',true);
    expect(chart.getTasks().slice(1)).toEqual(original().slice(1));
    expect(chart.getTasks()[0].end).toBe('2026-10-08');
    const tasks = original(); tasks[0].start = '2026-10-02'; tasks[0].end = '2026-10-08'; chart.setTasks(tasks);
    expect(chart.getTasks()).toEqual(tasks);
    expect(changes).toHaveBeenCalledTimes(1);
  });
  it('updates shared successors exactly once and protects selected started descendants', function () {
    const tasks = original(); tasks[2].dependencies = ['a','b']; chart.setTasks(tasks);
    chart.setSelectedTaskIds(['a','b']); key('a');
    const next = chart.getTasks();
    expect(next[0].start).toBe('2026-10-02');
    expect(next[1].start).toBe('2026-10-03'); expect(next[1].end).toBe('2026-10-13');
    expect(next[2].start).toBe('2026-10-11'); expect(next[3].start).toBe('2026-10-19');
    expect(changes).toHaveBeenCalledTimes(4);
  });
  it('protects completed and overrun work too, and keeps started milestones as fixed points', function () {
    const tasks = original(); tasks[1].progress = 125; tasks[3].progress = 1; tasks[4].dependencies = ['m']; chart.setTasks(tasks);
    key('a'); const next = chart.getTasks();
    expect(next[1].start).toBe(tasks[1].start); expect(next[1].end).toBe('2026-10-13');
    expect(next[1].progress).toBe(125); expect(next[3]).toEqual(tasks[3]);
    expect(next[4].start).toBe('2026-10-02');
  });
  it('previews and cancels the entire chain, including started-task extensions and arrow changes', function () {
    const before = host.querySelector('.gantt-dependency').getAttribute('d');
    pointer('pointerdown',400,host.querySelector('.gantt-bar[data-gantt-task="a"]')); pointer('pointermove',496);
    expect(chart.getTasks()).toEqual(original()); expect(changes).not.toHaveBeenCalled();
    expect(host.querySelector('.gantt-dependency').getAttribute('d')).not.toBe(before);
    key('a','Escape'); expect(chart.getTasks()).toEqual(original());
    expect(host.querySelector('.gantt-dependency').getAttribute('d')).toBe(before);
    pointer('pointerdown',400,host.querySelector('.gantt-bar[data-gantt-task="a"]')); pointer('pointermove',496); pointer('pointerup',496);
    expect(chart.getTasks()[1].start).toBe('2026-10-03'); expect(chart.getTasks()[1].end).toBe('2026-10-14');
    expect(chart.getTasks()[2].start).toBe('2026-10-12');
  });
  it('adds and removes links without touching dates, reports link changes, and validates cycles atomically', function () {
    const link = jasmine.createSpy('link'); chart.options.onDependencyChange = link;
    chart.addDependency('a','u');
    expect(chart.getTasks().map(task=>[task.start,task.end])).toEqual(original().map(task=>[task.start,task.end]));
    expect(chart.getTasks()[4].dependencies).toEqual(['a']); expect(host.querySelectorAll('.gantt-dependency').length).toBe(4);
    chart.addDependency('a','u'); expect(link).toHaveBeenCalledTimes(1);
    expect(()=>chart.addDependency('c','a')).toThrow(); expect(()=>chart.addDependency('a','a')).toThrow();
    expect(()=>chart.addDependency('missing','a')).toThrow();
    expect(chart.getTasks()[0].dependencies).toBeUndefined();
    chart.removeDependency('a','u'); chart.removeDependency('a','u'); expect(link).toHaveBeenCalledTimes(2);
    expect(link.calls.mostRecent().args[0]).toEqual({from:'a',to:'u',action:'remove'});
    expect(changes).not.toHaveBeenCalled();
  });
  it('rejects invalid graphs on setTasks and reinitialization while preserving the original instance', function () {
    for(const dependencies of [['missing'],['a'],['b','b'],'b']) {
      const tasks=original();tasks[0].dependencies=dependencies;
      expect(()=>chart.setTasks(tasks)).toThrow();
      expect(()=>M.Gantt.init(host,{tasks})).toThrow();
      expect(M.Gantt.getInstance(host)).toBe(chart);
    }
    const cycle=original();cycle[0].dependencies=['m'];expect(()=>chart.setTasks(cycle)).toThrow();
    expect(chart.getTasks()).toEqual(original());
  });
  it('copies dependency arrays across input, getters, and all task callbacks', function () {
    const tasks=original();chart.setTasks(tasks); tasks[1].dependencies.push('u');
    chart.getTasks()[1].dependencies.push('u');
    chart.options.onTaskClick = task => task.dependencies?.push('u');
    chart.options.onTaskChange = change => { change.task.dependencies?.push('u');change.previousTask.dependencies?.push('u'); };
    host.querySelector('.gantt-bar[data-gantt-task="b"]').click();
    chart.setSelectedTaskIds(['a']);key('a');
    expect(chart.getTasks()[1].dependencies).toEqual(['a']);
  });
  it('redraws arrows after zoom and keeps marker IDs unique across charts', function () {
    const before=host.querySelector('.gantt-dependency').getAttribute('d'); chart.setZoom(2);
    expect(host.querySelector('.gantt-dependency').getAttribute('d')).not.toBe(before);
    const other=document.createElement('div');document.body.append(other);
    const second=M.Gantt.init(other,{tasks:original()});
    expect(other.querySelector('marker').id).not.toBe(host.querySelector('marker').id);
    second.destroy();other.remove();
  });
});

describe('Gantt direct dependency controls', function () {
  let host, chart, links, edits, clicks;
  const tasks = () => [
    { id: 'a', name: 'Planning', start: '2026-10-01', end: '2026-10-05' },
    { id: 'b', name: 'Started', start: '2026-10-03', end: '2026-10-08', progress: 40 },
    { id: 'c', name: 'Release', start: '2026-10-08', end: '2026-10-08', milestone: true }
  ];
  const port = id => host.querySelector(`[data-gantt-connect="${id}"]`);
  const bar = id => host.querySelector(`.gantt-bar[data-gantt-task="${id}"]`);
  const clickLink = (from, to) => { port(from).click(); bar(to).click(); };
  beforeEach(function () {
    host = document.createElement('div'); host.style.width = '900px'; document.body.append(host);
    links = jasmine.createSpy('links'); edits = jasmine.createSpy('edits'); clicks = jasmine.createSpy('clicks');
    chart = M.Gantt.init(host, { tasks: tasks(), editable: true, onDependencyChange: links, onTaskChange: edits, onTaskClick: clicks });
  });
  afterEach(function () { chart.destroy(); host.remove(); });
  it('connects through button activation without editing dates or task selection', function () {
    clickLink('a', 'b');
    expect(chart.getTasks()[1].dependencies).toEqual(['a']);
    expect(chart.getTasks().map(t => [t.start, t.end])).toEqual(tasks().map(t => [t.start, t.end]));
    expect(chart.getSelectedTaskIds()).toEqual([]);
    expect(links).toHaveBeenCalledOnceWith({ from: 'a', to: 'b', action: 'add' });
    expect(edits).not.toHaveBeenCalled(); expect(clicks).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(bar('b'));
    expect(host.querySelector('.gantt-connecting')).toBeNull();
  });
  it('disconnects by its accessible removal button and restores focus', function () {
    clickLink('a', 'b');
    const remove = host.querySelector('[data-gantt-disconnect]');
    expect(remove.getAttribute('aria-label')).toBe('Disconnect Planning from Started');
    remove.click();
    expect(chart.getTasks()[1].dependencies).toEqual([]);
    expect(host.querySelector('.gantt-dependency')).toBeNull();
    expect(links.calls.mostRecent().args[0]).toEqual({ from: 'a', to: 'b', action: 'remove' });
    expect(document.activeElement).toBe(bar('b')); expect(edits).not.toHaveBeenCalled();
  });
  it('removes only the chosen curve and leaves dates and other links unchanged', function () {
    clickLink('a', 'b'); clickLink('a', 'c');
    const before = chart.getTasks(); links.calls.reset();
    const remove = host.querySelector('.gantt-link-remove[data-from="a"][data-to="b"]');
    expect(remove.closest('svg').getAttribute('aria-hidden')).toBeNull();
    remove.click();
    expect(chart.getTasks()[1].dependencies).toEqual([]);
    expect(chart.getTasks()[2].dependencies).toEqual(['a']);
    expect(chart.getTasks().map(t => [t.start, t.end])).toEqual(before.map(t => [t.start, t.end]));
    expect(links).toHaveBeenCalledOnceWith({ from: 'a', to: 'b', action: 'remove' });
    expect(edits).not.toHaveBeenCalled(); expect(clicks).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(bar('b'));
  });
  it('keeps curve removal focused and positioned after zoom and view updates', function () {
    clickLink('a', 'b');
    host.querySelector('.gantt-link-remove').focus();
    const before = host.querySelector('.gantt-link-control').getAttribute('x');
    chart.setZoom(2);
    expect(document.activeElement.classList.contains('gantt-link-remove')).toBeTrue();
    expect(host.querySelector('.gantt-link-control').getAttribute('x')).not.toBe(before);
    chart.setView('week');
    expect(document.activeElement.classList.contains('gantt-link-remove')).toBeTrue();
    chart.setEditable(false);
    expect(host.querySelector('.gantt-link-remove')).toBeNull();
    expect(host.querySelector('.gantt-dependencies').getAttribute('aria-hidden')).toBe('true');
  });
  it('rejects self links, existing links, and indirect cycles without mutations', function () {
    clickLink('a', 'a'); expect(links).not.toHaveBeenCalled();
    clickLink('a', 'b'); clickLink('b', 'c'); const before = chart.getTasks();
    clickLink('a', 'b'); clickLink('c', 'a');
    expect(chart.getTasks()).toEqual(before); expect(links).toHaveBeenCalledTimes(2);
    expect(host.querySelector('.gantt-announcement').textContent).toContain('No link added');
  });
  it('cancels with Escape and blocks date arrow edits during connection mode', function () {
    port('a').click();
    bar('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(chart.getTasks()).toEqual(tasks());
    bar('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    bar('b').click();
    expect(links).not.toHaveBeenCalled(); expect(clicks).toHaveBeenCalledTimes(1);
    expect(port('a').getAttribute('aria-pressed')).toBe('false');
  });
  it('hides link editing controls in read-only mode or with connectable false', function () {
    chart.addDependency('a', 'b'); chart.setEditable(false);
    expect(port('a')).toBeNull(); expect(host.querySelector('[data-gantt-disconnect]')).toBeNull();
    expect(host.querySelector('.gantt-dependency')).not.toBeNull();
    chart.setEditable(true); expect(port('a')).not.toBeNull();
    chart.options.connectable = false; chart.setTasks(chart.getTasks());
    expect(port('a')).toBeNull(); expect(host.querySelector('.gantt-resize')).not.toBeNull();
  });
  it('cancels pending connections on rerender and destroy', function () {
    port('a').click(); chart.setZoom(0.5); bar('b').click();
    expect(links).not.toHaveBeenCalled();
    port('a').click(); chart.setTasks(tasks().slice(1)); bar('b').click();
    expect(links).not.toHaveBeenCalled();
    const oldPort = port('b'); oldPort.click(); chart.destroy(); oldPort.click();
    expect(host.children.length).toBe(0); expect(links).not.toHaveBeenCalled();
  });
  it('keeps milestone ports inside the calendar at minimum weekly zoom', function () {
    chart.setView('week'); chart.setZoom(0.5);
    expect(port('c').getBoundingClientRect().right).toBeLessThanOrEqual(host.querySelector('.gantt-table').getBoundingClientRect().right);
    clickLink('c', 'a'); expect(chart.getTasks()[0].dependencies).toEqual(['c']);
  });
});
