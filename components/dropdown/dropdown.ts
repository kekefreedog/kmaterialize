import { Utils } from '../../src/utils';
import { Component, BaseOptions, InitElements, MElement, Openable } from '../../src/component';

export interface DropdownOptions extends BaseOptions {
  /**
   * Defines the edge the menu is aligned to.
   * @default 'left'
   */
  alignment: 'left' | 'right';
  /**
   * If true, automatically focus dropdown el for keyboard.
   * @default true
   */
  autoFocus: boolean;
  /**
   * If true, constrainWidth to the size of the dropdown activator.
   * @default true
   */
  constrainWidth: boolean;
  /**
   * Provide an element that will be the bounding container of the dropdown.
   * @default null
   */
  container: Element;
  /**
   * If false, the dropdown will show below the trigger.
   * @default true
   */
  coverTrigger: boolean;
  /**
   * If true, close dropdown on item click.
   * @default true
   */
  closeOnClick: boolean;
  /**
   * If true, the dropdown will open on hover.
   * @default false
   */
  hover: boolean;
  /**
   * The duration of the transition enter in milliseconds.
   * @default 150
   */
  inDuration: number;
  /**
   * The duration of the transition out in milliseconds.
   * @default 250
   */
  outDuration: number;
  /**
   * Function called when dropdown starts entering.
   * @default null
   */
  onOpenStart: (el: HTMLElement) => void;
  /**
   * Function called when dropdown finishes entering.
   * @default null
   */
  onOpenEnd: (el: HTMLElement) => void;
  /**
   * Function called when dropdown starts exiting.
   * @default null
   */
  onCloseStart: (el: HTMLElement) => void;
  /**
   * Function called when dropdown finishes exiting.
   * @default null
   */
  onCloseEnd: (el: HTMLElement) => void;
  /**
   * Function called when item is clicked.
   * @default null
   */
  onItemClick: (el: HTMLLIElement) => void;
}

const _defaults: DropdownOptions = {
  alignment: 'left',
  autoFocus: true,
  constrainWidth: true,
  container: null,
  coverTrigger: true,
  closeOnClick: true,
  hover: false,
  inDuration: 150,
  outDuration: 250,
  onOpenStart: null,
  onOpenEnd: null,
  onCloseStart: null,
  onCloseEnd: null,
  onItemClick: null
};

export class Dropdown extends Component<DropdownOptions> implements Openable {
  static _dropdowns: Dropdown[] = [];
  /** ID of the dropdown element. */
  id: string;
  /** The DOM element of the dropdown. */
  dropdownEl: HTMLElement;
  /** If the dropdown is open. */
  isOpen: boolean;
  /** If the dropdown content is scrollable. */
  isScrollable: boolean;
  isTouchMoving: boolean;
  /** The index of the item focused. */
  focusedIndex: number;
  filterQuery: string[];
  filterTimeout: NodeJS.Timeout | number;

  /** Timers owned by the current opening or closing animation. */
  private _animationTimers:Array<ReturnType<typeof setTimeout>> = [];
  /** Delay before opening a submenu with the pointer. */
  private _submenuTimer:ReturnType<typeof setTimeout>;
  /** Whether this opening should transfer keyboard focus. */
  private _focusOnOpen:boolean = true;

  constructor(el: HTMLElement, options: Partial<DropdownOptions>) {
    super(el, options, Dropdown);
    this.el['M_Dropdown'] = this;

    Dropdown._dropdowns.push(this);
    this.id = Utils.getIdFromTrigger(el);
    this.dropdownEl = document.getElementById(this.id);

    this.options = {
      ...Dropdown.defaults,
      ...options
    };

    this.isOpen = false;
    this.isScrollable = false;
    this.isTouchMoving = false;
    this.focusedIndex = -1;
    this.filterQuery = [];
    this.el.ariaExpanded = 'false';

    // Move dropdown-content after dropdown-trigger
    this._moveDropdownToElement();
    this._makeDropdownFocusable();
    this._setupEventHandlers();
  }

  static get defaults(): DropdownOptions {
    return _defaults;
  }

  /**
   * Initializes instance of Dropdown.
   * @param el HTML element.
   * @param options Component options.
   */
  static init(el: HTMLElement, options?: Partial<DropdownOptions>): Dropdown;
  /**
   * Initializes instances of Dropdown.
   * @param els HTML elements.
   * @param options Component options.
   */
  static init(els: InitElements<MElement>, options?: Partial<DropdownOptions>): Dropdown[];
  /**
   * Initializes instances of Dropdown.
   * @param els HTML elements.
   * @param options Component options.
   */
  static init(
    els: HTMLElement | InitElements<MElement>,
    options: Partial<DropdownOptions> = {}
  ): Dropdown | Dropdown[] {
    return super.init(els, options, Dropdown);
  }

  static getInstance(el: HTMLElement): Dropdown {
    return el['M_Dropdown'];
  }

