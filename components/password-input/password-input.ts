import { Component, BaseOptions, InitElements, MElement } from '../../src/component';

export interface PasswordInputOptions extends BaseOptions {
    /** Accessible name when the password is hidden. */
    showLabel: string;
    /** Accessible name when the password is visible. */
    hideLabel: string;
}

type PasswordInputElement = HTMLInputElement & { M_PasswordInput?: PasswordInput };

const _defaults: PasswordInputOptions = {
    showLabel: 'Show password',
    hideLabel: 'Hide password'
};

/**
 * Show or hide a password with an accessible suffix button.
 * Existing data-password-toggle-icon wrappers remain supported.
 */
export class PasswordInput extends Component<PasswordInputOptions> {
    declare el: PasswordInputElement;
    private _suffixEl: HTMLElement | null;
    private _stateObserver: MutationObserver;
    private _originalAttributes: Map<string, string | null> = new Map();

    constructor(el: HTMLInputElement, options: Partial<PasswordInputOptions>) {
        super(el, options, PasswordInput);
        this.el.M_PasswordInput = this;
        this.options = { ...PasswordInput.defaults, ...options };
        this._suffixEl = this.el.parentElement?.querySelector<HTMLElement>('[data-password-toggle-icon]') ?? null;

        if (this._suffixEl) {
            for (const name of ['type', 'role', 'tabindex', 'aria-label', 'aria-pressed', 'aria-controls', 'aria-disabled', 'disabled', 'icon-text'])
                this._originalAttributes.set(name, this._suffixEl.getAttribute(name));

            if (this._suffixEl instanceof HTMLButtonElement) {
                this._suffixEl.type = 'button';
            } else if (!this._isCrazyButton()) {
                this._suffixEl.setAttribute('role', 'button');
                this._suffixEl.tabIndex = 0;
            }

            if (this.el.id) this._suffixEl.setAttribute('aria-controls', this.el.id);
        }

        // Read the actual input type, including an initially visible password.
        this._syncState();
        this._suffixEl?.addEventListener('click', this._handleToggleClick);
        this._suffixEl?.addEventListener('keydown', this._handleToggleKeydown);
        this._stateObserver = new MutationObserver(() => this._syncState());
        this._stateObserver.observe(this.el, { attributes: true, attributeFilter: ['type', 'disabled'] });
        for (let parent = this.el.parentElement; parent; parent = parent.parentElement) {
            if (parent instanceof HTMLFieldSetElement)
                this._stateObserver.observe(parent, { attributes: true, attributeFilter: ['disabled'] });
        }
    }

    static get defaults(): PasswordInputOptions {
        return _defaults;
    }

    static init(el: HTMLInputElement, options?: Partial<PasswordInputOptions>): PasswordInput;
    static init(els: InitElements<HTMLInputElement | MElement>, options?: Partial<PasswordInputOptions>): PasswordInput[];
    static init(
        els: HTMLInputElement | InitElements<HTMLInputElement | MElement>,
        options: Partial<PasswordInputOptions> = {}
    ): PasswordInput | PasswordInput[] {
        return super.init(els, options, PasswordInput);
    }

    static getInstance(el: HTMLInputElement): PasswordInput {
        return (el as PasswordInputElement).M_PasswordInput!;
    }

    /** Remove listeners and restore the supplied button attributes. */
    destroy() {
        this._stateObserver.disconnect();
        this._suffixEl?.removeEventListener('click', this._handleToggleClick);
        this._suffixEl?.removeEventListener('keydown', this._handleToggleKeydown);
        for (const [name, value] of this._originalAttributes) {
            if (value === null) this._suffixEl?.removeAttribute(name);
            else this._suffixEl?.setAttribute(name, value);
        }
        this.el.M_PasswordInput = undefined;
    }

    /** Toggle without submitting the form or changing its value or selection. */
    toggle() {
        if (this.el.matches(':disabled')) return;
        const start = this.el.selectionStart;
        const end = this.el.selectionEnd;
        const direction = this.el.selectionDirection;
        this.el.type = this.el.type === 'password' ? 'text' : 'password';
        if (start !== null && end !== null) this.el.setSelectionRange(start, end, direction ?? undefined);
        this._syncState();
    }

    private _isCrazyButton(): boolean {
        return this._suffixEl?.matches('crazy-button, regular-btn') ?? false;
    }

    private _syncState() {
        const visible = this.el.type === 'text';
        const disabled = this.el.matches(':disabled');
        this.el.dataset.passwordVisible = visible ? '1' : '0';
        this._suffixEl?.setAttribute('aria-label', visible ? this.options.hideLabel : this.options.showLabel);
        this._suffixEl?.setAttribute('aria-pressed', String(visible));
        this._suffixEl?.setAttribute('aria-disabled', String(disabled));
        if (this._suffixEl instanceof HTMLButtonElement) this._suffixEl.disabled = disabled;
        if (this._isCrazyButton()) {
            this._suffixEl?.toggleAttribute('disabled', disabled);
            this._suffixEl?.setAttribute('icon-text', visible ? 'visibility_off' : 'visibility');
        } else {
            const icon = this._suffixEl?.querySelector('i');
            if (icon) icon.textContent = visible ? 'visibility_off' : 'visibility';
        }
    }

    private _handleToggleClick = (event: MouseEvent) => {
        event.preventDefault();
        this.toggle();
    };

    private _handleToggleKeydown = (event: KeyboardEvent) => {
        // Native buttons already dispatch clicks for Enter and Space.
        if (this._suffixEl instanceof HTMLButtonElement || this._isCrazyButton() || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        this.toggle();
    };
}
