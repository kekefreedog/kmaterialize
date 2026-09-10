/**
 * Front
 *
 * Front TS scripts for your Crazy App.
 *
 * @package    kzarshenas/crazyphp
 * @author     kekefreedog <kevin.zarshenas@gmail.com>
 * @copyright  2022-2026 Kévin Zarshenas
 */

/**
 * Kmcomponent
 *
 * Reactive web components using compiled Handlebars templates and SCSS styles.
 * Supports light DOM projection or native slots inside an open shadow root.
 *
 * @package    kzarshenas/crazyphp
 * @author     kekefreedog <kevin.zarshenas@gmail.com>
 * @copyright  2022-2026 Kévin Zarshenas
 */
export default abstract class Kmcomponent<T extends object = Record<string, unknown>> extends (typeof HTMLElement === "undefined" ? class {} as typeof HTMLElement : HTMLElement) {

    /** Static Parameters
     ******************************************************
     */

    /** @var properties Property schema, available before custom element registration */
    public static properties: KmcomponentProperties = {};

    /** @var template Compiled HBS function, HTML string, or module export */
    public static template: KmcomponentTemplate = "";

    /** @var styles Compiled CSS, context function, or css-loader export */
    public static styles: KmcomponentStyles = "";

    /** @var options Default rendering mode for instances of the component */
    public static options: KmcomponentOptions = { shadow: false };

    /** Parameters
     ******************************************************
     */

    /** @var renderRoot Query this element or shadow root in component hooks */
    public readonly renderRoot: HTMLElement | ShadowRoot;

    /** @var updateComplete Resolves true after rendering, false if disconnected before the update */
    public updateComplete: Promise<boolean> = Promise.resolve(false);

    /** Private Parameters
     ******************************************************
     */

    /** @var _values Current typed values, independent from the static schema */
    private _values: Record<string, unknown> = Object.create(null);

    /** @var _initialized Whether defaults have been validated and copied */
    private _initialized = false;

    /** @var _pending Whether a render microtask is already queued */
    private _pending = false;

    /** @var _reflecting Prevent attribute reflection from feeding back into property updates */
    private _reflecting = false;

    /** @var _template Optional template override for this instance */
    private _template?: KmcomponentTemplate;

    /** @var _styles Optional stylesheet override for this instance */
    private _styles?: KmcomponentStyles;

    /** @var _cleanups Resources to release before rerendering or disconnecting */
    private _cleanups: Array<() => void> = [];

    /** @var _observer Observer for light DOM child changes */
    private _observer: MutationObserver | null = null;

    /** @var _children Supplied child nodes in their projection order */
    private _children: Node[] = [];

    /** @var _ownedRoots Template roots, excluded when collecting supplied children */
    private _ownedRoots = new Set<Node>();

    /** @var _slots Light DOM insertion points and their original fallback content */
    private _slots: LightSlot[] = [];

    /** @var _parking Retained children without a matching light DOM slot */
    private _parking: DocumentFragment;

    /**
     * Constructor
     *
     * Choose the rendering root without reading attributes or supplied children.
     * Subclass fields are initialized after this constructor returns.
     *
     * @param options Rendering options overriding the static defaults
     */
    public constructor(options: KmcomponentOptions = {}) {

        // Construct the native element before accessing the subclass configuration.
        super();

        // Constructor options take precedence over the component's static defaults.
        const configuration = { ...this.component.options, ...options };
        this.renderRoot = configuration.shadow ? this.attachShadow({ mode: "open" }) : this;

        // Keep unmatched light DOM children alive without displaying them.
        this._parking = this.ownerDocument.createDocumentFragment();

    }

    /** Methods | Events
     ******************************************************
     */

    /**
     * Post Render
     *
     * Called after the generated markup and projected children have been mounted.
     * Override to install event handlers or widgets, paired with onCleanup().
     *
     * @return void
     */
    public postRender(): void {

        // Component subclasses can attach their behavior after rendering.
    }

    /**
     * On Cleanup
     *
     * Register a resource disposer for the current rendered content.
     *
     * @param cleanup Callback executed before rerendering or disconnecting
     * @return void
     */
    public onCleanup(cleanup: () => void): void {

        this._cleanups.push(cleanup);

    }

    /** Public Methods | Properties
     ******************************************************
     */

