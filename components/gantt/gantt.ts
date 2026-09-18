import { enableGanttConnections } from './gantt-connections';
import { BaseOptions, Component, InitElements, MElement } from '../../src/component';

export type GanttView = 'day' | 'week';
export type GanttTone = 'primary' | 'secondary' | 'tertiary' | 'error';
export type GanttEditAction = 'move' | 'resize-start' | 'resize-end';

export interface GanttDependencyChange {
  from: string;
  to: string;
  action: 'add' | 'remove';
}

export interface GanttTaskChange {
  task: GanttTask;
  previousTask: GanttTask;
  action: GanttEditAction;
}

/** Custom color regions up to 100%; overruns always use the critical region. */
export interface GanttProgressMeter {
  low: number;
  high: number;
  /** Defaults to 100: higher completion is better. */
  optimum?: number;
  optimalColor?: string;
  suboptimalColor?: string;
  criticalColor?: string;
}

export interface GanttTask {
  id: string;
  name: string;
  /** Calendar dates in YYYY-MM-DD format. The end date is inclusive. */
  start: string;
  end: string;
  /** Non-negative percentage. Values above 100 indicate an overrun. */
  progress?: number;
  /** Any CSS color, including a theme variable. Overrides meter colors. */
  progressColor?: string;
  progressMeter?: GanttProgressMeter;
  /** Optional secondary label, such as a person or department. */
  detail?: string;
  tone?: GanttTone;
  /** A milestone must have the same start and end date. */
  milestone?: boolean;
  /** Upstream task IDs. Links propagate moves; they impose no date ordering. */
  dependencies?: string[];
}

export interface GanttOptions extends BaseOptions {
  tasks: GanttTask[];
  view: GanttView;
  locale: string;
  label: string;
  emptyText: string;
  showToday: boolean;
  editable: boolean;
  /** Show direct connection and removal controls while editable. */
  connectable: boolean;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  onTaskClick: ((task: GanttTask, event: MouseEvent) => void) | null;
  /** Called once after a pointer or keyboard edit commits, with independent copies. */
  onTaskChange: ((change: GanttTaskChange) => void) | null;
  onSelectionChange: ((taskIds: string[]) => void) | null;
  onDependencyChange: ((change: GanttDependencyChange) => void) | null;
}

const DAY = 86400000;
let nextGanttId = 0;
interface GanttDrag {
  pointerId: number;
  previousTask: GanttTask;
  task: GanttTask;
  previousTasks: GanttTask[];
  tasks: GanttTask[];
  downstream: Set<string>;
  action: GanttEditAction;
  anchorDay: number;
  clientX: number;
  startX: number;
  moved: boolean;
}

