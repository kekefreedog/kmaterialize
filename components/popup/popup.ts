import type Swal from 'sweetalert2';
import type {
  SweetAlertCustomClass,
  SweetAlertOptions,
  SweetAlertResult
} from 'sweetalert2';

import { loadPeer } from '../../src/peer-loader';

export type PopupOptions = SweetAlertOptions;
export type PopupResult<T = unknown> = SweetAlertResult<T>;

function withClass(
  required: string,
  custom?: string | readonly string[]
): string {
  return [
    required,
    ...(typeof custom === 'string'
      ? custom.split(/\s+/)
      : custom ?? [])
  ]
    .filter(
      (value, index, values) =>
        value && values.indexOf(value) === index
    )
    .join(' ');
}

/** Materialize-themed SweetAlert2 dialogs. No element initialization is needed. */
export class Popup {
  /** Fresh defaults so per-dialog customization cannot affect later popups. */
  static get defaults(): PopupOptions {
    return {
      buttonsStyling: false,
      heightAuto: false,
      customClass: {
        container: 'popup-container',
        popup: 'popup',
        confirmButton: 'btn filled',
        cancelButton: 'btn outlined',
        denyButton: 'btn tonal'
      }
    };
  }

  private static _load(): Promise<typeof Swal> {
    // Use the JS-only build: the consumer controls stylesheet order.
    return loadPeer<typeof Swal>(
      {
        specifier: 'sweetalert2',
        globalName: 'Swal',
        feature: 'Popup',
        cdnHint:
          '<link rel="stylesheet" href="path/to/sweetalert2.min.css">\n' +
          '    <script src="path/to/sweetalert2.min.js"></script>\n' +
          '    (copy from node_modules/sweetalert2/dist/; load the CSS before materialize.css)'
      },
      () => import('sweetalert2/dist/sweetalert2.js')
    );
  }

  /** Open a dialog and resolve with SweetAlert2's confirmation/dismissal result. */
  static async fire<T = unknown>(
    options: PopupOptions = {}
  ): Promise<PopupResult<Awaited<T>>> {
    const swal = await Popup._load();
    const defaults = Popup.defaults;

    const customClass: SweetAlertCustomClass = {
      ...defaults.customClass,
      ...options.customClass,

      // Keep the scoped theme even when consumers add their own classes.
      container: withClass(
        'popup-container',
        options.customClass?.container
      ),

      popup: withClass(
        'popup',
        options.customClass?.popup
      )
    };

    /*
     * SweetAlertOptions is a discriminated union because `input: "file"`
     * uses a different inputValidator signature. Object spreading causes
     * TypeScript to lose that correlation, even though the resulting
     * object is valid.
     */
    const mergedOptions = {
      ...defaults,
      ...options,
      customClass
    } as SweetAlertOptions;

    const result = await swal.fire<T>(mergedOptions);

    /*
     * SweetAlert2 declares its own internal Awaited<T>, while modern
     * TypeScript provides the global Awaited<T>. They are semantically
     * equivalent here but TypeScript can report them as unrelated.
     */
    return result as PopupResult<Awaited<T>>;
  }

  /** Close the current SweetAlert2 dialog, resolving its pending result. */
  static async close(): Promise<void> {
    const swal = await Popup._load();
    swal.close();
  }
}