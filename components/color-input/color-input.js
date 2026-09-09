import { Component } from '../../src/component';
import { loadPeer } from '../../src/peer-loader';
// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/Color.ts
// Built-in French translation for Pickr's UI strings, activated by
// `data-color-locale="fr-fr"` alone - no separate options object required
// from the consumer, unlike a fully custom `options.locale` override.
const FR_FR = {
    'ui:dialog': 'boîte de dialogue du sélecteur de couleur',
    'btn:toggle': 'basculer la boîte de dialogue du sélecteur de couleur',
    'btn:swatch': 'échantillon de couleur',
    'btn:last-color': 'utiliser la couleur précédente',
    'btn:save': 'Enregistrer',
    'btn:cancel': 'Annuler',
    'btn:clear': 'Effacer',
    'aria:btn:save': 'enregistrer et fermer',
    'aria:btn:cancel': 'annuler et fermer',
    'aria:btn:clear': 'effacer et fermer',
    'aria:input': 'champ de saisie de couleur',
    'aria:palette': 'zone de sélection des couleurs',
    'aria:hue': 'curseur de sélection de teinte',
    'aria:opacity': "curseur de sélection d'opacité"
};
const _defaults = {
    theme: 'classic',
    opacity: true,
    swatches: [
        'rgba(244, 67, 54, 1)',
        'rgba(233, 30, 99, 0.95)',
        'rgba(156, 39, 176, 0.9)',
        'rgba(103, 58, 183, 0.85)',
        'rgba(63, 81, 181, 0.8)',
        'rgba(33, 150, 243, 0.75)',
        'rgba(3, 169, 244, 0.7)',
        'rgba(0, 188, 212, 0.7)',
        'rgba(0, 150, 136, 0.75)',
        'rgba(76, 175, 80, 0.8)',
        'rgba(139, 195, 74, 0.85)',
        'rgba(205, 220, 57, 0.9)',
        'rgba(255, 235, 59, 0.95)',
        'rgba(255, 193, 7, 1)'
    ]
};
// @implement /Users/kzarshenas/Sites/CrazyProject/CrazyPHP/src/Front/Library/Utility/Form/Color.ts
// Enhances a native `<input type="color" data-color-picker="pickr">` with a
// full Pickr popup (palette, hue/opacity sliders, swatches, hex/rgba/hsla).
// If `data-color-picker` is absent the input is left completely untouched -
// still a plain native color swatch, matching CrazyPHP's own fallback.
//
// Pickr remains an optional peerDependency and is loaded on demand via peer-loader.
export class ColorInput extends Component {
    pickr;
    ready;
    _swatchEl;
    _labels;
    constructor(el, options) {
        super(el, options, ColorInput);
        this.el.M_ColorInput = this;
        this.options = {
            ...ColorInput.defaults,
            ...options
        };
        this._swatchEl = document.createElement('div');
        this.el.after(this._swatchEl);
        this.el.classList.add('hide');
        this.el.addEventListener('change', this._handleInputChange);
        this._labels = Array.from(document.querySelectorAll('label')).filter(label => label.htmlFor === this.el.id);
        this._labels.forEach(label => label.addEventListener('click', this._handleLabelClick));
        this.ready = this._setup();
    }
    static get defaults() {
        return _defaults;
    }
    static init(els, options = {}) {
        return super.init(els, options, ColorInput);
    }
    static getInstance(el) {
        return el.M_ColorInput;
    }
    destroy() {
        this.el.removeEventListener('change', this._handleInputChange);
        this._labels.forEach(label => label.removeEventListener('click', this._handleLabelClick));
        this.pickr?.destroyAndRemove();
        this._swatchEl.remove();
        this.el.classList.remove('hide');
        this.el.M_ColorInput = undefined;
    }
    _handleInputChange = () => {
        this.pickr?.setColor(this.el.value);
    };
    _handleLabelClick = (event) => {
        // A label associated with a hidden input[type=color] otherwise opens
        // the browser's native picker (notably in Firefox). Route the same
        // accessible label activation to Pickr instead.
        event.preventDefault();
        void this.ready.then(() => this.pickr?.show());
    };
    async _setup() {
        const Pickr = await loadPeer({
            specifier: '@simonwep/pickr',
            globalName: 'Pickr',
            feature: 'Color input (Pickr) enhancement',
            cdnHint: '<link rel="stylesheet" href="path/to/pickr-classic.min.css">\n' +
                '    <script src="path/to/pickr.min.js"></script>\n' +
                '    (self-hosted - copy from node_modules/@simonwep/pickr/dist/, or a CDN of your choice)'
        }, () => import('@simonwep/pickr'));
        const dataset = this.el.dataset;
        const theme = (['classic', 'monolith', 'nano'].includes(dataset.colorTheme ?? '')
            ? dataset.colorTheme
            : this.options.theme);
        const lockOpacity = dataset.colorOpacity !== undefined
            ? ['false', '0', '', 'null'].includes(dataset.colorOpacity)
            : !this.options.opacity;
        const pickrOptions = {
            el: this._swatchEl,
            theme,
            lockOpacity,
            swatches: this.options.swatches,
            components: {
                preview: true,
                opacity: true,
                hue: true,
                interaction: {
                    hex: true,
                    rgba: true,
                    hsla: true,
                    hsva: true,
                    cmyk: true,
                    input: true,
                    clear: true,
                    save: true
                }
            }
        };
        if (this.options.locale) {
            pickrOptions.i18n = this.options.locale;
        }
        else if (dataset.colorLocale === 'fr-fr') {
            pickrOptions.i18n = FR_FR;
        }
        const currentValue = this.el.getAttribute('value');
        if (currentValue && currentValue !== 'randomHex()') {
            pickrOptions.default = currentValue;
        }
        else if (this.el.hasAttribute('default')) {
            const currentDefault = this.el.getAttribute('default');
            if (currentDefault === 'randomHex()') {
                const randomColor = Math.floor(Math.random() * 16777216);
                pickrOptions.default = `#${randomColor.toString(16).padStart(6, '0')}`;
            }
            else if (currentDefault) {
                pickrOptions.default = currentDefault;
            }
        }
        this.pickr = Pickr.create(pickrOptions);
        if (this.el.disabled)
            this.pickr.disable();
        this.pickr.on('save', (color, instance) => {
            const hexa = color?.toHEXA().toString();
            if (hexa) {
                this.el.value = hexa;
                this.el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            instance.hide();
        });
    }
}
