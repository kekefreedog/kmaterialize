/**
 * Nested Dropdown Regression
 *
 * Exercise menu ownership, keyboard levels, viewport placement, and teardown.
 */
// Exercise a three-level dropdown tree.
describe('Nested dropdowns', () => {
  // Prepare the test fixture.
  let fixture;

  // Prepare the component instances.
  let menus;

  // Create a nested menu tree for each scenario.
  beforeEach(() => {
    // Create the fixture container.
    fixture = document.createElement('div');

    // Include two branches and a third level under the first branch.
    fixture.innerHTML = `<button id="nested-root-trigger" class="dropdown-trigger" data-target="nested-root">Actions</button>
      <ul id="nested-root" class="dropdown-content" style="min-width:220px">
        <li><button id="nested-files-trigger" class="dropdown-trigger" data-target="nested-files">Files</button>
          <ul id="nested-files" class="dropdown-content">
            <li><button id="nested-export-trigger" class="dropdown-trigger" data-target="nested-export">Export</button>
              <ul id="nested-export" class="dropdown-content"><li><button id="nested-pdf">PDF</button></li><li><button>CSV</button></li></ul>
            </li><li><button id="nested-save">Save</button></li>
          </ul>
        </li>
        <li><button id="nested-view-trigger" class="dropdown-trigger" data-target="nested-view">View</button>
          <ul id="nested-view" class="dropdown-content"><li><button>Grid</button></li></ul>
        </li>
      </ul>`;

    // Mount the fixture before initialization.
    document.body.append(fixture);

    // Initialize every trigger with immediate transitions.
    menus = M.Dropdown.init(fixture.querySelectorAll('.dropdown-trigger'), { inDuration: 0, outDuration: 0, constrainWidth: false, coverTrigger: false, container: fixture });
  });

  // Clean up the whole tree after each scenario.
  afterEach(() => {
    // Destroy the root and its registered descendants.
    if(M.Dropdown.getInstance(menus[0].el))
      // Tear down the menu tree without changing unrelated instances.
      menus[0].destroy();

    // Remove the fixture markup.
    fixture.remove();
  });

  // Exercise one keyboard level at a time.
  it('opens three levels and returns one level with Left and Escape', async () => {
    // Open the root menu.
    menus[0].open();

    // Wait for opening handlers.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Focus the first branch.
    menus[0].dropdownEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    // Open its submenu.
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // Wait for submenu focus.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Verify parent and child both remain open.
    expect(menus[0].isOpen && menus[1].isOpen).toBeTrue();

    // Verify focus moved into the child.
    expect(document.activeElement === menus[1].dropdownEl.children[0]).toBeTrue();

    // Open the third level.
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    // Wait for the deepest level to receive focus.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Verify the submenu escapes parent overflow through the top layer.
    expect(menus[2].dropdownEl.matches(':popover-open')).toBeTrue();

    // Return to the second level.
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

    // Verify only the deepest level closes.
    expect(menus[2].isOpen).toBeFalse();

    // Verify focus returns to its submenu trigger.
    expect(document.activeElement.id).toBe('nested-export-trigger');

    // Close the second level.
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Verify the root remains open.
    expect(menus[0].isOpen && !menus[1].isOpen).toBeTrue();

    // Verify focus returns to the root branch trigger.
    expect(document.activeElement.id).toBe('nested-files-trigger');

    // Close the root.
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Verify the root trigger receives focus.
    expect(document.activeElement.id).toBe('nested-root-trigger');
  });

  // Keep parent toggles separate from leaf activation.
  it('keeps parent menus open on toggles and closes the tree on a leaf click', async () => {
    // Track callbacks on the parent menu.
    const rootSelection = jasmine.createSpy('root selection');

    // Track callbacks on the owning submenu.
    const childSelection = jasmine.createSpy('child selection');

    // Attach the root callback.
    menus[0].options.onItemClick = rootSelection;

    // Attach the child callback.
    menus[1].options.onItemClick = childSelection;

    // Open the root.
    menus[0].open();

    // Wait for document click handling.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Toggle the Files branch.
    fixture.querySelector('#nested-files-trigger').click();

    // Wait for the child to open.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Verify the parent stays open.
    expect(menus[0].isOpen && menus[1].isOpen).toBeTrue();

    // Verify a branch toggle is not a selection.
    expect(rootSelection).not.toHaveBeenCalled();

    // Activate a leaf action.
    fixture.querySelector('#nested-save').click();

    // Verify the entire tree closes.
    expect(menus.every(menu => !menu.isOpen)).toBeTrue();

    // Verify only the owning menu reports the action.
    expect(childSelection).toHaveBeenCalledTimes(1);

    // Verify the root did not report a child action again.
    expect(rootSelection).not.toHaveBeenCalled();
  });

  // Avoid multiple overlapping branches at one level.
  it('opens hovered branches and dismisses their siblings', async () => {
    // Open the root menu.
    menus[0].open();

    // Wait for the root to settle.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Hover the Files branch.
    fixture.querySelector('#nested-files-trigger').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));

    // Wait for the deliberate hover delay.
    await new Promise(resolve => setTimeout(resolve, 180));

    // Verify pointer navigation opens the child.
    expect(menus[1].isOpen).toBeTrue();

    // Verify hovering did not move the root's keyboard cursor.
    expect(menus[0].focusedIndex).toBe(-1);

    // Verify pointer navigation leaves keyboard focus on the root menu.
    expect(document.activeElement === menus[0].dropdownEl).toBeTrue();

    // Hover the sibling branch.
    fixture.querySelector('#nested-view-trigger').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));

    // Wait for sibling activation.
    await new Promise(resolve => setTimeout(resolve, 180));

    // Verify only the new branch remains open.
    expect(!menus[1].isOpen && menus[3].isOpen).toBeTrue();
  });

  // Prevent clipping at the viewport's right edge.
  it('flips a submenu to the left when the right side has no room', async () => {
    // Anchor the root near the right viewport edge.
    menus[0].el.style.cssText = 'position:fixed;right:8px;top:40px;width:220px';

    // Align the root popup to its trigger's right edge.
    menus[0].options.alignment = 'right';

    // Open the root menu.
    menus[0].open();

    // Wait for root positioning.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Open the child menu.
    menus[1].open();

    // Wait for child positioning.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Read the parent's visible bounds.
    const parent = menus[0].dropdownEl.getBoundingClientRect();

    // Read the child's visible bounds.
    const child = menus[1].dropdownEl.getBoundingClientRect();

    // Verify the child is placed before the parent's left edge.
    expect(child.right).toBeLessThanOrEqual(parent.left);

    // Verify the submenu remains inside the viewport.
    expect(child.left).toBeGreaterThanOrEqual(0);
  });

  // Prevent orphan top-layer menus after component teardown.
  it('destroys open descendants with the root', async () => {
    // Open the root menu.
    menus[0].open();

    // Wait for root initialization.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Open a descendant.
    menus[1].open();

    // Wait for the descendant popover.
    await new Promise(resolve => setTimeout(resolve, 30));

    // Destroy the whole tree.
    menus[0].destroy();

    // Verify all instance references were removed.
    expect(menus.every(menu => !M.Dropdown.getInstance(menu.el))).toBeTrue();

    // Verify no native popup remains open.
    expect(fixture.querySelector(':popover-open')).toBeNull();
  });
});
