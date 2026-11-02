/** Editable source text with a Prism presentation layer and native selection. */
import { bindEditorToolbar, type EditorToolbar } from "../editor-common/toolbar";
import { Component, type InitElements, type MElement } from "../../src/component";
import { EditorHistory } from "../editor-common/history";
import { loadPeer } from "../../src/peer-loader";
import type * as Prism from "prismjs";

export interface ScriptEditorOptions {
    value:string;
    language:string;
    label:string;
    readOnly:boolean;
    tabSize:number;
    lineNumbers:boolean;
    onChange:((value:string) => void)|null;
}

export interface ScriptEditorSelection { start:number; end:number; }
interface ScriptSnapshot extends ScriptEditorSelection { value:string; }

/** Code editor. Source is highlighted as text and is never executed. */
export class ScriptEditor extends Component<ScriptEditorOptions> {
    public ready:Promise<void>;
    public readonly textarea:HTMLTextAreaElement;
    private _pre:HTMLPreElement;
    private _code:HTMLElement;
    private _gutter:HTMLPreElement;
    private _status:HTMLElement;
    private _prism?:typeof Prism;
    private _history:EditorHistory<ScriptSnapshot>;
    private _originalNodes:Node[];
    private _addedClass:boolean;
    private _controller = new AbortController();
    private _disconnect:(() => void)|null = null;
    private _destroyed:boolean = false;
    private _composing:boolean = false;

    public constructor(el:HTMLElement, options:Partial<ScriptEditorOptions> = {}){
        // Initialize component ownership.
        super(el, options, ScriptEditor);
        // Resolve authored source and explicit options.
        this.options = {...ScriptEditor.defaults, value:el.querySelector("textarea, code")?.textContent || "", language:el.dataset.language || "javascript", ...options};
        // Clamp indentation to a usable width.
        this.options.tabSize = Math.max(1, Math.min(8, Math.trunc(this.options.tabSize) || 4));
        // Preserve authored content.
        this._originalNodes = Array.from(el.childNodes);
        // Track the component-owned class.
        this._addedClass = !el.classList.contains("script-editor");
        // Apply the component root.
        el.classList.add("script-editor");
        // Register the instance.
        el["M_ScriptEditor"] = this;
        // Create line numbers.
        this._gutter = document.createElement("pre");
        // Mark decorative line numbers.
        this._gutter.setAttribute("aria-hidden", "true");
        // Style the gutter.
        this._gutter.className = "script-editor-gutter";
        // Create the editing viewport.
        const viewport = document.createElement("div");
        // Style the viewport.
        viewport.className = "script-editor-viewport";
        // Create the highlighting layer.
        this._pre = document.createElement("pre");
        // Hide decorative highlighting from assistive technology.
        this._pre.setAttribute("aria-hidden", "true");
        // Style the highlighting layer.
        this._pre.className = "script-editor-highlight";
        // Create the highlighted source container.
        this._code = document.createElement("code");
        // Attach the source container.
        this._pre.append(this._code);
        // Create the native editing control.
        this.textarea = document.createElement("textarea");
        // Style the editing control.
        this.textarea.className = "script-editor-input";
        // Name the editor accessibly.
        this.textarea.setAttribute("aria-label", this.options.label);
        // Explain keyboard escape from indentation mode.
        this.textarea.title = "Tab indents. Press Escape, then Tab to leave the editor.";
        // Keep long source lines horizontally scrollable.
        this.textarea.wrap = "off";
        // Disable prose correction for source code.
        this.textarea.spellcheck = false;
        // Disable autocapitalization.
        this.textarea.setAttribute("autocapitalize", "off");
        // Load the initial source.
        this.textarea.value = this.options.value.replace(/\r\n?/g, "\n");
        // Apply read-only mode.
        this.textarea.readOnly = this.options.readOnly;
        // Layer native editing over the decorative source.
        viewport.append(this._pre, this.textarea);
        // Create a visible cursor/language readout.
        this._status = document.createElement("div");
        // Style the readout without announcing every keystroke.
        this._status.className = "script-editor-status";
        // Install the editor structure.
        el.replaceChildren(this._gutter, viewport, this._status);
        // Initialize undo history.
        this._history = new EditorHistory(this._snapshot());
        // Subscribe to text edits.
        this.textarea.addEventListener("input", this._onInput, {signal:this._controller.signal});
        // Subscribe to keyboard commands.
        this.textarea.addEventListener("keydown", this._onKeydown, {signal:this._controller.signal});
        // Synchronize scrolling without rerendering source.
        this.textarea.addEventListener("scroll", this._syncScroll, {signal:this._controller.signal});
        // Update cursor state after selection changes.
        this.textarea.addEventListener("select", this._onSelection, {signal:this._controller.signal});
        // Update cursor state after pointer interactions.
        this.textarea.addEventListener("click", this._onSelection, {signal:this._controller.signal});
        // Update cursor state after arrow keys.
        this.textarea.addEventListener("keyup", this._onSelection, {signal:this._controller.signal});
        // Preserve IME composition as one history operation.
        this.textarea.addEventListener("compositionstart", this._onCompositionStart, {signal:this._controller.signal});
        // Commit the completed composition.
        this.textarea.addEventListener("compositionend", this._onCompositionEnd, {signal:this._controller.signal});
        // Route native undo requests through the same history.
        this.textarea.addEventListener("beforeinput", this._onBeforeInput, {signal:this._controller.signal});
        // Render readable plain text immediately.
        this._render();
        // Load Prism only when an editor is created.
        this.ready = this._loadPrism();
    }

