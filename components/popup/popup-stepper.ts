import type Swal from 'sweetalert2';
import type { PopupOptions, PopupResult } from './popup';

export interface PopupStepContext<T = unknown> {
  /** Aborted when the popup closes. Pass this signal to fetch or other work. */
  signal: AbortSignal;
  /** Results from completed steps, in order. */
  results: readonly T[];
  /** Update the active step's plain-text progress message. */
  setMessage(message: string): void;
}
export interface PopupStep<T = unknown> {
  title: string;
  description?: string;
  run(context: PopupStepContext<T>): T | Promise<T>;
}
export interface PopupStepsOptions<T = unknown> {
  title: string;
  description?: string;
  steps: readonly PopupStep<T>[];
  /** Allow cancellation while working. Defaults to true. */
  cancellable?: boolean;
  cancelButtonText?: string;
  doneButtonText?: string;
  retryButtonText?: string;
}

/** Internal runner; Popup.steps supplies the themed dialog and optional peer. */
export async function runPopupSteps<T>(
  swal: typeof Swal,
  options: PopupStepsOptions<T>,
  fire: (options: PopupOptions) => Promise<PopupResult<T[]>>
): Promise<PopupResult<T[]>> {
  if (!options.steps?.length || options.steps.some(step => typeof step.run !== 'function')) {
    throw new TypeError('Popup.steps requires at least one step with a run function.');
  }
  const steps = options.steps.map(step => ({ ...step }));
  const controller = new AbortController();
  const results: T[] = [];
  const root = document.createElement('div');
  root.className = 'popup-stepper';
  if (options.description) {
    const description = document.createElement('p');
    description.textContent = options.description;
    root.append(description);
  }
  const progress = document.createElement('progress');
  progress.className = 'popup-stepper-progress';
  progress.max = steps.length;
  progress.value = 0;
  progress.setAttribute('aria-label', 'Completed steps');
  const list = document.createElement('ol');
  list.className = 'popup-stepper-list';
  const rows = steps.map((step, index) => {
    const row = document.createElement('li');
    row.className = 'popup-stepper-step';
    row.dataset.state = 'pending';
    const marker = document.createElement('span');
    marker.className = 'popup-stepper-marker';
    marker.textContent = String(index + 1);
    marker.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = step.title;
    const state = document.createElement('span');
    state.className = 'popup-stepper-state';
    state.textContent = 'Waiting';
    const message = document.createElement('p');
    message.textContent = step.description || '';
    body.append(title, state, message);
    row.append(marker, body);
    list.append(row);
    return { row, marker, state, message };
  });
  const status = document.createElement('p');
  status.className = 'popup-stepper-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  root.append(progress, list, status);
  let popup: HTMLElement | undefined;
  let running = false;
  let complete = false;
  const alive = () => !controller.signal.aborted && popup === swal.getPopup();
  const run = async () => {
    if (running || complete || !alive()) return;
    running = true;
    swal.update({ showConfirmButton: false });
    list.setAttribute('aria-busy', 'true');
    try {
      while (results.length < steps.length && alive()) {
        const index = results.length;
        const step = steps[index];
        const view = rows[index];
        view.row.dataset.state = 'active';
        view.row.setAttribute('aria-current', 'step');
        view.marker.textContent = String(index + 1);
        view.state.textContent = 'In progress';
        view.message.textContent = step.description || '';
        status.textContent = `Step ${index + 1} of ${steps.length}: ${step.title}`;
        const value = await step.run({
          signal: controller.signal,
          results: Object.freeze([...results]),
          setMessage(message) {
            if (alive() && running && results.length === index) view.message.textContent = message;
          }
        });
        if (!alive()) return;
        results.push(value);
        progress.value = results.length;
        view.row.dataset.state = 'complete';
        view.row.removeAttribute('aria-current');
        view.marker.textContent = '✓';
        view.state.textContent = 'Complete';
      }
      if (!alive()) return;
      complete = true;
      status.textContent = 'All steps completed.';
      swal.update({ showConfirmButton: true, showCancelButton: false,
        confirmButtonText: options.doneButtonText || 'Done' });
      swal.getConfirmButton()?.focus();
    } catch (error) {
      if (!alive()) return;
      const view = rows[results.length];
      view.row.dataset.state = 'error';
      view.row.removeAttribute('aria-current');
      view.marker.textContent = '!';
      view.state.textContent = 'Failed';
      view.message.textContent = error instanceof Error ? error.message : String(error);
      status.textContent = `${steps[results.length].title} failed. Retry this step or close the popup.`;
      // Even a non-cancellable run can be dismissed after a failure.
      swal.update({ showConfirmButton: true, showCancelButton: true,
        confirmButtonText: options.retryButtonText || 'Retry step' });
      swal.getConfirmButton()?.focus();
    } finally {
      running = false;
      list.removeAttribute('aria-busy');
    }
  };
  try {
    return await fire({
      titleText: options.title,
      html: root,
      customClass: { popup: 'popup-stepper-dialog' },
      showConfirmButton: false,
      showCancelButton: options.cancellable !== false,
      cancelButtonText: options.cancelButtonText || 'Cancel',
      allowOutsideClick: false,
      allowEscapeKey: () => options.cancellable !== false || (!running && !complete),
      didOpen(element) { popup = element; void run(); },
      willClose() { controller.abort(); },
      didDestroy() { controller.abort(); },
      preConfirm() {
        if (complete) return [...results];
        void run();
        return false;
      }
    });
  } finally {
    controller.abort();
  }
}
