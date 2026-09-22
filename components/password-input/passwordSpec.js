describe('PasswordInput', function() {
    let fixture;
    let input;
    let button;
    let instance;

    beforeEach(function() {
        fixture = document.createElement('form');
        fixture.innerHTML = '<div class="input-field"><input id="password-test" type="password" value="example-secret" data-password-toggle><button class="suffix btn-flat p-0 transparent" data-password-toggle-icon><i class="material-icons">visibility</i></button></div>';
        document.body.appendChild(fixture);
        input = fixture.querySelector('input');
        button = fixture.querySelector('button');
        instance = M.PasswordInput.init(input);
    });

    afterEach(function() {
        M.PasswordInput.getInstance(input)?.destroy();
        fixture.remove();
    });

    it('toggles the supplied suffix button without submitting or changing the value', function() {
        const submit = jasmine.createSpy('submit');
        fixture.addEventListener('submit', submit);
        input.setSelectionRange(2, 5);
        expect(button.type).toBe('button');
        expect(button.getAttribute('aria-controls')).toBe(input.id);
        expect(button.getAttribute('aria-label')).toBe('Show password');
        button.click();
        expect(input.type).toBe('text');
        expect(input.value).toBe('example-secret');
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(5);
        expect(button.getAttribute('aria-label')).toBe('Hide password');
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.querySelector('i').textContent).toBe('visibility_off');
        button.click();
        expect(input.type).toBe('password');
        expect(input.dataset.passwordVisible).toBe('0');
        expect(button.getAttribute('aria-pressed')).toBe('false');
        expect(submit).not.toHaveBeenCalled();
    });

    it('does not toggle a disabled input and synchronizes the button', async function() {
        input.disabled = true;
        instance.toggle();
        await Promise.resolve();
        expect(input.type).toBe('password');
        expect(button.disabled).toBeTrue();
        input.disabled = false;
        await Promise.resolve();
        expect(button.disabled).toBeFalse();
    });

    it('follows a disabled fieldset', async function() {
        instance.destroy();
        const fieldset = document.createElement('fieldset');
        fixture.appendChild(fieldset);
        fieldset.appendChild(input.parentElement);
        instance = M.PasswordInput.init(input);
        fieldset.disabled = true;
        await Promise.resolve();
        expect(button.disabled).toBeTrue();
        instance.toggle();
        expect(input.type).toBe('password');
        fieldset.disabled = false;
        await Promise.resolve();
        expect(button.disabled).toBeFalse();
    });

    it('uses the actual type for initially visible passwords and custom labels', function() {
        instance.destroy();
        input.type = 'text';
        instance = M.PasswordInput.init(input, { showLabel: 'Afficher', hideLabel: 'Masquer' });
        expect(button.getAttribute('aria-label')).toBe('Masquer');
        button.click();
        expect(input.type).toBe('password');
        expect(button.getAttribute('aria-label')).toBe('Afficher');
    });

    it('keeps readonly passwords revealable', function() {
        input.readOnly = true;
        button.click();
        expect(input.type).toBe('text');
        expect(input.readOnly).toBeTrue();
    });

    it('reinitializes without duplicate listeners and destroys cleanly', function() {
        instance = M.PasswordInput.init(input);
        button.click();
        expect(input.type).toBe('text');
        instance.destroy();
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(input.type).toBe('text');
        expect(M.PasswordInput.getInstance(input)).toBeUndefined();
        expect(button.hasAttribute('aria-pressed')).toBeFalse();
    });

    it('supports keyboard activation on legacy suffix wrappers', function() {
        instance.destroy();
        button.outerHTML = '<div data-password-toggle-icon><i>visibility</i></div>';
        button = fixture.querySelector('[data-password-toggle-icon]');
        instance = M.PasswordInput.init(input);
        expect(button.getAttribute('role')).toBe('button');
        expect(button.tabIndex).toBe(0);
        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(input.type).toBe('text');
        button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        expect(input.type).toBe('password');
    });
});
