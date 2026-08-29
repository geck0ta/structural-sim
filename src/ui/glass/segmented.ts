// §14 — segmented control iOS: pill geser spring (Apple ease). Vanilla, keyboard, aria.

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export class SegmentedControl<T extends string> {
  private readonly buttons: HTMLButtonElement[] = [];
  private selected: T;

  constructor(
    private readonly options: readonly SegmentOption<T>[],
    initial: T,
    private readonly onChange: (v: T) => void,
  ) {
    this.selected = initial;
    const root = document.createElement('div');
    root.className = 'segmented';
    root.setAttribute('role', 'tablist');
    const pill = document.createElement('div');
    pill.className = 'segmented-pill';
    root.append(pill);

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'segmented-btn';
      btn.textContent = opt.label;
      btn.setAttribute('role', 'tab');
      const on = opt.value === initial;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      btn.addEventListener('click', () => this.select(opt.value));
      this.buttons.push(btn);
      root.append(btn);
    }

    root.addEventListener('keydown', (e) => {
      const i = this.options.findIndex((o) => o.value === this.selected);
      let next: number;
      if (e.key === 'ArrowRight') next = (i + 1) % this.options.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + this.options.length) % this.options.length;
      else return;
      e.preventDefault();
      this.select(this.options[next].value);
      this.buttons[next].focus();
    });

    this.rootEl = root;
    this.pillEl = pill;
    requestAnimationFrame(() => this.movePill(false));
  }

  private readonly rootEl: HTMLDivElement;
  private readonly pillEl: HTMLDivElement;

  select(value: T): void {
    this.selected = value;
    this.buttons.forEach((b, i) => {
      const on = this.options[i].value === value;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    this.movePill(true);
    this.onChange(value);
  }

  private movePill(animate: boolean): void {
    const i = this.options.findIndex((o) => o.value === this.selected);
    const btn = this.buttons[i];
    if (!btn) return;
    this.pillEl.style.transition = animate ? 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    this.pillEl.style.transform = `translateX(${btn.offsetLeft}px)`;
    this.pillEl.style.width = `${btn.offsetWidth}px`;
  }

  get el(): HTMLDivElement {
    return this.rootEl;
  }
}
