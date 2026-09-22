import { BaseOptions, Component, InitElements, MElement } from "../../src/component";
import CrazyButton from "../extensions/web/crazy-button";
import { loadPeer } from "../../src/peer-loader";
import type * as Prism from "prismjs";

/** Display source code with optional syntax highlighting and clipboard controls. */
export interface CodeCardOptions extends BaseOptions {
    code:string;
    language:string;
    title:string;
    copy:boolean;
    highlight:boolean;
    copyLabel:string;
    copiedLabel:string;
    errorLabel:string;
}

const _defaults:CodeCardOptions = {
    code: "",
    language: "plain",
    title: "",
    copy: true,
    highlight: true,
    copyLabel: "Copy code",
    copiedLabel: "Copied!",
    errorLabel: "Unable to copy",
};

/** A themed code card. Source text is never executed or interpreted as markup. */
export class CodeCard extends Component<CodeCardOptions> {

    public ready:Promise<void>;
    private _prism?:typeof Prism;
    private _originalNodes:Node[];
    private _addedClasses:string[];
    private _code:HTMLElement;
    private _pre:HTMLPreElement;
    private _button:CrazyButton;
    private _status:HTMLElement;
    private _timer:ReturnType<typeof setTimeout>;
    private _copying:boolean = false;
    private _destroyed:boolean = false;
    private _revision:number = 0;

    public constructor(el:HTMLElement, options:Partial<CodeCardOptions> = {}){
        super(el, options, CodeCard);
        const source = el.querySelector("pre > code, code");
        const language = Array.from(source?.classList || []).find(name => name.startsWith("language-"))?.slice(9);
        this.options = {
            ...CodeCard.defaults,
            code: source?.textContent || "",
            language: el.dataset.codeLanguage || language || "plain",
            title: el.dataset.codeTitle || "",
            copy: el.dataset.codeCopy !== "false",
            highlight: el.dataset.codeHighlight !== "false",
            ...options,
        };
        this._originalNodes = Array.from(el.childNodes);
        this._addedClasses = ["card", "code-card"].filter(name => !el.classList.contains(name));
        el.classList.add(...this._addedClasses);
        el["M_CodeCard"] = this;
        this._createElements();
        this._render();
        this.ready = this.update({});
    }

    public static get defaults():CodeCardOptions { return _defaults; }
    public static init(el:HTMLElement, options?:Partial<CodeCardOptions>):CodeCard;
    public static init(els:InitElements<MElement>, options?:Partial<CodeCardOptions>):CodeCard[];
    public static init(els:HTMLElement|InitElements<MElement>, options:Partial<CodeCardOptions> = {}):CodeCard|CodeCard[] {
        return super.init(els, options, CodeCard);
    }
    public static getInstance(el:HTMLElement):CodeCard { return el["M_CodeCard"]; }

    /** Update content, language, title, or the optional copy control. */
    public async update(options:Partial<CodeCardOptions>):Promise<void> {
        if(this._destroyed) return;
        this.options = { ...this.options, ...options };
        this._revision++;
        clearTimeout(this._timer);
        this._setCopyFeedback("content_copy");
        this._render();
        if(this.options.highlight && !this._prism){
            this._prism = await loadPeer<typeof Prism>({
                specifier: "prismjs",
                globalName: "Prism",
                feature: "CodeCard syntax highlighting",
                cdnHint: '<script src="path/to/prism.js" data-manual></script> (include the language grammars you use)',
            }, async() => {
                const scope = window as Window & { Prism?:typeof Prism|{ manual:boolean } };
                const created = !scope.Prism;
                if(created) scope.Prism = { manual: true };
                try { return await import("prismjs"); }
                catch(error){ if(created) delete scope.Prism; throw error; }
            });
        }
        if(!this._destroyed) this._render();
    }

    public getCode():string { return this.options.code; }

