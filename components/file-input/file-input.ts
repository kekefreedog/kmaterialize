import type * as FilePondNS from 'filepond';
import { Component, BaseOptions, InitElements, MElement } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';

export type FilePondPluginName = 'image-preview' | 'file-validate-type' | 'image-exif-orientation';

export interface FileInputOptions extends BaseOptions {
  /** Which optional FilePond plugins to register - each is its own optional peerDependency. */
  plugins: FilePondPluginName[];
}

const _defaults: FileInputOptions = {
  plugins: []
};

// Each plugin needs its own literal `import('literal-string')` call (see
// peer-loader.ts) so Vite/webpack/Rollup can statically discover it - a
// generic specifier-driven loop can't produce that, hence one entry per
// plugin instead of building the import call from PLUGIN_SPECS's string.
const PLUGIN_LOADERS: Record<
  FilePondPluginName,
  { specifier: string; globalName: string; importer: () => Promise<unknown> }
> = {
  'image-preview': {
    specifier: 'filepond-plugin-image-preview',
    globalName: 'FilePondPluginImagePreview',
    importer: () => import('filepond-plugin-image-preview')
  },
  'file-validate-type': {
    specifier: 'filepond-plugin-file-validate-type',
    globalName: 'FilePondPluginFileValidateType',
    importer: () => import('filepond-plugin-file-validate-type')
  },
  'image-exif-orientation': {
    specifier: 'filepond-plugin-image-exif-orientation',
    globalName: 'FilePondPluginImageExifOrientation',
    importer: () => import('filepond-plugin-image-exif-orientation')
  }
};

// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/File.ts
// Enhances the EXISTING `.file-field` structure in place - add
// `data-file-picker="filepond"` (+ optional `data-file-plugins="a,b,c"`) to
// an otherwise completely stock `.file-field`, nothing else about the
// markup changes. FilePond.create() hides the native `<input type=file>`
// and injects its own root as a *sibling*, it never removes anything from
// the DOM, so the surrounding button/label/file-path-wrapper stay intact
// at rest - only the interactive drop area swaps in visually.
//
// FilePond and its plugins are optional peerDependencies, loaded on demand
// via peer-loader.
export class FileInput extends Component<FileInputOptions> {
  pond: FilePondNS.FilePond | undefined;
  ready: Promise<void>;
  private _fileEl: HTMLInputElement | null;
  private _pathEl: HTMLInputElement | null;

  constructor(el: HTMLElement, options: Partial<FileInputOptions>) {
    super(el, options, FileInput);
    (this.el as any).M_FileInput = this;

    const pluginsAttr = this.el.dataset.filePlugins;
    this.options = {
      ...FileInput.defaults,
      plugins: pluginsAttr
        ? (pluginsAttr.split(',').map((p) => p.trim()) as FilePondPluginName[])
        : FileInput.defaults.plugins,
      ...options
    };

    this._fileEl = this.el.querySelector<HTMLInputElement>('input[type="file"]');
    this._pathEl = this.el.querySelector<HTMLInputElement>('.file-path');

    this.ready = this._setup();
  }

  static get defaults(): FileInputOptions {
    return _defaults;
  }

  static init(el: HTMLElement, options?: Partial<FileInputOptions>): FileInput;
  static init(els: InitElements<MElement>, options?: Partial<FileInputOptions>): FileInput[];
  static init(
    els: HTMLElement | InitElements<MElement>,
    options: Partial<FileInputOptions> = {}
  ): FileInput | FileInput[] {
    return super.init(els, options, FileInput);
  }

  static getInstance(el: HTMLElement): FileInput {
    return (el as any).M_FileInput;
  }

  destroy() {
    this.el.classList.remove('file-field-enhanced');
    this.el.querySelector<HTMLElement>('.btn')?.classList.remove('hide');
    this.el.querySelector<HTMLElement>('.file-path-wrapper')?.classList.remove('hide');
    this.pond?.destroy();
    (this.el as any).M_FileInput = undefined;
  }

  /** Convenience wrapper over the underlying FilePond instance's own getFiles(). */
  getFiles() {
    return this.pond?.getFiles() ?? [];
  }

