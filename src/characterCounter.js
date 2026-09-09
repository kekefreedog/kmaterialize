import { Component } from './component';
const _defaults = Object.freeze({});
export class CharacterCounter extends Component {
    /** Stores the reference to the counter HTML element. */
    counterEl;
    /** Specifies whether the input is valid or not. */
    isInvalid;
    /** Specifies whether the input text has valid length or not. */
    isValidLength;
    constructor(el, options) {
        super(el, {}, CharacterCounter);
        this.el['M_CharacterCounter'] = this;
        this.options = {
            ...CharacterCounter.defaults,
            ...options
        };
        this.isInvalid = false;
        this.isValidLength = false;
        this._setupCounter();
        this._setupEventHandlers();
    }
    static get defaults() {
        return _defaults;
    }
    /**
     * Initializes instances of CharacterCounter.
     * @param els HTML elements.
     * @param options Component options.
     */
    static init(els, options = {}) {
        return super.init(els, options, CharacterCounter);
    }
    static getInstance(el) {
        return el['M_CharacterCounter'];
    }
    destroy() {
        this._removeEventHandlers();
        this.el['CharacterCounter'] = undefined;
        this._removeCounter();
    }
    _setupEventHandlers() {
        this.el.addEventListener('focus', this.updateCounter, true);
        this.el.addEventListener('input', this.updateCounter, true);
    }
    _removeEventHandlers() {
        this.el.removeEventListener('focus', this.updateCounter, true);
        this.el.removeEventListener('input', this.updateCounter, true);
    }
    _setupCounter() {
        this.counterEl = document.createElement('span');
        this.counterEl.classList.add('character-counter');
        this.counterEl.style.float = 'right';
        this.counterEl.style.fontSize = '12px';
        this.counterEl.style.height = '1';
        this.el.parentElement.appendChild(this.counterEl);
    }
    _removeCounter() {
        this.counterEl.remove();
    }
    updateCounter = () => {
        const maxLength = parseInt(this.el.getAttribute('maxlength')), actualLength = this.el.value.length;
        this.isValidLength = actualLength <= maxLength;
        let counterString = actualLength.toString();
        if (maxLength) {
            counterString += '/' + maxLength;
            this._validateInput();
        }
        this.counterEl.innerHTML = counterString;
    };
    _validateInput() {
        if (this.isValidLength && this.isInvalid) {
            this.isInvalid = false;
            this.el.classList.remove('invalid');
        }
        else if (!this.isValidLength && !this.isInvalid) {
            this.isInvalid = true;
            this.el.classList.remove('valid');
            this.el.classList.add('invalid');
        }
    }
}
