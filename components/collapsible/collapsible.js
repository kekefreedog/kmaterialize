import { Utils } from '../../src/utils';
import { Component } from '../../src/component';
const _defaults = {
    accordion: true,
    onOpenStart: null,
    onOpenEnd: null,
    onCloseStart: null,
    onCloseEnd: null,
    inDuration: 300,
    outDuration: 300
};
export class Collapsible extends Component {
    _headers;
    constructor(el, options) {
        super(el, options, Collapsible);
        this.el['M_Collapsible'] = this;
        this.options = {
            ...Collapsible.defaults,
            ...options
        };
        // Setup tab indices
        this._headers = Array.from(this.el.querySelectorAll('li > .collapsible-header'));
        this._headers.forEach((el) => (el.tabIndex = 0));
        this._setupEventHandlers();
        // Open active
        const activeBodies = Array.from(this.el.querySelectorAll('li.active > .collapsible-body'));
        if (this.options.accordion) {
            if (activeBodies.length > 0) {
                // Accordion => open first active only
                this._setExpanded(activeBodies[0]);
            }
        }
        else {
            // Expandables => all active
            activeBodies.forEach((el) => this._setExpanded(el));
        }
    }
    static get defaults() {
        return _defaults;
    }
    /**
     * Initializes instances of Collapsible.
     * @param els HTML elements.
     * @param options Component options.
     */
    static init(els, options = {}) {
        return super.init(els, options, Collapsible);
    }
    static getInstance(el) {
        return el['M_Collapsible'];
    }
    destroy() {
        this._removeEventHandlers();
        this.el['M_Collapsible'] = undefined;
    }
    _setupEventHandlers() {
        this.el.addEventListener('click', this._handleCollapsibleClick);
        this._headers.forEach((header) => header.addEventListener('keydown', this._handleCollapsibleKeydown));
    }
    _removeEventHandlers() {
        this.el.removeEventListener('click', this._handleCollapsibleClick);
        this._headers.forEach((header) => header.removeEventListener('keydown', this._handleCollapsibleKeydown));
    }
    _handleCollapsibleClick = (e) => {
        const header = e.target.closest('.collapsible-header');
        if (e.target && header) {
            const collapsible = header.closest('.collapsible');
            if (collapsible !== this.el)
                return;
            const li = header.closest('li');
            const isActive = li.classList.contains('active');
            const index = [...li.parentNode.children].indexOf(li);
            if (isActive)
                this.close(index);
            else
                this.open(index);
        }
    };
    _handleCollapsibleKeydown = (e) => {
        if (Utils.keys.ENTER.includes(e.key)) {
            this._handleCollapsibleClick(e);
        }
    };
    _setExpanded(li) {
        li.style.maxHeight = li.scrollHeight + 'px';
    }
    _animateIn(index) {
        const li = this.el.children[index];
        if (!li)
            return;
        const body = li.querySelector('.collapsible-body');
        const duration = this.options.inDuration; // easeInOutCubic
        body.style.transition = `max-height ${duration}ms ease-out`;
        this._setExpanded(body);
        setTimeout(() => {
            if (typeof this.options.onOpenEnd === 'function') {
                this.options.onOpenEnd.call(this, li);
            }
        }, duration);
    }
    _animateOut(index) {
        const li = this.el.children[index];
        if (!li)
            return;
        const body = li.querySelector('.collapsible-body');
        const duration = this.options.outDuration; // easeInOutCubic
        body.style.transition = `max-height ${duration}ms ease-out`;
        body.style.maxHeight = '0';
        setTimeout(() => {
            if (typeof this.options.onCloseEnd === 'function') {
                this.options.onCloseEnd.call(this, li);
            }
        }, duration);
    }
    /**
     * Open collapsible section.
     * @param n Nth section to open.
     */
    open = (index) => {
        const listItems = Array.from(this.el.children).filter((c) => c.tagName === 'LI');
        const li = listItems[index];
        if (li && !li.classList.contains('active')) {
            // onOpenStart callback
            if (typeof this.options.onOpenStart === 'function') {
                this.options.onOpenStart.call(this, li);
            }
            // Handle accordion behavior
            if (this.options.accordion) {
                const activeLis = listItems.filter((li) => li.classList.contains('active'));
                activeLis.forEach((activeLi) => {
                    const index = listItems.indexOf(activeLi);
                    this.close(index);
                });
            }
            // Animate in
            li.classList.add('active');
            this._animateIn(index);
        }
    };
    /**
     * Close collapsible section.
     * @param n Nth section to close.
     */
    close = (index) => {
        const li = Array.from(this.el.children).filter((c) => c.tagName === 'LI')[index];
        if (li && li.classList.contains('active')) {
            // onCloseStart callback
            if (typeof this.options.onCloseStart === 'function') {
                this.options.onCloseStart.call(this, li);
            }
            // Animate out
            li.classList.remove('active');
            this._animateOut(index);
        }
    };
}