    public static get defaults():ScriptEditorOptions {
        // Prepare result.
        const result:ScriptEditorOptions = {value:"", language:"javascript", label:"Script editor", readOnly:false, tabSize:4, lineNumbers:true, onChange:null};
        // Return result.
        return result;
    }

    public static init(el:HTMLElement, options?:Partial<ScriptEditorOptions>):ScriptEditor;
    public static init(els:InitElements<MElement>, options?:Partial<ScriptEditorOptions>):ScriptEditor[];
    public static init(els:HTMLElement|InitElements<MElement>, options:Partial<ScriptEditorOptions> = {}):ScriptEditor|ScriptEditor[] {
        // Prepare result.
        const result = super.init(els, options, ScriptEditor);
        // Return result.
        return result;
    }

    public static getInstance(el:HTMLElement):ScriptEditor {
        // Prepare result.
        const result = el["M_ScriptEditor"];
        // Return result.
        return result;
    }

    public getValue():string {
        // Prepare result.
        const result = this.textarea.value;
        // Return result.
        return result;
    }

    /** Programmatic loads remain available in read-only mode and are undoable. */
    public setValue(value:string):void {
        // Update a live editor only.
        if(!this._destroyed){
            // Preserve the pre-edit selection for undo.
            this._history.replaceCurrent(this._snapshot());
            // Normalize platform line endings.
            this.textarea.value = String(value).replace(/\r\n?/g, "\n");
            // Record the replacement.
            this._commit();
        }
    }

    public getSelection():ScriptEditorSelection {
        // Prepare result.
        const result = {start:this.textarea.selectionStart, end:this.textarea.selectionEnd};
        // Return result.
        return result;
    }

    public setSelection(start:number, end:number = start):void {
        // Update a live control only.
        if(!this._destroyed){
            // Focus without moving the page.
            this.textarea.focus({preventScroll:true});
            // Apply native clamping and selection behavior.
            this.textarea.setSelectionRange(start, end);
            // Update cursor state.
            this._onSelection();
        }
    }

    public replaceSelection(text:string):void {
        // Respect read-only mode.
        if(!this._destroyed && !this.options.readOnly){
            // Preserve the pre-edit selection for undo.
            this._history.replaceCurrent(this._snapshot());
            // Replace the native selection.
            this.textarea.setRangeText(text, this.textarea.selectionStart, this.textarea.selectionEnd, "end");
            // Record the change.
            this._commit();
            // Return focus to the source.
            this.focus();
        }
    }

