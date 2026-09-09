import { Component } from '../../src/component';
const _defaults = {
    opacity: 0.5,
    inDuration: 250,
    outDuration: 250,
    onOpenStart: null,
    onOpenEnd: null,
    onCloseStart: null,
    onCloseEnd: null,
    preventScrolling: true,
    dismissible: true,
    startingTop: '4%',
    endingTop: '10%'
};
class Modal extends Component {
    constructor(el, options) {
        super(el, options, Modal);
        this.el['M_Modal'] = this;
        this.options = {
            ...Modal.defaults,
            ...options
        };
        this.el.tabIndex = 0;
        this._setupEventHandlers();
    }
    static get defaults() {
        return _defaults;
    }
    static init(els, options = {}) {
        return super.init(els, options, Modal);
    }
    static getInstance(el) {
        return el['M_Modal'];
    }
    destroy() { }
    _setupEventHandlers() { }
    _removeEventHandlers() { }
    _handleTriggerClick() { }
    _handleOverlayClick() { }
    _handleModalCloseClick() { }
    _handleKeydown() { }
    _handleFocus() { }
    open() {
        return this;
    }
    close() {
        return this;
    }
    // Experimental!
    static #createHtml(config) {
        return `<dialog id="modal1" class="modal">
      ${config.header ? '<div class="modal-header">' + config.header + '</div>' : ''}
      <div class="modal-content">
        ${config.content}
      </div>
      ${config.header ? '<div class="modal-footer">' + config.footer + '</div>' : ''}
    </dialog>`;
    }
    static #createHtmlElement(config) {
        const dialog = document.createElement('dialog');
        dialog.id = config.id;
        return dialog;
    }
    static create(config) {
        const isServer = false;
        if (isServer)
            return this.#createHtml(config);
        return this.#createHtmlElement(config);
    }
    static { }
}
export { Modal };
