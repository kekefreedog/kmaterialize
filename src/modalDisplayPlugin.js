const _defaults = {
    classList: ['modal'],
    title: null,
    onOpen: null,
    onClose: null,
};
export class ModalDisplayPlugin {
    el;
    container;
    options;
    visible;
    footer;
    constructor(el, container, options) {
        this.el = el;
        this.options = {
            ..._defaults,
            ...options,
        };
        this.container = document.createElement('dialog');
        this.container.classList.add('modal', 'display-modal', this.options.classList.join(' '));
        if (options.title) {
            const modalHeader = document.createElement('div');
            modalHeader.classList.add('modal-header');
            modalHeader.append(options.title);
            this.container.append(modalHeader);
        }
        const modalContent = document.createElement('div');
        modalContent.classList.add('modal-content');
        modalContent.append(container);
        this.container.append(modalContent);
        this.footer = document.createElement('div');
        this.footer.classList.add('modal-footer');
        this.container.append(this.footer);
        document.body.append(this.container);
        document.addEventListener('click', (e) => {
            if (this.visible && !(this.el === e.target) && !(e.target.closest('.display-modal'))) {
                this.hide();
            }
        }, true);
    }
    /**
     * Initializes instance of ModalDisplayPlugin
     * @param el HTMLElement to position to
     * @param container HTMLElement to be positioned
     * @param options Plugin options
     */
    static init(el, container, options) {
        return new ModalDisplayPlugin(el, container, options);
    }
    show = () => {
        if (this.visible)
            return;
        this.visible = true;
        this.container.setAttribute('open', 'true');
        setTimeout(() => {
            if (typeof this.options.onOpen == 'function') {
                this.options.onOpen.call(this);
            }
        }, 10);
    };
    hide = () => {
        if (!this.visible)
            return;
        this.visible = false;
        this.container.removeAttribute('open');
        setTimeout(() => {
            if (typeof this.options.onClose == 'function') {
                this.options.onClose.call(this);
            }
        }, 10);
    };
}
