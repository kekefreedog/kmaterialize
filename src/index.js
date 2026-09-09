/* eslint-disable @typescript-eslint/no-unused-vars */
import { Autocomplete } from '../components/search/autocomplete';
import { Alert } from '../components/alert/alert';
import { Kanban } from '../components/kanban/kanban';
import { FloatingActionButton } from '../components/button/buttons';
import { Cards } from '../components/card/cards';
import { Carousel } from '../components/carousel/carousel';
import { Chips } from '../components/chip/chips';
import { Collapsible } from '../components/collapsible/collapsible';
import { Datepicker } from '../components/datepicker/datepicker';
import { Dropdown } from '../components/dropdown/dropdown';
import { Forms } from '../components/textfield/forms';
import { Materialbox } from '../components/dialog/materialbox';
import { Modal } from '../components/dialog/modal';
import { FormSelect } from '../components/textfield/select';
import { Sidenav } from '../components/navigation-drawer/sidenav';
import { Slider } from '../components/carousel/slider';
import { Tabs } from '../components/tabs/tabs';
import { Timepicker } from '../components/timepicker/timepicker';
import { Toast } from '../components/snackbar/toasts';
import { Tooltip } from '../components/tooltip/tooltip';
import { Range } from '../components/slider/range';
import { Toolbar } from '../components/toolbar/toolbar';
import { PasswordInput } from '../components/password-input/password-input';
import { NumberInput } from '../components/number-input/number-input';
import { ColorInput } from '../components/color-input/color-input';
import { AirDatepickerField } from '../components/air-datepicker/air-datepicker';
import { FileInput } from '../components/file-input/file-input';
import { TomSelectField } from '../components/tom-select/tom-select-field';
import { TapTarget } from './tapTarget';
import { CharacterCounter /*, CharacterCounterOptions*/ } from './characterCounter';
import { Parallax } from './parallax';
import { Pushpin } from './pushpin';
import { ScrollSpy } from './scrollspy';
import { Waves } from './waves';
import { Utils } from './utils';
/* eslint-enable @typescript-eslint/no-unused-vars */
export { Alert, Kanban, Autocomplete, FloatingActionButton, Cards, Carousel, CharacterCounter, Chips, Collapsible, Datepicker, Dropdown, Forms, Materialbox, Modal, Parallax, Pushpin, ScrollSpy, FormSelect, Sidenav, Slider, Tabs, TapTarget, Timepicker, Toast, Tooltip, Waves, Range, Toolbar, PasswordInput, NumberInput, ColorInput, AirDatepickerField, FileInput, TomSelectField };
export const version = '2.3.3';
/**
 * Convenience helper matching v1's `M.toast({...})` call, since Toast is a
 * class in v2 with no bare functional equivalent of its own.
 */
export function toast(options) {
    return new Toast(options);
}
/**
 * Automatically initialize components.
 * @param context Root element to initialize. Defaults to `document.body`.
 * @param options Options for each component.
 */
export function AutoInit(context = document.body, options) {
    const registry = {
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
        NumberInput: context.querySelectorAll('input[data-type="number"]:not(.no-autoinit)'),
        ColorInput: context.querySelectorAll('input[type="color"][data-color-picker="pickr"]:not(.no-autoinit)'),
        AirDatepickerField: context.querySelectorAll('input[data-date-picker="air-datepicker"]:not(.no-autoinit)'),
        FileInput: context.querySelectorAll('.file-field[data-file-picker="filepond"]:not(.no-autoinit)'),
        TomSelectField: context.querySelectorAll('select.tomselected:not(.no-autoinit)')
    };
    Autocomplete.init(registry.Autocomplete, options?.Autocomplete ?? {});
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
