import { Component } from '../../src/component';
const _defaults = {
    dismissible: true
};
/** A persistent, contextual feedback banner. */
export class Alert extends Component {
    _closeButton = null;
    _onClose = () => this.dismiss();
    constructor(el, options) {
        super(el, options, Alert);
        this.options = { ...Alert.defaults, ...options };
        this.el['M_Alert'] = this;
        this._bindCloseButton();
    }
    static get defaults() {
        return _defaults;
    }
    static init(els, options = {}) {
        return super.init(els, options, Alert);
    }
    static getInstance(el) {
        return el['M_Alert'];
    }
    _bindCloseButton() {
        this._closeButton = this.el.querySelector('.alert-close');
        if (this.options.dismissible && this._closeButton) {
            this._closeButton.addEventListener('click', this._onClose);
        }
    }
    /** Hide and remove the alert from the document. */
    dismiss() {
        if (!this.el.isConnected)
            return;
        this.el.classList.add('alert-dismissing');
        const remove = () => {
            this.el.removeEventListener('transitionend', remove);
            this.el.hidden = true;
            this.options.onDismiss?.(this);
        };
        if (getComputedStyle(this.el).transitionDuration === '0s')
            remove();
        else
            this.el.addEventListener('transitionend', remove, { once: true });
    }
    /** Show an alert that was previously dismissed. */
    open() {
        this.el.hidden = false;
        this.el.classList.remove('alert-dismissing');
    }
    destroy() {
        this._closeButton?.removeEventListener('click', this._onClose);
        delete this.el['M_Alert'];
    }
}
