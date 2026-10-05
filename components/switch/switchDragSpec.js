describe('Switch dragging', () => {
    let fixture, input, lever, startX, startY;

    const pointer = (type, dx = 0, dy = 0, target = document, options = {}) => {
        const event = new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 31, isPrimary: true,
            pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
            clientX: startX + dx, clientY: startY + dy, ...options
        });
        target.dispatchEvent(event);
        return event;
    };
    const down = () => pointer('pointerdown', 0, 0, lever);
    const compatibilityClick = () => lever.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, detail: 1
    }));

    beforeEach(() => {
        fixture = document.createElement('form');
        fixture.innerHTML = '<div class="switch"><label>Setting<input type="checkbox" name="enabled" value="yes"><span class="lever"></span></label></div>';
        document.body.append(fixture);
        input = fixture.querySelector('input');
        lever = fixture.querySelector('.lever');
        const rect = lever.getBoundingClientRect();
        startX = rect.left + 16;
        startY = rect.top + rect.height / 2;
    });

    afterEach(() => {
        pointer('pointercancel');
        fixture.remove();
    });

    for(const icon of [false, true]){
        it(`moves the ${icon ? 'icon' : 'plain'} thumb continuously without committing early`, () => {
            if(icon) fixture.firstElementChild.classList.add('switch-with-icon');
            const before = getComputedStyle(lever, '::after');
            const center = parseFloat(before.left) + parseFloat(before.width) / 2;
            down();
            pointer('pointermove', 6);
            const after = getComputedStyle(lever, '::after');
            expect(parseFloat(after.left) + parseFloat(after.width) / 2 - center).toBeCloseTo(6, 0);
            expect(input.checked).toBeFalse();
            expect(lever.classList.contains('is-dragging')).toBeTrue();
        });
    }

    it('keeps the same outer halo throughout plain and icon drags in either state', () => {
        let expectedColor;
        for(const icon of [false, true]){
            fixture.firstElementChild.classList.toggle('switch-with-icon', icon);
            for(const checked of [false, true]){
                input.checked = checked;
                down();
                for(const distance of [6, 15, 60]){
                    pointer('pointermove', checked ? -distance : distance);
                    const halo = getComputedStyle(lever, '::before');
                    const thumb = getComputedStyle(lever, '::after');
                    const scale = new DOMMatrix(halo.transform).a;
                    expect(parseFloat(halo.width) * scale).toBeCloseTo(57.6, 0);
                    expect(parseFloat(halo.height) * scale).toBeGreaterThan(lever.getBoundingClientRect().height);
                    expect(parseFloat(halo.left) + parseFloat(halo.width) / 2).toBeCloseTo(parseFloat(thumb.left) + parseFloat(thumb.width) / 2, 0);
                    expectedColor ??= halo.backgroundColor;
                    expect(halo.backgroundColor).toBe(expectedColor);
                }
                pointer('pointercancel');
            }
        }
    });

    it('commits once on release without toggling again on the following click', () => {
        const change = jasmine.createSpy('change');
        const update = jasmine.createSpy('input');
        input.addEventListener('change', change);
        input.addEventListener('input', update);
        down();
        pointer('pointermove', 15);
        pointer('pointerup', 15);
        compatibilityClick();
        expect(input.checked).toBeTrue();
        expect(change).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledTimes(1);
        expect(new FormData(fixture).get('enabled')).toBe('yes');
        expect(lever.classList.contains('is-dragging')).toBeFalse();
        expect(lever.style.getPropertyValue('--switch-drag-progress')).toBe('');
    });

    it('can drag an enabled switch off', () => {
        input.checked = true;
        down();
        pointer('pointermove', -15);
        pointer('pointerup', -15);
        compatibilityClick();
        expect(input.checked).toBeFalse();
    });

    it('does not toggle or emit a change when released on the original side', () => {
        const change = jasmine.createSpy('change');
        input.addEventListener('change', change);
        down();
        pointer('pointermove', 6);
        pointer('pointerup', 6);
        compatibilityClick();
        expect(input.checked).toBeFalse();
        expect(change).not.toHaveBeenCalled();
    });

    it('can cross the midpoint and return before release', () => {
        down();
        pointer('pointermove', 30);
        pointer('pointermove', 5);
        pointer('pointerup', 5);
        compatibilityClick();
        expect(input.checked).toBeFalse();
    });

    it('leaves short taps to native label activation', () => {
        down();
        pointer('pointermove', 2);
        pointer('pointerup', 2);
        compatibilityClick();
        expect(input.checked).toBeTrue();
    });

    it('does not intercept vertical touch scrolling', () => {
        pointer('pointerdown', 0, 0, lever, {pointerType: 'touch'});
        const event = pointer('pointermove', 2, 20, document, {pointerType: 'touch'});
        pointer('pointerup', 2, 20, document, {pointerType: 'touch'});
        compatibilityClick();
        expect(event.defaultPrevented).toBeFalse();
        expect(input.checked).toBeFalse();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
    });

    for(const reason of ['pointercancel', 'lostpointercapture', 'Escape', 'blur']){
        it(`cancels on ${reason} without changing the value`, () => {
            down();
            pointer('pointermove', 18);
            if(reason === 'Escape')
                input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
            else if(reason === 'blur')
                window.dispatchEvent(new Event('blur'));
            else
                pointer(reason, 18, 0, reason === 'lostpointercapture' ? lever : document);
            pointer('pointerup', 18);
            compatibilityClick();
            expect(input.checked).toBeFalse();
            expect(lever.classList.contains('is-dragging')).toBeFalse();
        });
    }

    it('honors a canceled native activation', () => {
        input.addEventListener('click', event => event.preventDefault());
        const change = jasmine.createSpy('change');
        input.addEventListener('change', change);
        down();
        pointer('pointermove', 18);
        pointer('pointerup', 18);
        expect(input.checked).toBeFalse();
        expect(change).not.toHaveBeenCalled();
    });

    it('honors disabled fieldsets and disabled controls', () => {
        input.disabled = true;
        down(); pointer('pointermove', 18); pointer('pointerup', 18);
        expect(input.checked).toBeFalse();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
        input.disabled = false;
        const fieldset = document.createElement('fieldset');
        fieldset.disabled = true;
        fixture.prepend(fieldset);
        fieldset.append(input.closest('.switch'));
        down(); pointer('pointermove', 18); pointer('pointerup', 18);
        expect(input.checked).toBeFalse();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
    });

    it('does not commit when disabled during a drag', () => {
        down();
        pointer('pointermove', 18);
        input.disabled = true;
        pointer('pointerup', 18);
        expect(input.checked).toBeFalse();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
    });

    it('resets the native value and cancels any pending drag', () => {
        input.defaultChecked = true;
        down();
        pointer('pointermove', -18);
        fixture.reset();
        pointer('pointerup', -18);
        compatibilityClick();
        expect(input.checked).toBeTrue();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
    });

    it('mirrors dragging in right-to-left layouts', () => {
        fixture.dir = 'rtl';
        down();
        pointer('pointermove', -18);
        pointer('pointerup', -18);
        expect(input.checked).toBeTrue();
    });

    it('ignores other pointers while a drag is in progress', () => {
        down();
        pointer('pointermove', 6);
        pointer('pointerup', 30, 0, document, {pointerId: 32, isPrimary: false});
        expect(lever.classList.contains('is-dragging')).toBeTrue();
        pointer('pointerup', 6);
        expect(input.checked).toBeFalse();
    });

    it('ignores a canceled pointer press', () => {
        lever.addEventListener('pointerdown', event => event.preventDefault());
        down(); pointer('pointermove', 18); pointer('pointerup', 18);
        expect(input.checked).toBeFalse();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
    });

    it('cleans up when the control is removed during a drag', () => {
        down();
        pointer('pointermove', 18);
        fixture.remove();
        pointer('pointermove', 20);
        expect(input.checked).toBeFalse();
        expect(lever.classList.contains('is-dragging')).toBeFalse();
    });
});