    /** Indent or outdent all selected lines, preserving their selection. */
    public indent(outdent:boolean = false):void {
        // Respect read-only mode.
        if(!this._destroyed && !this.options.readOnly){
            // Preserve the pre-edit selection for undo.
            this._history.replaceCurrent(this._snapshot());
            // Read the current selection.
            const {start, end} = this.getSelection();
            // Find the first selected line.
            const from = this.getValue().slice(0, start).lastIndexOf("\n") + 1;
            // Exclude a following line selected only at column zero.
            const to = end > start && this.getValue()[end - 1] === "\n" ? end - 1 : end;
            // Build transformed lines.
            const lines = this.getValue().slice(from, to).split("\n");
            // Prepare indentation text.
            const pad = " ".repeat(this.options.tabSize);
            // Track the first-line selection offset.
            let firstDelta = 0;
            // Transform each line independently.
            const replacement = lines.map((line, index) => {
                // Prepare result.
                let result = pad + line;
                // Remove one indentation level when requested.
                if(outdent)
                    // Accept either a tab or up to tabSize spaces.
                    result = line.replace(new RegExp(`^(\\t| {1,${this.options.tabSize}})`), "");
                // Track the caret's first-line displacement.
                if(index === 0)
                    // Save the signed character difference.
                    firstDelta = result.length - line.length;
                // Return result.
                return result;
            }).join("\n");
            // Apply the transformed text.
            this.textarea.setRangeText(replacement, from, to, "preserve");
            // Preserve the user's selection within transformed lines.
            this.textarea.setSelectionRange(Math.max(from, start + firstDelta), Math.max(from, end + replacement.length - (to - from)));
            // Record the change.
            this._commit();
            // Restore editing focus.
            this.focus();
        }
    }

    public undo():void {
        // Respect editor lifecycle and read-only mode.
        if(!this._destroyed && !this.options.readOnly)
            // Restore the preceding snapshot.
            this._restore(this._history.undo());
    }

    public redo():void {
        // Respect editor lifecycle and read-only mode.
        if(!this._destroyed && !this.options.readOnly)
            // Restore the following snapshot.
            this._restore(this._history.redo());
    }

    /** Additional grammars must be loaded by the application before this call. */
    public setLanguage(language:string):void {
        // Update a live editor only.
        if(!this._destroyed){
            // Store the requested grammar identifier.
            this.options.language = language.toLowerCase();
            // Highlight with the current grammar or readable plain text.
            this._render();
        }
    }

    public setReadOnly(value:boolean):void {
        // Update a live editor only.
        if(!this._destroyed){
            // Store interaction mode.
            this.options.readOnly = value;
            // Apply native read-only behavior.
            this.textarea.readOnly = value;
            // Refresh command state.
            this._onSelection();
        }
    }

    public focus():void {
        // Focus a live control only.
        if(!this._destroyed)
            // Preserve the page's scroll position.
            this.textarea.focus({preventScroll:true});
    }

    public canExecute(command:string):boolean {
        // Prepare result.
        const result = !this._destroyed && !this.options.readOnly &&
            ({undo:this._history.canUndo, redo:this._history.canRedo, indent:true, outdent:true}[command] ?? false);
        // Return result.
        return result;
    }

    public execute(command:string):void {
        // Define the public toolbar command set.
        const commands = {undo:() => this.undo(), redo:() => this.redo(), indent:() => this.indent(), outdent:() => this.indent(true)};
        // Execute supported commands only.
        if(this.canExecute(command))
            // Invoke the selected method.
            commands[command]();
    }

