import { Utils } from './utils';
import { Component } from './component';
const _defaults = {
    responsiveThreshold: 0 // breakpoint for swipeable
};
export class Parallax extends Component {
    _enabled;
    _img;
    static _parallaxes = [];
    static _handleScrollThrottled;
    static _handleWindowResizeThrottled;
    constructor(el, options) {
        super(el, options, Parallax);
        this.el['M_Parallax'] = this;
        this.options = {
            ...Parallax.defaults,
            ...options
        };
        this._enabled = window.innerWidth > this.options.responsiveThreshold;
        this._img = this.el.querySelector('img');
        this._updateParallax();
        this._setupEventHandlers();
        this._setupStyles();
        Parallax._parallaxes.push(this);
    }
    static get defaults() {
        return _defaults;
    }
    /**
     * Initializes instances of Parallax.
     * @param els HTML elements.
     * @param options Component options.
     */
    static init(els, options = {}) {
        return super.init(els, options, Parallax);
    }
    static getInstance(el) {
        return el['M_Parallax'];
    }
    destroy() {
        Parallax._parallaxes.splice(Parallax._parallaxes.indexOf(this), 1);
        this._img.style.transform = '';
        this._removeEventHandlers();
        this.el['M_Parallax'] = undefined;
    }
    static _handleScroll() {
        for (let i = 0; i < Parallax._parallaxes.length; i++) {
            const parallaxInstance = Parallax._parallaxes[i];
            parallaxInstance._updateParallax.call(parallaxInstance);
        }
    }
    static _handleWindowResize() {
        for (let i = 0; i < Parallax._parallaxes.length; i++) {
            const parallaxInstance = Parallax._parallaxes[i];
            parallaxInstance._enabled = window.innerWidth > parallaxInstance.options.responsiveThreshold;
        }
    }
    _setupEventHandlers() {
        this._img.addEventListener('load', this._handleImageLoad);
        if (Parallax._parallaxes.length === 0) {
            if (!Parallax._handleScrollThrottled) {
                Parallax._handleScrollThrottled = Utils.throttle(Parallax._handleScroll, 5);
            }
            if (!Parallax._handleWindowResizeThrottled) {
                Parallax._handleWindowResizeThrottled = Utils.throttle(Parallax._handleWindowResize, 5);
            }
            window.addEventListener('scroll', Parallax._handleScrollThrottled);
            window.addEventListener('resize', Parallax._handleWindowResizeThrottled);
        }
    }
    _removeEventHandlers() {
        this._img.removeEventListener('load', this._handleImageLoad);
        if (Parallax._parallaxes.length === 0) {
            window.removeEventListener('scroll', Parallax._handleScrollThrottled);
            window.removeEventListener('resize', Parallax._handleWindowResizeThrottled);
        }
    }
    _setupStyles() {
        this._img.style.opacity = '1';
    }
    _handleImageLoad = () => {
        this._updateParallax();
    };
    _offset(el) {
        const box = el.getBoundingClientRect();
        const docElem = document.documentElement;
        return {
            top: box.top + window.scrollY - docElem.clientTop,
            left: box.left + window.scrollX - docElem.clientLeft
        };
    }
    _updateParallax() {
        const containerHeight = this.el.getBoundingClientRect().height > 0 ? this.el.parentElement.offsetHeight : 500;
        const imgHeight = this._img.offsetHeight;
        const parallaxDist = imgHeight - containerHeight;
        const bottom = this._offset(this.el).top + containerHeight;
        const top = this._offset(this.el).top;
        const scrollTop = Utils.getDocumentScrollTop();
        const windowHeight = window.innerHeight;
        const windowBottom = scrollTop + windowHeight;
        const percentScrolled = (windowBottom - top) / (containerHeight + windowHeight);
        const parallax = parallaxDist * percentScrolled;
        if (!this._enabled) {
            this._img.style.transform = '';
        }
        else if (bottom > scrollTop && top < scrollTop + windowHeight) {
            this._img.style.transform = `translate3D(-50%, ${parallax}px, 0)`;
        }
    }
}
