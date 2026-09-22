describe("CodeCard", function(){
    let host;
    let instance;
    let clipboard;
    let writeText;

    beforeEach(function(){
        host = document.createElement("div");
        host.innerHTML = '<pre><code class="language-javascript">const answer = 42;</code></pre>';
        document.body.append(host);
        clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        writeText = jasmine.createSpy("writeText").and.returnValue(Promise.resolve());
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    });

    afterEach(function(){
        instance?.destroy();
        instance = undefined;
        host.remove();
        if(clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
        else delete navigator.clipboard;
    });

    it("renders source as text without executing HTML", async function(){
        const code = '<img src=x onerror="window.__codeExecuted=true">\n<script>alert(1)</script>';
        instance = M.CodeCard.init(host, { code, language: "html", highlight: false });
        await instance.ready;
        expect(host.querySelector("pre code").textContent).toBe(code);
        expect(host.querySelector("img, script")).toBeNull();
        expect(instance.getCode()).toBe(code);
    });

    it("copies original source including indentation and trailing newline", async function(){
        const code = "first\n    second\n";
        instance = M.CodeCard.init(host, { code, title: "Do not copy this title", highlight: false });
        await instance.ready;
        expect(await instance.copy()).toBeTrue();
        expect(writeText).toHaveBeenCalledOnceWith(code);
        expect(host.querySelector('[role="status"]').textContent).toBe("Copied!");
        expect(host.querySelector("crazy-button i").textContent).toBe("check");
        expect(host.querySelector("button").getAttribute("aria-label")).toBe("Copied!");
    });

    it("hides and disables the copy action when requested", async function(){
        host.dataset.codeCopy = "false";
        instance = M.CodeCard.init(host, { highlight: false });
        await instance.ready;
        expect(host.querySelector("crazy-button").hidden).toBeTrue();
        expect(await instance.copy()).toBeFalse();
        expect(writeText).not.toHaveBeenCalled();
        await instance.update({ copy: true });
        expect(host.querySelector("crazy-button").hidden).toBeFalse();
    });

    it("reports clipboard errors instead of announcing success", async function(){
        writeText.and.returnValue(Promise.reject(new Error("Permission denied")));
        instance = M.CodeCard.init(host, { highlight: false });
        await instance.ready;
        expect(await instance.copy()).toBeFalse();
        expect(host.querySelector('[role="status"]').textContent).toBe("Unable to copy");
        expect(host.querySelector("button").disabled).toBeFalse();
        expect(host.querySelector("crazy-button i").textContent).toBe("error_outline");
        expect(host.querySelector("button").getAttribute("aria-label")).toBe("Unable to copy");
    });

    it("updates custom content and treats unknown language names as plain text", async function(){
        instance = M.CodeCard.init(host, { highlight: false });
        await instance.ready;
        await instance.update({ code: "custom => value", language: "custom", title: "My format", copy: false });
        expect(host.querySelector("pre code").textContent).toBe("custom => value");
        expect(host.querySelector("pre").getAttribute("aria-label")).toBe("My format");
        await instance.update({ title: "" });
        expect(host.querySelector("pre").getAttribute("aria-label")).toBe("CUSTOM code");
        expect(host.querySelector("crazy-button").hidden).toBeTrue();
    });

    it("restores the authored DOM and listeners on destroy", async function(){
        const original = host.firstElementChild;
        instance = M.CodeCard.init(host, { highlight: false });
        await instance.ready;
        const button = host.querySelector("button");
        instance.destroy();
        instance = undefined;
        button.click();
        expect(writeText).not.toHaveBeenCalled();
        expect(host.firstElementChild).toBe(original);
        expect(host.classList.contains("code-card")).toBeFalse();
        expect(M.CodeCard.getInstance(host)).toBeUndefined();
    });

    it("highlights JavaScript while preserving the source text", async function(){
        instance = M.CodeCard.init(host);
        await instance.ready;
        expect(host.querySelectorAll(".token").length).toBeGreaterThan(0);
        expect(host.querySelector("pre code").textContent).toBe("const answer = 42;");
    });

    it("keeps a replacement instance intact when an old owner destroys twice", async function(){
        const old = M.CodeCard.init(host, { highlight: false });
        await old.ready;
        instance = M.CodeCard.init(host, { code: "replacement", highlight: false });
        await instance.ready;
        old.destroy();
        expect(M.CodeCard.getInstance(host)).toBe(instance);
        expect(host.querySelector("pre code").textContent).toBe("replacement");
    });

    it("does not mutate restored markup when a pending copy completes", async function(){
        let resolve;
        writeText.and.returnValue(new Promise(done => { resolve = done; }));
        instance = M.CodeCard.init(host, { highlight: false });
        await instance.ready;
        const copying = instance.copy();
        instance.destroy();
        instance = undefined;
        const restored = host.innerHTML;
        resolve();
        await copying;
        expect(host.innerHTML).toBe(restored);
    });

    it("uses CrazyButton activation and restores its icon after success feedback", async function(){
        jasmine.clock().install();
        try {
            instance = M.CodeCard.init(host, { highlight: false });
            await instance.ready;
            const button = host.querySelector("crazy-button");
            const copied = new Promise(resolve => host.addEventListener("codecopy", resolve, { once: true }));
            button.querySelector("button").click();
            await copied;
            expect(writeText).toHaveBeenCalledTimes(1);
            expect(button.querySelector("i").textContent).toBe("check");
            jasmine.clock().tick(2000);
            await button.updateComplete;
            expect(button.querySelector("i").textContent).toBe("content_copy");
            expect(button.querySelector("button").getAttribute("aria-label")).toBe("Copy code");
            expect(host.querySelector('[role="status"]').textContent).toBe("");
        }finally{
            jasmine.clock().uninstall();
        }
    });

    it("does not show stale success when the source changes during a copy", async function(){
        let resolve;
        writeText.and.returnValue(new Promise(done => { resolve = done; }));
        instance = M.CodeCard.init(host, { highlight: false });
        await instance.ready;
        const copying = instance.copy();
        expect(await instance.copy()).toBeFalse();
        await instance.update({ code: "new source" });
        resolve();
        await copying;
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(host.querySelector("crazy-button i").textContent).toBe("content_copy");
        expect(host.querySelector("button").getAttribute("aria-label")).toBe("Copy code");
        expect(host.querySelector('[role="status"]').textContent).toBe("");
    });

});