    public connectToolbar(toolbar:EditorToolbar):() => void {
        // Prepare result.
        let result = ():void => {};
        // Bind a live editor only.
        if(!this._destroyed){
            // Disconnect any previous toolbar.
            this._disconnect?.();
            // Bind commands and history availability.
            result = bindEditorToolbar(this.el, toolbar, command => this.execute(command), command => this.canExecute(command));
            // Retain cleanup for destruction.
            this._disconnect = result;
        }
        // Return result.
        return result;
    }

    public destroy():void {
        // Restore the authored element once.
        if(!this._destroyed){
            // Prevent pending asynchronous rendering.
            this._destroyed = true;
            // Remove all control listeners.
            this._controller.abort();
            // Release external toolbar listeners.
            this._disconnect?.();
            // Restore authored nodes.
            this.el.replaceChildren(...this._originalNodes);
            // Remove the component-owned class.
            if(this._addedClass)
                // Preserve classes supplied by the application.
                this.el.classList.remove("script-editor");
            // Remove temporary composition state.
            this.el.classList.remove("is-composing");
            // Release the instance reference.
            delete this.el["M_ScriptEditor"];
        }
    }

    private async _loadPrism():Promise<void> {
        // Load the optional peer using the shared framework loader.
        this._prism = await loadPeer<typeof Prism>({specifier:"prismjs", globalName:"Prism", feature:"ScriptEditor", cdnHint:'<script src="prism.js" data-manual></script>'}, async() => {
            // Prepare the manual-highlighting global before Prism loads.
            const scope = window as Window & {Prism?:typeof Prism|{manual:boolean}};
            // Prepare result.
            let result:typeof import("prismjs");
            // Track ownership of the loader configuration.
            const created = !scope.Prism;
            // Disable Prism's whole-document automatic scan.
            if(created)
                // Create only the loader configuration.
                scope.Prism = {manual:true};
            // Remove an unfulfilled configuration before the global fallback.
            try {
                // Import the installed optional peer.
                result = await import("prismjs");
            }catch(error){
                // Remove only the configuration created by this loader.
                if(created)
                    // Prevent a configuration object from masquerading as Prism.
                    delete scope.Prism;
                // Let the shared loader report the missing dependency.
                throw error;
            }
            // Return result.
            return result;
        });
        // Avoid rendering into a destroyed or reinitialized host.
        if(!this._destroyed)
            // Apply the now-available highlighting.
            this._render();
    }

    private _snapshot():ScriptSnapshot {
        // Prepare result.
        const result = {value:this.getValue(), ...this.getSelection()};
        // Return result.
        return result;
    }

    private _commit():void {
        // Record a new undo step.
        this._history.commit(this._snapshot());
        // Redraw the decorative source.
        this._render();
        // Announce the changed value.
        this._emitChange();
    }

    private _restore(snapshot:ScriptSnapshot|undefined):void {
        // Apply available history only.
        if(snapshot){
            // Restore source text.
            this.textarea.value = snapshot.value;
            // Restore the associated selection.
            this.setSelection(snapshot.start, snapshot.end);
            // Refresh highlighting and command state.
            this._render();
            // Notify consumers without creating another history entry.
            this._emitChange();
        }
    }

    private _emitChange():void {
        // Keep options aligned with the current document.
        this.options.value = this.getValue();
        // Dispatch the public change event.
        this.el.dispatchEvent(new CustomEvent("scriptchange", {bubbles:true, detail:{value:this.getValue(), language:this.options.language}}));
        // Notify the optional callback.
        this.options.onChange?.(this.getValue());
    }

