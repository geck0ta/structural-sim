// §14 — picker iOS: tombol gaya select + bottom sheet glass. Pengganti <select> native.

export interface PickerOption {
  readonly id: string;
  readonly label: string;
}

export class IOSPicker {
  private cur: string;
  private sheet: HTMLDivElement | null = null;
  readonly el: HTMLButtonElement;

  constructor(
    private readonly options: readonly PickerOption[],
    initial: string,
    private readonly onPick: (id: string) => void,
    private readonly title: string,
  ) {
    this.cur = initial;
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'picker-btn';
    this.el.textContent = this.text(initial);
    this.el.addEventListener('click', () => this.open());
  }

  private text(id: string): string {
    return this.options.find((o) => o.id === id)?.label ?? id;
  }

  private open(): void {
    if (this.sheet) return;
    const sheet = document.createElement('div');
    sheet.className = 'picker-sheet';
    const card = document.createElement('div');
    card.className = 'picker-card glass';
    const t = document.createElement('div');
    t.className = 'picker-title';
    t.textContent = this.title;
    card.append(t);
    for (const o of this.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'picker-opt' + (o.id === this.cur ? ' cur' : '');
      b.textContent = o.label;
      b.addEventListener('click', () => {
        this.select(o.id);
        this.close();
      });
      card.append(b);
    }
    sheet.append(card);
    // Anchor dropdown: card fixed tepat di bawah tombol pemicu (bukan bottom sheet tengah).
    const r = this.el.getBoundingClientRect();
    card.style.position = 'fixed';
    card.style.top = `${Math.min(r.bottom + 6, window.innerHeight - 80)}px`;
    card.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 260))}px`;
    card.style.width = `${Math.max(r.width, 240)}px`;
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    }, { once: true });
    document.body.append(sheet);
    this.sheet = sheet;
  }

  private close(): void {
    this.sheet?.remove();
    this.sheet = null;
  }

  select(id: string): void {
    this.cur = id;
    this.el.textContent = this.text(id);
    this.onPick(id);
  }
}
