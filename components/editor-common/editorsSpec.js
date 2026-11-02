/* global M, describe, it, expect, beforeEach, afterEach */
/** Regression coverage for editor state, command bindings, and lifecycle. */
describe("Writing and storyboard components", () => {
    // Keep each test isolated from the runner page.
    let host;
    // Track the current component for teardown.
    let instance;
    // Track an external toolbar host.
    let toolbar;

    // Create a fresh authored host.
    beforeEach(() => {
        // Create the component container.
        host = document.createElement("div");
        // Add authored content to test restoration.
        host.textContent = "Original host";
        // Attach it for native focus and layout behavior.
        document.body.append(host);
        // Create external command controls.
        toolbar = document.createElement("div");
        // Supply native command buttons.
        toolbar.innerHTML = '<button data-editor-command="undo">Undo</button><button data-editor-command="redo">Redo</button><button data-editor-command="insert" data-editor-value="dialogue">Add dialogue</button>';
        // Attach controls outside the editor host.
        document.body.append(toolbar);
    });

    // Release listeners and DOM after every assertion.
    afterEach(() => {
        // Destroy the active component.
        instance?.destroy();
        // Clear the instance reference.
        instance = null;
        // Remove the test host.
        host.remove();
        // Remove the external controls.
        toolbar.remove();
    });

    // Verify formatting, order, and serialization share document history.
    it("round-trips screenplay structure and restores edits", () => {
        // Create a screenplay with the default writable block.
        instance = M.ScreenplayEditor.init(host);
        // Insert a character block.
        const id = instance.insertBlock("character", "MAYA");
        // Insert its dialogue.
        const dialogue = instance.insertBlock("dialogue", "Before the light.");
        // Move the dialogue to the start.
        instance.moveBlock(dialogue, 0);
        // Check ordered data.
        expect(instance.getDocument().blocks[0].id).toBe(dialogue);
        // Restore the original order.
        instance.undo();
        // Check the preceding character.
        expect(instance.getDocument().blocks[1].id).toBe(id);
        // Redo the move.
        instance.redo();
        // Capture a complete serialization.
        const saved = instance.toJSON();
        // Remove a block.
        instance.removeBlock(id);
        // Reload the saved document.
        instance.fromJSON(saved);
        // Check semantic round-trip equality.
        expect(instance.toJSON()).toBe(saved);
    });

    // Verify Enter splits a selection without losing its suffix.
    it("splits screenplay blocks and continues character into dialogue", () => {
        // Create a single character block.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Scene", blocks:[{id:"a", type:"character", text:"MAYA speaks"}]}});
        // Select a split point.
        instance.focus("a", 4, 5);
        // Trigger the editor's actual keyboard path.
        host.querySelector("textarea").dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true, cancelable:true}));
        // Read the resulting structure.
        const blocks = instance.getDocument().blocks;
        // Check prefix preservation.
        expect(blocks[0].text).toBe("MAYA");
        // Check the natural next semantic role.
        expect(blocks[1].type).toBe("dialogue");
        // Check suffix preservation.
        expect(blocks[1].text).toBe("speaks");
        // Undo the entire split as one transaction.
        instance.undo();
        // Check the original block text.
        expect(instance.getDocument().blocks[0].text).toBe("MAYA speaks");
    });

    // Verify block type commands survive toolbar focus changes.
    it("connects screenplay toolbar commands and disables unavailable history", () => {
        // Create an empty screenplay.
        instance = M.ScreenplayEditor.init(host);
        // Connect an external toolbar element.
        const disconnect = instance.connectToolbar(toolbar);
        // Confirm history starts disabled.
        expect(toolbar.querySelector('[data-editor-command="undo"]').disabled).toBeTrue();
        // Execute a real delegated click.
        toolbar.querySelector('[data-editor-command="insert"]').click();
        // Check the inserted semantic role.
        expect(instance.getActiveBlock().type).toBe("dialogue");
        // Confirm history is now available.
        expect(toolbar.querySelector('[data-editor-command="undo"]').disabled).toBeFalse();
        // Disconnect the controls.
        disconnect();
        // Click a formerly connected command.
        toolbar.querySelector('[data-editor-command="insert"]').click();
        // Check no second block was inserted.
        expect(instance.getDocument().blocks.length).toBe(2);
    });

    // Verify document validation is atomic and getters are detached.
    it("rejects malformed screenplay imports and protects internal data", () => {
        // Create a document.
        instance = M.ScreenplayEditor.init(host);
        // Capture the original data.
        const saved = instance.toJSON();
        // Reject an unknown block role.
        expect(() => instance.fromJSON('{"title":"Broken","blocks":[{"type":"unknown","text":"x"}]}')).toThrow();
        // Check the document remains intact.
        expect(instance.toJSON()).toBe(saved);
        // Read a detached copy.
        const copy = instance.getDocument();
        // Mutate the external copy.
        copy.blocks[0].text = "Outside mutation";
        // Check internal data remains unchanged.
        expect(instance.toJSON()).toBe(saved);
        // Make the document read-only.
        instance.setReadOnly(true);
        // Attempt a user mutation.
        instance.insertBlock("action", "Blocked");
        // Check read-only behavior.
        expect(instance.toJSON()).toBe(saved);
    });

    // Verify code editing, line selection, and history work together.
    it("indents selected source lines without indenting the following line", async() => {
        // Create source with a selected whole-line range.
        instance = M.ScriptEditor.init(host, {value:"one\ntwo\nthree", tabSize:2});
        // Allow plain-text fallback in a runner without the optional peer.
        await instance.ready.catch(() => undefined);
        // Select the first two lines including their trailing newline.
        instance.setSelection(0, 8);
        // Indent selected lines.
        instance.indent();
        // Check the following line is untouched.
        expect(instance.getValue()).toBe("  one\n  two\nthree");
        // Undo indentation.
        instance.undo();
        // Check original text.
        expect(instance.getValue()).toBe("one\ntwo\nthree");
        // Redo indentation.
        instance.redo();
        // Outdent the restored selection.
        instance.indent(true);
        // Check whitespace round-trip.
        expect(instance.getValue()).toBe("one\ntwo\nthree");
    });

    // Verify a first empty line does not shift indentation into the next line.
    it("indents an empty first line and preserves source as text", async() => {
        // Create an empty first line.
        instance = M.ScriptEditor.init(host, {value:"\n<img src=x onerror=alert(1)>", language:"plain"});
        // Wait for optional syntax setup.
        await instance.ready.catch(() => undefined);
        // Place the caret at the beginning.
        instance.setSelection(0);
        // Indent the empty line.
        instance.indent();
        // Check only the first line changed.
        expect(instance.getValue().startsWith("    \n")).toBeTrue();
        // Check source markup was never interpreted.
        expect(host.querySelector("img")).toBeNull();
        // Enable read-only mode.
        instance.setReadOnly(true);
        // Attempt to overwrite the selection.
        instance.replaceSelection("blocked");
        // Check source remains intact.
        expect(instance.getValue()).not.toContain("blocked");
    });

    // Verify syntax changes do not replace source and destroy restores markup.
    it("keeps source during language changes and safely reinitializes", async() => {
        // Initialize a script editor.
        instance = M.ScriptEditor.init(host, {value:"const count = 1;"});
        // Wait for optional highlighting.
        await instance.ready.catch(() => undefined);
        // Change to an unavailable grammar.
        instance.setLanguage("missing-language");
        // Check the source remains exact.
        expect(instance.getValue()).toBe("const count = 1;");
        // Reinitialize the same host through the component lifecycle.
        instance = M.ScriptEditor.init(host, {value:"replacement"});
        // Wait for the replacement instance.
        await instance.ready.catch(() => undefined);
        // Verify there is only one editing surface.
        expect(host.querySelectorAll("textarea").length).toBe(1);
        // Restore authored markup.
        instance.destroy();
        // Check exact host restoration.
        expect(host.textContent).toBe("Original host");
    });

    // Verify selection-preserving card mutations and timing totals.
    it("duplicates, reorders, and restores storyboard shots", () => {
        // Create an empty storyboard.
        instance = M.Storyboard.init(host);
        // Add a shot with timing metadata.
        const first = instance.addShot({title:"Wide", duration:5});
        // Duplicate the selected shot.
        const copy = instance.duplicateShot();
        // Ensure duplicate IDs are distinct.
        expect(copy).not.toBe(first);
        // Check timing is copied.
        expect(instance.getTotalDuration()).toBe(10);
        // Move the duplicate to the start.
        instance.moveShot(copy, 0);
        // Check ordered data.
        expect(instance.getShots()[0].id).toBe(copy);
        // Remove the duplicate.
        instance.removeShot(copy);
        // Check timing after removal.
        expect(instance.getTotalDuration()).toBe(5);
        // Undo deletion.
        instance.undo();
        // Check the duplicate is restored in place.
        expect(instance.getShots()[0].id).toBe(copy);
        // Check versioned JSON round-trip.
        const saved = instance.toJSON();
        // Reload the saved document.
        instance.fromJSON(saved);
        // Check exact serialization.
        expect(instance.toJSON()).toBe(saved);
    });

    // Verify invalid frames and documents cannot corrupt the existing board.
    it("validates storyboard imports and image URLs atomically", () => {
        // Create a board with one valid shot.
        instance = M.Storyboard.init(host);
        // Add a supported frame reference.
        const id = instance.addShot({title:"Frame", image:"/frame.png"});
        // Capture existing state.
        const saved = instance.toJSON();
        // Reject executable URL schemes.
        expect(() => instance.updateShot(id, {image:"javascript:alert(1)"})).toThrow();
        // Reject negative durations.
        expect(() => instance.updateShot(id, {duration:-1})).toThrow();
        // Reject unsupported document versions.
        expect(() => instance.fromJSON('{"version":2,"shots":[]}')).toThrow();
        // Check the board was not partially modified.
        expect(instance.toJSON()).toBe(saved);
        // Check getters do not expose mutable internal references.
        const copy = instance.getShots();
        // Modify the caller's detached copy.
        copy[0].title = "Outside mutation";
        // Check internal data remains intact.
        expect(instance.toJSON()).toBe(saved);
    });

    // Verify destructive actions honor read-only mode and empty boards recover.
    it("protects read-only storyboards and supports deleting the final shot", () => {
        // Create a board with one shot.
        instance = M.Storyboard.init(host);
        // Add the only shot.
        const id = instance.addShot({title:"Only shot"});
        // Disable user edits.
        instance.setReadOnly(true);
        // Attempt to remove the shot.
        instance.removeShot(id);
        // Check read-only protection.
        expect(instance.getShots().length).toBe(1);
        // Restore editing.
        instance.setReadOnly(false);
        // Remove the final shot.
        instance.removeShot(id);
        // Check the empty board state.
        expect(instance.getSelectedShot()).toBeNull();
        // Restore the deleted shot.
        instance.undo();
        // Check restored selection.
        expect(instance.getSelectedShot().id).toBe(id);
    });

    // Verify source undo restores the selection used by an API edit.
    it("restores the selected source range when undoing replacement", async() => {
        // Initialize source text.
        instance = M.ScriptEditor.init(host, {value:"abcdef"});
        // Wait for optional highlighting setup.
        await instance.ready.catch(() => undefined);
        // Select a range after initialization.
        instance.setSelection(2, 5);
        // Replace that range through the public API.
        instance.replaceSelection("X");
        // Undo the replacement.
        instance.undo();
        // Verify source restoration.
        expect(instance.getValue()).toBe("abcdef");
        // Verify selection restoration.
        expect(instance.getSelection()).toEqual({start:2, end:5});
    });

    // Verify document undo keeps title editing focus.
    it("preserves screenplay title focus for native undo requests", () => {
        // Initialize a document with a title.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Draft", blocks:[]}});
        // Locate the title input.
        const title = host.querySelector("input");
        // Focus the title before editing.
        title.focus();
        // Append text as a native edit would.
        title.value = "Draft two";
        // Record the input change.
        title.dispatchEvent(new Event("input", {bubbles:true}));
        // Request undo through the native beforeinput path.
        title.dispatchEvent(new InputEvent("beforeinput", {inputType:"historyUndo", bubbles:true, cancelable:true}));
        // Check restored document content.
        expect(instance.getDocument().title).toBe("Draft");
        // Check keyboard focus stays in the title.
        expect(document.activeElement).toBe(title);
    });

    // Verify runtime callers cannot create conflicting IDs through insertion.
    it("always assigns new IDs to inserted storyboard shots", () => {
        // Initialize the board.
        instance = M.Storyboard.init(host);
        // Add an original shot.
        const id = instance.addShot({title:"Original"});
        // Pass a runtime field excluded from the TypeScript insertion contract.
        const next = instance.addShot({id, title:"Inserted"});
        // Check that insertion still creates a distinct identifier.
        expect(next).not.toBe(id);
        // Verify both shots remain individually addressable.
        expect(new Set(instance.getShots().map(shot => shot.id)).size).toBe(2);
    });

    // Verify menu portals never become light-DOM button content.
    it("preserves rounded menu labels across rerenders and restores external menus", async() => {
        // Create an external authored menu.
        const menu = document.createElement("ul");
        // Give the menu a unique lookup target.
        menu.id = "editor-toolbar-menu-regression";
        // Apply the real dropdown component styling.
        menu.className = "dropdown-content";
        // Supply a native command item.
        menu.innerHTML = '<li><button type="button">Dialogue</button></li>';
        // Keep the authored menu outside the custom button.
        toolbar.append(menu);
        // Create an extended round menu trigger.
        const trigger = document.createElement("crazy-button");
        // Select the labeled variant.
        trigger.setAttribute("type", "extended");
        // Set the initial label.
        trigger.setAttribute("label", "Scene heading");
        // Associate the external menu.
        trigger.setAttribute("menu-target", menu.id);
        // Attach the custom element.
        host.append(trigger);
        // Wait for its initial render.
        await trigger.updateComplete;
        // Update the selected menu label.
        trigger.setAttribute("label", "Dialogue");
        // Wait for the rerender and slot observer.
        await trigger.updateComplete;
        // Wait for pending mutation observers to settle.
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Check the label remains visible.
        expect(trigger.querySelector('[part="button"]').textContent).toBe("Dialogue");
        // Check the menu is outside the light-DOM slot tree.
        expect(trigger.contains(menu)).toBeFalse();
        // Check the menu is hosted outside scrolling toolbar content.
        expect(menu.parentNode).toBe(document.body);
        // Disconnect the custom element.
        trigger.remove();
        // Check cleanup restores caller-owned markup.
        expect(menu.parentNode).toBe(toolbar);
    });
    // Verify screenplay geometry stays physical while the preview scales.
    it("shows complete A4 pages with stable pagination at narrow widths", async () => {
        // Create enough independent lines to require several writing sheets.
        const blocks = Array.from({length:90}, (_, index) => ({id:`line-${index}`, type:"action", text:`Action ${index}.`}));

        // Create the paged screenplay.
        instance = M.ScreenplayEditor.init(host, {document:{title:"A4 test", blocks}});

        // Capture physical page geometry.
        const page = host.querySelector(".screenplay-page");

        // Check the A4 portrait ratio independently of display scaling.
        expect(page.offsetHeight / page.offsetWidth).toBeCloseTo(297 / 210, 2);

        // Check 12-point Courier is represented by 16 CSS pixels.
        expect(getComputedStyle(host.querySelector("textarea")).fontSize).toBe("16px");

        // Capture the desktop page count.
        const count = instance.getPageCount();

        // Verify content actually flows onto later sheets.
        expect(count).toBeGreaterThan(1);

        // Shrink the preview to a phone-sized container.
        host.style.width = "320px";

        // Wait for the observer's deferred preview update rather than a fixed frame count.
        await new Promise(resolve => {
            // Bound the wait so a broken observer still produces an assertion failure.
            let frames = 0;

            // Inspect the actual rendered preview size.
            const check = () => {
                // Count the delivered animation frames.
                frames++;

                // Finish when the preview fits or the bounded wait expires.
                if(host.querySelector(".screenplay-page-frame").getBoundingClientRect().width < 320 || frames >= 20)
                    // Resume the layout assertions.
                    resolve();
                else
                    // Check after the next observer and animation-frame delivery.
                    requestAnimationFrame(check);
            };

            // Begin observing the rendered result.
            requestAnimationFrame(check);
        });

        // Keep the same physical page count and source data.
        expect(instance.getPageCount()).toBe(count);

        // Verify the preview fits the narrow container.
        expect(host.querySelector(".screenplay-page-frame").getBoundingClientRect().width).toBeLessThan(320);

        // Keep the page stack accessible through the fixed-height scrollable canvas.
        expect(host.querySelector(".screenplay-paper").scrollHeight).toBeGreaterThan(host.querySelector(".screenplay-paper").clientHeight);

        // Verify pagination leaves semantic data untouched.
        expect(instance.getDocument().blocks).toEqual(blocks);
    });

    // Verify long native text fields continue across physical page boundaries.
    it("preserves long screenplay blocks while editing and undoing page continuations", () => {
        // Create a long source paragraph with deliberate line breaks.
        const text = Array.from({length:180}, (_, index) => `A long action line ${index}.`).join("\n");

        // Create a single semantic block spanning several sheets.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Long action", blocks:[{id:"long", type:"action", text}]}});

        // Capture its visual continuations.
        const inputs = Array.from(host.querySelectorAll("textarea[data-block-id]"));

        // Verify several sheets were created for the one block.
        expect(instance.getPageCount()).toBeGreaterThan(2);

        // Verify no text was lost or duplicated at a page boundary.
        expect(inputs.map(input => input.value).join("")).toBe(text);

        // Verify every visible field stays inside its page's writing area.
        for(const input of inputs)
            // Compare rendered field and body bounds at the same preview scale.
            expect(input.getBoundingClientRect().bottom).toBeLessThanOrEqual(input.closest(".screenplay-page-body").getBoundingClientRect().bottom + 1);

        // Edit a continuation rather than the first field.
        const input = inputs[1];

        // Capture its position in the full semantic source.
        const offset = Number(input.dataset.blockStart);

        // Focus and insert text in the second sheet.
        input.focus();

        // Replace part of the continuation through the native textarea.
        input.value = "EDIT " + input.value;

        // Set a caret in source coordinates after the inserted text.
        input.setSelectionRange(5, 5);

        // Trigger the actual input path.
        input.dispatchEvent(new Event("input", {bubbles:true}));

        // Verify only that source range changed.
        expect(instance.getDocument().blocks[0].text).toBe(text.slice(0, offset) + "EDIT " + text.slice(offset));

        // Verify the active continuation retained its source caret.
        expect(Number(document.activeElement.dataset.blockStart) + document.activeElement.selectionStart).toBe(offset + 5);

        // Undo the continuation edit as one document operation.
        instance.undo();

        // Restore the complete original source text.
        expect(instance.getDocument().blocks[0].text).toBe(text);

        // Verify paging never split the semantic block in exported JSON.
        expect(JSON.parse(instance.toJSON()).blocks.length).toBe(1);
    });

    // Verify toolbar commands operate on source offsets after a page break.
    it("splits and formats the selected screenplay continuation", () => {
        // Create a long block with identifiable source positions.
        const text = "A long action line.\n".repeat(100);

        // Initialize a multi-page semantic block.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Continuation", blocks:[{id:"long", type:"action", text}]}});

        // Pick a source position on a later sheet.
        const offset = Number(host.querySelectorAll("textarea[data-block-id]")[1].dataset.blockStart) + 5;

        // Select that position through the public method.
        instance.focus("long", offset);

        // Move focus to an external toolbar control.
        toolbar.querySelector("button").focus();

        // Reformat the active semantic block.
        instance.setBlockType("dialogue");

        // Preserve the caret even though dialogue pagination uses a narrower width.
        expect(Number(document.activeElement.dataset.blockStart) + document.activeElement.selectionStart).toBe(offset);

        // Split at the selected continuation position.
        document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key:"Enter", bubbles:true, cancelable:true}));

        // Read the resulting semantic blocks.
        const blocks = instance.getDocument().blocks;

        // Preserve source before the split.
        expect(blocks[0].text).toBe(text.slice(0, offset));

        // Preserve source after the split.
        expect(blocks[1].text).toBe(text.slice(offset));
    });

    // Verify drag sorting commits one operation and rejects read-only gestures.
    it("sorts storyboard cards from handles and restores the order with undo", () => {
        // Create an editable board.
        instance = M.Storyboard.init(host);

        // Add the first shot.
        const first = instance.addShot({title:"First"});

        // Add the second shot.
        const second = instance.addShot({title:"Second"});

        // Add the third shot.
        const third = instance.addShot({title:"Third"});

        // Capture the first card's dedicated drag handle.
        const handle = host.querySelector(".storyboard-drag-handle");

        // Capture the final card as the drop target.
        const target = host.querySelectorAll(".storyboard-shot")[2];

        // Use the browser's real native drag payload.
        const dataTransfer = new DataTransfer();

        // Start a local handle drag.
        handle.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));

        // Measure the destination's trailing edge.
        const bounds = target.getBoundingClientRect();

        // Preview insertion after the last card in either grid orientation.
        target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer, clientX:bounds.right - 2, clientY:bounds.bottom - 2}));

        // Confirm the insertion preview is visible.
        expect(target.classList.contains("is-drop-after")).toBeTrue();

        // Commit the native drop.
        target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));

        // Verify document order changed exactly as previewed.
        expect(instance.getShots().map(shot => shot.id)).toEqual([second, third, first]);

        // Undo the entire drag in one operation.
        instance.undo();

        // Verify original order is restored.
        expect(instance.getShots().map(shot => shot.id)).toEqual([first, second, third]);

        // Disable user mutations.
        instance.setReadOnly(true);

        // Verify the native grip cannot start a drag.
        expect(host.querySelector(".storyboard-drag-handle").draggable).toBeFalse();

        // Verify footer commands are disabled with the handles.
        expect(host.querySelector('crazy-button[data-shot-command="duplicate"]').hasAttribute("disabled")).toBeTrue();
    });

    // Verify rounded actions and keyboard grips use the same mutation path.
    it("runs each rounded storyboard action once and supports keyboard sorting", async () => {
        // Create an editable board.
        instance = M.Storyboard.init(host);

        // Add the initial shot.
        const first = instance.addShot({title:"Original"});

        // Locate the actual custom button.
        const duplicate = host.querySelector('crazy-button[data-shot-command="duplicate"]');

        // Wait for the real inner native button.
        await duplicate.updateComplete;

        // Support both bundled demos and plain-script hosts without the optional tooltip peer.
        const tooltipError = await duplicate.tooltipReady.then(() => null, error => error);

        // Retain a visible native label when enhanced tooltips are unavailable.
        if(tooltipError)
            // Verify graceful fallback instead of an unhandled page error.
            expect(duplicate.querySelector("button").title).toBe("Duplicate");

        // Click through the real custom button event sequence.
        duplicate.querySelector("button").click();

        // Verify click plus buttonaction produced only one duplicate.
        expect(instance.getShots().length).toBe(2);

        // Locate the first shot's keyboard grip.
        const handle = host.querySelector(".storyboard-drag-handle");

        // Focus its dedicated sorting control.
        handle.focus();

        // Move the shot forward without dragging.
        handle.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowRight", bubbles:true, cancelable:true}));

        // Verify the shot moved one position.
        expect(instance.getShots()[1].id).toBe(first);

        // Verify focus follows the same shot's grip.
        expect(document.activeElement.closest(".storyboard-shot").dataset.shotId).toBe(first);
    });

    // Verify preview size and scrollbars do not change screenplay data or history.
    it("fits the parent by default and supports fixed screenplay zoom with scrolling", () => {
        // Use a narrow host to exercise both horizontal and vertical scrolling.
        host.style.width = "320px";

        // Create a long, fixed-format screenplay.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Preview", blocks:[{id:"a", type:"action", text:"A line of action.\n".repeat(100)}]}});

        // Capture the source and physical page count.
        const source = instance.toJSON();

        // Capture the original page count.
        const pages = instance.getPageCount();

        // Locate the fixed scrolling canvas.
        const canvas = host.querySelector(".screenplay-paper");

        // Check the default preview mode.
        expect(instance.getZoom()).toBe("fit-parent");

        // Fit the available width without a horizontal scrollbar.
        expect(canvas.scrollWidth).toBeLessThanOrEqual(canvas.clientWidth + 1);

        // Switch to actual-size preview.
        instance.setZoom(1);

        // Check horizontal scrolling is available for a full-size sheet.
        expect(canvas.scrollWidth).toBeGreaterThan(canvas.clientWidth);

        // Check vertical scrolling is available for the page stack.
        expect(canvas.scrollHeight).toBeGreaterThan(canvas.clientHeight);

        // Keep the same screenplay pagination.
        expect(instance.getPageCount()).toBe(pages);

        // Keep the serialized screenplay unchanged.
        expect(instance.toJSON()).toBe(source);

        // Exclude preview choices from undo history.
        expect(instance.canExecute("undo")).toBeFalse();

        // Reject invalid display sizes atomically.
        expect(() => instance.setZoom(0)).toThrowError(RangeError);

        // Preserve the previous valid size.
        expect(instance.getZoom()).toBe(1);

        // Allow preview controls while viewing a read-only screenplay.
        instance.setReadOnly(true);

        // Restore responsive sizing.
        instance.setZoom("fit-parent");

        // Return to a contained, horizontally fitted sheet.
        expect(canvas.scrollWidth).toBeLessThanOrEqual(canvas.clientWidth + 1);
    });

    // Verify native block grips reorder semantic data in one history operation.
    it("drags screenplay blocks with undo and supports keyboard grips", () => {
        // Create three independently identified screenplay elements.
        const blocks = [{id:"a", type:"scene", text:"INT. ROOM — DAY"}, {id:"b", type:"action", text:"The door opens."}, {id:"c", type:"dialogue", text:"Hello."}];

        // Create the editable writing surface.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Grip test", blocks}});

        // Locate the source grip and final destination.
        const handle = host.querySelector(".screenplay-block-handle");

        // Resolve the final block's visual fragment.
        const target = host.querySelectorAll(".screenplay-block")[2];

        // Use the native drag payload.
        const dataTransfer = new DataTransfer();

        // Start sorting from the dedicated handle.
        handle.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));

        // Resolve the insertion position after the final element.
        const bounds = target.getBoundingClientRect();

        // Preview the destination.
        target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer, clientY:bounds.bottom - 1}));

        // Verify a visible insertion preview.
        expect(target.classList.contains("is-drop-after")).toBeTrue();

        // Complete the native drop.
        target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));

        // Verify semantic document order changed.
        expect(instance.getDocument().blocks.map(block => block.id)).toEqual(["b", "c", "a"]);

        // Undo the complete drag once.
        instance.undo();

        // Restore the original semantic order.
        expect(instance.getDocument().blocks).toEqual(blocks);

        // Locate the restored first grip.
        const grip = host.querySelector(".screenplay-block-handle");

        // Focus the accessible sorting control.
        grip.focus();

        // Move the selected block one position using the keyboard.
        grip.dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true, cancelable:true}));

        // Verify keyboard sorting uses the same model operation.
        expect(instance.getDocument().blocks.map(block => block.id)).toEqual(["b", "a", "c"]);

        // Retain focus on the moved block's grip.
        expect(document.activeElement.dataset.blockId).toBe("a");

        // Disable all pointer and keyboard sorting in read-only mode.
        instance.setReadOnly(true);

        // Verify the native grip is disabled.
        expect(host.querySelector(".screenplay-block-handle").disabled).toBeTrue();

        // Verify dragging is no longer advertised.
        expect(host.querySelector(".screenplay-block-handle").draggable).toBeFalse();
    });

    // Verify small indented elements can be targeted from blank horizontal space.
    it("previews a full-width screenplay insertion line and drops beside short blocks", () => {
        // Create a short speech group after an action.
        const blocks = [{id:"a", type:"scene", text:"INT. ROOM — DAY"}, {id:"b", type:"action", text:"A pause."}, {id:"c", type:"parenthetical", text:"(quietly)"}, {id:"d", type:"dialogue", text:"Hello."}];

        // Initialize the editable screenplay.
        instance = M.ScreenplayEditor.init(host, {document:{title:"Wide drop", blocks}});

        // Locate the source handle.
        const handle = host.querySelector(".screenplay-block-handle");

        // Locate the indented target and its full-width writing area.
        const target = host.querySelector(".screenplay-parenthetical");

        // Resolve the destination page body.
        const body = target.parentElement;

        // Read scaled pointer coordinates beside the short field.
        const bounds = body.getBoundingClientRect();

        // Read the insertion boundary above the parenthetical.
        const top = target.getBoundingClientRect().top;

        // Create a native local drag payload.
        const dataTransfer = new DataTransfer();

        // Begin sorting through the grip.
        handle.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));

        // Hover blank space to the right of the indented target.
        body.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer, clientX:bounds.right - 2, clientY:top - 1}));

        // Locate the full-width insertion overlay.
        const marker = body.querySelector(".screenplay-drop-indicator");

        // Verify the marker exists even though the pointer did not hit a text field.
        expect(marker).not.toBeNull();

        // Verify the line spans the writing area rather than the indented block.
        expect(marker.getBoundingClientRect().width).toBeCloseTo(bounds.width, 1);

        // Drop in the same blank row space.
        body.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));

        // Move the whole semantic block to the previewed boundary.
        expect(instance.getDocument().blocks.map(block => block.id)).toEqual(["b", "a", "c", "d"]);

        // Remove the transient insertion line after a successful drop.
        expect(host.querySelector(".screenplay-drop-indicator")).toBeNull();

        // Undo the entire operation once.
        instance.undo();

        // Restore the original document order.
        expect(instance.getDocument().blocks).toEqual(blocks);
    });

});