    /**
     * Get Property
     *
     * Read a typed value, initializing per-instance defaults when necessary.
     *
     * @param name Declared property name
     * @return Current property value
     * @throws TypeError When the property is not declared
     */
    public getProperty<K extends keyof T & string>(name: K): T[K] {

        this.definition(name);
        this.initialize();
        return this._values[name] as T[K];

    }

    /**
     * Set Property
     *
     * Update a typed value and optionally reflect it to the mapped HTML attribute.
     * Programmatic values must already match the declared type.
     *
     * @param name Declared property name
     * @param value New typed value
     * @return void
     * @throws TypeError When the value is invalid or cannot be serialized
     */
    public setProperty<K extends keyof T & string>(name: K, value: T[K]): void {

        const property = this.definition(name);
        this.initialize();
        if (!this.valid(value, property)) throw new TypeError(`Invalid component property: ${name}`);
        const attribute = this.component.attributeName(name, property);

        // Serialize before changing state: circular JSON must not partially update it.
        const serialized = property.reflect && attribute !== null
            ? property.type === "array" || property.type === "object" ? JSON.stringify(value)
                : String(value)
            : null;
        const changed = !Object.is(this._values[name], value);
        this._values[name] = value;

        // Reflected writes must not trigger a second conversion or render request.
        if (serialized !== null && attribute !== null) {
            this._reflecting = true;
            try {
                if (this.getAttribute(attribute) !== serialized) this.setAttribute(attribute, serialized);
            } finally {
                this._reflecting = false;
            }
        }
        if (changed) this.requestUpdate();

    }

    /** Public Methods | Rendering
     ******************************************************
     */

    /**
     * Set Html And Css
     *
     * Override the static assets for one instance, including constructor-based setup.
     *
     * @param html HTML string, compiled template, or module export
     * @param css CSS string, context function, or css-loader export
     * @return void
     */
    public setHtmlAndCss(html: KmcomponentTemplate, css: KmcomponentStyles): void {

        this._template = html;
        this._styles = css;
        this.requestUpdate();

    }

    /**
     * Render
     *
     * Evaluate the template without mounting it or changing supplied children.
     * Styles are mounted separately during the scheduled update.
     *
     * @return Rendered HTML
     */
    public render(): string {

        let template = this._template ?? this.component.template;
        while (typeof template === "object") template = template.default;
        return typeof template === "function" ? template(this.prepareContext()) : template;

    }

    /**
     * Request Update
     *
     * Batch synchronous changes into one render microtask.
     * Changes made while disconnected are rendered on the next connection.
     *
     * @return Promise resolving whether the queued update rendered
     */
    public requestUpdate(): Promise<boolean> {

        // Reuse the pending update so synchronous property changes render together.
        if (this._pending) return this.updateComplete;
        this._pending = true;
        this.updateComplete = Promise.resolve().then(() => {

            // Release the queue before rendering so hooks can request a later update.
            this._pending = false;
            if (!this.isConnected) return false;
            this.update();
            return true;
        });
        return this.updateComplete;

    }

    /** Protected Methods
     ******************************************************
     */

    /**
     * Prepare Context
     *
     * Build the template data using the existing attributes/name convention.
     * Override to add component-specific context.
     *
     * @return Template context
     */
    protected prepareContext(): KmcomponentContext {

        this.initialize();
        return { attributes: { ...this._values }, name: this.localName };

    }

    /** Private Methods | Properties
     ******************************************************
     */

    /**
     * Get Component
     *
     * Access declarations on the concrete subclass rather than instance fields.
     *
     * @return Component constructor
     */
    private get component(): typeof Kmcomponent {

        return this.constructor as typeof Kmcomponent;

    }

    /**
     * Get Definition
     *
     * Resolve an own schema entry, rejecting undeclared property names.
     *
     * @param name Property name
     * @return Property definition
     */
    private definition(name: string): KmcomponentProperty {

        if (!Object.prototype.hasOwnProperty.call(this.component.properties, name)) {
            throw new TypeError(`Unknown component property: ${name}`);
        }
        return this.component.properties[name];

    }