  destroy() {
    // Destroy descendants before unregistering their parent.
    this._getChildren().forEach(child => child.destroy());

    // Close without stealing focus during teardown.
    this._close(false);

    // Cancel pending animation callbacks.
    this._clearAnimationTimers();

    // Cancel delayed pointer navigation.
    clearTimeout(this._submenuTimer);

    // Remove temporary and permanent listeners.
    this._removeTemporaryEventHandlers();

    // Remove permanent listeners.
    this._removeEventHandlers();

    // Remove a submenu from the native top layer during immediate teardown.
    if(this.dropdownEl.matches(':popover-open'))
      // Hide without waiting for a cancelled closing animation.
      this.dropdownEl.hidePopover();

    // Restore the hidden menu styles.
    this._resetDropdownStyles();

    // Remove submenu presentation metadata.
    this.dropdownEl.removeAttribute('data-submenu');

    // Unregister this instance.
    Dropdown._dropdowns.splice(Dropdown._dropdowns.indexOf(this), 1);

    // Remove the element instance reference.
    this.el['M_Dropdown'] = undefined;
  }

  _setupEventHandlers() {
    // Handle keyboard activation of the root trigger.
    this.el.addEventListener('keydown', this._handleTriggerKeydown);

    // Dispatch item callbacks for the owning menu only.
    this.dropdownEl?.addEventListener('click', this._handleDropdownClick);

    // Open submenu rows on pointer hover.
    this.dropdownEl?.addEventListener('pointerover', this._handleMenuPointerOver);

    // Cancel pending submenu opening when leaving a menu.
    this.dropdownEl?.addEventListener('pointerleave', this._handleMenuPointerLeave);

    // Preserve the existing root hover option.
    if(this.options.hover){
      // Open a hover trigger.
      this.el.addEventListener('mouseenter', this._handleMouseEnter);

      // Track pointer exit from the trigger.
      this.el.addEventListener('mouseleave', this._handleMouseLeave);

      // Track pointer exit from the menu.
      this.dropdownEl.addEventListener('mouseleave', this._handleMouseLeave);
    }else{
      // Toggle click and touch triggers.
      this.el.addEventListener('click', this._handleClick);
    }
  }

  _removeEventHandlers() {
    // Remove trigger keyboard handling.
    this.el.removeEventListener('keydown', this._handleTriggerKeydown);

    // Remove item callback handling.
    this.dropdownEl.removeEventListener('click', this._handleDropdownClick);

    // Remove submenu hover handling.
    this.dropdownEl.removeEventListener('pointerover', this._handleMenuPointerOver);

    // Remove pointer exit handling.
    this.dropdownEl.removeEventListener('pointerleave', this._handleMenuPointerLeave);

    // Remove hover trigger listeners.
    this.el.removeEventListener('mouseenter', this._handleMouseEnter);

    // Remove trigger exit handling.
    this.el.removeEventListener('mouseleave', this._handleMouseLeave);

    // Remove hover menu exit handling.
    this.dropdownEl.removeEventListener('mouseleave', this._handleMouseLeave);

    // Remove click trigger handling.
    this.el.removeEventListener('click', this._handleClick);
  }

  _setupTemporaryEventHandlers() {
    // Handle outside clicks and leaf selections.
    document.body.addEventListener('click', this._handleDocumentClick);

    // Distinguish touch scrolling from selection.
    document.body.addEventListener('touchmove', this._handleDocumentTouchmove);

    // Handle keys only within the current menu level.
    this.dropdownEl.addEventListener('keydown', this._handleDropdownKeydown);

    // Reposition menus after viewport changes.
    window.addEventListener('resize', this._handleWindowResize);

    // Dismiss fixed submenus when their anchor scrolls away.
    window.addEventListener('scroll', this._handleAncestorScroll, true);
  }

  _removeTemporaryEventHandlers() {
    // Remove outside click handling.
    document.body.removeEventListener('click', this._handleDocumentClick);

    // Remove touch scrolling handling.
    document.body.removeEventListener('touchmove', this._handleDocumentTouchmove);

    // Remove menu keyboard handling.
    this.dropdownEl.removeEventListener('keydown', this._handleDropdownKeydown);

    // Remove viewport resize handling.
    window.removeEventListener('resize', this._handleWindowResize);

    // Remove anchor scroll handling.
    window.removeEventListener('scroll', this._handleAncestorScroll, true);
  }

  _handleClick = (e: MouseEvent) => {
    e.preventDefault();
    //this._moveDropdown((<HTMLElement>e.target).closest('li'));
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  };

  _handleMouseEnter = () => {
    //this._moveDropdown((<HTMLElement>e.target).closest('li'));
    this.open();
  };

