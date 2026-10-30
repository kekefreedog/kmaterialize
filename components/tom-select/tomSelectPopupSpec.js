/**
 * Tom Select Popup Checks
 *
 * Verify clipped popup menus, scrolling, explicit parents and teardown.
 */

// Exercise the public select component without application-specific overrides.
describe('TomSelectField popup menus', function(){

    // Retain the optional peer assets for suite cleanup.
    const assets = [];

    // Retain each mounted field for teardown after failed assertions.
    let field;

    // Retain the fixture container for cleanup.
    let fixture;

    // Load the same optional peer used by plain-script consumers.
    beforeAll(async function(){

        // Create the peer script element.
        const script = document.createElement('script');

        // Use the installed Tom Select distribution.
        script.src = '/__spec__/node_modules/tom-select/dist/js/tom-select.complete.min.js';

        // Create the peer stylesheet element.
        const style = document.createElement('link');

        // Load the baseline select styles before exercising geometry.
        style.rel = 'stylesheet';

        // Use the installed peer's stylesheet.
        style.href = '/__spec__/node_modules/tom-select/dist/css/tom-select.css';

        // Retain both elements for teardown.
        assets.push(script, style);

        // Wait until both optional assets are available.
        await Promise.all(assets.map(element => new Promise((resolve, reject) => {

            // Resolve after the browser has loaded this asset.
            element.onload = resolve;

            // Report a missing test dependency.
            element.onerror = () => reject(new Error('Could not load Tom Select test dependency'));

            // Start loading the peer asset.
            document.head.appendChild(element);

        })));

    });

    // Mount a popup-shaped scrolling boundary for each regression.
    beforeEach(function(){

        // Create the popup fixture.
        fixture = document.createElement('div');

        // Match the popup context recognized by the component.
        fixture.className = 'swal2-popup';

        // Reproduce a positioned popup above ordinary page content.
        fixture.style.cssText = 'position:fixed;left:40px;top:40px;width:320px;display:block;z-index:1100;background:white';

        // Place the field near a clipped content edge with enough content to scroll.
        fixture.innerHTML = '<div class="popup-scroll" style="height:120px;overflow:auto"><div style="padding-top:60px;padding-bottom:160px"><div class="input-field"><select><option value="quicktime">Daily Quicktime</option><option value="offline">Offline</option><option value="review">Daily Review</option></select></div></div></div>';

        // Attach the fixture before initializing the field.
        document.body.appendChild(fixture);

    });

    // Remove menus and listeners even when a check fails.
    afterEach(function(){

        // Destroy any surviving component instance.
        field?.destroy();

        // Release the field reference for the next check.
        field = undefined;

        // Remove only this test's fixture.
        fixture.remove();

    });

    // Remove optional peer assets after the suite.
    afterAll(function(){

        // Release the loaded script and stylesheet.
        assets.forEach(element => element.remove());

    });

    // Require the final menu item to escape clipping and remain selectable.
    it('exposes the last option outside clipped popup content', async function(){

        // Initialize through the public API without a custom dropdown parent.
        field = M.TomSelectField.init(fixture.querySelector('select'));

        // Wait for the optional peer and control setup.
        await field.ready;

        // Render available options before opening the menu programmatically.
        field.tomSelect.refreshOptions(false);

        // Open the populated dropdown.
        field.tomSelect.open();

        // Read the final option's bounds.
        const option = field.tomSelect.dropdown.querySelector('[data-value="review"]');

        // Locate the final option in viewport coordinates.
        const bounds = option.getBoundingClientRect();

        // Require the library to portal popup menus into the body.
        expect(field.tomSelect.dropdown.parentElement).toBe(document.body);

        // Confirm that the final item extends beyond the clipped content.
        expect(bounds.bottom).toBeGreaterThan(fixture.querySelector('.popup-scroll').getBoundingClientRect().bottom);

        // Require the item to receive pointer events above the popup.
        expect(option.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))).toBeTrue();

        // Select the formerly clipped item through its real event handler.
        option.click();

        // Require the native field to receive the selected value.
        expect(field.el.value).toBe('review');

    });

    // Verify portal geometry and listener cleanup across popup scrolling.
    it('tracks nested scrolling and releases the menu and listener on destroy', async function(){

        // Initialize a default popup field.
        field = M.TomSelectField.init(fixture.querySelector('select'));

        // Wait for enhancement before opening the menu.
        await field.ready;

        // Display the menu before changing the scrolling boundary.
        field.tomSelect.open();

        // Observe positioning without replacing the library implementation.
        const reposition = spyOn(field.tomSelect, 'positionDropdown').and.callThrough();

        // Retain the nested scrolling element.
        const scroll = fixture.querySelector('.popup-scroll');

        // Move the control within the popup.
        scroll.scrollTop = 20;

        // Dispatch the non-bubbling event handled by the capture listener.
        scroll.dispatchEvent(new Event('scroll'));

        // Require the dropdown to follow its control.
        expect(reposition).toHaveBeenCalled();

        // Check the calculated document-relative menu position.
        expect(parseFloat(field.tomSelect.dropdown.style.top)).toBeCloseTo(field.tomSelect.control.getBoundingClientRect().bottom + window.scrollY, 0);

        // Retain the portal node to check removal after destruction.
        const dropdown = field.tomSelect.dropdown;

        // Destroy the component while the menu is open.
        field.destroy();

        // Avoid a second component teardown in the shared cleanup.
        field = undefined;

        // Reset the observed positioning calls after teardown.
        reposition.calls.reset();

        // Scroll again after the owner has been destroyed.
        scroll.dispatchEvent(new Event('scroll'));

        // Require the portal node to be removed.
        expect(dropdown.isConnected).toBeFalse();

        // Require the popup listener to have been removed.
        expect(reposition).not.toHaveBeenCalled();

    });

    // Preserve explicit parent choices and ordinary non-popup behavior.
    it('honors an explicit inline parent and keeps ordinary fields inline', async function(){

        // Explicitly request Tom Select's normal inline menu.
        field = M.TomSelectField.init(fixture.querySelector('select'), {settings: {dropdownParent: null}});

        // Wait for the authored configuration to be applied.
        await field.ready;

        // Require the explicit parent to take precedence over popup defaults.
        expect(field.tomSelect.dropdown.parentElement).toBe(field.tomSelect.wrapper);

        // Release the popup field before reusing the native select.
        field.destroy();

        // Turn the same markup into an ordinary page form.
        fixture.classList.remove('swal2-popup');

        // Initialize the ordinary select without popup overrides.
        field = M.TomSelectField.init(fixture.querySelector('select'));

        // Wait for the normal enhancement lifecycle.
        await field.ready;

        // Require ordinary forms to retain their inline dropdown.
        expect(field.tomSelect.dropdown.parentElement).toBe(field.tomSelect.wrapper);

    });

});
