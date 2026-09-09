import { Component } from '../../src/component';
const _defaults = {
    draggable: true
};
/** A lightweight, dependency-free board for columns of draggable cards. */
export class Kanban extends Component {
    _draggedCard = null;
    _dragSourceColumn = null;
    _dropPreview = null;
    _dragImage = null;
    _previewHeight = 64;
    _onDragStart = (event) => {
        const card = event.target?.closest('.kanban-card');
        if (!card || !this.options.draggable || card.classList.contains('is-disabled') || card.getAttribute('aria-disabled') === 'true')
            return;
        this._draggedCard = card;
        this._dragSourceColumn = card.closest('.kanban-column');
        this._previewHeight = Math.max(64, Math.round(card.getBoundingClientRect().height));
        card.classList.add('is-dragging');
        this._dragImage = card.cloneNode(true);
        this._dragImage.classList.remove('is-dragging');
        this._dragImage.classList.add('kanban-drag-image');
        this._dragImage.setAttribute('aria-hidden', 'true');
        this._dragImage.style.width = `${card.getBoundingClientRect().width}px`;
        document.body.appendChild(this._dragImage);
        event.dataTransfer?.setDragImage(this._dragImage, card.offsetWidth / 2, card.offsetHeight / 2);
        event.dataTransfer?.setData('text/plain', card.dataset.kanbanCard || '');
        if (event.dataTransfer)
            event.dataTransfer.effectAllowed = 'move';
    };
    _onDragOver = (event) => {
        if (!this._draggedCard)
            return;
        const column = event.target?.closest('.kanban-column');
        if (!column || !this.el.contains(column))
            return;
        event.preventDefault();
        if (event.dataTransfer)
            event.dataTransfer.dropEffect = 'move';
        this.el.querySelectorAll('.kanban-column.is-drag-over').forEach((item) => item.classList.remove('is-drag-over'));
        column.classList.add('is-drag-over');
        this._updateDropPreview(column, event);
    };
    _onDrop = (event) => {
        if (!this._draggedCard)
            return;
        const column = event.target?.closest('.kanban-column');
        if (!column || !this.el.contains(column))
            return;
        event.preventDefault();
        const body = column.querySelector('.kanban-column-body') || column;
        const targetCard = event.target?.closest('.kanban-card');
        const source = this._dragSourceColumn;
        const movedCard = this._draggedCard;
        if (this._dropPreview?.parentElement === body) {
            body.insertBefore(movedCard, this._dropPreview);
            this._dropPreview.remove();
        }
        else if (targetCard && targetCard !== movedCard && targetCard.parentElement === body) {
            body.insertBefore(movedCard, targetCard);
        }
        else {
            body.appendChild(movedCard);
        }
        this._clearDragState();
        this._updateCounts();
        if (source && source !== column)
            this.options.onMove?.({ card: movedCard, from: source, to: column });
    };
    _onDragEnd = () => this._clearDragState();
    constructor(el, options) {
        super(el, options, Kanban);
        this.options = { ...Kanban.defaults, ...options };
        this.el['M_Kanban'] = this;
        this._prepareMarkup();
        if (this.options.draggable)
            this._bindEvents();
    }
    static get defaults() {
        return _defaults;
    }
    static init(els, options = {}) {
        return super.init(els, options, Kanban);
    }
    static getInstance(el) {
        return el['M_Kanban'];
    }
    _prepareMarkup() {
        this.el.setAttribute('role', 'region');
        this.el.querySelectorAll('.kanban-column').forEach((column) => {
            column.setAttribute('role', 'group');
            const body = column.querySelector('.kanban-column-body');
            if (body)
                body.setAttribute('role', 'list');
            column.querySelectorAll('.kanban-card').forEach((card) => {
                card.setAttribute('role', 'listitem');
                const disabled = card.classList.contains('is-disabled') || card.getAttribute('aria-disabled') === 'true';
                card.setAttribute('tabindex', disabled ? '-1' : '0');
                if (disabled) {
                    card.setAttribute('aria-disabled', 'true');
                    card.draggable = false;
                }
                else if (this.options.draggable) {
                    card.draggable = true;
                }
            });
        });
        this._updateCounts();
    }
    _bindEvents() {
        this.el.addEventListener('dragstart', this._onDragStart);
        this.el.addEventListener('dragover', this._onDragOver);
        this.el.addEventListener('drop', this._onDrop);
        this.el.addEventListener('dragend', this._onDragEnd);
    }
    _clearDragState() {
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
    _updateCounts() {
        this.el.querySelectorAll('.kanban-column').forEach((column) => {
            const count = column.querySelector('.kanban-column-count');
            const body = column.querySelector('.kanban-column-body');
            if (count && body)
                count.textContent = String(body.querySelectorAll(':scope > .kanban-card').length);
            const empty = body?.querySelector('.kanban-empty');
            if (empty && body)
                empty.hidden = body.querySelectorAll(':scope > .kanban-card').length > 0;
        });
    }
    _updateDropPreview(column, event) {
        const body = column.querySelector('.kanban-column-body') || column;
        const targetCard = event.target?.closest('.kanban-card');
        if (targetCard === this._draggedCard)
            return;
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
        }
        else if (this._dropPreview.parentElement !== body) {
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