  _handleMouseLeave = (e:MouseEvent) => {
    // Resolve the pointer destination, including leaving the window.
    const target = e.relatedTarget;

    // Keep the menu open while moving through its submenu tree.
    if(!(target instanceof Node) || !this._contains(target))
      // Close a hover menu after leaving its tree.
      this.close();
  };

  private _handleMenuPointerOver = (e:PointerEvent) => {
    // Resolve the row under the pointer.
    const row = (e.target as Element).closest<HTMLElement>('li');

    // Handle only available rows belonging to this menu.
    if(e.pointerType !== 'touch' && this.isOpen && row?.parentElement === this.dropdownEl && this._isAvailable(row)){
      // Cancel any previous pending row change.
      clearTimeout(this._submenuTimer);

      // Resolve a child menu for this row.
      const child = this._getSubmenu(row);

      // Delay activation to avoid opening menus while crossing rows.
      this._submenuTimer = setTimeout(() => {
        // Close sibling menus without moving keyboard focus.
        this._getChildren().filter(menu => menu !== child).forEach(menu => menu._close(false));

        // Open the hovered child without stealing keyboard focus.
        if(child && !child.isOpen){
          // Preserve the current keyboard focus during pointer navigation.
          child._focusOnOpen = false;

          // Open the child beside this menu.
          child.open();
        }
      }, 150);
    }
  };

  private _handleMenuPointerLeave = () => {
    // Cancel delayed activation when the pointer leaves before opening.
    clearTimeout(this._submenuTimer);
  };

  private _handleAncestorScroll = (e:Event) => {
    // Resolve the scrolling node.
    const target = e.target;

    // Close only when an ancestor scrolls, allowing the submenu itself to scroll.
    if(this._getParentDropdown() && target instanceof Node && !this.dropdownEl.contains(target))
      // Dismiss without taking focus away from the scrolling control.
      this._close(false);
  };

  _handleDocumentClick = (e:MouseEvent) => {
    // Preserve the original path if selecting an option rerenders its menu.
    const path = e.composedPath();

    // Resolve a submenu trigger anywhere along the original click path.
    const submenuTrigger = path.find(node => node instanceof HTMLElement && Dropdown.getInstance(node)?._getParentDropdown());

    // Include portalled descendants in the current menu tree.
    const insideMenu = path.some(node => node instanceof Node && this._contains(node) && node !== this.el);

    // Identify activation of this menu's trigger.
    const insideTrigger = path.includes(this.el);

    // Close the tree only for a leaf selection, never for a submenu toggle.
    if(this.options.closeOnClick && insideMenu && !insideTrigger && !submenuTrigger && !this.isTouchMoving){
      // Close this menu and all open descendants.
      this.close();
    }else if(!insideMenu && !insideTrigger){
      // Allow other click handlers to finish before dismissing the menu.
      setTimeout(() => {
        // Close only if the menu remains open.
        if(this.isOpen)
          // Dismiss the menu after an outside click.
          this.close();
      }, 0);
    }

    // Reset the touch-scroll guard for the next click.
    this.isTouchMoving = false;
  };

  _handleTriggerKeydown = (e:KeyboardEvent) => {
    // Let the owning menu handle nested trigger keys.
    const isRoot = !this._getParentDropdown();

    // Recognize keyboard activation of a closed root menu.
    const openKey = Utils.keys.ARROW_DOWN.includes(e.key) || Utils.keys.ENTER.includes(e.key) || e.key === ' ';

    // Open root menus without also activating the underlying control.
    if(isRoot && openKey && !this.isOpen){
      // Prevent native button or link activation.
      e.preventDefault();

      // Open the root menu.
      this.open();
    }
  };

  _handleDocumentTouchmove = (e: TouchEvent) => {
    const target = <HTMLElement>e.target;
    if (target.closest('.dropdown-content')) {
      this.isTouchMoving = true;
    }
  };

  _handleDropdownClick = (e:MouseEvent) => {
    // Resolve the clicked row at this menu level.
    const row = (e.target as Element).closest<HTMLLIElement>('li');

    // Dispatch leaf callbacks only once, from the owning menu.
    if(row?.parentElement === this.dropdownEl && this._isAvailable(row) && !this._getSubmenu(row) && typeof this.options.onItemClick === 'function')
      // Notify the application of the selected leaf item.
      this.options.onItemClick.call(this, row);
  };

