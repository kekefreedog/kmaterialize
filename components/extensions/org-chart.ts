import { enableCardHandles } from "./card-drag-handles";
import { printChart } from "./chart-print";
import type { ChartPrintOptions } from "./chart-print";
export type { ChartPrintOptions } from "./chart-print";
import { enableChartGestures } from "./chart-gestures";
import { enableChartConnections } from "./chart-connections";

export interface OrgChartAppearance {
  color?: string;
  textColor?: string;
  borderColor?: string;
  accent?: string;
  accentPosition?: "top" | "right" | "bottom" | "left";
}
export interface OrgChartTeam extends OrgChartAppearance { id: string; name: string; x: number; y: number }
export interface OrgChartPerson extends OrgChartAppearance { id: string; teamId: string; name: string; role?: string }
export interface OrgChartLink { from: string; to: string; fromType?: "person" | "team"; toType?: "person" | "team"; label?: string }
export interface OrgChartData { teams: OrgChartTeam[]; people: OrgChartPerson[]; links: OrgChartLink[] }
export interface OrgChartOptions {
  data: OrgChartData;
  draggable?: boolean;
  /** Enable mouse/touch connection ports on cards and groups. Defaults to true. */
  connectable?: boolean;
  /** Allow inline link-label editing. Defaults to false. */
  editable?: boolean;
  orientation?: "horizontal" | "vertical";
  onChange?: (data: OrgChartData) => void;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomChange?: (zoom: number) => void;
}

const svgNS = "http://www.w3.org/2000/svg";
const copy = (data: OrgChartData): OrgChartData => JSON.parse(JSON.stringify(data));
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Materialize organization chart; no graph dependency. */
export class OrgChart {
  private zoom = 1;
  private labelEditor?: { index: number; input: HTMLInputElement };
  private static instances = new WeakMap<HTMLElement, OrgChart>();
  private data: OrgChartData;
  private stage = element("div", "org-chart-stage");
  private svg = document.createElementNS(svgNS, "svg");
  private summary = element("div", "org-chart-summary");
  private people = new Map<string, HTMLElement>();
  private panels = new Map<string, HTMLElement>();
  private events = new AbortController();
  private observer: ResizeObserver;
  private drag?: { id: string; pointer: number; x: number; y: number; left: number; top: number; handle: HTMLElement };
  private frame = 0;
  private removeCardHandles?: () => void;
  private originalNodes: Node[];
  private hadClass: boolean;
  private removeGestures: () => void;
  private connections?: ReturnType<typeof enableChartConnections>;

  static init(el: HTMLElement, options: OrgChartOptions): OrgChart {
    return new OrgChart(el, options);
  }

  static getInstance(el: HTMLElement): OrgChart | undefined { return this.instances.get(el); }

  constructor(private el: HTMLElement, private options: OrgChartOptions) {
    this.validate(options.data);
    this.zoom = this.clampZoom(options.zoom ?? 1);
    OrgChart.getInstance(el)?.destroy();
    this.data = copy(options.data);
    this.originalNodes = Array.from(el.childNodes);
    this.hadClass = el.classList.contains("org-chart");
    el.classList.add("org-chart");
    this.svg.classList.add("org-chart-links");
    this.svg.setAttribute("aria-hidden", options.editable === true ? "false" : "true");
    el.replaceChildren(this.stage, this.summary);
    OrgChart.instances.set(el, this);
    const signal = this.events.signal;
    this.stage.addEventListener("pointerdown", this.startDrag, { signal });
    this.stage.addEventListener("pointermove", this.moveDrag, { signal });
    this.stage.addEventListener("pointerup", this.endDrag, { signal });
    this.stage.addEventListener("pointercancel", this.endDrag, { signal });
    this.stage.addEventListener("lostpointercapture", this.endDrag, { signal });
    this.stage.addEventListener("keydown", this.moveWithKeyboard, { signal });
    this.observer = new ResizeObserver(() => this.scheduleDraw());
    this.render();
    this.setZoom(this.zoom);
    if (options.connectable !== false) this.connections = enableChartConnections(el, this.stage, () => this.zoom,
      (from, to) => !(from.id === to.id && from.type === to.type) && !this.data.links.some(link =>
        link.from === from.id && (link.fromType || 'person') === from.type && link.to === to.id && (link.toType || 'person') === to.type),
      (from, to) => {
        const link: OrgChartLink = { from: from.id, fromType: from.type, to: to.id, toType: to.type, label: "New link" };
        // Consumers may intercept insertion; labels can be edited on the canvas.
        if (el.dispatchEvent(new CustomEvent('orgconnect', { detail: link, cancelable: true }))) {
          this.setData({ ...this.getData(), links: [...this.data.links, link] });
        }
      });
    this.removeGestures = enableChartGestures(el, () => this.getZoom(), value => this.setZoom(value), () => {
      this.endDrag();
      this.connections?.cancel();
      el.dispatchEvent(new Event('carddragcancel'));
    });
  }

