import { BaseOptions, Component, InitElements, MElement } from '../../src/component';

export interface NavbarAutoHideOptions extends BaseOptions {
  /** Null watches the page. Supply an element for an independently scrolling panel. */
  scrollTarget: HTMLElement | null;
  /** Accumulated pixels in one direction before changing visibility. */
  tolerance: number;
  /** Keep the navbar visible within this many pixels of the top. */
  offset: number;
}

/** A sticky navbar that hides going down and returns going up. */
export class NavbarAutoHide extends Component<NavbarAutoHideOptions> {
  private _target: HTMLElement | Window;
  private _events = new AbortController();
  private _frame = 0;
  private _last = 0;
  private _distance = 0;
  private _direction = 0;
  private _originalClasses: string[];

  constructor(el: HTMLElement, options: Partial<NavbarAutoHideOptions> = {}) {
    const settings = { ...NavbarAutoHide.defaults, ...options };
    if (!Number.isFinite(settings.tolerance) || settings.tolerance < 0) throw new Error('Navbar scroll tolerance must be a non-negative number.');
    if (!Number.isFinite(settings.offset) || settings.offset < 0) throw new Error('Navbar scroll offset must be a non-negative number.');
    if (settings.scrollTarget !== null && !(settings.scrollTarget instanceof HTMLElement)) throw new Error('Navbar scrollTarget must be an HTMLElement or null.');
    super(el, options, NavbarAutoHide);
    this.options = settings;
    this._target = settings.scrollTarget || window;
    this._originalClasses = ['navbar-hide-on-scroll', 'is-navbar-hidden'].filter(name => el.classList.contains(name));
    el.classList.add('navbar-hide-on-scroll');
    el.classList.remove('is-navbar-hidden');
    el['M_NavbarAutoHide'] = this;
    this._last = this._position();
    const signal = this._events.signal;
    this._target.addEventListener('scroll', this._schedule, { passive: true, signal });
    window.addEventListener('resize', this._reset, { signal });
    window.addEventListener('pageshow', this._reset, { signal });
    el.addEventListener('focusin', this._reset, { signal });
    el.addEventListener('focusout', this._reset, { signal });
  }

  static get defaults(): NavbarAutoHideOptions { return { scrollTarget: null, tolerance: 4, offset: 0 }; }
  static init(el: HTMLElement, options?: Partial<NavbarAutoHideOptions>): NavbarAutoHide;
  static init(els: InitElements<MElement>, options?: Partial<NavbarAutoHideOptions>): NavbarAutoHide[];
  static init(els: HTMLElement | InitElements<MElement>, options: Partial<NavbarAutoHideOptions> = {}): NavbarAutoHide | NavbarAutoHide[] {
    return super.init(els, options, NavbarAutoHide);
  }
  static getInstance(el: HTMLElement): NavbarAutoHide { return el['M_NavbarAutoHide']; }

  private _position(): number {
    const target = this.options.scrollTarget;
    const max = target ? target.scrollHeight - target.clientHeight : (document.scrollingElement?.scrollHeight || 0) - window.innerHeight;
    return Math.max(0, Math.min(Math.max(0, max), target ? target.scrollTop : window.scrollY));
  }

  private _reset = (): void => {
    cancelAnimationFrame(this._frame); this._frame = 0;
    this._last = this._position(); this._distance = 0; this._direction = 0;
    this.el.classList.remove('is-navbar-hidden');
  };

  private _schedule = (): void => {
    if (!this._frame) this._frame = requestAnimationFrame(this._update);
  };

  private _update = (): void => {
    this._frame = 0;
    const position = this._position(), delta = position - this._last;
    this._last = position;
    if (position <= this.options.offset || this.el.contains(document.activeElement)) { this._reset(); return; }
    if (!delta) return;
    const direction = Math.sign(delta);
    if (direction !== this._direction) this._distance = 0;
    this._direction = direction;
    this._distance += Math.abs(delta);
    if (this._distance >= this.options.tolerance) {
      this.el.classList.toggle('is-navbar-hidden', direction > 0);
      this._distance = 0;
    }
  };

  destroy(): void {
    this._events.abort(); cancelAnimationFrame(this._frame);
    for (const name of ['navbar-hide-on-scroll', 'is-navbar-hidden']) this.el.classList.toggle(name, this._originalClasses.includes(name));
    delete this.el['M_NavbarAutoHide'];
  }
}