    /** Copy the original source, preserving whitespace and excluding UI labels. */
    public async copy():Promise<boolean> {
        if(this._destroyed || this._copying || !this.options.copy) return false;
        const revision = this._revision;
        const restoreFocus = this._button.contains(document.activeElement);
        this._copying = true;
        this._button.setProperty("disabled", true);
        clearTimeout(this._timer);
        this._setCopyFeedback("content_copy");
        let success = false;
        try {
            await navigator.clipboard.writeText(this.options.code);
            success = true;
        }catch{
            // Leave the source available for manual selection when clipboard access fails.
        }finally{
            this._copying = false;
        }
        if(this._destroyed) return success;
        this._button.setProperty("disabled", false);
        if(revision === this._revision){
            this._setCopyFeedback(success ? "check" : "error_outline", success ? this.options.copiedLabel : this.options.errorLabel);
            this._timer = setTimeout(() => this._setCopyFeedback("content_copy"), 2000);
        }
        await this._button.updateComplete;
        if(this._destroyed) return success;
        if(restoreFocus && document.activeElement === document.body && this.options.copy && this._button.isConnected)
            this._button.querySelector("button")?.focus({ preventScroll: true });
        this.el.dispatchEvent(new CustomEvent("codecopy", { bubbles: true, detail: { success } }));
        return success;
    }

    /** Restore the authored markup and remove component-owned listeners. */
    public destroy():void {
        if(this._destroyed) return;
        this._destroyed = true;
        clearTimeout(this._timer);
        this._button.removeEventListener("buttonaction", this._onCopy);
        this.el.replaceChildren(...this._originalNodes);
        this.el.classList.remove(...this._addedClasses);
        delete this.el["M_CodeCard"];
    }

    private _onCopy = ():void => { void this.copy(); };

    private _createElements():void {
        this._status = document.createElement("span");
        this._status.className = "code-card-status";
        this._status.setAttribute("role", "status");
        this._button = new CrazyButton();
        this._button.className = "code-card-copy";
        this._button.setAttribute("type", "icon");
        this._button.setAttribute("variant", "standard");
        this._button.setAttribute("size", "xs");
        this._button.addEventListener("buttonaction", this._onCopy);
        this._pre = document.createElement("pre");
        this._pre.className = "code-card-body";
        this._pre.tabIndex = 0;
        this._code = document.createElement("code");
        this._pre.append(this._code);
        this.el.replaceChildren(this._status, this._button, this._pre);
    }

    private _setCopyFeedback(icon:string, message:string = ""):void {
        this._status.textContent = message;
        this._button.setAttribute("icon-text", icon);
        this._button.setAttribute("aria-label", message || this.options.copyLabel);
        this._button.title = message || this.options.copyLabel;
    }

    private _render():void {
        const requested = this.options.language.trim().toLowerCase();
        const aliases = { html: "markup", xml: "markup", js: "javascript", ts: "typescript", shell: "bash", text: "plain", plaintext: "plain" };
        const language = /^[a-z0-9-]+$/.test(requested) ? aliases[requested] || requested : "plain";
        const labels = { markup: "HTML", css: "CSS", javascript: "JavaScript", typescript: "TypeScript", php: "PHP", json: "JSON", yaml: "YAML", bash: "Shell", python: "Python", handlebars: "Handlebars", plain: "Plain text" };
        this._pre.setAttribute("aria-label", this.options.title || (labels[language] || requested.toUpperCase()) + " code");
        this._button.hidden = !this.options.copy;
        this._code.className = "language-" + language;
        let grammar = this._prism?.languages[language];
        if(grammar && (language === "javascript" || language === "typescript")){
            // Match the documentation's class and browser-global colors without changing shared grammars.
            const classes = grammar["class-name"];
            grammar = {
                ...grammar,
                "class-name": [
                    ...(Array.isArray(classes) ? classes : classes ? [classes] : []),
                    { pattern: /\b[A-Z][\w$]*(?=\s*\.)/ },
                ],
                "builtin-variable": /\b(?:document|window|console|navigator|globalThis)\b/,
            };
        }
        if(this.options.highlight && grammar)
            this._code.innerHTML = this._prism.highlight(this.options.code, grammar, language);
        else
            this._code.textContent = this.options.code;
    }
}
