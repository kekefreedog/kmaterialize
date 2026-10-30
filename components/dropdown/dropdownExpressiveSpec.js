/**
 * Expressive Dropdown Keyboard Regression
 *
 * Verify that keyboard focus remains visible without selecting unavailable rows.
 */
// Exercise both theme palettes with real menu keyboard handling.
describe('Expressive dropdown keyboard focus', () => {
  // Prepare the fixture reference.
  let fixture;

  // Prepare the dropdown instance.
  let dropdown;

  // Preserve the active theme.
  let previousTheme;

  // Create an isolated menu for each check.
  beforeEach(() => {
    // Remember the caller's theme.
    previousTheme = document.documentElement.getAttribute('theme');

    // Create the menu container.
    fixture = document.createElement('div');

    // Include selection, separators, disabled items, and a normal action.
    fixture.innerHTML = `<style>#expressive-menu > li { transition: none; }</style><button id="expressive-trigger" data-target="expressive-menu">Open</button>
      <ul id="expressive-menu" class="dropdown-content">
        <li class="selected" aria-selected="true"><button>Selected view</button></li>
        <li class="divider" role="separator"></li>
        <li class="disabled" aria-disabled="true"><span>Unavailable</span></li>
        <li><button>Other view</button></li>
      </ul>`;

    // Mount the fixture before initializing the popover.
    document.body.append(fixture);

    // Disable animation delays for deterministic keyboard checks.
    dropdown = M.Dropdown.init(fixture.querySelector('button'), { inDuration: 0, outDuration: 0 });
  });

  // Restore the page after each check.
  afterEach(() => {
    // Remove component event handlers.
    dropdown.destroy();

    // Remove the test markup.
    fixture.remove();

    // Restore the caller's explicit theme when present.
    if(previousTheme !== null)
      // Restore the previous theme value.
      document.documentElement.setAttribute('theme', previousTheme);
    else
      // Restore automatic theme selection.
      document.documentElement.removeAttribute('theme');
  });

  // Check focus visibility and navigation in each theme.
  ['light', 'dark'].forEach((theme) => {
    // Ensure arrow navigation skips decorative rows without changing selection.
    it(`keeps focused items inside the menu in ${theme} mode`, async () => {
      // Apply the palette under test.
      document.documentElement.setAttribute('theme', theme);

      // Open the dropdown.
      dropdown.open();

      // Wait for the opening task to bind keyboard handlers.
      await new Promise(resolve => setTimeout(resolve, 30));

      // Resolve the menu rows.
      const rows = dropdown.dropdownEl.children;

      // Move focus to the selected first row.
      dropdown.dropdownEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Verify the initial keyboard position.
      expect(document.activeElement === rows[0]).toBeTrue();

      // Move across the separator and disabled row.
      rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      // Verify that only an available row receives focus.
      expect(document.activeElement === rows[3]).toBeTrue();

      // Verify that moving focus preserves the selected item.
      expect(rows[0].getAttribute('aria-selected')).toBe('true');

      // Read the focus indicator geometry.
      const focusedStyle = getComputedStyle(rows[3]);

      // Verify that the focus ring fits entirely inside the row.
      expect(parseFloat(focusedStyle.outlineOffset) + parseFloat(focusedStyle.outlineWidth)).toBeLessThanOrEqual(0);

      // Verify a visible focused state against the menu surface.
      expect(focusedStyle.backgroundColor).not.toBe(getComputedStyle(dropdown.dropdownEl).backgroundColor);

      // Verify the item fits inside the scrolling surface.
      expect(rows[3].getBoundingClientRect().right).toBeLessThanOrEqual(dropdown.dropdownEl.getBoundingClientRect().right);

      // Move backwards over the unavailable rows.
      rows[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

      // Verify reverse navigation returns to the first row.
      expect(document.activeElement === rows[0]).toBeTrue();

      // Close the menu from the keyboard.
      rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // Verify that Escape closes the dropdown.
      expect(dropdown.isOpen).toBeFalse();

      // Verify focus returns to the trigger.
      expect(document.activeElement === dropdown.el).toBeTrue();
    });
  });
});