    /**
     * Clone Default
     *
     * Copy JSON-compatible defaults recursively so instances do not share objects.
     *
     * @param value Default value to copy
     * @return Independent copy of the value
     */
    private clone(value: unknown): unknown {

        if (Array.isArray(value)) return value.map(item => this.clone(item));
        if (value !== null && typeof value === "object") {
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(value)) {
                Object.defineProperty(result, key, {
                    value: this.clone((value as Record<string, unknown>)[key]),
                    enumerable: true, configurable: true, writable: true,
                });
            }
            return result;
        }
        return value;

    }

    /**
     * Get Default Value
     *
     * Use the declared default or the empty value for the declared type.
     *
     * @param property Property definition
     * @return Fresh default value
     */
    private defaultValue(property: KmcomponentProperty): unknown {

        if (property.default !== undefined) return this.clone(property.default);
        switch (property.type) {
            case "string": return "";
            case "number": return 0;
            case "boolean": return false;
            case "array": return [];
            case "object": return {};
        }

    }

    /**
     * Validate Value
     *
     * Check the runtime type and any allowed scalar values.
     *
     * @param value Value to validate
     * @param property Property definition
     * @return Whether the value matches the schema
     */
    private valid(value: unknown, property: KmcomponentProperty): boolean {

        let matches: boolean;
        switch (property.type) {
            case "number": matches = typeof value === "number" && Number.isFinite(value); break;
            case "array": matches = Array.isArray(value); break;
            case "object": matches = Object.prototype.toString.call(value) === "[object Object]"; break;
            default: matches = typeof value === property.type;
        }
        return matches && (!property.select || (property.select as readonly unknown[]).includes(value));

    }

    /**
     * Initialize Properties
     *
     * Validate the schema and create each instance's initial values once.
     *
     * @return void
     * @throws TypeError When defaults or reflection options are inconsistent
     */
    private initialize(): void {

        if (this._initialized) return;
        for (const name of Object.keys(this.component.properties)) {
            const property = this.definition(name);
            const value = this.defaultValue(property);
            if (!this.valid(value, property)) {
                throw new TypeError(`Invalid default for component property: ${name}`);
            }
            if (property.reflect && property.attribute === false) {
                throw new TypeError(`Reflected property must have an attribute: ${name}`);
            }
            this._values[name] = value;
        }
        this._initialized = true;

    }

    /**
     * Convert Attribute
     *
     * Convert HTML strings to typed values. Invalid or removed attributes restore
     * the declared default, including explicit false and zero values.
     *
     * @param value HTML attribute value, or null when removed
     * @param property Property definition
     * @return Converted value or default
     */
    private fromAttribute(value: string | null, property: KmcomponentProperty): unknown {

        if (value === null) return this.defaultValue(property);
        let parsed: unknown = value;
        switch (property.type) {
            case "number": parsed = value.trim() === "" ? NaN : Number(value); break;
            case "boolean": {
                const normalized = value.trim().toLowerCase();
                parsed = ["", "true", "1"].includes(normalized) ? true
                    : ["false", "0"].includes(normalized) ? false : undefined;
                break;
            }
            case "array":
            case "object":
                try { parsed = JSON.parse(value); } catch { parsed = undefined; }
                break;
        }
        return this.valid(parsed, property) ? parsed : this.defaultValue(property);

    }

    /** Private Methods | Rendering
     ******************************************************
     */

    /**
     * Get Style Text
     *
     * Normalize styles while retaining css-loader's CSS-aware serialization.
     *
     * @return CSS text
     */
    private styleText(): string {

        let styles = this._styles ?? this.component.styles;
        while (typeof styles === "object" && "default" in styles) styles = styles.default;
        if (typeof styles === "function") return styles(this.prepareContext());
        if (typeof styles === "string") return styles;
        // css-loader exports a list with its own CSS-aware toString().
        if (styles.toString !== Object.prototype.toString && styles.toString !== Array.prototype.toString) {
            return styles.toString();
        }
        throw new TypeError("Component styles must be CSS text or a css-loader export.");

    }

    /**
     * Update
     *
     * Prepare the new markup before replacing the current render.
     * Retain supplied light DOM nodes and mount them into the new insertion points.
     *
     * @return void
     */
    private update(): void {

        this.initialize();

        // Evaluate both assets before disturbing the currently mounted content.
        const template = this.ownerDocument.createElement("template");
        template.innerHTML = this.render();
        const css = this.styleText();
        if (css) {
            const style = this.ownerDocument.createElement("style");
            style.textContent = css;
            template.content.prepend(style);
        }
        // Internal node moves must not be interpreted as new supplied children.
        this._observer?.disconnect();
        try {
            this.cleanup();
            if (this.renderRoot === this) {

                // Save original nodes rather than cloning their markup and losing state.
                this.collectChildren();
                for (const node of this._children) this._parking.appendChild(node);

                // A nested custom element owns its own slots.
                this._slots = Array.from(template.content.querySelectorAll("slot"))
                    .filter(slot => {
                        for (let parent = slot.parentElement; parent; parent = parent.parentElement) {
                            if (parent.localName.includes("-")) return false;
                        }
                        return true;
                    })
                    .map(element => ({ element, fallback: Array.from(element.childNodes) }));
                this._ownedRoots = new Set(template.content.childNodes);
            }

            // Native shadow slots project automatically; light DOM requires explicit moves.
            this.renderRoot.replaceChildren(template.content);
            if (this.renderRoot === this) this.projectChildren();
        } finally {
            this.observeChildren();
        }

        // Hooks see the complete render, including any supplied content.
        this.postRender();

    }

    /**
     * Cleanup
     *
     * Release resources in reverse registration order.
     * Run every disposer even if one fails, then propagate the last error.
     *
     * @return void
     */
    private cleanup(): void {

        const callbacks = this._cleanups.splice(0).reverse();
        let failure: unknown;
        let failed = false;
        for (const callback of callbacks) {
            try { callback(); } catch (error) { failed = true; failure = error; }
        }
        if (failed) throw failure;

    }

    /** Private Methods | Children
     ******************************************************
     */

    /**
     * Collect Children
     *
     * Retain supplied nodes still owned by this component and discover newly
     * appended host children. Removed nodes must not return on the next render.
     *
     * @return void
     */
    private collectChildren(): void {

        // Drop nodes removed or transferred out of this component by application code.
        this._children = this._children.filter(node => this.contains(node) || node.parentNode === this._parking);
        const added = Array.from(this.childNodes).filter(node => !this._ownedRoots.has(node));
        // Re-appending a supplied node moves it to the end, as appendChild does.
        this._children = this._children.filter(node => !added.includes(node as ChildNode));
        this._children.push(...added);

    }

    /**
     * Project Children
     *
     * Assign supplied nodes to the first matching light DOM slot.
     * Restore fallback content for empty slots and retain unmatched nodes.
     *
     * @return void
     */
    private projectChildren(): void {

        // Group nodes by the first matching named or default slot.
        const groups = new Map<HTMLSlotElement, Node[]>();
        for (const node of this._children) {
            const name = node.nodeType === 1 ? (node as Element).getAttribute("slot") ?? "" : "";
            const slot = this._slots.find(slot => slot.element.name === name);
            if (slot) {
                const group = groups.get(slot.element) ?? [];
                group.push(node);
                groups.set(slot.element, group);
            } else if (node.parentNode !== this._parking) {
                this._parking.appendChild(node);
            }
        }

        // Avoid unnecessary moves, which would reconnect nested custom elements.
        for (const slot of this._slots) {
            const children = groups.get(slot.element) ?? slot.fallback;
            if (children.length !== slot.element.childNodes.length
                || children.some((node, index) => node !== slot.element.childNodes[index])) {
                slot.element.replaceChildren(...children);
            }
        }

    }

    /**
     * Observe Children
     *
     * Watch supplied child changes only in light DOM. Native shadow slots are
     * managed by the browser. Pause observation while performing internal moves.
     *
     * @return void
     */
    private observeChildren(): void {

        if (this.renderRoot !== this || !this.isConnected) return;
        if (!this._observer) {
            const Observer = this.ownerDocument.defaultView!.MutationObserver;
            this._observer = new Observer(() => {
                this._observer!.disconnect();
                try {
                    this.collectChildren();
                    this.projectChildren();
                } finally {
                    this.observeChildren();
                }
            });
        }

        // Also watch retained nodes: a changed slot name can make them visible again.
        this._observer.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: ["slot"] });
        this._observer.observe(this._parking, { childList: true, subtree: true, attributes: true, attributeFilter: ["slot"] });

    }

    /** Methods | Callbacks
     ******************************************************
     */

    /**
     * Connected Callback
     *
     * Initialize values, resume child observation, and schedule rendering.
     *
     * @return void
     */
    public connectedCallback(): void {

        this.initialize();
        this.observeChildren();
        this.requestUpdate();

    }

    /**
     * Disconnected Callback
     *
     * Stop child observation and release resources for the current render.
     *
     * @return void
     */
    public disconnectedCallback(): void {

        this._observer?.disconnect();
        this.cleanup();

    }

    /**
     * Attribute Changed Callback
     *
     * Keep typed values current even while detached, without reflection loops.
     *
     * @param name Changed HTML attribute name
     * @param oldValue Previous attribute value
     * @param newValue New attribute value, or null when removed
     * @return void
     */
    public attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {

        if (this._reflecting || oldValue === newValue) return;
        this.initialize();
        const key = Object.keys(this.component.properties).find(key =>
            this.component.attributeName(key, this.definition(key)) === name);
        if (key === undefined) return;
        const value = this.fromAttribute(newValue, this.definition(key));
        if (!Object.is(this._values[key], value)) {
            this._values[key] = value;
            this.requestUpdate();
        }

    }

    /** Static Methods
     ******************************************************
     */

    /**
     * Observed Attributes
     *
     * Derive observed attributes from the static schema at registration time.
     * Duplicate mappings would make property updates ambiguous.
     *
     * @return Mapped HTML attribute names
     */
    public static get observedAttributes(): string[] {

        const names = Object.keys(this.properties)
            .map(name => this.attributeName(name, this.properties[name]))
            .filter((name): name is string => name !== null);
        if (new Set(names).size !== names.length) {
            throw new TypeError("Component properties must use distinct attribute names.");
        }
        return names;

    }

    /**
     * Get Attribute Name
     *
     * Resolve and validate an optional lowercase HTML attribute mapping.
     *
     * @param name Property name
     * @param property Property definition
     * @return Mapped name, or null for a property without an attribute
     */
    private static attributeName(name: string, property: KmcomponentProperty): string | null {

        if (property.attribute === false) return null;
        const attribute = typeof property.attribute === "string" ? property.attribute : name.toLowerCase();
        if (!attribute || /[\s\u0000"'>/=]/.test(attribute) || attribute !== attribute.toLowerCase()) {
            throw new TypeError(`Invalid component attribute name: ${attribute}`);
        }
        return attribute;

    }

}