  _handleDropdownKeydown = (e:KeyboardEvent) => {
    // Resolve the menu that owns the key event.
    const owner = (e.target as Element).closest('.dropdown-content');

    // Keep key handling confined to the active level.
    if(this.isOpen && owner === this.dropdownEl){
      // Resolve the parent menu for backwards navigation.
      const parent = this._getParentDropdown();

      // Follow the document's writing direction for submenu keys.
      const rtl = getComputedStyle(this.el).direction === 'rtl';

      // Choose the forward key for the current writing direction.
      const forward = rtl ? 'ArrowLeft' : 'ArrowRight';

      // Choose the backward key for the current writing direction.
      const backward = rtl ? 'ArrowRight' : 'ArrowLeft';

      // Resolve the currently focused row.
      const row = this.dropdownEl.children[this.focusedIndex] as HTMLElement;

      // Resolve its submenu if present.
      const child = row ? this._getSubmenu(row) : null;

      // Close the whole tree when leaving by Tab.
      if(Utils.keys.TAB.includes(e.key)){
        // Preserve the component's existing Tab dismissal behavior.
        e.preventDefault();

        // Stop ancestor menus from handling the same key.
        e.stopPropagation();

        // Find the root of this menu tree.
        let root:Dropdown = this;

        // Walk back to the root trigger.
        while(root._getParentDropdown())
          // Advance to the parent menu.
          root = root._getParentDropdown();

        // Close the tree and restore the root trigger.
        root.close();
      }else if(Utils.keys.ESC.includes(e.key) || (e.key === backward && parent)){
        // Prevent native popover dismissal from closing additional levels.
        e.preventDefault();

        // Keep dismissal scoped to this level.
        e.stopPropagation();

        // Return to the trigger in the parent menu.
        this.close();
      }else if(e.key === forward && child){
        // Prevent horizontal page scrolling.
        e.preventDefault();

        // Prevent ancestor menu navigation.
        e.stopPropagation();

        // Open and focus the submenu's first available row.
        this._openChild(child);
      }else if(Utils.keys.ARROW_DOWN.includes(e.key) || Utils.keys.ARROW_UP.includes(e.key)){
        // Prevent page scrolling while navigating items.
        e.preventDefault();

        // Prevent ancestor menu navigation.
        e.stopPropagation();

        // Cancel delayed hover activation after a keyboard move.
        clearTimeout(this._submenuTimer);

        // Choose the direction through the current menu's rows.
        const direction = Utils.keys.ARROW_DOWN.includes(e.key) ? 1 : -1;

        // Start from the focused row or the appropriate list edge.
        let index = this.focusedIndex < 0 && direction < 0 ? this.dropdownEl.children.length : this.focusedIndex;

        // Search for the next available row.
        do {
          // Advance one row at a time.
          index += direction;
        }while(index >= 0 && index < this.dropdownEl.children.length && !this._isAvailable(this.dropdownEl.children[index] as HTMLElement));

        // Move focus only when another available row exists.
        if(index >= 0 && index < this.dropdownEl.children.length){
          // Close descendants attached to the previous row.
          this._getChildren().forEach(menu => menu._close(false));

          // Remove the transient active marker from the previous row.
          row?.classList.remove('active');

          // Store the new keyboard position.
          this.focusedIndex = index;

          // Focus and reveal the selected keyboard row.
          this._focusFocusedItem();
        }
      }else if(Utils.keys.ENTER.includes(e.key) || e.key === ' '){
        // Prevent a second native click on focused buttons or links.
        e.preventDefault();

        // Keep activation scoped to this menu.
        e.stopPropagation();

        // Open submenus without selecting their parent row.
        if(child){
          // Move keyboard focus into the child.
          this._openChild(child);
        }else if(row && this._isAvailable(row)){
          // Resolve the direct action without searching nested menus.
          const action = row.querySelector<HTMLElement>(':scope > a, :scope > button') || row;

          // Activate the focused leaf action.
          action.click();
        }
      }else if(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
        // Keep typeahead scoped to the current level.
        e.stopPropagation();

        // Append this character to the current search.
        this.filterQuery.push(e.key.toLowerCase());

        // Resolve the accumulated prefix.
        const query = this.filterQuery.join('');

        // Search only available direct rows, excluding nested submenu text.
        const index = Array.from(this.dropdownEl.children).findIndex((item:HTMLElement) => {
          // Resolve the label at this level.
          const label = item.querySelector<HTMLElement>(':scope > a, :scope > button, :scope > span') || item;

          // Return whether this available label matches the prefix.
          return this._isAvailable(item) && label.innerText.trim().toLowerCase().startsWith(query);
        });

        // Focus a matching row when found.
        if(index >= 0){
          // Close submenus attached to a different row.
          this._getChildren().forEach(menu => menu._close(false));

          // Record the matching row.
          this.focusedIndex = index;

          // Focus the matching row.
          this._focusFocusedItem();
        }

        // Restart the typeahead expiry timer.
        clearTimeout(this.filterTimeout);

        // Clear the search after the typing pause.
        this.filterTimeout = setTimeout(this._resetFilterQuery, 1000);
      }
    }
  };

  _handleWindowResize = () => {
    // Only re-place the dropdown if it's still visible
    // Accounts for elements hiding via media queries
    if (this.el.offsetParent) {
      this.recalculateDimensions();
    }
  };

  _resetFilterQuery = () => {
    this.filterQuery = [];
  };

