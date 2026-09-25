import { initInputCopyButtons } from './input-copy';
import { initOutlinedNotches } from './outlined-notch';
import { Utils } from '../../src/utils';

export class Forms {
  /**
   * Checks if the label has validation and apply
   * the correct class and styles
   * @param textfield
   */
  static validateField(textfield: HTMLInputElement) {
    if (!textfield) {
      console.error('No text field element found');
      return;
    }

    const hasLength = textfield.getAttribute('data-length') !== null;
    const lenAttr = parseInt(textfield.getAttribute('data-length'));
    const len = textfield.value.length;

    if (
      len === 0 &&
      textfield.validity.badInput === false &&
      !textfield.required &&
      textfield.classList.contains('validate')
    ) {
      textfield.classList.remove('invalid');
    } else if (textfield.classList.contains('validate')) {
      // Check for character counter attributes
      if (
        (textfield.validity.valid && hasLength && len <= lenAttr) ||
        (textfield.validity.valid && !hasLength)
      ) {
        textfield.classList.remove('invalid');
      } else {
        textfield.classList.add('invalid');
      }
    }
  }

  /**
   * Resizes the given TextArea after updating the
   *  value content dynamically.
   * @param e EventTarget
   */
  static textareaAutoResize(e: EventTarget) {
    const textarea = e as HTMLTextAreaElement;
    // Hidden fields cannot be measured until their layout is available.
    if (!textarea.getClientRects().length || !textarea.offsetWidth) return;
    const style = getComputedStyle(textarea);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const borderBox = style.boxSizing === 'border-box';
    if (!textarea.hasAttribute('original-height'))
      textarea.setAttribute('original-height', textarea.getBoundingClientRect().height.toString());

    const originalHeight = parseFloat(textarea.getAttribute('original-height')) || 0;
    const minimum = borderBox ? originalHeight : Math.max(0, originalHeight - border - padding);
    // Measure the native control so wrapping, fonts and trailing newlines agree.
    // Reset first to let a previously expanded textarea shrink after deletion.
    textarea.style.height = '0px';
    const height = textarea.scrollHeight + (borderBox ? border : -padding);
    textarea.style.height = Math.ceil(Math.max(minimum, height)) + 'px';
    textarea.setAttribute('previous-length', textarea.value.length.toString());
  }

  static Init() {
    initOutlinedNotches();
    initInputCopyButtons();
    if (typeof document !== 'undefined')
      document?.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('change', (e: KeyboardEvent) => {
          const target = <HTMLInputElement>e.target;
          if (target instanceof HTMLInputElement) {
            if (target.value.length !== 0 || target.getAttribute('placeholder') !== null) {
              for (const child of target.parentNode.children) {
                if (child.tagName == 'label') {
                  child.classList.add('active');
                }
              }
            }
            Forms.validateField(target);
          }
        });

        document.addEventListener('keyup', (e: KeyboardEvent) => {
          const target = <HTMLInputElement>e.target;
          // Radio and Checkbox focus class
          if (target instanceof HTMLInputElement && ['radio', 'checkbox'].includes(target.type)) {
            // TAB, check if tabbing to radio or checkbox.
            if (Utils.keys.TAB.includes(e.key)) {
              target.classList.add('tabbed');
              target.addEventListener('blur', () => target.classList.remove('tabbed'), {
                once: true
              });
            }
          }
        });

        document
          .querySelectorAll('.materialize-textarea')
          .forEach((textArea: HTMLTextAreaElement) => {
            Forms.InitTextarea(textArea);
          });

        // File Input Path
        document
          .querySelectorAll('.file-field input[type="file"]')
          .forEach((fileInput: HTMLInputElement) => {
            Forms.InitFileInputPath(fileInput);
          });
      });
  }

  static InitTextarea(textarea: HTMLTextAreaElement) {
    // Save Data in Element
    textarea.setAttribute('original-height', textarea.getBoundingClientRect().height.toString());
    textarea.setAttribute('previous-length', (textarea.value || '').length.toString());
    Forms.textareaAutoResize(textarea);
    textarea.addEventListener('input', (e) => Forms.textareaAutoResize(e.target));
    textarea.addEventListener('keyup', (e) => Forms.textareaAutoResize(e.target));
    textarea.addEventListener('keydown', (e) => Forms.textareaAutoResize(e.target));
  }

  static InitFileInputPath(fileInput: HTMLInputElement) {
    fileInput.addEventListener('change', () => {
      const fileField = fileInput.closest('.file-field');
      const pathInput = <HTMLInputElement>fileField.querySelector('input.file-path');
      const files = fileInput.files;
      const filenames = [];
      for (let i = 0; i < files.length; i++) {
        filenames.push(files[i].name);
      }
      pathInput.value = filenames.join(', ');
      pathInput.dispatchEvent(
        new Event('change', { bubbles: true, cancelable: true, composed: true })
      );
    });
  }
}