  async _setup(): Promise<void> {
    if (!this._fileEl) {
      console.error(Error('.file-field enhanced with data-file-picker="filepond" needs an input[type=file]'));
      return;
    }

    const FilePond = await loadPeer<typeof FilePondNS>(
      {
        specifier: 'filepond',
        globalName: 'FilePond',
        feature: 'File input (FilePond) enhancement',
        cdnHint:
          '<link rel="stylesheet" href="path/to/filepond.min.css">\n' +
          '    <script src="path/to/filepond.min.js"></script>\n' +
          '    (self-hosted - copy from node_modules/filepond/dist/, or a CDN of your choice)'
      },
      () => import('filepond')
    );

    const pluginNames = new Set(this.options.plugins);
    // file-validate-type is auto-registered whenever the input restricts
    // `accept`, matching CrazyPHP's own convention, even if the consumer
    // didn't list it explicitly in data-file-plugins.
    if (this._fileEl.accept) pluginNames.add('file-validate-type');

    for (const name of pluginNames) {
      const loader = PLUGIN_LOADERS[name];
      if (!loader) continue;
      const plugin = await loadPeer(
        {
          specifier: loader.specifier,
          globalName: loader.globalName,
          feature: `File input FilePond plugin "${name}"`,
          cdnHint: `<script src="path/to/${loader.specifier}.min.js"></script> (self-hosted - copy from node_modules/${loader.specifier}/dist/, or a CDN of your choice)`
        },
        loader.importer
      );
      FilePond.registerPlugin(plugin as any);
    }

    const pondOptions: FilePondNS.FilePondOptions = {};
    const { dataset } = this._fileEl;
    const readBoolean = (value: string | undefined) => value !== 'false';

    pondOptions.allowMultiple = this._fileEl.multiple;
    pondOptions.disabled = this._fileEl.disabled;
    if (dataset.defaultFile) pondOptions.files = [dataset.defaultFile];
    if (dataset.maxFiles) pondOptions.maxFiles = Number(dataset.maxFiles);
    if (this._fileEl.multiple) pondOptions.allowReorder = readBoolean(dataset.allowReorder);
    if (dataset.labelIdle) pondOptions.labelIdle = dataset.labelIdle;
    if (dataset.instantUpload !== undefined) pondOptions.instantUpload = readBoolean(dataset.instantUpload);
    if (dataset.dropValidation !== undefined) pondOptions.dropValidation = readBoolean(dataset.dropValidation);
    if (dataset.imagePreviewHeight) pondOptions.imagePreviewHeight = Number(dataset.imagePreviewHeight);
    if (dataset.stylePanelLayout) {
      pondOptions.stylePanelLayout = dataset.stylePanelLayout as FilePondNS.FilePondOptions['stylePanelLayout'];
    }
    if (dataset.stylePanelAspectRatio) pondOptions.stylePanelAspectRatio = dataset.stylePanelAspectRatio;

    this.pond = FilePond.create(this._fileEl, pondOptions);

    // FilePond inserts its own root as a *sibling* of the input it was
    // given - but that input lives inside .btn (stock .file-field markup
    // is `.btn > input[type=file]`), so the fresh FilePond root lands
    // inside .btn too. Move it back out to be a direct child of .file-field
    // itself before hiding .btn, or hiding .btn would take the whole
    // FilePond widget down with it.
    const pondRoot = this.pond.element;
    if (pondRoot) {
      this.el.appendChild(pondRoot);
      const fileHeight = Number(dataset.fileHeight);
      if (Number.isFinite(fileHeight) && fileHeight > 0) {
        (pondRoot as HTMLElement).style.height = `${fileHeight}px`;
      }
      // Matches CrazyPHP's own File.ts behavior - FilePond's free-tier
      // "Powered by FilePond" credit link doesn't fit a themed, branded UI.
      pondRoot.querySelectorAll('.filepond--credits').forEach((el) => el.remove());
    }

    // Everything from the stock .file-field is now redundant - FilePond's
    // own drop zone is the entire upload affordance. Hidden, not removed,
    // so the .file-field structure this component promises to preserve is
    // still there, just not shown alongside FilePond's widget.
    this.el.classList.add('file-field-enhanced');
    this.el.querySelector<HTMLElement>('.btn')?.classList.add('hide');
    this.el.querySelector<HTMLElement>('.file-path-wrapper')?.classList.add('hide');
    this._syncPathInput();
    this.pond.on('updatefiles', this._syncPathInput);
  }

  _syncPathInput = () => {
    if (!this._pathEl || !this.pond) return;
    this._pathEl.value = this.pond
      .getFiles()
      .map((f) => f.filename)
      .join(', ');
  };
}
