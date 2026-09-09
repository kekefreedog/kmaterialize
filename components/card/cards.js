import { Utils } from '../../src/utils';
import { Component } from '../../src/component';
const _defaults = {
    onOpen: null,
    onClose: null,
    inDuration: 225,
    outDuration: 300
};
class Cards extends Component {
    #cardReveal;
    #initialOverflow;
    #activators;
    #cardRevealClose;
    isOpen = false;
    constructor(el, options) {
        super(el, options, Cards);
        this.el['M_Cards'] = this;
        this.options = {
            ...Cards.defaults,
            ...options
        };
        this.#activators = [];
        this.#cardReveal = this.el.querySelector('.card-reveal');
        if (this.#cardReveal) {
            this.#initialOverflow = getComputedStyle(this.el).overflow;
            this.#activators = Array.from(this.el.querySelectorAll('.activator'));
            this.#activators.forEach((el) => {
                if (el)
                    el.tabIndex = 0;
            });
            this.#cardRevealClose = this.#cardReveal?.querySelector('.card-title');
            if (this.#cardRevealClose)
                this.#cardRevealClose.tabIndex = -1;
            this.#cardReveal.ariaExpanded = 'false';
            this.#setupEventHandlers();
        }
    }
    static get defaults() {
        return _defaults;
    }
    /**
     * Initializes instances of Cards.
     * @param els HTML elements.
     * @param options Component options.
     */
    static init(els, options) {
        return super.init(els, options, Cards);
    }
    static getInstance(el) {
        return el['M_Cards'];
    }
    /**
     * {@inheritDoc}
     */
    destroy() {
        this.#removeEventHandlers();
        this.#activators = [];
    }
    #setupEventHandlers = () => {
        this.#activators.forEach((el) => {
            el.addEventListener('click', this.#handleClickInteraction);
            el.addEventListener('keypress', this.#handleKeypressEvent);
        });
    };
    #removeEventHandlers = () => {
        this.#activators.forEach((el) => {
            el.removeEventListener('click', this.#handleClickInteraction);
            el.removeEventListener('keypress', this.#handleKeypressEvent);
        });
    };
    #handleClickInteraction = () => {
        this.#handleRevealEvent();
    };
    #handleKeypressEvent = (e) => {
        if (Utils.keys.ENTER.includes(e.key)) {
            this.#handleRevealEvent();
        }
    };
    #handleRevealEvent = () => {
        this.#activators.forEach((el) => (el.tabIndex = -1)); // Reveal Card
        this.open();
    };
    #setupRevealCloseEventHandlers = () => {
        this.#cardRevealClose.addEventListener('click', this.close);
        this.#cardRevealClose.addEventListener('keypress', this.#handleKeypressCloseEvent);
    };
    #removeRevealCloseEventHandlers = () => {
        this.#cardRevealClose.addEventListener('click', this.close);
        this.#cardRevealClose.addEventListener('keypress', this.#handleKeypressCloseEvent);
    };
    #handleKeypressCloseEvent = (e) => {
        if (Utils.keys.ENTER.includes(e.key)) {
            this.close();
        }
    };
    /**
     * Show card reveal.
     */
    open = () => {
        if (this.isOpen)
            return;
        this.isOpen = true;
        this.el.style.overflow = 'hidden';
        this.#cardReveal.style.display = 'block';
        this.#cardReveal.ariaExpanded = 'true';
        this.#cardRevealClose.tabIndex = 0;
        setTimeout(() => {
            this.#cardReveal.style.transition = `transform ${this.options.outDuration}ms ease`; //easeInOutQuad
            this.#cardReveal.style.transform = 'translateY(-100%)';
        }, 1);
        if (typeof this.options.onOpen === 'function') {
            this.options.onOpen.call(this);
        }
        this.#setupRevealCloseEventHandlers();
    };
    /**
     * Hide card reveal.
     */
    close = () => {
        if (!this.isOpen)
            return;
        this.isOpen = false;
        this.#cardReveal.style.transition = `transform ${this.options.inDuration}ms ease`; //easeInOutQuad
        this.#cardReveal.style.transform = 'translateY(0)';
        setTimeout(() => {
            this.#cardReveal.style.display = 'none';
            this.#cardReveal.ariaExpanded = 'false';
            this.#activators.forEach((el) => (el.tabIndex = 0));
            this.#cardRevealClose.tabIndex = -1;
            this.el.style.overflow = this.#initialOverflow;
        }, this.options.inDuration);
        if (typeof this.options.onClose === 'function') {
            this.options.onClose.call(this);
        }
        this.#removeRevealCloseEventHandlers();
    };
    static Init() {
        if (typeof document !== 'undefined')
            // Handle initialization of static cards.
            document.addEventListener('DOMContentLoaded', () => {
                const cards = document.querySelectorAll('.card');
                cards.forEach((el) => {
                    if (el && el['M_Card'] == undefined)
                        this.init(el);
                });
            });
    }
}
export { Cards };