  getData(): OrgChartData { return copy(this.data); }

  /** Set the canvas scale, clamped to the configured limits. */
  setZoom(value: number): void {
    if (!Number.isFinite(value)) throw new TypeError("Zoom must be finite.");
    this.connections?.cancel();
    this.zoom = this.clampZoom(value);
    this.stage.style.setProperty('zoom', String(this.zoom));
    this.el.dataset.zoom = String(this.zoom);
    this.draw();
    this.el.dispatchEvent(new CustomEvent('zoomchange', { detail: this.zoom }));
    this.options.onZoomChange?.(this.zoom);
  }

  /** Return the current canvas scale multiplier. */
  getZoom(): number { return this.zoom; }

  /** Restore the canvas to 100% scale. */
  resetZoom(): void { this.setZoom(1); }

  /** Open a full-chart print preview; select Save as PDF in the browser. */
  exportPdf(title = 'Org chart', options: ChartPrintOptions = {}): Promise<void> {
    this.connections?.cancel();
    this.draw();
    return printChart(this.stage, title, options);
  }

  private clampZoom(value: number): number {
    if (!Number.isFinite(value)) throw new TypeError('Zoom must be finite.');
    const min = this.options.minZoom ?? 0.5;
    const max = this.options.maxZoom ?? 2;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) throw new TypeError("Invalid zoom limits.");
    return Math.min(max, Math.max(min, value));
  }

  setData(data: OrgChartData): void {
    this.validate(data);
    this.endDrag();
    this.data = copy(data);
    this.render();
    this.options.onChange?.(this.getData());
  }

  destroy(): void {
    this.finishLabelEdit(false);
    this.connections?.destroy();
    this.removeGestures();
    this.removeCardHandles?.();
    this.events.abort();
    this.endDrag();
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
    this.el.replaceChildren(...this.originalNodes);
    if (!this.hadClass) this.el.classList.remove("org-chart");
    OrgChart.instances.delete(this.el);
  }

  private validate(data: OrgChartData): void {
    const teams = new Set<string>();
    const people = new Set<string>();
    for (const team of data.teams) {
      if (!team.id || teams.has(team.id) || !team.name.trim() || !Number.isFinite(team.x) || !Number.isFinite(team.y) || team.x < 0 || team.y < 0)
        throw new Error("Teams need unique IDs, a name, and finite, non-negative coordinates.");
      teams.add(team.id);
    }
    for (const person of data.people) {
      if (!person.id || people.has(person.id) || !teams.has(person.teamId) || !person.name.trim())
        throw new Error("People need unique IDs, a name, and an existing team.");
      people.add(person.id);
    }
    for (const link of data.links) {
      if (!(link.fromType === "team" ? teams : people).has(link.from) || !(link.toType === "team" ? teams : people).has(link.to) || (link.from === link.to && (link.fromType || "person") === (link.toType || "person")))
        throw new Error("Relationships must connect two different, existing people or teams.");
    }
  }

  private applyAppearance(el: HTMLElement, appearance: OrgChartAppearance): void {
    if (appearance.color) {
      el.style.setProperty("--org-item-color", appearance.color);
      el.classList.add("org-chart-tinted");
    }
    if (appearance.textColor) el.style.setProperty("--org-item-text", appearance.textColor);
    if (appearance.borderColor) el.style.border = `2px solid ${appearance.borderColor}`;
    if (appearance.accent) {
      el.style.setProperty("--org-item-accent", appearance.accent);
      el.dataset.accent = appearance.accentPosition || "bottom";
    }
  }

  private render(): void {
    this.finishLabelEdit(false);
    this.connections?.cancel();
    this.removeCardHandles?.();
    this.observer.disconnect();
    this.people.clear();
    this.panels.clear();
    this.stage.replaceChildren(this.svg);
    for (const team of this.data.teams) {
      const panel = element("section", "org-chart-team");
      this.applyAppearance(panel, team);
      panel.style.left = `${team.x}px`;
      panel.style.top = `${team.y}px`;
      panel.setAttribute("aria-label", team.name);
      panel.dataset.orgTeam = team.id;
      const members = this.data.people.filter(person => person.teamId === team.id);
      const header = element("button", "org-chart-team-handle");
      header.type = "button";
      header.dataset.team = team.id;
      header.disabled = this.options.draggable === false;
      header.setAttribute("aria-label", `${team.name}, ${members.length} people. Drag or use arrow keys to move; Shift moves faster.`);
      header.append(element("span", "org-chart-team-name", team.name), element("span", "org-chart-count", String(members.length)));
      if (this.options.draggable !== false) {
        const icon = element("i", "material-icons org-chart-drag-icon", "drag_indicator");
        icon.setAttribute("aria-hidden", "true");
        header.prepend(icon);
      }
      panel.append(header);
      if (this.options.connectable !== false) panel.append(this.connectionPort(team.name));
      for (const person of members) {
        const card = element("article", "org-chart-person");
        this.applyAppearance(card, person);
        card.dataset.orgPerson = person.id;
        const initials = person.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("");
        const avatar = element("span", "org-chart-avatar", initials);
        avatar.setAttribute("aria-hidden", "true");
        const details = element("div", "org-chart-person-details");
        details.append(element("strong", "org-chart-person-name", person.name));
        if (person.role) details.append(element("span", "org-chart-person-role", person.role));
        card.append(avatar, details);
        if (this.options.connectable !== false) card.append(this.connectionPort(person.name));
        panel.append(card);
        this.people.set(person.id, card);
      }
      if (!members.length) panel.append(element("p", "org-chart-empty", "Ready for your people"));
      this.panels.set(team.id, panel);
      this.stage.append(panel);
      this.observer.observe(panel);
    }
    if (!this.data.teams.length) this.stage.append(element("p", "org-chart-empty", "Add a team to start your org chart."));
    // Relationships remain available as plain text to assistive technology.
    this.summary.replaceChildren();
    const list = document.createElement("ul");
    for (const link of this.data.links) {
      const from = (link.fromType === "team" ? this.data.teams : this.data.people).find(item => item.id === link.from)!;
      const to = (link.toType === "team" ? this.data.teams : this.data.people).find(item => item.id === link.to)!;
      list.append(element("li", "", `${from.name} → ${to.name}: ${link.label || "Connected to"}`));
    }
    this.summary.append(element("h2", "", "Relationships"), list);
    this.removeCardHandles = enableCardHandles(this.el, {
      cardSelector: '.org-chart-person', dropSelector: '.org-chart-team',
      enabled: () => this.options.draggable !== false,
      onMove: (card, _from, to) => {
        const person = this.data.people.find(person => person.id === card.dataset.orgPerson)!;
        person.teamId = to.dataset.orgTeam!;
        const order = Array.from(this.stage.querySelectorAll<HTMLElement>('.org-chart-person')).map(card => card.dataset.orgPerson);
        this.data.people.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        this.render();
        this.people.get(person.id)?.querySelector<HTMLButtonElement>('.card-drag-handle')?.focus({ preventScroll: true });
        this.options.onChange?.(this.getData());
      },
    });
    this.draw();
  }

  private scheduleDraw(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  private connectionPort(name: string): HTMLButtonElement {
    const port = element('button', 'org-chart-connect-port');
    const icon = element('i', 'material-icons', 'add');
    icon.setAttribute('aria-hidden', 'true');
    port.append(icon);
    port.type = 'button';
    port.title = `Drag to connect ${name} to a card or group`;
    port.setAttribute('aria-label', port.title);
    return port;
  }

  private draw(): void {
    const vertical = this.options.orientation === "vertical";
    const width = Math.max(vertical ? 0 : 900, ...this.data.teams.map(team => team.x + this.panels.get(team.id)!.offsetWidth + 80));
    const height = Math.max(560, ...this.data.teams.map(team => team.y + this.panels.get(team.id)!.offsetHeight + 80));
    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${height}px`;
    this.svg.setAttribute("width", String(width));
    this.svg.setAttribute("height", String(height));
    this.svg.replaceChildren();
    const origin = this.stage.getBoundingClientRect();
    for (const link of this.data.links) {
      // Project vertical layouts onto the same routing axes, then rotate back.
      const project = (box: DOMRect) => {
        // DOM bounds are screen pixels; SVG paths use unzoomed canvas units.
        const rect = new DOMRect((box.x - origin.x) / this.zoom, (box.y - origin.y) / this.zoom, box.width / this.zoom, box.height / this.zoom);
        return vertical
        ? { left: rect.top, right: rect.bottom, top: rect.left, height: rect.width }
        : rect;
      };
      const from = project((link.fromType === "team" ? this.panels : this.people).get(link.from)!.getBoundingClientRect());
      const to = project((link.toType === "team" ? this.panels : this.people).get(link.to)!.getBoundingClientRect());
      const originX = 0;
      const originY = 0;
      const point = (x: number, y: number) => vertical ? [y, x] : [x, y];
      // Overlapping endpoints route around the outer edge of their panels.
      const sameSide = from.left < to.right && to.left < from.right;
      const direction = to.left >= from.left ? 1 : -1;
      const x1 = (sameSide || direction > 0 ? from.right : from.left) - originX;
      const x2 = (sameSide || direction < 0 ? to.right : to.left) - originX;
      const y1 = from.top + (link.fromType === "team" && !vertical ? 28 : from.height / 2) - originY;
      const y2 = to.top + (link.toType === "team" && !vertical ? 28 : to.height / 2) - originY;
      const bend = sameSide ? 72 : Math.max(48, Math.abs(x2 - x1) * 0.5);
      const c1 = sameSide ? Math.max(x1, x2) + bend : x1 + bend * direction;
      const c2 = sameSide ? Math.max(x1, x2) + bend : x2 - bend * direction;
      const group = document.createElementNS(svgNS, "g");
      group.classList.add("org-chart-link");
      this.svg.append(group);
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", `M ${point(x1, y1).join(" ")} C ${point(c1, y1).join(" ")}, ${point(c2, y2).join(" ")}, ${point(x2, y2).join(" ")}`);
      group.append(path);
      if (this.options.editable === true) {
        const hit = path.cloneNode() as SVGPathElement;
        hit.classList.add('org-chart-link-hit');
        group.append(hit);
      }
      for (const [x, y] of [point(x1, y1), point(x2, y2)]) {
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", String(x)); dot.setAttribute("cy", String(y)); dot.setAttribute("r", "3");
        group.append(dot);
      }
      if (link.label || this.options.editable === true) {
        const text = document.createElementNS(svgNS, "text");
        text.textContent = link.label || "Add label";
        if (!link.label) text.classList.add("org-chart-link-label-empty");
        const [labelX, labelY] = point((x1 + 3 * c1 + 3 * c2 + x2) / 8, (y1 + y2) / 2);
        text.setAttribute("x", String(labelX));
        text.setAttribute("y", String(labelY - 9));
        if (this.options.editable === true) {
          const index = this.data.links.indexOf(link);
          text.classList.add('org-chart-link-label');
          text.dataset.linkIndex = String(index);
          text.setAttribute('tabindex', '0');
          text.setAttribute('role', 'button');
          text.setAttribute('aria-label', link.label ? `Edit relationship name: ${link.label}` : 'Add relationship name');
          text.addEventListener('click', () => this.editLabel(index, labelX, labelY));
          text.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault(); this.editLabel(index, labelX, labelY);
            }
          });
          if (this.labelEditor?.index === index) this.positionLabelEditor(labelX, labelY);
        }
        group.append(text);
        if (this.options.editable === true) {
          const remove = document.createElementNS(svgNS, 'g');
          remove.classList.add('org-chart-link-remove');
          const removePoint = path.getPointAtLength(path.getTotalLength() * 0.72);
          const restingTransform = `translate(${removePoint.x}, ${removePoint.y})`;
          remove.dataset.restingTransform = restingTransform;
          remove.setAttribute('transform', this.labelEditor?.index === this.data.links.indexOf(link)
            ? `translate(${parseFloat(this.labelEditor.input.style.left) + 240}, ${parseFloat(this.labelEditor.input.style.top) + 18})`
            : restingTransform);
          remove.setAttribute('tabindex', '0');
          remove.setAttribute('role', 'button');
          remove.setAttribute('aria-label', `Remove relationship: ${link.label || 'Unnamed link'}`);
          const hitArea = document.createElementNS(svgNS, 'rect');
          hitArea.setAttribute('x', '-16'); hitArea.setAttribute('y', '-16');
          hitArea.setAttribute('width', '32'); hitArea.setAttribute('height', '32'); hitArea.setAttribute('rx', '16');
          const icon = document.createElementNS(svgNS, 'text');
          icon.textContent = '×'; icon.setAttribute('y', '5'); icon.setAttribute('aria-hidden', 'true');
          remove.append(hitArea, icon);
          const deleteLink = () => {
            const index = this.data.links.indexOf(link);
            if (index < 0) return;
            this.finishLabelEdit(false);
            const data = this.getData();
            data.links.splice(index, 1);
            this.setData(data);
            const next = this.svg.querySelector<SVGElement>(`[data-link-index="${Math.min(index, data.links.length - 1)}"]`);
            (next || this.el).focus({ preventScroll: true });
          };
          // Keep a label editor's blur handler from replacing this control mid-click.
          remove.addEventListener('pointerdown', event => event.preventDefault());
          remove.addEventListener('click', deleteLink);
          remove.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault(); event.stopPropagation(); deleteLink();
            }
          });
          group.append(remove);
        }
      }
    }
  }

  private positionLabelEditor(x: number, y: number): void {
    const input = this.labelEditor!.input;
    input.style.left = `${Math.max(0, x - 110)}px`;
    input.style.top = `${Math.max(0, y - 28)}px`;
  }

  private editLabel(index: number, x: number, y: number): void {
    if (this.options.editable !== true) return;
    this.finishLabelEdit(true);
    const input = element('input', 'org-chart-link-editor');
    input.type = 'text';
    input.value = this.data.links[index].label || '';
    input.maxLength = 80;
    input.setAttribute('aria-label', 'Relationship name');
    this.labelEditor = { index, input };
    this.positionLabelEditor(x, y);
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        this.finishLabelEdit(event.key === 'Enter');
        this.svg.querySelector<SVGTextElement>(`[data-link-index="${index}"]`)?.focus();
      }
    });
    input.addEventListener('blur', () => this.finishLabelEdit(true));
    this.stage.append(input);
    input.focus({ preventScroll: true });
    input.select();
    this.draw();
  }

  private finishLabelEdit(save: boolean): void {
    if (!this.labelEditor) return;
    const { index, input } = this.labelEditor;
    this.labelEditor = undefined;
    const value = input.value.trim();
    input.remove();
    this.svg.querySelectorAll<SVGGElement>('.org-chart-link-remove').forEach(control => control.setAttribute('transform', control.dataset.restingTransform!));
    if (save && this.data.links[index].label !== value) {
      this.data.links[index].label = value;
      this.render();
      this.options.onChange?.(this.getData());
    }
  }

  private startDrag = (event: PointerEvent): void => {
    if (this.options.draggable === false || event.button !== 0 || this.drag) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-team]");
    if (!handle) return;
    const team = this.data.teams.find(team => team.id === handle.dataset.team)!;
    this.drag = { id: team.id, pointer: event.pointerId, x: event.clientX, y: event.clientY, left: team.x, top: team.y, handle };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("is-dragging");
  };

  private moveDrag = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    this.move(this.drag.id, this.drag.left + (event.clientX - this.drag.x) / this.zoom, this.drag.top + (event.clientY - this.drag.y) / this.zoom);
  };

  private endDrag = (): void => {
    if (!this.drag) return;
    const { handle, pointer } = this.drag;
    this.drag = undefined;
    handle.classList.remove("is-dragging");
    if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
    this.options.onChange?.(this.getData());
  };

  private moveWithKeyboard = (event: KeyboardEvent): void => {
    if (this.options.draggable === false) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-team]");
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!handle || !directions[event.key]) return;
    event.preventDefault();
    const team = this.data.teams.find(team => team.id === handle.dataset.team)!;
    const [dx, dy] = directions[event.key];
    const step = event.shiftKey ? 40 : 10;
    this.move(team.id, team.x + dx * step, team.y + dy * step);
    this.options.onChange?.(this.getData());
  };

  private move(id: string, x: number, y: number): void {
    const team = this.data.teams.find(team => team.id === id)!;
    team.x = Math.max(24, Math.round(x));
    team.y = Math.max(24, Math.round(y));
    const panel = this.panels.get(id)!;
    panel.style.left = `${team.x}px`; panel.style.top = `${team.y}px`;
    this.scheduleDraw();
  }
}