  _resetDropdownStyles() {
    this.dropdownEl.style.display = '';
    this._resetDropdownPositioningStyles();
    this.dropdownEl.style.transform = '';
    this.dropdownEl.style.opacity = '';
  }

  _resetDropdownPositioningStyles() {
    this.dropdownEl.style.width = '';
    this.dropdownEl.style.height = '';
    this.dropdownEl.style.left = '';
    this.dropdownEl.style.top = '';
    this.dropdownEl.style.transformOrigin = '';
  }

  _moveDropdownToElement(containerEl: HTMLElement = null) {
    if (this.options.container) {
      this.options.container.append(this.dropdownEl);
      return;
    }
    if (containerEl) {
      if (!containerEl.contains(this.dropdownEl)) containerEl.append(this.dropdownEl);
      return;
    }
    this.el.after(this.dropdownEl);
  }

  /** Resolve the owning menu from the trigger, even if its popup is portalled. */
  private _getParentDropdown():Dropdown {
    // Find the menu containing this trigger.
    const menu = this.el.closest('.dropdown-content');

    // Resolve the owning instance independently of initialization order.
    const result = Dropdown._dropdowns.find(instance => instance !== this && instance.dropdownEl === menu) || null;

    // Return the parent when this is a submenu.
    return result;
  }

  /** Resolve direct child instances. */
  private _getChildren():Dropdown[] {
    // Collect menus owned by this level.
    const result = Dropdown._dropdowns.filter(instance => instance._getParentDropdown() === this);

    // Return the direct children.
    return result;
  }

  /** Resolve a row's registered submenu trigger. */
  private _getSubmenu(row:HTMLElement):Dropdown {
    // Find a trigger belonging directly to this row.
    const trigger = row.querySelector<HTMLElement>(':scope > .dropdown-trigger');

    // Resolve an initialized submenu without creating duplicate instances.
    const result = trigger ? Dropdown.getInstance(trigger) || null : null;

    // Return the submenu for this row.
    return result;
  }

  /** Check whether a row can receive keyboard focus. */
  private _isAvailable(row:HTMLElement):boolean {
    // Exclude hidden, disabled, decorative, and explicitly skipped rows.
    const result = !!row && row.tabIndex !== -1 && !row.matches('.disabled, .divider, .optgroup, [aria-disabled="true"], [role="separator"], [hidden]');

    // Return whether the row can be activated.
    return result;
  }

  /** Include descendant popups when testing pointer containment. */
  private _contains(node:Node):boolean {
    // Include this menu, its trigger, and portalled descendants.
    const result = this.el.contains(node) || this.dropdownEl.contains(node) || this._getChildren().some(child => child._contains(node));

    // Return whether the node belongs to the menu tree.
    return result;
  }

  /** Open or refocus a child from keyboard navigation. */
  private _openChild(child:Dropdown):void {
    // Cancel pending pointer navigation.
    clearTimeout(this._submenuTimer);

    // Request focus transfer for this opening.
    child._focusOnOpen = true;

    // Open a closed submenu.
    if(!child.isOpen)
      // Open beside the current menu.
      child.open();
    else{
      // Start at the first available child row.
      child.focusedIndex = Array.from(child.dropdownEl.children).findIndex((item:HTMLElement) => child._isAvailable(item));

      // Move focus into an already open submenu.
      child._focusFocusedItem();
    }
  }

  /** Cancel callbacks from a previous animation. */
  private _clearAnimationTimers():void {
    // Cancel each pending callback.
    this._animationTimers.forEach(timer => clearTimeout(timer));

    // Reset timer ownership.
    this._animationTimers = [];
  }

  /** Place a submenu beside its parent and keep it in the viewport. */
  private _placeSubmenu(parent:Dropdown):void {
    // Resolve the parent popup's visible bounds.
    const parentBounds = parent.dropdownEl.getBoundingClientRect();

    // Align the child with its trigger row.
    const rowBounds = this.el.closest('li').getBoundingClientRect();

    // Measure the child at its natural width.
    const bounds = this.dropdownEl.getBoundingClientRect();

    // Reserve an outer viewport gutter.
    const gutter = 8;

    // Keep the child readable while fitting narrow screens.
    const width = Math.min(Math.max(bounds.width, 180), Math.max(0, window.innerWidth - gutter * 2));

    // Keep long menus scrollable inside the viewport.
    const height = Math.min(bounds.height, Math.max(0, window.innerHeight - gutter * 2));

    // Prefer the writing direction's forward edge.
    const preferLeft = getComputedStyle(this.el).direction === 'rtl';

    // Measure the space on the parent's right.
    const rightSpace = window.innerWidth - parentBounds.right - gutter - 2;

    // Measure the space on the parent's left.
    const leftSpace = parentBounds.left - gutter - 2;

    // Flip when the preferred side does not fit and the opposite side has more room.
    const useLeft = preferLeft ? leftSpace >= width || leftSpace >= rightSpace : rightSpace < width && leftSpace > rightSpace;

    // Resolve the preferred horizontal coordinate.
    const x = useLeft ? parentBounds.left - width - 2 : parentBounds.right + 2;

    // Clamp the child to the viewport, including narrow mobile screens.
    this.dropdownEl.style.left = Math.max(gutter, Math.min(x, window.innerWidth - width - gutter)) + 'px';

    // Align vertically while retaining the viewport gutter.
    this.dropdownEl.style.top = Math.max(gutter, Math.min(rowBounds.top - 2, window.innerHeight - height - gutter)) + 'px';

    // Apply the measured child width.
    this.dropdownEl.style.width = width + 'px';

    // Apply the available child height.
    this.dropdownEl.style.height = height + 'px';

    // Animate from the edge attached to the parent.
    this.dropdownEl.style.transformOrigin = `${useLeft ? '100%' : '0'} 0`;

    // Report whether the popup needs vertical scrolling.
    this.isScrollable = bounds.height > height;
  }

