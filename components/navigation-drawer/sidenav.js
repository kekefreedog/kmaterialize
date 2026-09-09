import { Utils } from '../../src/utils';
import { Component } from '../../src/component';
const _defaults = {
    edge: 'left',
    draggable: true,
    dragTargetWidth: '10px',
    inDuration: 250,
    outDuration: 200,
    onOpenStart: null,
    onOpenEnd: null,
    onCloseStart: null,
    onCloseEnd: null,
    preventScrolling: true
};
export class Sidenav extends Component {
    id;
    /** Describes open/close state of Sidenav. */
    isOpen;
    /** Describes if sidenav is fixed. */
    isFixed;
    /** Describes if Sidenav is being dragged. */
    isDragged;
    lastWindowWidth;
    lastWindowHeight;
    static _sidenavs;
    _overlay;
    dragTarget;
    _startingXpos;
    _xPos;
    _time;
    _width;
    _initialScrollTop;
    _verticallyScrolling;
    deltaX;
    velocityX;
    percentOpen;
    constructor(el, options) {
        super(el, options, Sidenav);
        this.el['M_Sidenav'] = this;
        this.options = {
            ...Sidenav.defaults,
            ...options
        };
        this.id = this.el.id;
        this.isOpen = false;
        this.isFixed = this.el.classList.contains('sidenav-fixed');
        this.isDragged = false;
        // Window size variables for window resize checks
        this.lastWindowWidth = window.innerWidth;
        this.lastWindowHeight = window.innerHeight;
        this._createOverlay();
        this._createDragTarget();
        this._setupEventHandlers();
        this._setupClasses();
        this._setupFixed();
        Sidenav._sidenavs.push(this);
    }
    static get defaults() {
        return _defaults;
    }
    /**
     * Initializes instances of Sidenav.
     * @param els HTML elements.
     * @param options Component options.
     */
    static init(els, options = {}) {
        return super.init(els, options, Sidenav);
    }
    static getInstance(el) {
        return el['M_Sidenav'];
    }
    destroy() {
        this._removeEventHandlers();
        this._enableBodyScrolling();
        this._overlay.parentNode.removeChild(this._overlay);
        this.dragTarget.parentNode.removeChild(this.dragTarget);
        this.el['M_Sidenav'] = undefined;
        this.el.style.transform = '';
        const index = Sidenav._sidenavs.indexOf(this);
        if (index >= 0) {
            Sidenav._sidenavs.splice(index, 1);
        }
    }
    _createOverlay() {
        this._overlay = document.createElement('div');
        this._overlay.classList.add('sidenav-overlay');
        this._overlay.addEventListener('click', this.close);
        document.body.appendChild(this._overlay);
    }
    _setupEventHandlers() {
        if (Sidenav._sidenavs.length === 0) {
            document.body.addEventListener('click', this._handleTriggerClick);
        }
        const passiveIfSupported = null;
        this.dragTarget.addEventListener('touchmove', this._handleDragTargetDrag, passiveIfSupported);
        this.dragTarget.addEventListener('touchend', this._handleDragTargetRelease);
        this._overlay.addEventListener('touchmove', this._handleCloseDrag, passiveIfSupported);
        this._overlay.addEventListener('touchend', this._handleCloseRelease);
        this.el.addEventListener('touchmove', this._handleCloseDrag); // , passiveIfSupported);
        this.el.addEventListener('touchend', this._handleCloseRelease);
        this.el.addEventListener('click', this._handleCloseTriggerClick);
        // Add resize for side nav fixed
        if (this.isFixed) {
            window.addEventListener('resize', this._handleWindowResize);
        }
        /* Set aria-hidden state */
        this._setAriaHidden();
        this._setTabIndex();
    }
    _removeEventHandlers() {
        if (Sidenav._sidenavs.length === 1) {
            document.body.removeEventListener('click', this._handleTriggerClick);
        }
        this.dragTarget.removeEventListener('touchmove', this._handleDragTargetDrag);
        this.dragTarget.removeEventListener('touchend', this._handleDragTargetRelease);
        this._overlay.removeEventListener('touchmove', this._handleCloseDrag);
        this._overlay.removeEventListener('touchend', this._handleCloseRelease);
        this.el.removeEventListener('touchmove', this._handleCloseDrag);
        this.el.removeEventListener('touchend', this._handleCloseRelease);
        this.el.removeEventListener('click', this._handleCloseTriggerClick);
        // Remove resize for side nav fixed
        if (this.isFixed) {
            window.removeEventListener('resize', this._handleWindowResize);
        }
    }
    _handleTriggerClick(e) {
        const trigger = e.target.closest('.sidenav-trigger');
        if (e.target && trigger) {
            const sidenavId = Utils.getIdFromTrigger(trigger);
            const sidenavInstance = document.getElementById(sidenavId)['M_Sidenav'];
            if (sidenavInstance) {
                sidenavInstance.open();
            }
            e.preventDefault();
        }
    }
    // Set variables needed at the beginning of drag and stop any current transition.
    _startDrag(e) {
        const clientX = e.targetTouches[0].clientX;
        this.isDragged = true;
        this._startingXpos = clientX;
        this._xPos = this._startingXpos;
        this._time = Date.now();
        this._width = this.el.getBoundingClientRect().width;
        this._overlay.style.display = 'block';
        this._initialScrollTop = this.isOpen ? this.el.scrollTop : Utils.getDocumentScrollTop();
        this._verticallyScrolling = false;
    }
    //Set variables needed at each drag move update tick
    _dragMoveUpdate(e) {
        const clientX = e.targetTouches[0].clientX;
        const currentScrollTop = this.isOpen ? this.el.scrollTop : Utils.getDocumentScrollTop();
        this.deltaX = Math.abs(this._xPos - clientX);
        this._xPos = clientX;
        this.velocityX = this.deltaX / (Date.now() - this._time);
        this._time = Date.now();
        if (this._initialScrollTop !== currentScrollTop) {
            this._verticallyScrolling = true;
        }
    }
    _handleDragTargetDrag = (e) => {
        // Check if draggable
        if (!this._isDraggable())
            return;
        let totalDeltaX = this._calculateDelta(e);
        const dragDirection = totalDeltaX > 0 ? 'right' : 'left';
        // Don't allow totalDeltaX to exceed Sidenav width or be dragged in the opposite direction
        totalDeltaX = Math.min(this._width, Math.abs(totalDeltaX));
        if (this.options.edge === dragDirection) {
            totalDeltaX = 0;
        }
        /**
         * transformX is the drag displacement
         * transformPrefix is the initial transform placement
         * Invert values if Sidenav is right edge
         */
        let transformX = totalDeltaX;
        let transformPrefix = 'translateX(-100%)';
        if (this.options.edge === 'right') {
            transformPrefix = 'translateX(100%)';
            transformX = -transformX;
        }
        // Calculate open/close percentage of sidenav, with open = 1 and close = 0
        this.percentOpen = Math.min(1, totalDeltaX / this._width);
        // Set transform and opacity styles
        this.el.style.transform = `${transformPrefix} translateX(${transformX}px)`;
        this._overlay.style.opacity = this.percentOpen.toString();
    };
    _handleDragTargetRelease = () => {
        if (this.isDragged) {
            if (this.percentOpen > 0.2) {
                this.open();
            }
            else {
                this._animateOut();
            }
            this.isDragged = false;
            this._verticallyScrolling = false;
        }
    };
    _handleCloseDrag = (e) => {
        // Check if open and draggable
        if (!this.isOpen || !this._isDraggable())
            return;
        let totalDeltaX = this._calculateDelta(e);
        // dragDirection is the attempted user drag direction
        const dragDirection = totalDeltaX > 0 ? 'right' : 'left';
        totalDeltaX = Math.min(this._width, Math.abs(totalDeltaX));
        if (this.options.edge !== dragDirection) {
            totalDeltaX = 0;
        }
        let transformX = -totalDeltaX;
        if (this.options.edge === 'right') {
            transformX = -transformX;
        }
        // Calculate open/close percentage of sidenav, with open = 1 and close = 0
        this.percentOpen = Math.min(1, 1 - totalDeltaX / this._width);
        // Set transform and opacity styles
        this.el.style.transform = `translateX(${transformX}px)`;
        this._overlay.style.opacity = this.percentOpen.toString();
    };
    _calculateDelta = (e) => {
        // If not being dragged, set initial drag start variables
        if (!this.isDragged) {
            this._startDrag(e);
        }
        // Run touchmove updates
        this._dragMoveUpdate(e);
        // Calculate raw deltaX
        return this._xPos - this._startingXpos;
    };
    _handleCloseRelease = () => {
        if (this.isOpen && this.isDragged) {
            if (this.percentOpen > 0.8) {
                this._animateIn();
            }
            else {
                this.close();
            }
            this.isDragged = false;
            this._verticallyScrolling = false;
        }
    };
    // Handles closing of Sidenav when element with class .sidenav-close
    _handleCloseTriggerClick = (e) => {
        const closeTrigger = e.target.closest('.sidenav-close');
        if (closeTrigger && !this._isCurrentlyFixed()) {
            this.close();
        }
    };
    _handleWindowResize = () => {
        // Only handle horizontal resizes
        if (this.lastWindowWidth !== window.innerWidth) {
            if (window.innerWidth > 992) {
                this.open();
            }
            else {
                this.close();
            }
        }
        this.lastWindowWidth = window.innerWidth;
        this.lastWindowHeight = window.innerHeight;
    };
    _setupClasses() {
        if (this.options.edge === 'right') {
            this.el.classList.add('right-aligned');
            this.dragTarget.classList.add('right-aligned');
        }
    }
    _removeClasses() {
        this.el.classList.remove('right-aligned');
        this.dragTarget.classList.remove('right-aligned');
    }
    _setupFixed() {
        if (this._isCurrentlyFixed())
            this.open();
    }
    _isDraggable() {
        return this.options.draggable && !this._isCurrentlyFixed() && !this._verticallyScrolling;
    }
    _isCurrentlyFixed() {
        return this.isFixed && window.innerWidth > 992;
    }
    _createDragTarget() {
        const dragTarget = document.createElement('div');
        dragTarget.classList.add('drag-target');
        dragTarget.style.width = this.options.dragTargetWidth;
        document.body.appendChild(dragTarget);
        this.dragTarget = dragTarget;
    }
    _preventBodyScrolling() {
        document.body.style.overflow = 'hidden';
    }
    _enableBodyScrolling() {
        document.body.style.overflow = '';
    }
    /**
     * Opens Sidenav.
     */
    open = () => {
        if (this.isOpen === true)
            return;
        this.isOpen = true;
        // Run onOpenStart callback
        if (typeof this.options.onOpenStart === 'function') {
            this.options.onOpenStart.call(this, this.el);
        }
        // Handle fixed Sidenav
        if (this._isCurrentlyFixed()) {
            // Show if fixed
            this.el.style.transform = 'translateX(0)';
            this._enableBodyScrolling();
            this._overlay.style.display = 'none';
        }
        // Handle non-fixed Sidenav
        else {
            if (this.options.preventScrolling)
                this._preventBodyScrolling();
            if (!this.isDragged || this.percentOpen != 1)
                this._animateIn();
            /* Set aria-hidden state */
            this._setAriaHidden();
            this._setTabIndex();
        }
    };
    /**
     * Closes Sidenav.
     */
    close = () => {
        if (this.isOpen === false)
            return;
        this.isOpen = false;
        // Run onCloseStart callback
        if (typeof this.options.onCloseStart === 'function') {
            this.options.onCloseStart.call(this, this.el);
        }
        // Handle fixed Sidenav
        if (this._isCurrentlyFixed()) {
            const transformX = this.options.edge === 'left' ? '-105%' : '105%';
            this.el.style.transform = `translateX(${transformX})`;
        }
        // Handle non-fixed Sidenav
        else {
            this._enableBodyScrolling();
            if (!this.isDragged || this.percentOpen != 0) {
                this._animateOut();
            }
            else {
                this._overlay.style.display = 'none';
            }
            /* Set aria-hidden state */
            this._setAriaHidden();
            this._setTabIndex();
        }
    };
    _animateIn() {
        this._animateSidenavIn();
        this._animateOverlayIn();
    }
    _animateOut() {
        this._animateSidenavOut();
        this._animateOverlayOut();
    }
    _animateSidenavIn() {
        let slideOutPercent = this.options.edge === 'left' ? -1 : 1;
        if (this.isDragged) {
            slideOutPercent =
                this.options.edge === 'left'
                    ? slideOutPercent + this.percentOpen
                    : slideOutPercent - this.percentOpen;
        }
        const duration = this.options.inDuration;
        // from
        this.el.style.transition = 'none';
        this.el.style.transform = 'translateX(' + slideOutPercent * 100 + '%)';
        setTimeout(() => {
            this.el.style.transition = `transform ${duration}ms ease`; // easeOutQuad
            // to
            this.el.style.transform = 'translateX(0)';
        }, 1);
        setTimeout(() => {
            if (typeof this.options.onOpenEnd === 'function')
                this.options.onOpenEnd.call(this, this.el);
        }, duration);
    }
    _animateSidenavOut() {
        const endPercent = this.options.edge === 'left' ? -1 : 1;
        // let slideOutPercent = 0;
        // if (this.isDragged) {
        //   // @todo unused variable
        //   slideOutPercent =
        //     this.options.edge === 'left'
        //       ? endPercent + this.percentOpen
        //       : endPercent - this.percentOpen;
        // }
        const duration = this.options.outDuration;
        this.el.style.transition = `transform ${duration}ms ease`; // easeOutQuad
        // to
        this.el.style.transform = 'translateX(' + endPercent * 100 + '%)';
        setTimeout(() => {
            if (typeof this.options.onCloseEnd === 'function')
                this.options.onCloseEnd.call(this, this.el);
        }, duration);
    }
    _animateOverlayIn() {
        let start = 0;
        if (this.isDragged)
            start = this.percentOpen;
        else
            this._overlay.style.display = 'block';
        // Animation
        const duration = this.options.inDuration;
        // from
        this._overlay.style.transition = 'none';
        this._overlay.style.opacity = start.toString();
        // easeOutQuad
        setTimeout(() => {
            this._overlay.style.transition = `opacity ${duration}ms ease`;
            // to
            this._overlay.style.opacity = '1';
        }, 1);
    }
    _animateOverlayOut() {
        const duration = this.options.outDuration;
        // easeOutQuad
        this._overlay.style.transition = `opacity ${duration}ms ease`;
        // to
        this._overlay.style.opacity = '0';
        setTimeout(() => {
            this._overlay.style.display = 'none';
        }, duration);
    }
    _setAriaHidden = () => {
        this.el.ariaHidden = this.isOpen ? 'false' : 'true';
        const navWrapper = document.querySelector('.nav-wrapper ul');
        if (navWrapper)
            navWrapper.ariaHidden = this.isOpen.toString();
    };
    _setTabIndex = () => {
        const navLinks = document.querySelectorAll('.nav-wrapper ul li a');
        const sideNavLinks = document.querySelectorAll('.sidenav li a');
        if (navLinks)
            navLinks.forEach((navLink) => {
                navLink.tabIndex = this.isOpen ? -1 : 0;
            });
        if (sideNavLinks)
            sideNavLinks.forEach((sideNavLink) => {
                sideNavLink.tabIndex = this.isOpen ? 0 : -1;
            });
    };
    static {
        Sidenav._sidenavs = [];
    }
}
