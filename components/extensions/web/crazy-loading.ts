import Kmcomponent, { type KmcomponentProperties } from './kmcomponent';
import { Loading } from '../../loading/loading';

const string = (value = '', select?: string[]) => ({ type: 'string' as const, default: value, select });
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Reactive Loading wrapper. Styles and behavior belong to the existing Loading component. */
export default class CrazyLoading extends Kmcomponent {
  static properties: KmcomponentProperties = {
    active: { type: 'boolean', default: true, reflect: true },
    size: { ...string('normal', ['small', 'normal', 'large']), reflect: true },
    label: string('Loading…'),
    'complete-label': string('Ready'),
    'aria-label': string(),
    image: string(),
    'icon-text': string(),
    'icon-class': string('material-icons'),
  };

  get isActive(): boolean { return this.getProperty('active') as boolean; }

  /** Show the ring. Await updateComplete when reading the rendered status. */
  start(label?: string): void {
    if (label !== undefined) this.setProperty('label', label);
    this.setProperty('active', true);
  }

  /** Hide the ring while retaining the logo or projected content. */
  stop(label?: string): void {
    if (label !== undefined) this.setProperty('complete-label', label);
    this.setProperty('active', false);
  }

  render(): string {
    const a = this.prepareContext().attributes;
    const content = a.image
      ? `<img class="loading-screen-btn-logo" src="${escape(a.image)}" alt="">`
      : a['icon-text'] ? `<i class="${escape(a['icon-class'])}" aria-hidden="true">${escape(a['icon-text'])}</i>` : '';
    return `<div part="indicator" class="loading no-autoinit loading-screen-btn-container">
      <span part="content" class="loading-content loading-screen-btn-logo-container" aria-hidden="true"><slot>${content}</slot></span>
    </div>`;
  }

  postRender(): void {
    const a = this.prepareContext().attributes;
    const indicator = this.querySelector<HTMLElement>('[part="indicator"]')!;
    const loading = Loading.init(indicator, {
      active: this.isActive,
      label: String(a['aria-label'] || a.label),
      completeLabel: String(a['complete-label']),
    });
    indicator.querySelector('.preloader-wrapper')!.classList.add('loading-screen-btn-preloader');
    this.onCleanup(() => loading.destroy());
  }
}

/** Original no-attribute markup retains its 10rem size and application favicon. */
export class LoadingScreenBtn extends CrazyLoading {
  static properties: KmcomponentProperties = {
    ...CrazyLoading.properties,
    size: { ...string('large', ['small', 'normal', 'large']), reflect: true },
    image: string('/asset/favicon/android-chrome-192x192.png'),
  };
}

if (typeof customElements !== 'undefined') {
  if (!customElements.get('crazy-loading')) customElements.define('crazy-loading', CrazyLoading);
  if (!customElements.get('loading-screen-btn')) customElements.define('loading-screen-btn', LoadingScreenBtn);
}