  _makeDropdownFocusable() {
    // Prepare keyboard navigation when the menu exists.
    if(this.dropdownEl){
      // Associate the trigger with its controlled menu.
      this.el.setAttribute('aria-controls', this.id);

      // Announce submenu availability to assistive technology.
      this.el.setAttribute('aria-haspopup', 'true');

      // Enable native popover positioning.
      this.dropdownEl.popover = '';

      // Allow focus on the menu before navigating its items.
      this.dropdownEl.tabIndex = 0;

      // Keep separators and unavailable choices out of arrow-key navigation.
      Array.from(this.dropdownEl.children).forEach((el) => {
        // Identify rows that cannot be activated.
        const unavailable = el.matches('.divider, .disabled, .optgroup, [aria-disabled="true"], [role="separator"]');

        // Exclude decorative and disabled rows from keyboard focus.
        if(unavailable)
          // Preserve the menu row while skipping it during navigation.
          el.setAttribute('tabindex', '-1');
        else if(!el.hasAttribute('tabindex'))
          // Retain explicit caller-provided tab order for available rows.
          el.setAttribute('tabindex', '0');
      });
    }
  }

  _focusFocusedItem() {
    if (
      this.focusedIndex >= 0 &&
      this.focusedIndex < this.dropdownEl.children.length &&
      this.options.autoFocus
    ) {
      (this.dropdownEl.children[this.focusedIndex] as HTMLElement).focus({
        preventScroll: true
      });
      this.dropdownEl.children[this.focusedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }

  _getDropdownPosition(closestOverflowParent: HTMLElement) {
    // const offsetParentBRect = this.el.offsetParent.getBoundingClientRect();
    const triggerBRect = this.el.getBoundingClientRect();
    const dropdownBRect = this.dropdownEl.getBoundingClientRect();

    let idealHeight = dropdownBRect.height;
    let idealWidth = dropdownBRect.width;
    let idealXPos = triggerBRect.left - dropdownBRect.left;
    let idealYPos = triggerBRect.top - dropdownBRect.top;

    const dropdownBounds = {
      left: idealXPos,
      top: idealYPos,
      height: idealHeight,
      width: idealWidth
    };

    const alignments = Utils.checkPossibleAlignments(
      this.el,
      closestOverflowParent,
      dropdownBounds,
      this.options.coverTrigger ? 0 : triggerBRect.height
    );

    let verticalAlignment = 'top';
    let horizontalAlignment = this.options.alignment;
    idealYPos += this.options.coverTrigger ? 0 : triggerBRect.height;

    // Reset isScrollable
    this.isScrollable = false;

    if (!alignments.top) {
      if (alignments.bottom) {
        verticalAlignment = 'bottom';

        if (!this.options.coverTrigger) {
          idealYPos -= triggerBRect.height;
        }
      } else {
        this.isScrollable = true;

        // Determine which side has most space and cutoff at correct height
        idealHeight -= 20; // Add padding when cutoff
        if (alignments.spaceOnTop > alignments.spaceOnBottom) {
          verticalAlignment = 'bottom';
          idealHeight += alignments.spaceOnTop;
          idealYPos -= this.options.coverTrigger
            ? alignments.spaceOnTop - 20
            : alignments.spaceOnTop - 20 + triggerBRect.height;
        } else {
          idealHeight += alignments.spaceOnBottom;
        }
      }
    }

    // If preferred horizontal alignment is possible
    if (!alignments[horizontalAlignment]) {
      const oppositeAlignment = horizontalAlignment === 'left' ? 'right' : 'left';
      if (alignments[oppositeAlignment]) {
        horizontalAlignment = oppositeAlignment;
      } else {
        // Determine which side has most space and cutoff at correct height
        if (alignments.spaceOnLeft > alignments.spaceOnRight) {
          horizontalAlignment = 'right';
          idealWidth += alignments.spaceOnLeft;
          idealXPos -= alignments.spaceOnLeft;
        } else {
          horizontalAlignment = 'left';
          idealWidth += alignments.spaceOnRight;
        }
      }
    }

    if (verticalAlignment === 'bottom') {
      idealYPos =
        idealYPos - dropdownBRect.height + (this.options.coverTrigger ? triggerBRect.height : 0);
    }
    if (horizontalAlignment === 'right') {
      idealXPos = idealXPos - dropdownBRect.width + triggerBRect.width;
    }
    return {
      x: idealXPos,
      y: idealYPos,
      verticalAlignment: verticalAlignment,
      horizontalAlignment: horizontalAlignment,
      height: idealHeight,
      width: idealWidth
    };
  }

  _animateIn() {
    // Respect reduced-motion preferences.
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : this.options.inDuration;

    // Capture whether this opening should receive keyboard focus.
    const focus = this._focusOnOpen && this.options.autoFocus;

    // Restore the default for subsequent openings.
    this._focusOnOpen = true;

    // Prepare the initial animation state.
    this.dropdownEl.style.transition = 'none';

    // Fade in from transparent.
    this.dropdownEl.style.opacity = '0';

    // Use a restrained scale for the Expressive surface.
    this.dropdownEl.style.transform = duration ? 'scale(0.9)' : 'none';

    // Animate to the final state on the next task.
    this._animationTimers.push(setTimeout(() => {
      // Apply the opening transition.
      this.dropdownEl.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;

      // Reveal the menu.
      this.dropdownEl.style.opacity = '1';

      // Restore the final scale.
      this.dropdownEl.style.transform = 'none';
    }, 1));

    // Transfer focus after the opening transition.
    this._animationTimers.push(setTimeout(() => {
      // Focus only menus opened for keyboard interaction.
      if(focus){
        // Start submenus on their first available item.
        if(this._getParentDropdown()){
          // Resolve the first available child row.
          this.focusedIndex = Array.from(this.dropdownEl.children).findIndex((item:HTMLElement) => this._isAvailable(item));

          // Focus the child row.
          this._focusFocusedItem();
        }else{
          // Preserve root menu focus behavior.
          this.dropdownEl.focus();
        }
      }

      // Notify callers once the menu is open.
      if(typeof this.options.onOpenEnd === 'function')
        // Dispatch the opening callback.
        this.options.onOpenEnd.call(this, this.el);
    }, duration));
  }

  _animateOut() {
    // Respect reduced-motion preferences.
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : this.options.outDuration;

    // Apply the closing transition.
    this.dropdownEl.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;

    // Fade the menu out.
    this.dropdownEl.style.opacity = '0';

    // Contract the surface slightly during dismissal.
    this.dropdownEl.style.transform = duration ? 'scale(0.9)' : 'none';

    // Finish hiding the surface after its transition.
    this._animationTimers.push(setTimeout(() => {
      // Hide native submenu popovers.
      if(this.dropdownEl.matches(':popover-open'))
        // Remove the popup from the top layer.
        this.dropdownEl.hidePopover();

      // Restore closed styling.
      this._resetDropdownStyles();

      // Notify callers after dismissal.
      if(typeof this.options.onCloseEnd === 'function')
        // Dispatch the closing callback.
        this.options.onCloseEnd.call(this, this.el);
    }, duration));
  }

  private _getClosestAncestor(el: HTMLElement, condition: (Function) => boolean): HTMLElement {
    let ancestor = el.parentNode;
    while (ancestor !== null && ancestor !== document) {
      if (condition(ancestor)) {
        return <HTMLElement>ancestor;
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  _placeDropdown() {
    // Resolve whether this menu is nested.
    const parent = this._getParentDropdown();

    // Position child menus beside their parent surface.
    if(parent){
      // Keep submenu positioning independent of parent overflow.
      this._placeSubmenu(parent);
    }else{
      // Container here will be closest ancestor with overflow: hidden
      let closestOverflowParent: HTMLElement = this._getClosestAncestor(
        this.dropdownEl,
        (ancestor: HTMLElement) => {
          // Return whether this ancestor clips its contents.
          return (
            !['HTML', 'BODY'].includes(ancestor.tagName) &&
            getComputedStyle(ancestor).overflow !== 'visible'
          );
        }
      );
      // Fallback
      if (!closestOverflowParent) {
        // Resolve the root menu's positioning container.
        closestOverflowParent = <HTMLElement>(
          (!!this.dropdownEl.offsetParent ? this.dropdownEl.offsetParent : this.dropdownEl.parentNode)
        );
      }

      // Establish a positioning context for the root popup.
      if (getComputedStyle(closestOverflowParent).position === 'static')
        // Anchor absolute root positioning to the container.
        closestOverflowParent.style.position = 'relative';

      //this._moveDropdown(closestOverflowParent);

      // Set width before calculating positionInfo
      const idealWidth = this.options.constrainWidth
        ? this.el.getBoundingClientRect().width
        : this.dropdownEl.getBoundingClientRect().width;
      // Apply the requested trigger or natural width.
      this.dropdownEl.style.width = idealWidth + 'px';

      // Resolve the root placement using the existing alignment rules.
      const positionInfo = this._getDropdownPosition(closestOverflowParent);
      // Apply the root horizontal position.
      this.dropdownEl.style.left = positionInfo.x + 'px';
      // Apply the root vertical position.
      this.dropdownEl.style.top = positionInfo.y + 'px';
      // Apply the available root height.
      this.dropdownEl.style.height = positionInfo.height + 'px';
      // Apply the available root width.
      this.dropdownEl.style.width = positionInfo.width + 'px';
      // Animate from the anchored root corner.
      this.dropdownEl.style.transformOrigin = `${
        positionInfo.horizontalAlignment === 'left' ? '0' : '100%'
      } ${positionInfo.verticalAlignment === 'top' ? '0' : '100%'}`;
    }
  }

  /**
   * Open dropdown.
   */
  open = () => {
    // Open only closed menus with a valid popup.
    if(!this.isOpen && this.dropdownEl){
      // Resolve this menu's parent before changing its presentation.
      const parent = this._getParentDropdown();

      // Cancel callbacks from an earlier closing animation.
      this._clearAnimationTimers();

      // Cancel delayed pointer navigation.
      clearTimeout(this._submenuTimer);

      // Keep only one child open at each level.
      if(parent){
        // Close sibling submenus without stealing focus.
        parent._getChildren().filter(child => child !== this).forEach(child => child._close(false));

        // Synchronize the parent keyboard position only when focus will move.
        if(this._focusOnOpen)
          // Record the row to restore with Left or Escape.
          parent.focusedIndex = Array.from(parent.dropdownEl.children).indexOf(this.el.closest('li'));

        // Mark fixed submenu presentation.
        this.dropdownEl.setAttribute('data-submenu', '');

        // Manage dismissal explicitly across all submenu levels.
        this.dropdownEl.popover = 'manual';
      }

      // Record the opening state.
      this.isOpen = true;

      // Notify callers before measuring content.
      if(typeof this.options.onOpenStart === 'function')
        // Dispatch the opening callback.
        this.options.onOpenStart.call(this, this.el);

      // Reset dimensions and animation state.
      this._resetDropdownStyles();

      // Reveal the popup for measurement.
      this.dropdownEl.style.display = 'block';

      // Lift submenus above their parent's clipping and scrolling container.
      if(parent && !this.dropdownEl.matches(':popover-open'))
        // Show the fixed submenu in the browser top layer.
        this.dropdownEl.showPopover();

      // Position the popup at its anchor.
      this._placeDropdown();

      // Animate the popup and transfer focus when appropriate.
      this._animateIn();

      // Bind document handlers after the triggering click completes.
      this._animationTimers.push(setTimeout(() => this._setupTemporaryEventHandlers(), 0));

      // Announce the expanded trigger.
      this.el.ariaExpanded = 'true';
    }
  };

  /** Close this menu and its descendants, restoring the trigger focus. */
  close = () => {
    // Use the normal focus-restoring dismissal path.
    this._close(true);
  };

  /** Close descendants without repeatedly moving focus through the tree. */
  private _close(restoreFocus:boolean):void {
    // Close only open menus.
    if(this.isOpen){
      // Cancel pending pointer activation.
      clearTimeout(this._submenuTimer);

      // Cancel opening callbacks that could refocus a closed popup.
      this._clearAnimationTimers();

      // Close descendants before the parent surface disappears.
      this._getChildren().forEach(child => child._close(false));

      // Record the closed state.
      this.isOpen = false;

      // Reset keyboard navigation.
      this.focusedIndex = -1;

      // Cancel pending typeahead cleanup.
      clearTimeout(this.filterTimeout);

      // Reset the typeahead prefix.
      this.filterQuery = [];

      // Notify callers before dismissal.
      if(typeof this.options.onCloseStart === 'function')
        // Dispatch the closing callback.
        this.options.onCloseStart.call(this, this.el);

      // Animate the surface out.
      this._animateOut();

      // Stop observing keyboard and document events.
      this._removeTemporaryEventHandlers();

      // Restore focus only for the menu explicitly dismissed.
      if(restoreFocus && this.options.autoFocus)
        // Return to its trigger without scrolling the document.
        this.el.focus({preventScroll: true});

      // Announce the collapsed trigger.
      this.el.ariaExpanded = 'false';
    }
  }


  /**
   * While dropdown is open, you can recalculate its dimensions if its contents have changed.
   */
  recalculateDimensions = () => {
    if (this.isOpen) {
      this._resetDropdownPositioningStyles();
      this._placeDropdown();
    }
  };
}