    private _render():void {
        // Normalize common grammar aliases.
        const aliases = {js:"javascript", html:"markup", xml:"markup", ts:"typescript", text:"plain"};
        // Resolve the requested grammar.
        const language = aliases[this.options.language] || this.options.language;
        // Read a loaded Prism grammar.
        const grammar = this._prism?.languages?.[language];
        // Preserve the final empty line in the decorative layer.
        const value = this.getValue() + "\n";
        // Use Prism's escaped output only for known grammars.
        if(grammar)
            // Render highlighted source without evaluating it.
            this._code.innerHTML = this._prism.highlight(value, grammar, language);
        else
            // Keep unsupported languages safely readable.
            this._code.textContent = value;
        // Render matching line numbers.
        this._gutter.textContent = this.getValue().split("\n").map((_, index) => String(index + 1)).join("\n");
        // Apply optional gutter visibility.
        this._gutter.hidden = !this.options.lineNumbers;
        // Match tab widths in both rendering layers.
        this.textarea.style.tabSize = String(this.options.tabSize);
        // Match highlighted tab width.
        this._pre.style.tabSize = String(this.options.tabSize);
        // Synchronize scrolling after source size changes.
        this._syncScroll();
        // Update cursor and toolbar state.
        this._onSelection();
    }

    private _onSelection = ():void => {
        // Read text before the caret.
        const before = this.getValue().slice(0, this.textarea.selectionStart).split("\n");
        // Show the current language and cursor location.
        this._status.textContent = `${this.options.language} · Ln ${before.length}, Col ${before[before.length - 1].length + 1}${this.options.readOnly ? " · Read only" : ""}`;
        // Refresh connected toolbar controls.
        this.el.dispatchEvent(new CustomEvent("editorstatechange"));
    };

    private _syncScroll = ():void => {
        // Align the highlighted vertical viewport.
        this._pre.scrollTop = this.textarea.scrollTop;
        // Align the highlighted horizontal viewport.
        this._pre.scrollLeft = this.textarea.scrollLeft;
        // Align the line-number viewport.
        this._gutter.scrollTop = this.textarea.scrollTop;
    };

    private _onInput = ():void => {
        // Commit completed input only.
        if(!this._composing)
            // Store the new source.
            this._commit();
    };

    private _onCompositionStart = ():void => {
        // Defer history until the composition finishes.
        this._composing = true;
        // Show native composition text.
        this.el.classList.add("is-composing");
    };

    private _onCompositionEnd = ():void => {
        // Resume normal history recording.
        this._composing = false;
        // Restore syntax highlighting.
        this.el.classList.remove("is-composing");
        // Record the composed text.
        this._commit();
    };

    private _onBeforeInput = (event:InputEvent):void => {
        // Route browser undo gestures through component history.
        if(event.inputType === "historyUndo" || event.inputType === "historyRedo"){
            // Prevent divergent native history.
            event.preventDefault();
            // Execute the corresponding public method.
            this.execute(event.inputType === "historyUndo" ? "undo" : "redo");
        }else if(!this._composing){
            // Preserve the native selection before ordinary edits.
            this._history.replaceCurrent(this._snapshot());
        }
    };

    private _escapeTab:boolean = false;

    private _onKeydown = (event:KeyboardEvent):void => {
        // Leave IME candidate selection untouched.
        if(!event.isComposing && !this._composing){
            // Allow the next Tab to leave the editor.
            if(event.key === "Escape")
                // Arm the keyboard escape path.
                this._escapeTab = true;
            else if(event.key === "Tab" && this._escapeTab)
                // Restore indentation for later keypresses.
                this._escapeTab = false;
            else if(!this.options.readOnly){
                // Handle platform undo and redo shortcuts.
                if((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())){
                    // Prevent the textarea's independent history.
                    event.preventDefault();
                    // Execute the requested history operation.
                    this.execute(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
                }else if(event.key === "Tab"){
                    // Use Tab for code indentation.
                    event.preventDefault();
                    // Indent or outdent the current lines.
                    this.indent(event.shiftKey);
                }else if(event.key === "Enter"){
                    // Preserve leading whitespace on a new line.
                    event.preventDefault();
                    // Read the line prefix before the selection.
                    const prefix = this.getValue().slice(0, this.textarea.selectionStart).split("\n").pop() || "";
                    // Insert a new line with matching indentation.
                    this.replaceSelection("\n" + (prefix.match(/^[\t ]*/) || [""])[0]);
                }
            }
        }
    };
}
