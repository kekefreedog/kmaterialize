/**
 * Base class implementation for Materialize components.
 */
export class Component {
    /**
     * The DOM element the plugin was initialized with.
     */
    el;
    /**
     * The options the instance was initialized with.
     */
    options;
    /**
     * Constructs component instance and set everything up.
     */
    constructor(el, options, classDef) {
        // Display error if el is not a valid HTML Element
        if (!(el instanceof HTMLElement)) {
            console.error(Error(el + ' is not an HTML Element'));
        }
        // If exists, destroy and reinitialize in child
        const ins = classDef.getInstance(el);
        if (!!ins) {
            ins.destroy();
        }
        this.el = el;
    }
    /**
     * Initializes component instances.
     * @param els HTML elements.
     * @param options Component options.
     * @param classDef Class definition.
     */
    static init(els, options, classDef) {
        let instances = null;
        if (els instanceof Element) {
            instances = new classDef(els, options);
        }
        else if (!!els && els.length) {
            instances = [];
            for (let i = 0; i < els.length; i++) {
                instances.push(new classDef(els[i], options));
            }
        }
        return instances;
    }
    /**
     * @returns default options for component instance.
     */
    static get defaults() {
        return {};
    }
    /**
     * Retrieves component instance for the given element.
     * @param el Associated HTML Element.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static getInstance(el) {
        throw new Error('This method must be implemented.');
    }
    /**
     * Destroy plugin instance and teardown.
     */
    destroy() {
        throw new Error('This method must be implemented.');
    }
}
