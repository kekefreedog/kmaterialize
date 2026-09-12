import { OtpInput, type OtpInputOptions } from '../components/otp-input/otp-input';
import { MaskitoInput, type MaskitoInputOptions } from '../components/maskito-input/maskito-input';
import { RichTextarea, type RichTextareaOptions } from '../components/rich-textarea/rich-textarea';
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Autocomplete, AutocompleteOptions } from '../components/search/autocomplete';
import { Popup } from '../components/popup/popup';
import { Loading, LoadingOptions } from '../components/loading/loading';
import { Alert, AlertOptions } from '../components/alert/alert';
import { Kanban, KanbanOptions } from '../components/kanban/kanban';
import { FloatingActionButton, FloatingActionButtonOptions } from '../components/button/buttons';
import { Cards, CardsOptions } from '../components/card/cards';
import { Carousel, CarouselOptions } from '../components/carousel/carousel';
import { Chips, ChipsOptions } from '../components/chip/chips';
import { Collapsible, CollapsibleOptions } from '../components/collapsible/collapsible';
import { Datepicker, DatepickerOptions } from '../components/datepicker/datepicker';
import { Dropdown, DropdownOptions } from '../components/dropdown/dropdown';
import { Forms } from '../components/textfield/forms';
import { Materialbox, MaterialboxOptions } from '../components/dialog/materialbox';
import { Modal, ModalOptions } from '../components/dialog/modal';
import { FormSelect, FormSelectOptions } from '../components/textfield/select';
import { Sidenav, SidenavOptions } from '../components/navigation-drawer/sidenav';
import { Slider, SliderOptions } from '../components/carousel/slider';
import { Tabs, TabsOptions } from '../components/tabs/tabs';
import { Timepicker, TimepickerOptions } from '../components/timepicker/timepicker';
import { Toast, ToastOptions } from '../components/snackbar/toasts';
import { Tooltip, TooltipOptions } from '../components/tooltip/tooltip';
import { Range } from '../components/slider/range';
import { Toolbar, ToolbarOptions } from '../components/toolbar/toolbar';
import { PasswordInput, PasswordInputOptions } from '../components/password-input/password-input';
import { NumberInput, NumberInputOptions } from '../components/number-input/number-input';
import { ColorInput, ColorInputOptions } from '../components/color-input/color-input';
import { AirDatepickerField, AirDatepickerFieldOptions } from '../components/air-datepicker/air-datepicker';
import { FileInput, FileInputOptions } from '../components/file-input/file-input';
import { TomSelectField, TomSelectFieldOptions } from '../components/tom-select/tom-select-field';

import { TapTarget, TapTargetOptions } from './tapTarget';
import { CharacterCounter /*, CharacterCounterOptions*/ } from './characterCounter';
import { Parallax, ParallaxOptions } from './parallax';
import { Pushpin, PushpinOptions } from './pushpin';
import { ScrollSpy, ScrollSpyOptions } from './scrollspy';
import { Waves } from './waves';
import { Utils } from './utils';
import { Component } from './component';
/* eslint-enable @typescript-eslint/no-unused-vars */

export type { PopupOptions, PopupResult } from '../components/popup/popup';
export type { ToastOptions } from '../components/snackbar/toasts';

export {
  OtpInput,
  MaskitoInput,
  RichTextarea,
  Popup,
  Loading,
  Alert,
  Kanban,
  Autocomplete,
  FloatingActionButton,
  Cards,
  Carousel,
  CharacterCounter,
  Chips,
  Collapsible,
  Datepicker,
  Dropdown,
  Forms,
  Materialbox,
  Modal,
  Parallax,
  Pushpin,
  ScrollSpy,
  FormSelect,
  Sidenav,
  Slider,
  Tabs,
  TapTarget,
  Timepicker,
  Toast,
  Tooltip,
  Waves,
  Range,
  Toolbar,
  PasswordInput,
  NumberInput,
  ColorInput,
  AirDatepickerField,
  FileInput,
  TomSelectField
};

export const version = '2.3.3';

/**
 * Convenience helper matching v1's `M.toast({...})` call, since Toast is a
 * class in v2 with no bare functional equivalent of its own.
 */
export function toast(options: Partial<ToastOptions>): Toast {
  return new Toast(options as ToastOptions);
}

