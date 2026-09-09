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
  private _dropPreview: HTMLElement | null = null;
  private _dragImage: HTMLElement | null = null;
  private _previewHeight = 64;

  private _onDragStart = (event: DragEvent) => {
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-card');
    if (!card || !this.options.draggable || card.classList.contains('is-disabled') || card.getAttribute('aria-disabled') === 'true') return;
    this._draggedCard = card;
    this._dragSourceColumn = card.closest<HTMLElement>('.kanban-column');
    this._previewHeight = Math.max(64, Math.round(card.getBoundingClientRect().height));
    card.classList.add('is-dragging');
    this._dragImage = card.cloneNode(true) as HTMLElement;
    this._dragImage.classList.remove('is-dragging');
    this._dragImage.classList.add('kanban-drag-image');
    this._dragImage.setAttribute('aria-hidden', 'true');
    this._dragImage.style.width = `${card.getBoundingClientRect().width}px`;
    document.body.appendChild(this._dragImage);
    event.dataTransfer?.setDragImage(this._dragImage, card.offsetWidth / 2, card.offsetHeight / 2);
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
    this._updateDropPreview(column, event);
  };

  private _onDrop = (event: DragEvent) => {
    if (!this._draggedCard) return;
    const column = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-column');
    if (!column || !this.el.contains(column)) return;
    event.preventDefault();
    const body = column.querySelector<HTMLElement>('.kanban-column-body') || column;
    const targetCard = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-card');
    const source = this._dragSourceColumn;
    const movedCard = this._draggedCard;
    if (this._dropPreview?.parentElement === body) {
      body.insertBefore(movedCard, this._dropPreview);
      this._dropPreview.remove();
    } else if (targetCard && targetCard !== movedCard && targetCard.parentElement === body) {
      body.insertBefore(movedCard, targetCard);
    } else {
      body.appendChild(movedCard);
    }
    this._clearDragState();
    this._updateCounts();
    if (source && source !== column) this.options.onMove?.({ card: movedCard, from: source, to: column });
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
        const disabled = card.classList.contains('is-disabled') || card.getAttribute('aria-disabled') === 'true';
        card.setAttribute('tabindex', disabled ? '-1' : '0');
        if (disabled) {
          card.setAttribute('aria-disabled', 'true');
          card.draggable = false;
        } else if (this.options.draggable) {
          card.draggable = true;
        }
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
    this._dragImage?.remove();
    this._dragImage = null;
    this._dropPreview?.remove();
    this._dropPreview = null;
    this._draggedCard?.classList.remove('is-dragging');
    this.el.querySelectorAll('.kanban-column.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
    this._draggedCard = null;
    this._dragSourceColumn = null;
    this._previewHeight = 64;
  }

  private _updateCounts() {
    this.el.querySelectorAll<HTMLElement>('.kanban-column').forEach((column) => {
      const count = column.querySelector<HTMLElement>('.kanban-column-count');
      const body = column.querySelector<HTMLElement>('.kanban-column-body');
      if (count && body) count.textContent = String(body.querySelectorAll(':scope > .kanban-card').length);
      const empty = body?.querySelector<HTMLElement>('.kanban-empty');
      if (empty && body) empty.hidden = body.querySelectorAll(':scope > .kanban-card').length > 0;
    });
  }

  private _updateDropPreview(column: HTMLElement, event: DragEvent) {
    const body = column.querySelector<HTMLElement>('.kanban-column-body') || column;
    const targetCard = (event.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-card');
    if (targetCard === this._draggedCard) return;
    if (!this._dropPreview) {
      this._dropPreview = document.createElement('div');
      this._dropPreview.className = 'kanban-drop-preview';
      this._dropPreview.setAttribute('aria-hidden', 'true');
    }
    // Keep the preview tied to the dragged card's original height. Using the
    // hovered card's height makes the placeholder jump as the pointer crosses
    // cards with different content lengths.
    this._dropPreview.style.height = `${this._previewHeight}px`;
    if (targetCard && targetCard.parentElement === body) {
      const box = targetCard.getBoundingClientRect();
      body.insertBefore(this._dropPreview, event.clientY < box.top + box.height / 2 ? targetCard : targetCard.nextSibling);
    } else if (this._dropPreview.parentElement !== body) {
      body.appendChild(this._dropPreview);
    }
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