/** Interface
 ******************************************************
 */

/** Shared property metadata, with allowed values restricted to scalar types. */
type PropertyOptions<T, Name extends string> = {
    /** Declared runtime value type. */
    type: Name;
    /** Initial value and fallback for removed or invalid attributes. */
    default?: T;
    /** Observed HTML attribute; defaults to the lowercase property name. */
    attribute?: boolean | string;
    /** Also write programmatic changes to the HTML attribute. Default: false. */
    reflect?: boolean;
    /** Allowed scalar values; the default must belong to this collection. */
    select?: [T] extends [string | number | boolean] ? readonly T[] : never;
};

/** Supported property definitions and their corresponding default types. */
export type KmcomponentProperty =
    | PropertyOptions<string, "string">
    | PropertyOptions<number, "number">
    | PropertyOptions<boolean, "boolean">
    | PropertyOptions<unknown[], "array">
    | PropertyOptions<Record<string, unknown>, "object">;

/** Static property schema for one component class. */
export type KmcomponentProperties = Record<string, KmcomponentProperty>;

/** Rendering configuration, fixed when an instance is constructed. */
export interface KmcomponentOptions {
    /** false: light DOM (default); true: an open shadow root. Fixed at construction. */
    shadow?: boolean;
}

/** Template data compatible with existing CrazyPHP Handlebars expressions. */
export interface KmcomponentContext<T extends object = Record<string, unknown>> {
    /** Current typed property values. */
    attributes: T;
    /** Registered custom element tag name. */
    name: string;
}

/** Compiled Handlebars function, literal HTML, or a default module wrapper. */
export type KmcomponentTemplate = string
    | ((context: KmcomponentContext) => string)
    | { default: KmcomponentTemplate };

/** Compiled CSS or loader output; style functions receive the template context. */
export type KmcomponentStyles = string
    | ((context: KmcomponentContext) => string)
    | { default: KmcomponentStyles }
    | { toString(): string };

/** Internal light DOM projection point and its reusable fallback nodes. */
interface LightSlot {
    /** Slot belonging to this component's generated template. */
    element: HTMLSlotElement;
    /** Original slot children used when no supplied nodes match. */
    fallback: Node[];
}