export interface AutoInitOptions {
  OtpInput?: Partial<OtpInputOptions>;
  MaskitoInput?: Partial<MaskitoInputOptions>;
  RichTextarea?: Partial<RichTextareaOptions>;
  Loading?: Partial<LoadingOptions>;
  Alert?: Partial<AlertOptions>;
  Kanban?: Partial<KanbanOptions>;
  Autocomplete?: Partial<AutocompleteOptions>;
  Cards?: Partial<CardsOptions>;
  Carousel?: Partial<CarouselOptions>;
  Chips?: Partial<ChipsOptions>;
  Collapsible?: Partial<CollapsibleOptions>;
  Datepicker?: Partial<DatepickerOptions>;
  Dropdown?: Partial<DropdownOptions>;
  Materialbox?: Partial<MaterialboxOptions>;
  Modal?: Partial<ModalOptions>;
  Parallax?: Partial<ParallaxOptions>;
  Pushpin?: Partial<PushpinOptions>;
  ScrollSpy?: Partial<ScrollSpyOptions>;
  FormSelect?: Partial<FormSelectOptions>;
  Sidenav?: Partial<SidenavOptions>;
  Tabs?: Partial<TabsOptions>;
  TapTarget?: Partial<TapTargetOptions>;
  Timepicker?: Partial<TimepickerOptions>;
  Tooltip?: Partial<TooltipOptions>;
  FloatingActionButton?: Partial<FloatingActionButtonOptions>;
  Toolbar?: Partial<ToolbarOptions>;
  PasswordInput?: Partial<PasswordInputOptions>;
  NumberInput?: Partial<NumberInputOptions>;
  ColorInput?: Partial<ColorInputOptions>;
  AirDatepickerField?: Partial<AirDatepickerFieldOptions>;
  FileInput?: Partial<FileInputOptions>;
  TomSelectField?: Partial<TomSelectFieldOptions>;
}

/**
 * Automatically initialize components.
 * @param context Root element to initialize. Defaults to `document.body`.
 * @param options Options for each component.
 */
