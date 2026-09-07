import { Component, BaseOptions, InitElements, MElement } from '../../src/component';

export interface ToolbarOptions extends BaseOptions {}

const _defaults: ToolbarOptions = {};

// @implement /Users/kzarshenas/Sites/RodeoFx/rodeo_toolkit_2/app/Environment/Partials/PlanningToolbar.ts
// Generic version of that file's track-indicator sliding and expandable
// search behavior, decoupled from the page-specific filter/state-binding
// system (UtilityFilter) the source used - here it's just plain DOM state.
export class Toolbar extends Component<ToolbarOptions> {
  _tracks: HTMLElement[];

  constructor(el: HTMLElement, options: Partial<ToolbarOptions>) {
    super(el, options, Toolbar);
    (this.el as any).M_Toolbar = this;

    this.options = {
      ...Toolbar.defaults,
      ...options
    };

    this._tracks = Array.from(this.el.querySelectorAll<HTMLElement>('.toolbar-track'));
    this._setupEventHandlers();
    this._tracks.forEach((track) => this._moveIndicator(track, false));

    // A custom/web font can still be loading at construction time; its
    // metrics landing after this first measurement would leave the
    // indicator very slightly offset from the (now differently-sized)
    // text it's supposed to sit behind. Re-measure once fonts are ready.
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        this._tracks.forEach((track) => this._moveIndicator(track, false));
      });
    }
  }

  static get defaults(): ToolbarOptions {
    return _defaults;
  }

  static init(el: HTMLElement, options?: Partial<ToolbarOptions>): Toolbar;
  static init(els: InitElements<MElement>, options?: Partial<ToolbarOptions>): Toolbar[];
  static init(
    els: HTMLElement | InitElements<MElement>,
    options: Partial<ToolbarOptions> = {}
  ): Toolbar | Toolbar[] {
    return super.init(els, options, Toolbar);
  }

  static getInstance(el: HTMLElement): Toolbar {
    return (el as any).M_Toolbar;
  }

  destroy() {
    this._removeEventHandlers();
    (this.el as any).M_Toolbar = undefined;
  }

  /**
   * Re-measure and reposition every track's sliding indicator - call this
   * after changing which .toolbar-track-item is active from your own code,
   * or after anything that could have changed the toolbar's layout/width.
   */
  updateIndicators() {
    this._tracks.forEach((track) => this._moveIndicator(track, true));
  }

  _setupEventHandlers() {
    this.el.addEventListener('click', this._handleTrackClick);
    this.el.addEventListener('focusin', this._handleSearchFocusIn);
    this.el.addEventListener('focusout', this._handleSearchFocusOut);
    this.el.addEventListener('input', this._handleSearchInput);
    this.el.addEventListener('keydown', this._handleSearchKeydown);
    window.addEventListener('resize', this._handleWindowResize);
  }

  _removeEventHandlers() {
    this.el.removeEventListener('click', this._handleTrackClick);
    this.el.removeEventListener('focusin', this._handleSearchFocusIn);
    this.el.removeEventListener('focusout', this._handleSearchFocusOut);
    this.el.removeEventListener('input', this._handleSearchInput);
    this.el.removeEventListener('keydown', this._handleSearchKeydown);
    window.removeEventListener('resize', this._handleWindowResize);
  }

  _handleTrackClick = (e: MouseEvent) => {
    const item = (e.target as HTMLElement).closest('.toolbar-track-item') as HTMLElement;
    if (!item) return;
    const track = item.closest('.toolbar-track') as HTMLElement;
    if (!track || !this._tracks.includes(track)) return;

    track.querySelectorAll('.toolbar-track-item.is-active').forEach((el) => el.classList.remove('is-active'));
    item.classList.add('is-active');
    this._moveIndicator(track, true);
  };

  _handleSearchFocusIn = (e: FocusEvent) => {
    const search = (e.target as HTMLElement).closest('.toolbar-search');
    if (search) search.classList.add('is-expanded');
  };

  _handleSearchFocusOut = (e: FocusEvent) => {
    const search = (e.target as HTMLElement).closest('.toolbar-search');
    if (!search) return;
    const input = search.querySelector<HTMLInputElement>('.toolbar-search-input');
    if (input && input.value === '') search.classList.remove('is-expanded');
  };

  _handleSearchInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.classList.contains('toolbar-search-input')) return;
    const search = input.closest('.toolbar-search');
    if (search) search.classList.toggle('is-expanded', input.value !== '' || document.activeElement === input);
  };

  _handleSearchKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const input = (e.target as HTMLElement).closest('.toolbar-search')?.querySelector<HTMLInputElement>('.toolbar-search-input');
    if (!input) return;
    input.value = '';
    input.blur();
  };

  _handleWindowResize = () => {
    this._tracks.forEach((track) => this._moveIndicator(track, false));
  };

  _moveIndicator(track: HTMLElement, animate: boolean) {
    const indicator = track.querySelector<HTMLElement>('.toolbar-track-indicator');
    const active = track.querySelector<HTMLElement>('.toolbar-track-item.is-active');
    if (!indicator || !active) return;

    if (!animate) indicator.style.transition = 'none';
    // No "- track.clientLeft" here: offsetLeft is already relative to the
    // offsetParent's padding edge, same origin as the indicator's own
    // `left: 0` (an absolutely positioned element's containing block is
    // its ancestor's padding box) - subtracting the border width again
    // was double-counting it, nudging the indicator a px too far left.
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    indicator.style.width = `${active.offsetWidth}px`;
    track.classList.add('is-armed');
    if (!animate) {
      // Force layout so the transition-less move above actually applies
      // before re-enabling transitions on the next frame.
      void indicator.offsetWidth;
      requestAnimationFrame(() => {
        indicator.style.transition = '';
      });
    }
  }
}
