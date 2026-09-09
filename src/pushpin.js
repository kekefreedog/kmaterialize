import { Utils } from './utils';
import { Component } from './component';
const _defaults = {
    top: 0,
    bottom: Infinity,
    offset: 0,
    onPositionChange: null
};
export class Pushpin extends Component {
    static _pushpins;
    originalOffset;
    constructor(el, options) {
        super(el, options, Pushpin);
        this.el['M_Pushpin'] = this;
        this.options = {
            ...Pushpin.defaults,
            ...options
        };
        this.originalOffset = this.el.offsetTop;
        Pushpin._pushpins.push(this);
        this._setupEventHandlers();
        this._updatePosition();
    }
    static get defaults() {
        return _defaults;
    }
    /**
     * Initializes instances of Pushpin.
     * @param els HTML elements.
     * @param options Component options.
     */
    static init(els, options = {}) {
        return super.init(els, options, Pushpin);
    }
    static getInstance(el) {
        return el['M_Pushpin'];
    }
    destroy() {
        this.el.style.top = null;
        this._removePinClasses();
        // Remove pushpin Inst
        const index = Pushpin._pushpins.indexOf(this);
        Pushpin._pushpins.splice(index, 1);
        if (Pushpin._pushpins.length === 0) {
            this._removeEventHandlers();
        }
        this.el['M_Pushpin'] = undefined;
    }
    static _updateElements() {
        for (const elIndex in Pushpin._pushpins) {
            const pInstance = Pushpin._pushpins[elIndex];
            pInstance._updatePosition();
        }
    }
    _setupEventHandlers() {
        document.addEventListener('scroll', Pushpin._updateElements);
    }
    _removeEventHandlers() {
        document.removeEventListener('scroll', Pushpin._updateElements);
    }
    _updatePosition() {
        const scrolled = Utils.getDocumentScrollTop() + this.options.offset;
        if (this.options.top <= scrolled &&
            this.options.bottom >= scrolled &&
            !this.el.classList.contains('pinned')) {
            this._removePinClasses();
            this.el.style.top = `${this.options.offset}px`;
            this.el.classList.add('pinned');
            // onPositionChange callback
            if (typeof this.options.onPositionChange === 'function') {
                this.options.onPositionChange.call(this, 'pinned');
            }
        }
        // Add pin-top (when scrolled position is above top)
        if (scrolled < this.options.top && !this.el.classList.contains('pin-top')) {
            this._removePinClasses();
            this.el.style.top = '0';
            this.el.classList.add('pin-top');
            // onPositionChange callback
            if (typeof this.options.onPositionChange === 'function') {
                this.options.onPositionChange.call(this, 'pin-top');
            }
        }
        // Add pin-bottom (when scrolled position is below bottom)
        if (scrolled > this.options.bottom && !this.el.classList.contains('pin-bottom')) {
            this._removePinClasses();
            this.el.classList.add('pin-bottom');
            this.el.style.top = `${this.options.bottom - this.originalOffset}px`;
            // onPositionChange callback
            if (typeof this.options.onPositionChange === 'function') {
                this.options.onPositionChange.call(this, 'pin-bottom');
            }
        }
    }
    _removePinClasses() {
        // IE 11 bug (can't remove multiple classes in one line)
        this.el.classList.remove('pin-top');
        this.el.classList.remove('pinned');
        this.el.classList.remove('pin-bottom');
    }
    static {
        Pushpin._pushpins = [];
    }
}