export function AutoInit(context: HTMLElement = document.body, options?: Partial<AutoInitOptions>) {
  const registry = {
    OtpInput: context.querySelectorAll('input[data-otp]:not(.no-autoinit)'),
    MaskitoInput: context.querySelectorAll('input[data-maskito]:not([data-otp]):not(.no-autoinit)'),
    RichTextarea: context.querySelectorAll('textarea[data-editor="quill"]:not(.no-autoinit)'),
    Loading: context.querySelectorAll('.loading:not(.no-autoinit)'),
    Alert: context.querySelectorAll('.alert:not(.no-autoinit)'),
    Kanban: context.querySelectorAll('.kanban-board:not(.no-autoinit)'),
    Autocomplete: context.querySelectorAll('.autocomplete:not(.no-autoinit)'),
    Cards: context.querySelectorAll('.cards:not(.no-autoinit)'),
    Carousel: context.querySelectorAll('.carousel:not(.no-autoinit)'),
    Chips: context.querySelectorAll('.chips:not(.no-autoinit)'),
    Collapsible: context.querySelectorAll('.collapsible:not(.no-autoinit)'),
    Datepicker: context.querySelectorAll('.datepicker:not(.no-autoinit)'),
    Dropdown: context.querySelectorAll('.dropdown-trigger:not(.no-autoinit)'),
    Materialbox: context.querySelectorAll('.materialboxed:not(.no-autoinit)'),
    Modal: context.querySelectorAll('.modal:not(.no-autoinit)'),
    Parallax: context.querySelectorAll('.parallax:not(.no-autoinit)'),
    Pushpin: context.querySelectorAll('.pushpin:not(.no-autoinit)'),
    ScrollSpy: context.querySelectorAll('.scrollspy:not(.no-autoinit)'),
    // Excludes .tomselected - a select opted into TomSelectField instead
    // (see below), never eligible for FormSelect regardless of ordering.
    FormSelect: context.querySelectorAll('select:not(.no-autoinit):not(.tomselected)'),
    Sidenav: context.querySelectorAll('.sidenav:not(.no-autoinit)'),
    Tabs: context.querySelectorAll('.tabs:not(.no-autoinit)'),
    TapTarget: context.querySelectorAll('.tap-target:not(.no-autoinit)'),
    Timepicker: context.querySelectorAll('.timepicker:not(.no-autoinit)'),
    Tooltip: context.querySelectorAll('.tooltipped:not(.no-autoinit)'),
    FloatingActionButton: context.querySelectorAll('.fixed-action-btn:not(.no-autoinit)'),
    // Excludes .fixed-action-btn.toolbar - that's an unrelated FAB display
    // mode reusing the same class name, not this component.
    Toolbar: context.querySelectorAll('.toolbar:not(.fixed-action-btn):not(.no-autoinit)'),
    PasswordInput: context.querySelectorAll('input[data-password-toggle]:not(.no-autoinit)'),
    NumberInput: context.querySelectorAll('input[data-type="number"]:not([data-otp]):not([data-maskito]):not(.no-autoinit)'),
    ColorInput: context.querySelectorAll('input[type="color"][data-color-picker="pickr"]:not(.no-autoinit)'),
    AirDatepickerField: context.querySelectorAll('input[data-date-picker="air-datepicker"]:not(.no-autoinit)'),
    FileInput: context.querySelectorAll('.file-field[data-file-picker="filepond"]:not(.no-autoinit)'),
    TomSelectField: context.querySelectorAll('select.tomselected:not(.no-autoinit)')
  };
  OtpInput.init(registry.OtpInput, options?.OtpInput ?? {});
  MaskitoInput.init(registry.MaskitoInput, options?.MaskitoInput ?? {});
  RichTextarea.init(registry.RichTextarea, options?.RichTextarea ?? {});
  Autocomplete.init(registry.Autocomplete, options?.Autocomplete ?? {});
  Loading.init(registry.Loading, options?.Loading ?? {});
  Alert.init(registry.Alert, options?.Alert ?? {});
  Kanban.init(registry.Kanban, options?.Kanban ?? {});
  Cards.init(registry.Cards, options?.Cards ?? {});
  Carousel.init(registry.Carousel, options?.Carousel ?? {});
  Chips.init(registry.Chips, options?.Chips ?? {});
  Collapsible.init(registry.Collapsible, options?.Collapsible ?? {});
  Datepicker.init(registry.Datepicker, options?.Datepicker ?? {});
  Dropdown.init(registry.Dropdown, options?.Dropdown ?? {});
  Materialbox.init(registry.Materialbox, options?.Materialbox ?? {});
  Modal.init(registry.Modal, options?.Modal ?? {});
  Parallax.init(registry.Parallax, options?.Parallax ?? {});
  Pushpin.init(registry.Pushpin, options?.Pushpin ?? {});
  ScrollSpy.init(registry.ScrollSpy, options?.ScrollSpy ?? {});
  FormSelect.init(registry.FormSelect, options?.FormSelect ?? {});
  Sidenav.init(registry.Sidenav, options?.Sidenav ?? {});
  Tabs.init(registry.Tabs, options?.Tabs ?? {});
  TapTarget.init(registry.TapTarget, options?.TapTarget ?? {});
  Timepicker.init(registry.Timepicker, options?.Timepicker ?? {});
  Tooltip.init(registry.Tooltip, options?.Tooltip ?? {});
  FloatingActionButton.init(registry.FloatingActionButton, options?.FloatingActionButton ?? {});
  Toolbar.init(registry.Toolbar, options?.Toolbar ?? {});
  PasswordInput.init(registry.PasswordInput, options?.PasswordInput ?? {});
  NumberInput.init(registry.NumberInput, options?.NumberInput ?? {});
  ColorInput.init(registry.ColorInput, options?.ColorInput ?? {});
  AirDatepickerField.init(registry.AirDatepickerField, options?.AirDatepickerField ?? {});
  FileInput.init(registry.FileInput, options?.FileInput ?? {});
  TomSelectField.init(registry.TomSelectField, options?.TomSelectField ?? {});
}

// Init

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', Utils.docHandleKeydown, true);
  document.addEventListener('keyup', Utils.docHandleKeyup, true);
  document.addEventListener('focus', Utils.docHandleFocus, true);
  document.addEventListener('blur', Utils.docHandleBlur, true);
}
Forms.Init();
Chips.Init();
Waves.Init();
Range.Init();
Cards.Init();

// Reusable components formerly hosted in the documentation project.
export * from '../components/extensions/material-buttons';
export * from '../components/extensions/list';
export * from '../components/extensions/org-chart';
export * from '../components/extensions/card-drag-handles';
export * from '../components/extensions/chart-connections';
export * from '../components/extensions/chart-gestures';
export * from '../components/extensions/chart-print';
export { default as Kmcomponent } from '../components/extensions/web/kmcomponent';
export * from '../components/extensions/web/kmcomponent';
export { default as CrazyButton } from '../components/extensions/web/crazy-button';

export { default as CrazyLoading, LoadingScreenBtn } from '../components/extensions/web/crazy-loading';

export { initNavbarScroll } from '../components/appbar/navbar-scroll';

export type { PopupStep, PopupStepContext, PopupStepsOptions } from '../components/popup/popup-stepper';

export type { RangeOptions } from '../components/slider/range';

export type { RichTextareaOptions } from '../components/rich-textarea/rich-textarea';

export type { MaskitoInputOptions } from '../components/maskito-input/maskito-input';

export type { OtpInputOptions } from '../components/otp-input/otp-input';
