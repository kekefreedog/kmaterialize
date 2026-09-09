import { BaseOptions, Component, InitElements, MElement } from '../../src/component';

export interface KanbanMoveDetail {
  card: HTMLElement;
  from: HTMLElement;
  to: HTMLElement;
}

export interface KanbanOptions extends BaseOptions {
  /** Enable native drag-and-drop interactions. */
  draggable: boolean;
  /** Called after a card changes column or order. */
  onMove?: (detail: KanbanMoveDetail) => void;
}

const _defaults: KanbanOptions = {
  draggable: true
};

/** A lightweight, dependency-free board for columns of draggable cards. */
export class Kanban extends Component<KanbanOptions> {
  private _draggedCard: HTMLElement | null = null;
  private _dragSourceColumn: HTMLElement | null = null;

  private _onDragStart = (event: DragEvent) => {
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-card');
    if (!card || !this.options.draggable) return;
    this._draggedCard = card;
    this._dragSourceColumn = card.closest<HTMLElement>('.kanban-column');
    card.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain', card.dataset.kanbanCard || '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  };

  private _onDragOver = (event: DragEvent) => {
    if (!this._draggedCard) return;
    const column = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-column');
    if (!column || !this.el.contains(column)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.el.querySelectorAll('.kanban-column.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
    column.classList.add('is-drag-over');
  };

  private _onDrop = (event: DragEvent) => {
    if (!this._draggedCard) return;
    const column = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-column');
    if (!column || !this.el.contains(column)) return;
    event.preventDefault();
    const body = column.querySelector<HTMLElement>('.kanban-column-body') || column;
    const targetCard = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-card');
    const source = this._dragSourceColumn;
    if (targetCard && targetCard !== this._draggedCard && targetCard.parentElement === body) {
      const box = targetCard.getBoundingClientRect();
      body.insertBefore(this._draggedCard, event.clientY < box.top + box.height / 2 ? targetCard : targetCard.nextSibling);
    } else {
      body.appendChild(this._draggedCard);
    }
    this._clearDragState();
    this._updateCounts();
    if (source && source !== column) this.options.onMove?.({ card: this._draggedCard, from: source, to: column });
  };

  private _onDragEnd = () => this._clearDragState();

  constructor(el: HTMLElement, options: Partial<KanbanOptions>) {
    super(el, options, Kanban);
    this.options = { ...Kanban.defaults, ...options };
    this.el['M_Kanban'] = this;
    this._prepareMarkup();
    if (this.options.draggable) this._bindEvents();
  }

  static get defaults(): KanbanOptions {
    return _defaults;
  }

  static init(el: HTMLElement, options?: Partial<KanbanOptions>): Kanban;
  static init(els: InitElements<MElement>, options?: Partial<KanbanOptions>): Kanban[];
  static init(els: HTMLElement | InitElements<MElement>, options: Partial<KanbanOptions> = {}): Kanban | Kanban[] {
    return super.init(els, options, Kanban);
  }

  static getInstance(el: HTMLElement): Kanban {
    return el['M_Kanban'];
  }

  private _prepareMarkup() {
    this.el.setAttribute('role', 'region');
    this.el.querySelectorAll<HTMLElement>('.kanban-column').forEach((column) => {
      column.setAttribute('role', 'group');
      const body = column.querySelector<HTMLElement>('.kanban-column-body');
      if (body) body.setAttribute('role', 'list');
      column.querySelectorAll<HTMLElement>('.kanban-card').forEach((card) => {
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        if (this.options.draggable) card.draggable = true;
      });
    });
    this._updateCounts();
  }

  private _bindEvents() {
    this.el.addEventListener('dragstart', this._onDragStart);
    this.el.addEventListener('dragover', this._onDragOver);
    this.el.addEventListener('drop', this._onDrop);
    this.el.addEventListener('dragend', this._onDragEnd);
  }

  private _clearDragState() {
    this._draggedCard?.classList.remove('is-dragging');
    this.el.querySelectorAll('.kanban-column.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
    this._draggedCard = null;
    this._dragSourceColumn = null;
  }

  private _updateCounts() {
    this.el.querySelectorAll<HTMLElement>('.kanban-column').forEach((column) => {
      const count = column.querySelector<HTMLElement>('.kanban-column-count');
      const body = column.querySelector<HTMLElement>('.kanban-column-body');
      if (count && body) count.textContent = String(body.querySelectorAll(':scope > .kanban-card').length);
    });
  }

  destroy() {
    this._clearDragState();
    this.el.removeEventListener('dragstart', this._onDragStart);
    this.el.removeEventListener('dragover', this._onDragOver);
    this.el.removeEventListener('drop', this._onDrop);
    this.el.removeEventListener('dragend', this._onDragEnd);
    delete this.el['M_Kanban'];
  }
}