/** Calendar arithmetic uses UTC so daylight-saving changes never shift a bar. */
function dateNumber(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Gantt dates must use YYYY-MM-DD.');
  }
  const result = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid Gantt date: ${value}`);
  }
  return result / DAY;
}

function todayNumber(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY;
}

function copyTask(task: GanttTask): GanttTask {
  return { ...task, ...(task.progressMeter ? { progressMeter: { ...task.progressMeter } } : {}),
    ...(task.dependencies ? { dependencies: [...task.dependencies] } : {}) };
}

function progressRegion(task: GanttTask): 'low' | 'optimal' | 'suboptimal' | 'critical' {
  const value = task.progress ?? 0;
  if (value > 100) return 'critical';
  const meter = task.progressMeter;
  if (!meter) return value < 30 ? 'low' : value < 90 ? 'optimal' : 'suboptimal';
  const optimum = meter.optimum ?? 100;
  if (optimum < meter.low) return value <= meter.low ? 'optimal' : value <= meter.high ? 'suboptimal' : 'critical';
  if (optimum > meter.high) return value >= meter.high ? 'optimal' : value >= meter.low ? 'suboptimal' : 'critical';
  return value >= meter.low && value <= meter.high ? 'optimal' : 'suboptimal';
}

function validateTasks(tasks: GanttTask[]): GanttTask[] {
  if (!Array.isArray(tasks)) throw new Error('Gantt tasks must be an array.');
  const ids = new Set<string>();
  let first = Infinity, last = -Infinity;
  const copy = tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id)) {
      throw new Error('Gantt tasks require unique, non-empty string IDs.');
    }
    ids.add(task.id);
    if (typeof task.name !== 'string' || !task.name.trim()) throw new Error('Gantt tasks require a name.');
    const start = dateNumber(task.start), end = dateNumber(task.end);
    if (end < start) throw new Error('Gantt end dates must be on or after start dates.');
    if (task.milestone && start !== end) throw new Error('A Gantt milestone must occupy one date.');
    if (task.progress !== undefined && (!Number.isFinite(task.progress) || task.progress < 0)) {
      throw new Error('Gantt progress must be a finite, non-negative number.');
    }
    if (task.tone !== undefined && !['primary', 'secondary', 'tertiary', 'error'].includes(task.tone)) {
      throw new Error('Invalid Gantt tone.');
    }
    if (task.dependencies !== undefined && (!Array.isArray(task.dependencies) || task.dependencies.some(id => typeof id !== 'string') || new Set(task.dependencies).size !== task.dependencies.length)) {
      throw new Error('Gantt dependencies must be an array of unique task IDs.');
    }
    const meter = task.progressMeter;
    if (meter !== undefined && (!meter || ![meter.low, meter.high, meter.optimum ?? 100].every(value => Number.isFinite(value) && value >= 0 && value <= 100) || meter.low > meter.high)) {
      throw new Error('Gantt meter thresholds must be between 0 and 100, with low <= high.');
    }
    for (const color of [task.progressColor, meter?.optimalColor, meter?.suboptimalColor, meter?.criticalColor]) {
      if (color !== undefined && (typeof color !== 'string' || !CSS.supports('color', color))) throw new Error('Gantt progress colors must be valid CSS colors.');
    }
    first = Math.min(first, start);
    last = Math.max(last, end);
    return copyTask(task);
  });
  if (last - first > 3660) throw new Error('A Gantt timeline can span at most 3661 calendar days.');
  const successors = new Map(copy.map(task => [task.id, [] as string[]]));
  const indegree = new Map(copy.map(task => [task.id, task.dependencies?.length || 0]));
  for (const task of copy) {
    for (const id of task.dependencies || []) {
      if (!ids.has(id) || id === task.id) throw new Error('Gantt dependencies must reference another existing task.');
      successors.get(id).push(task.id);
    }
  }
  const ready = copy.filter(task => !indegree.get(task.id)).map(task => task.id);
  for (let i = 0; i < ready.length; i++) {
    for (const id of successors.get(ready[i])) {
      indegree.set(id, indegree.get(id) - 1);
      if (!indegree.get(id)) ready.push(id);
    }
  }
  if (ready.length !== copy.length) throw new Error('Gantt dependencies cannot contain a cycle.');
  return copy;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Material-themed, horizontally scrollable calendar timeline. */
export class Gantt extends Component<GanttOptions> {
  private _tasks: GanttTask[];
  private _view: GanttView;
  private _start = 0;
  private _end = 0;
  private _dayWidth = 48;
  private _viewport: HTMLElement;
  private _original: DocumentFragment;
  private _hadClass: boolean;
  private _zoom: number;
  private _drag: GanttDrag | null = null;
  private _scrollFrame = 0;
  private _suppressClick = false;
  private _announcement: HTMLElement;
  private _originalClasses: string[];
  private _selected = new Set<string>();
  private _selectionAnchor: string | undefined;
  private _arrowId = `gantt-dependency-arrow-${++nextGanttId}`;
  private _resizeObserver: ResizeObserver;
  private _connections: ReturnType<typeof enableGanttConnections>;

  constructor(el: HTMLElement, options: Partial<GanttOptions> = {}) {
    // Validate before replacing a previously initialized chart.
    const settings = { ...Gantt.defaults, ...options };
    const tasks = validateTasks(settings.tasks);
    Gantt.validateView(settings.view);
    if (![settings.zoom, settings.minZoom, settings.maxZoom].every(value => Number.isFinite(value) && value > 0)
      || settings.minZoom > settings.maxZoom) throw new Error('Gantt zoom values must be positive, with minZoom <= maxZoom.');
    new Intl.DateTimeFormat(settings.locale);
    super(el, options, Gantt);
    this.options = settings;
    this._tasks = tasks;
    this._view = settings.view;
    this._zoom = Math.max(settings.minZoom, Math.min(settings.maxZoom, settings.zoom));
    this._hadClass = el.classList.contains('gantt');
    this._originalClasses = ['gantt-editable', 'gantt-dragging'].filter(name => el.classList.contains(name));
    this._original = document.createDocumentFragment();
    while (el.firstChild) this._original.append(el.firstChild);
    el.classList.add('gantt');
    this._viewport = element('div', 'gantt-viewport');
    this._viewport.tabIndex = 0;
    this._viewport.setAttribute('role', 'region');
    this._viewport.setAttribute('aria-label', settings.label);
    this._viewport.addEventListener('click', this._handleClick);
    this._viewport.addEventListener('pointerdown', this._handlePointerDown);
    this._viewport.addEventListener('pointermove', this._handlePointerMove);
    this._viewport.addEventListener('pointerup', this._handlePointerUp);
    this._viewport.addEventListener('pointercancel', this._handlePointerCancel);
    this._viewport.addEventListener('lostpointercapture', this._handlePointerCancel);
    this._viewport.addEventListener('keydown', this._handleKeyDown);
    window.addEventListener('blur', this._cancelDrag);
    this._announcement = element('div', 'gantt-announcement');
    this._announcement.setAttribute('role', 'status');
    this._announcement.setAttribute('aria-atomic', 'true');
    el.append(this._viewport, this._announcement);
    this._resizeObserver = new ResizeObserver(() => this._drawDependencies());
    this._connections = enableGanttConnections(this._viewport,
      () => this.options.editable && this.options.connectable && !this._drag,
      (from, to) => {
        if (from === to || this._tasks.find(task => task.id === to)?.dependencies?.includes(from)) return false;
        const next = this.getTasks(), target = next.find(task => task.id === to);
        if (!target) return false;
        target.dependencies = [...(target.dependencies || []), from];
        try { validateTasks(next); return true; } catch { return false; }
      },
      (from, to) => this.addDependency(from, to),
      (from, to) => this.removeDependency(from, to),
      message => { this._announcement.textContent = message; });
    el['M_Gantt'] = this;
    this._render();
  }

  static get defaults(): GanttOptions {
    return { tasks: [], view: 'day', locale: 'en', label: 'Project timeline', emptyText: 'No tasks scheduled.', showToday: true,
      editable: false, connectable: true, zoom: 1, minZoom: 0.5, maxZoom: 3, onTaskClick: null, onTaskChange: null, onSelectionChange: null, onDependencyChange: null };
  }

  static init(el: HTMLElement, options?: Partial<GanttOptions>): Gantt;
  static init(els: InitElements<MElement>, options?: Partial<GanttOptions>): Gantt[];
  static init(els: HTMLElement | InitElements<MElement>, options: Partial<GanttOptions> = {}): Gantt | Gantt[] {
    return super.init(els, options, Gantt);
  }

  static getInstance(el: HTMLElement): Gantt { return el['M_Gantt']; }

  private static validateView(view: GanttView): void {
    if (view !== 'day' && view !== 'week') throw new Error('Gantt view must be day or week.');
  }

  /** Returns a copy; mutate it and call setTasks to update the chart. */
  getTasks(): GanttTask[] { return this._tasks.map(copyTask); }

  /** Add an upstream → downstream link without rescheduling either task. */
  addDependency(from: string, to: string): void {
    const next = this.getTasks(), target = next.find(task => task.id === to);
    if (!target || !next.some(task => task.id === from)) throw new Error('Gantt dependencies require existing task IDs.');
    if (target.dependencies?.includes(from)) return;
    target.dependencies = [...(target.dependencies || []), from];
    this.setTasks(next);
    this.options.onDependencyChange?.({ from, to, action: 'add' });
  }

  removeDependency(from: string, to: string): void {
    const next = this.getTasks(), target = next.find(task => task.id === to);
    if (!target || !next.some(task => task.id === from)) throw new Error('Gantt dependencies require existing task IDs.');
    if (!target.dependencies?.includes(from)) return;
    target.dependencies = target.dependencies.filter(id => id !== from);
    this.setTasks(next);
    this.options.onDependencyChange?.({ from, to, action: 'remove' });
  }

  setTasks(tasks: GanttTask[]): void {
    const next = validateTasks(tasks);
    this._cancelDrag();
    this._tasks = next;
    const remaining = new Set(next.map(task => task.id));
    const removed = [...this._selected].some(id => !remaining.has(id));
    this._selected = new Set([...this._selected].filter(id => remaining.has(id)));
    this._render();
    if (removed) this.options.onSelectionChange?.(this.getSelectedTaskIds());
  }

  getSelectedTaskIds(): string[] { return this._tasks.filter(task => this._selected.has(task.id)).map(task => task.id); }

  setSelectedTaskIds(ids: string[]): void {
    if (!Array.isArray(ids) || ids.some(id => !this._tasks.some(task => task.id === id))) throw new Error('Gantt selection must contain existing task IDs.');
    this._cancelDrag();
    const next = new Set(ids);
    const changed = next.size !== this._selected.size || [...next].some(id => !this._selected.has(id));
    this._selected = next;
    this._selectionAnchor = ids[0];
    if (changed) {
      this._render();
      this.options.onSelectionChange?.(this.getSelectedTaskIds());
    }
  }

  private _selectForInteraction(id: string, event: MouseEvent): void {
    const anchor = this._selectionAnchor;
    if (event.shiftKey && anchor && this._tasks.some(task => task.id === anchor)) {
      const from = this._tasks.findIndex(task => task.id === anchor), to = this._tasks.findIndex(task => task.id === id);
      this.setSelectedTaskIds(this._tasks.slice(Math.min(from, to), Math.max(from, to) + 1).map(task => task.id));
      this._selectionAnchor = anchor;
    } else if (event.ctrlKey || event.metaKey) {
      this.setSelectedTaskIds(this._selected.has(id) ? this.getSelectedTaskIds().filter(item => item !== id) : [...this.getSelectedTaskIds(), id]);
      this._selectionAnchor = id;
    } else if (!this._selected.has(id)) this.setSelectedTaskIds([id]);
  }

  getView(): GanttView { return this._view; }

  setView(view: GanttView): void {
    Gantt.validateView(view);
    this._cancelDrag();
    const visibleDay = this._start + this._viewport.scrollLeft / this._dayWidth;
    this._view = view;
    this._render();
    this._viewport.scrollLeft = (visibleDay - this._start) * this._dayWidth;
  }

  isEditable(): boolean { return this.options.editable; }

  setEditable(editable: boolean): void {
    this._cancelDrag();
    this.options.editable = !!editable;
    this._render();
  }

  getZoom(): number { return this._zoom; }

  /** Scale calendar columns, preserving the date at the center of the viewport. */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) throw new Error('Gantt zoom must be a positive number.');
    this._cancelDrag();
    const offset = Math.max(0, (this._viewport.clientWidth - this._labelWidth()) / 2);
    const centerDay = this._start + (this._viewport.scrollLeft + offset) / this._dayWidth;
    this._zoom = Math.max(this.options.minZoom, Math.min(this.options.maxZoom, zoom));
    this._render();
    this._viewport.scrollLeft = (centerDay - this._start) * this._dayWidth - offset;
  }

  resetZoom(): void { this.setZoom(1); }

  /** Scroll to a calendar date, or to the user's local today when omitted. */
  scrollToDate(date?: string): void {
    const day = date === undefined ? todayNumber() : dateNumber(date);
    this._viewport.scrollLeft = Math.max(0, (day - this._start - 1) * this._dayWidth);
  }

  destroy(): void {
    this._connections.destroy();
    this._finishDrag();
    this._resizeObserver.disconnect();
    this._viewport.removeEventListener('click', this._handleClick);
    this._viewport.removeEventListener('pointerdown', this._handlePointerDown);
    this._viewport.removeEventListener('pointermove', this._handlePointerMove);
    this._viewport.removeEventListener('pointerup', this._handlePointerUp);
    this._viewport.removeEventListener('pointercancel', this._handlePointerCancel);
    this._viewport.removeEventListener('lostpointercapture', this._handlePointerCancel);
    this._viewport.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('blur', this._cancelDrag);
    this.el.replaceChildren(this._original);
    this.el.classList.toggle('gantt', this._hadClass);
    for (const name of ['gantt-editable', 'gantt-dragging']) this.el.classList.toggle(name, this._originalClasses.includes(name));
    delete this.el['M_Gantt'];
  }

  private _handleClick = (event: MouseEvent): void => {
    if (this._suppressClick && event.detail !== 0) { event.preventDefault(); return; }
    const selector = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-gantt-select]') : null;
    if (selector) {
      const id = selector.dataset.ganttSelect;
      this.setSelectedTaskIds(this._selected.has(id) ? this.getSelectedTaskIds().filter(item => item !== id) : [...this.getSelectedTaskIds(), id]);
      this._selectionAnchor = id;
      return;
    }
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-gantt-task]') : null;
    if (target?.dataset.ganttEdge) return;
    const task = target && this._tasks.find(item => item.id === target.dataset.ganttTask);
    if (task) {
      if (this.options.editable && event.detail === 0) this._selectForInteraction(task.id, event);
      this.options.onTaskClick?.(copyTask(task), event);
    }
  };

  private _labelWidth(): number {
    return this._viewport.querySelector('.gantt-label')?.getBoundingClientRect().width || 0;
  }

  private _pointerDay(clientX: number): number {
    return this._start + (this._viewport.scrollLeft + clientX - this._viewport.getBoundingClientRect().left - this._labelWidth()) / this._dayWidth;
  }

  private _handlePointerDown = (event: PointerEvent): void => {
    this._suppressClick = false;
    if (!this.options.editable || this._drag || event.button !== 0 || !event.isPrimary) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-gantt-task]') : null;
    const task = target && this._tasks.find(item => item.id === target.dataset.ganttTask);
    if (!task) return;
    target.focus({ preventScroll: true });
    this._selectForInteraction(task.id, event);
    if (event.ctrlKey || event.metaKey || event.shiftKey) { this._suppressClick = true; return; }
    const action = (target.dataset.ganttEdge as GanttEditAction) || 'move';
    const { previousTasks, downstream } = this._editContext(action);
    this._drag = {
      pointerId: event.pointerId, previousTask: copyTask(task), task: copyTask(task),
      previousTasks, tasks: previousTasks.map(copyTask), downstream, action,
      anchorDay: this._pointerDay(event.clientX), clientX: event.clientX, startX: event.clientX, moved: false
    };
    this._viewport.setPointerCapture(event.pointerId);
  };

  private _handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this._drag?.pointerId) return;
    this._drag.clientX = event.clientX;
    if (Math.abs(event.clientX - this._drag.startX) >= 4) this._drag.moved = true;
    if (!this._drag.moved) return;
    event.preventDefault();
    this._previewDrag();
    if (!this._scrollFrame) this._scrollFrame = requestAnimationFrame(this._autoScroll);
  };

  private _previewDrag(): void {
    const drag = this._drag;
    if (!drag) return;
    const tasks = this._editedTasks(drag.previousTasks, drag.action, Math.round(this._pointerDay(drag.clientX) - drag.anchorDay), drag.downstream);
    if (!tasks || tasks.every((task, index) => task.start === drag.tasks[index].start && task.end === drag.tasks[index].end)) return;
    drag.tasks = tasks;
    const task = tasks.find(item => item.id === drag.previousTask.id);
    drag.task = task;
    this._renderKeepingDate();
    this._announcement.textContent = `${tasks.length > 1 ? `${tasks.length} affected tasks · ` : ''}${task.name}: ${task.start} – ${task.end}`;
  }

  private _autoScroll = (): void => {
    this._scrollFrame = 0;
    const drag = this._drag;
    if (!drag?.moved) return;
    const rect = this._viewport.getBoundingClientRect();
    const left = rect.left + this._labelWidth() + 28, right = rect.right - 28;
    const distance = drag.clientX < left ? drag.clientX - left : drag.clientX > right ? drag.clientX - right : 0;
    if (distance) {
      this._viewport.scrollLeft += Math.sign(distance) * Math.min(16, Math.abs(distance));
      this._previewDrag();
    }
    this._scrollFrame = requestAnimationFrame(this._autoScroll);
  };

  private _handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._drag?.pointerId) return;
    const drag = this._drag;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-gantt-task]') : null;
    // Captured pointer events target the viewport; click selection is handled below.
    this._finishDrag();
    if (drag.moved) {
      this._suppressClick = true;
      this._commitEdits(drag.previousTasks, drag.tasks, drag.action);
    } else if (!target && drag.action === 'move') {
      this.options.onTaskClick?.(copyTask(drag.previousTask), event);
      this._suppressClick = true;
    }
  };

  private _handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this._drag?.pointerId) this._cancelDrag();
  };

  private _finishDrag(): void {
    const pointerId = this._drag?.pointerId;
    this._drag = null;
    cancelAnimationFrame(this._scrollFrame);
    this._scrollFrame = 0;
    if (pointerId !== undefined && this._viewport.hasPointerCapture(pointerId)) this._viewport.releasePointerCapture(pointerId);
    this.el.classList.remove('gantt-dragging');
  }

  private _cancelDrag = (): void => {
    if (!this._drag) return;
    this._suppressClick = this._drag.moved;
    this._finishDrag();
    this._renderKeepingDate();
    this._announcement.textContent = 'Edit canceled.';
  };

  private _editedTask(previous: GanttTask, action: GanttEditAction, delta: number): GanttTask | null {
    let start = dateNumber(previous.start), end = dateNumber(previous.end);
    if (action === 'move') { start += delta; end += delta; }
    if (action === 'resize-start') start = Math.min(start + delta, end);
    if (action === 'resize-end') end = Math.max(start, end + delta);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < dateNumber('0000-01-01') || end > dateNumber('9999-12-31')) return null;
    return { ...previous, start: new Date(start * DAY).toISOString().slice(0, 10), end: new Date(end * DAY).toISOString().slice(0, 10) };
  }

  private _editContext(action: GanttEditAction): { previousTasks: GanttTask[]; downstream: Set<string> } {
    const affected = new Set(this._selected), downstream = new Set<string>();
    if (action === 'move') {
      const successors = new Map(this._tasks.map(task => [task.id, [] as string[]]));
      for (const task of this._tasks) for (const id of task.dependencies || []) successors.get(id).push(task.id);
      const queue = [...affected];
      for (let i = 0; i < queue.length; i++) {
        for (const id of successors.get(queue[i])) {
          downstream.add(id);
          if (!affected.has(id)) { affected.add(id); queue.push(id); }
        }
      }
    }
    return { previousTasks: this._tasks.filter(task => affected.has(task.id)).map(copyTask), downstream };
  }

  private _editedTasks(previous: GanttTask[], action: GanttEditAction, delta: number, downstream = new Set<string>()): GanttTask[] | null {
    const resizable = previous.filter(task => !task.milestone);
    if (action !== 'move' && resizable.length) {
      const shortest = Math.min(...resizable.map(task => dateNumber(task.end) - dateNumber(task.start)));
      delta = action === 'resize-start' ? Math.min(delta, shortest) : Math.max(delta, -shortest);
    }
    const tasks = previous.map(task => {
      if (action !== 'move' && task.milestone) return copyTask(task);
      if (action === 'move' && downstream.has(task.id) && (task.progress ?? 0) > 0) {
        // Started work keeps its actual start, even if selected along with its predecessor.
        // A started milestone is a fixed point; its downstream tasks still receive the move.
        return task.milestone || delta <= 0 ? copyTask(task) : this._editedTask(task, 'resize-end', delta);
      }
      return this._editedTask(task, action, delta);
    });
    if (tasks.some(task => !task)) return null;
    const replacements = new Map(tasks.map(task => [task.id, task]));
    try { validateTasks(this._tasks.map(task => replacements.get(task.id) || task)); }
    catch { return null; }
    return tasks;
  }

  private _commitEdits(previousTasks: GanttTask[], tasks: GanttTask[], action: GanttEditAction): void {
    const changes = tasks.flatMap((task, index) => {
      const previousTask = previousTasks[index];
      const actualAction: GanttEditAction = action === 'move' && task.start === previousTask.start ? 'resize-end' : action;
      return task.start === previousTask.start && task.end === previousTask.end ? [] : [{ task: copyTask(task), previousTask: copyTask(previousTask), action: actualAction }];
    });
    const replacements = new Map(changes.map(change => [change.task.id, copyTask(change.task)]));
    this._tasks = this._tasks.map(task => replacements.get(task.id) || task);
    this._renderKeepingDate();
    if (changes.length) {
      const task = changes[0].task;
      this._announcement.textContent = changes.length > 1 ? `${changes.length} tasks updated.` : `${task.name}: ${task.start} – ${task.end}`;
      for (const change of changes) this.options.onTaskChange?.(change);
    }
  }

  private _handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this._drag) { event.preventDefault(); this._cancelDrag(); return; }
    if (!this.options.editable || this._drag || event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-gantt-task]') : null;
    const previous = target && this._tasks.find(item => item.id === target.dataset.ganttTask);
    if (!previous) return;
    event.preventDefault();
    if (!this._selected.has(previous.id)) this.setSelectedTaskIds([previous.id]);
    const action = (target.dataset.ganttEdge || (event.shiftKey && !previous.milestone ? 'resize-end' : 'move')) as GanttEditAction;
    const { previousTasks, downstream } = this._editContext(action);
    const tasks = this._editedTasks(previousTasks, action, event.key === 'ArrowRight' ? 1 : -1, downstream);
    if (tasks) this._commitEdits(previousTasks, tasks, action);
  };

  private _renderKeepingDate(): void {
    const day = this._start + this._viewport.scrollLeft / this._dayWidth;
    this._render();
    this._viewport.scrollLeft = (day - this._start) * this._dayWidth;
  }

  private _format(day: number, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.options.locale, { ...options, timeZone: 'UTC' }).format(new Date(day * DAY));
  }

  /** Measure actual row heights so connectors follow wrapping labels and responsive layouts. */
  private _drawDependencies(): void {
    const table = this._viewport.querySelector<HTMLElement>('.gantt-table');
    if (!table) return;
    const focusedRemove = table.contains(document.activeElement) && document.activeElement?.classList.contains('gantt-link-remove')
      ? { ...(document.activeElement as HTMLElement).dataset } : undefined;
    table.querySelector('.gantt-dependencies')?.remove();
    const tasks = this._drag?.tasks.length
      ? this._tasks.map(task => this._drag.tasks.find(item => item.id === task.id) || task) : this._tasks;
    if (!tasks.some(task => task.dependencies?.length)) return;
    const rect = table.getBoundingClientRect(), labelWidth = this._labelWidth();
    if (!rect.width || !rect.height) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('gantt-dependencies');
    const editable = this.options.editable && this.options.connectable;
    if (!editable) svg.setAttribute('aria-hidden', 'true');
    else { svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', 'Task dependencies'); }
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', String(rect.width - labelWidth));
    svg.setAttribute('height', String(rect.height));
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.id = this._arrowId;
    for (const [name, value] of Object.entries({ markerWidth: '6', markerHeight: '6', refX: '5', refY: '3', orient: 'auto', viewBox: '0 0 6 6' })) marker.setAttribute(name, value);
    const arrow = document.createElementNS(ns, 'path');
    arrow.setAttribute('d', 'M 0 0 L 6 3 L 0 6 Z');
    arrow.setAttribute('fill', 'currentColor');
    marker.append(arrow); defs.append(marker); svg.append(defs);
    const bars = new Map(Array.from(table.querySelectorAll<HTMLElement>('.gantt-bar')).map(bar => [bar.dataset.ganttTask, bar.getBoundingClientRect()]));
    for (const task of tasks) {
      const to = bars.get(task.id);
      for (const id of task.dependencies || []) {
        const from = bars.get(id);
        if (!from || !to) continue;
        const x1 = from.right - rect.left - labelWidth + 2, y1 = from.top + from.height / 2 - rect.top;
        const x2 = to.left - rect.left - labelWidth - 3, y2 = to.top + to.height / 2 - rect.top;
        const path = document.createElementNS(ns, 'path');
        path.classList.add('gantt-dependency');
        path.dataset.from = id; path.dataset.to = task.id;
        // Route overlapping schedules through the gap below the source row.
        const lane = y1 + (y2 >= y1 ? 1 : -1) * (from.height / 2 + 16);
        const d = x2 > x1 + 24
          ? `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`
          : `M ${x1} ${y1} H ${x1 + 12} V ${lane} H ${x2 - 12} V ${y2} H ${x2}`;
        path.setAttribute('d', d);
        path.setAttribute('marker-end', `url(#${this._arrowId})`);
        const group = document.createElementNS(ns, 'g');
        group.classList.add('gantt-dependency-link');
        path.setAttribute('aria-hidden', 'true');
        group.append(path);
        if (editable) {
          const hit = document.createElementNS(ns, 'path');
          hit.classList.add('gantt-dependency-hit'); hit.setAttribute('d', d); hit.setAttribute('aria-hidden', 'true');
          group.append(hit);
          const control = document.createElementNS(ns, 'foreignObject');
          const x = (x1 + x2) / 2;
          const y = x2 > x1 + 24 ? (y1 + y2) / 2 : lane;
          control.setAttribute('x', String(x - 16)); control.setAttribute('y', String(y - 16));
          control.setAttribute('width', '32'); control.setAttribute('height', '32');
          control.classList.add('gantt-link-control');
          const remove = element('button', 'gantt-link-remove', '×') as HTMLButtonElement;
          remove.type = 'button'; remove.dataset.ganttDisconnect = ''; remove.dataset.from = id; remove.dataset.to = task.id;
          remove.setAttribute('aria-label', `Disconnect ${tasks.find(item => item.id === id).name} from ${task.name}`);
          remove.title = remove.getAttribute('aria-label');
          control.append(remove); group.append(control);
        }
        svg.append(group);
      }
    }
    table.append(svg);
    if (focusedRemove) {
      Array.from(svg.querySelectorAll<HTMLButtonElement>('.gantt-link-remove'))
        .find(button => button.dataset.from === focusedRemove.from && button.dataset.to === focusedRemove.to)?.focus({ preventScroll: true });
    }
  }

  private _render(): void {
    this._connections.cancel();
    const scroll = this._viewport.scrollLeft;
    const focusId = this._viewport.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)?.dataset.ganttTask : undefined;
    const focusEdge = (document.activeElement as HTMLElement)?.dataset.ganttEdge;
    const focusSelect = (document.activeElement as HTMLElement)?.dataset.ganttSelect;
    const focusConnect = (document.activeElement as HTMLElement)?.dataset.ganttConnect;
    const focusLink = this._viewport.contains(document.activeElement) && document.activeElement?.classList.contains('gantt-link-remove')
      ? { ...(document.activeElement as HTMLElement).dataset } : undefined;
    this.el.classList.toggle('gantt-editable', this.options.editable);
    this.el.classList.toggle('gantt-dragging', !!this._drag?.moved);
    this._resizeObserver.disconnect();
    this._viewport.replaceChildren();
    if (!this._tasks.length) {
      const empty = element('p', 'gantt-empty', this.options.emptyText);
      empty.setAttribute('role', 'status');
      this._viewport.append(empty);
      return;
    }
    const previews = new Map(this._drag?.tasks.map(task => [task.id, task]) || []);
    const tasks = this._tasks.map(task => previews.get(task.id) || task);
    const taskNames = new Map(tasks.map(task => [task.id, task.name]));
    const start = Math.min(...tasks.map(task => dateNumber(task.start))) - 2;
    this._dayWidth = (this._view === 'day' ? 48 : 16) * this._zoom;
    const trailing = this.options.editable && this.options.connectable ? Math.max(3, Math.ceil(40 / this._dayWidth) + 1) : 3;
    const end = Math.max(...tasks.map(task => dateNumber(task.end))) + trailing;
    // Keep the calendar stable during a gesture, extending it when needed.
    this._start = this._drag ? Math.min(start, this._start) : start;
    this._end = this._drag ? Math.max(end, this._end) : end;
    if (this._view === 'week') {
      this._start -= (new Date(this._start * DAY).getUTCDay() + 6) % 7;
      this._end += (7 - (this._end - this._start) % 7) % 7;
    }
    this._dayWidth = (this._view === 'day' ? 48 : 16) * this._zoom;
    const days = this._end - this._start;
    const table = element('div', 'gantt-table');
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', this.options.label);
    table.style.setProperty('--gantt-timeline-width', `${days * this._dayWidth}px`);
    table.style.setProperty('--gantt-day-width', `${this._dayWidth}px`);
    const header = element('div', 'gantt-row gantt-header');
    header.setAttribute('role', 'row');
    const heading = element('div', 'gantt-label', this.options.label);
    heading.setAttribute('role', 'columnheader');
    const calendar = element('div', 'gantt-calendar');
    calendar.setAttribute('role', 'columnheader');
    calendar.setAttribute('aria-label', `${this._format(this._start, { dateStyle: 'long' })} – ${this._format(this._end - 1, { dateStyle: 'long' })}`);
    const months = element('div', 'gantt-months');
    months.setAttribute('aria-hidden', 'true');
    let monthStart = this._start;
    for (let day = this._start + 1; day <= this._end; day++) {
      if (day === this._end || new Date(day * DAY).getUTCDate() === 1) {
        const month = element('span', 'gantt-month', this._format(monthStart, { month: 'short', year: 'numeric' }));
        month.style.width = `${(day - monthStart) * this._dayWidth}px`;
        months.append(month);
        monthStart = day;
      }
    }
    const ticks = element('div', 'gantt-ticks');
    ticks.setAttribute('aria-hidden', 'true');
    const step = this._view === 'day' ? (this._dayWidth < 36 ? 2 : 1) : 7;
    const today = todayNumber();
    for (let day = this._start; day < this._end; day += step) {
      const tick = element('span', 'gantt-tick');
      tick.style.width = `${Math.min(step, this._end - day) * this._dayWidth}px`;
      tick.classList.toggle('is-today', this.options.showToday && today >= day && today < day + step);
      tick.append(element('span', '', this._format(day, this._view === 'day' ? { weekday: 'short' } : { month: 'short' })));
      tick.append(element('strong', '', this._format(day, { day: 'numeric' })));
      ticks.append(tick);
    }
    calendar.append(months, ticks);
    header.append(heading, calendar);
    table.append(header);
    for (const task of tasks) {
      const row = element('div', 'gantt-row');
      row.classList.toggle('is-selected', this._selected.has(task.id));
      row.setAttribute('role', 'row');
      const label = element('div', 'gantt-label');
      label.setAttribute('role', 'rowheader');
      if (this.options.editable) {
        label.classList.add('gantt-selectable-label');
        const select = element('input', 'gantt-select') as HTMLInputElement;
        select.type = 'checkbox';
        select.dataset.ganttSelect = task.id;
        select.setAttribute('aria-label', `Select ${task.name}`);
        select.checked = this._selected.has(task.id);
        label.append(select);
      }
      label.append(element('span', 'gantt-task-name', task.name));
      if (task.detail) label.append(element('span', 'gantt-task-detail', task.detail));
      const dependencyNames = task.dependencies?.map(id => taskNames.get(id)).join(', ');
      if (dependencyNames) {
        const caption = element('span', 'gantt-dependency-caption', 'Linked from: ');
        for (const id of task.dependencies) {
          const chip = element('span', 'gantt-dependency-chip', taskNames.get(id));
          if (this.options.editable && this.options.connectable) {
            const remove = element('button', 'gantt-disconnect', '×') as HTMLButtonElement;
            remove.type = 'button'; remove.dataset.ganttDisconnect = ''; remove.dataset.from = id; remove.dataset.to = task.id;
            remove.setAttribute('aria-label', `Disconnect ${taskNames.get(id)} from ${task.name}`);
            remove.title = remove.getAttribute('aria-label'); chip.append(remove);
          }
          caption.append(chip);
        }
        label.append(caption);
      }
      const value = task.progress ?? 0;
      const overrun = !task.milestone && value > 100 ? `${Number((value - 100).toPrecision(12))}% over expected` : '';
      if (overrun) label.append(element('span', 'gantt-overrun-text', `${value}% · ${overrun}`));
      const track = element('div', 'gantt-track');
      track.setAttribute('role', 'cell');
      const weekendOffset = (6 - new Date(this._start * DAY).getUTCDay() + 7) % 7;
      track.style.setProperty('--gantt-weekend-offset', `${weekendOffset * this._dayWidth}px`);
      const bar = element('button', 'gantt-bar') as HTMLButtonElement;
      bar.type = 'button';
      bar.dataset.ganttTask = task.id;
      bar.dataset.tone = task.tone || 'primary';
      bar.classList.toggle('is-milestone', !!task.milestone);
      const start = dateNumber(task.start), end = dateNumber(task.end);
      bar.style.left = `${(start - this._start) * this._dayWidth + (task.milestone ? this._dayWidth / 2 : 3)}px`;
      if (!task.milestone) bar.style.width = `${(end - start + 1) * this._dayWidth - 6}px`;
      const dateLabel = this._format(start, { dateStyle: 'medium' }) + (task.milestone ? '' : ` – ${this._format(end, { dateStyle: 'medium' })}`);
      const region = task.milestone ? null : progressRegion(task);
      bar.setAttribute('aria-label', `${task.name}${task.detail ? `, ${task.detail}` : ''}, ${dateLabel}, ${task.milestone ? 'milestone' : `${value}% progress`}${overrun ? `, ${overrun}` : ''}${region ? `, ${region} range` : ''}`);
      if (dependencyNames) bar.setAttribute('aria-label', `${bar.getAttribute('aria-label')}, linked from ${dependencyNames}`);
      bar.title = bar.getAttribute('aria-label');
      if (this.options.editable) {
        bar.setAttribute('aria-description', task.milestone ? 'Drag or use Left and Right arrows to move by one day.' : 'Drag or use Left and Right arrows to move by one day. Shift and arrow resizes the end. Use the start and end handles to resize. Escape cancels a drag.');
      }
      if (!task.milestone) {
        const progress = element('span', 'gantt-progress');
        progress.style.width = `${Math.min(100, value)}%`;
        if (region) progress.dataset.progressRegion = region;
        const progressColor = task.progressColor || (region && region !== 'low' && task.progressMeter?.[`${region}Color`]);
        if (progressColor) progress.style.setProperty('--gantt-progress-color', progressColor);
        progress.setAttribute('aria-hidden', 'true');
        const text = element('span', 'gantt-bar-text', task.name);
        text.setAttribute('aria-hidden', 'true');
        bar.append(progress, text);
      }
      const group = element('div', 'gantt-task');
      group.append(bar);
      if (this.options.editable && !task.milestone) {
        for (const edge of ['start', 'end'] as const) {
          const handle = element('button', `gantt-resize gantt-resize-${edge}`) as HTMLButtonElement;
          handle.type = 'button';
          handle.dataset.ganttTask = task.id;
          handle.dataset.ganttEdge = `resize-${edge}`;
          handle.setAttribute('aria-label', `Resize ${edge} of ${task.name}: ${task[edge]}`);
          handle.setAttribute('aria-description', 'Drag or use Left and Right arrows to change the date by one day. Escape cancels a drag.');
          handle.title = handle.getAttribute('aria-label');
          handle.style.left = `${edge === 'start' ? (start - this._start) * this._dayWidth - 9 : (start - this._start) * this._dayWidth + 3 + Math.max(8, (end - start + 1) * this._dayWidth - 6) - 12}px`;
          group.append(handle);
        }
      }
      if (this.options.editable && this.options.connectable) {
        const port = element('button', 'gantt-connect-port') as HTMLButtonElement;
        const icon = element('i', 'material-icons', 'add');
        icon.setAttribute('aria-hidden', 'true'); port.append(icon);
        port.type = 'button'; port.dataset.ganttConnect = task.id;
        port.setAttribute('aria-label', `Connect ${task.name} to a downstream task`);
        port.setAttribute('aria-pressed', 'false');
        port.setAttribute('aria-description', 'Drag to another task, or activate then choose a task. Escape cancels.');
        port.title = `Drag or click to connect ${task.name} to a downstream task`;
        port.style.left = `${task.milestone ? (start - this._start + 0.5) * this._dayWidth + 20 : (start - this._start) * this._dayWidth + 3 + Math.max(8, (end - start + 1) * this._dayWidth - 6) + 4}px`;
        group.append(port);
      }
      track.append(group);
      if (this.options.showToday && today >= this._start && today < this._end) {
        const marker = element('span', 'gantt-today');
        marker.style.left = `${(today - this._start + 0.5) * this._dayWidth}px`;
        marker.setAttribute('aria-hidden', 'true');
        track.append(marker);
      }
      row.append(label, track);
      table.append(row);
    }
    this._viewport.append(table);
    this._drawDependencies();
    this._resizeObserver.observe(table);
    this._viewport.scrollLeft = scroll;
    if (focusId !== undefined) {
      Array.from(table.querySelectorAll<HTMLElement>('[data-gantt-task]'))
        .find(bar => bar.dataset.ganttTask === focusId && bar.dataset.ganttEdge === focusEdge)?.focus({ preventScroll: true });
    }
    if (focusLink) {
      Array.from(table.querySelectorAll<HTMLButtonElement>('.gantt-link-remove'))
        .find(button => button.dataset.from === focusLink.from && button.dataset.to === focusLink.to)?.focus({ preventScroll: true });
    }
    if (focusConnect !== undefined) {
      Array.from(table.querySelectorAll<HTMLElement>('[data-gantt-connect]'))
        .find(button => button.dataset.ganttConnect === focusConnect)?.focus({ preventScroll: true });
    }
    if (focusSelect !== undefined) {
      Array.from(table.querySelectorAll<HTMLElement>('[data-gantt-select]'))
        .find(button => button.dataset.ganttSelect === focusSelect)?.focus({ preventScroll: true });
    }
  }
}
