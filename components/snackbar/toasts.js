const _defaults = {
    text: '',
    displayLength: 4000,
    inDuration: 300,
    outDuration: 375,
    classes: '',
    completeCallback: null,
    activationPercent: 0.8
};
export class Toast {
    /** The toast element. */
    el;
    /**
     * The remaining amount of time in ms that the toast
     * will stay before dismissal.
     */
    timeRemaining;
    /**
     * Describes the current pan state of the Toast.
     */
    panning;
    options;
    message;
    counterInterval;
    wasSwiped;
    startingXPos;
    xPos;
    time;
    deltaX;
    velocityX;
    static _toasts;
    static _container;
    static _draggedToast;
    constructor(options) {
        this.options = {
            ...Toast.defaults,
            ...options
        };
        this.message = this.options.text;
        this.panning = false;
        this.timeRemaining = this.options.displayLength;
        if (!Toast._container) {
            Toast._createContainer();
        }
        // Create new toast
        Toast._toasts.push(this);
        const toastElement = this._createToast();
        toastElement['M_Toast'] = this;
        this.el = toastElement;
        this._animateIn();
        this._setTimer();
    }
    static get defaults() {
        return _defaults;
    }
    static getInstance(el) {
        return el['M_Toast'];
    }
    static _createContainer() {
        const container = document.createElement('div');
        container.setAttribute('id', 'toast-container');
        // Add event handler
        container.addEventListener('touchstart', Toast._onDragStart);
        container.addEventListener('touchmove', Toast._onDragMove);
        container.addEventListener('touchend', Toast._onDragEnd);
        container.addEventListener('mousedown', Toast._onDragStart);
        document.addEventListener('mousemove', Toast._onDragMove);
        document.addEventListener('mouseup', Toast._onDragEnd);
        document.body.appendChild(container);
        Toast._container = container;
    }
    static _removeContainer() {
        document.removeEventListener('mousemove', Toast._onDragMove);
        document.removeEventListener('mouseup', Toast._onDragEnd);
        if (Toast._container) {
            Toast._container.remove();
            Toast._container = null;
        }
    }
    static _onDragStart(e) {
        if (e.target && e.target.closest('.toast')) {
            const toastElem = e.target.closest('.toast');
            const toast = toastElem['M_Toast'];
            toast.panning = true;
            Toast._draggedToast = toast;
            toast.el.classList.add('panning');
            toast.el.style.transition = '';
            toast.startingXPos = Toast._xPos(e);
            toast.time = Date.now();
            toast.xPos = Toast._xPos(e);
        }
    }
    static _onDragMove(e) {
        if (!!Toast._draggedToast) {
            e.preventDefault();
            const toast = Toast._draggedToast;
            toast.deltaX = Math.abs(toast.xPos - Toast._xPos(e));
            toast.xPos = Toast._xPos(e);
            toast.velocityX = toast.deltaX / (Date.now() - toast.time);
            toast.time = Date.now();
            const totalDeltaX = toast.xPos - toast.startingXPos;
            const activationDistance = toast.el.offsetWidth * toast.options.activationPercent;
            toast.el.style.transform = `translateX(${totalDeltaX}px)`;
            toast.el.style.opacity = (1 - Math.abs(totalDeltaX / activationDistance)).toString();
        }
    }
    static _onDragEnd() {
        if (!!Toast._draggedToast) {
            const toast = Toast._draggedToast;
            toast.panning = false;
            toast.el.classList.remove('panning');
            const totalDeltaX = toast.xPos - toast.startingXPos;
            const activationDistance = toast.el.offsetWidth * toast.options.activationPercent;
            const shouldBeDismissed = Math.abs(totalDeltaX) > activationDistance || toast.velocityX > 1;
            // Remove toast
            if (shouldBeDismissed) {
                toast.wasSwiped = true;
                toast.dismiss();
                // Animate toast back to original position
            }
            else {
                toast.el.style.transition = 'transform .2s, opacity .2s';
                toast.el.style.transform = '';
                toast.el.style.opacity = '';
            }
            Toast._draggedToast = null;
        }
    }
    static _xPos(e) {
        if (e.type.startsWith('touch') && e.targetTouches.length >= 1) {
            return e.targetTouches[0].clientX;
        }
        // mouse event
        return e.clientX;
    }
    /**
     * dismiss all toasts.
     */
    static dismissAll() {
        for (const toastIndex in Toast._toasts) {
            Toast._toasts[toastIndex].dismiss();
        }
    }
    _createToast() {
        let toast = this.options.toastId
            ? document.getElementById(this.options.toastId)
            : document.createElement('div');
        if (toast instanceof HTMLTemplateElement) {
            const node = toast.content.cloneNode(true);
            toast = node.firstElementChild;
        }
        toast.classList.add('toast');
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        // Add custom classes onto toast
        if (this.options.classes.length > 0) {
            toast.classList.add(...this.options.classes.split(' '));
        }
        if (this.message)
            toast.innerText = this.message;
        if (Toast._container) {
            Toast._container.appendChild(toast);
        }
        return toast;
    }
    _animateIn() {
        // Animate toast in
        this.el.style.display = '';
        this.el.style.opacity = '0';
        // easeOutCubic
        this.el.style.transition = `
      top ${this.options.inDuration}ms ease,
      opacity ${this.options.inDuration}ms ease
    `;
        setTimeout(() => {
            this.el.style.top = '0';
            this.el.style.opacity = '1';
        }, 1);
    }
    /**
     * Create setInterval which automatically removes toast when timeRemaining >= 0
     * has been reached.
     */
    _setTimer() {
        if (this.timeRemaining !== Infinity) {
            this.counterInterval = setInterval(() => {
                // If toast is not being dragged, decrease its time remaining
                if (!this.panning) {
                    this.timeRemaining -= 20;
                }
                // Animate toast out
                if (this.timeRemaining <= 0) {
                    this.dismiss();
                }
            }, 20);
        }
    }
    /**
     * Dismiss toast with animation.
     */
    dismiss() {
        clearInterval(this.counterInterval);
        const activationDistance = this.el.offsetWidth * this.options.activationPercent;
        if (this.wasSwiped) {
            this.el.style.transition = 'transform .05s, opacity .05s';
            this.el.style.transform = `translateX(${activationDistance}px)`;
            this.el.style.opacity = '0';
        }
        // easeOutExpo
        this.el.style.transition = `
      margin ${this.options.outDuration}ms ease,
      opacity ${this.options.outDuration}ms ease`;
        setTimeout(() => {
            this.el.style.opacity = '0';
            this.el.style.marginTop = '-40px';
        }, 1);
        setTimeout(() => {
            // Call the optional callback
            if (typeof this.options.completeCallback === 'function') {
                this.options.completeCallback();
            }
            // Remove toast from DOM
            if (this.el.id != this.options.toastId) {
                this.el.remove();
                const toastIndex = Toast._toasts.indexOf(this);
                // indexOf returns -1 if this toast is no longer tracked (e.g. the
                // static state was already reset elsewhere); splice(-1, 1) would
                // otherwise silently remove an unrelated, still-active toast.
                if (toastIndex !== -1) {
                    Toast._toasts.splice(toastIndex, 1);
                }
                if (Toast._toasts.length === 0) {
                    Toast._removeContainer();
                }
            }
        }, this.options.outDuration);
    }
    static {
        Toast._toasts = [];
        Toast._container = null;
        Toast._draggedToast = null;
    }
}
