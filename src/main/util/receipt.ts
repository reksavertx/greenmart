// Builder HTML struk thermal 58/80mm (v1.0.1) — dicetak via window tersembunyi + dialog print.
import type { ReceiptData } from '@shared/types';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

const nf = new Intl.NumberFormat('id-ID');

/** Baris item: nama di baris sendiri, lalu "qty x harga ........ subtotal". */
export function buildReceiptHtml(d: ReceiptData): string {
  const itemLines = d.items
    .map(
      (it) => `
      <div class="line name">${esc(it.name)}</div>
      <div class="line"><span>${it.qty} x ${nf.format(it.price)}</span><span>${nf.format(it.subtotal)}</span></div>`,
    )
    .join('');

  const cashierBlock = d.cashiers.length
    ? `<div class="sep"></div>
       <div class="line"><span>Kasir jaga:</span></div>
       <div class="line center bold">${esc(d.cashiers.join(', '))}</div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Struk ${esc(d.code)}</title><style>
    @page { size: ${d.widthMm}mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { width: ${d.widthMm}mm; font-family: 'Courier New', monospace; font-size: 10px; color: #000; }
    .receipt { padding: 3mm 2mm 4mm; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .logo { display: block; margin: 0 auto 2mm; width: 16mm; height: 16mm; object-fit: contain; }
    .store { font-size: 13px; font-weight: bold; text-align: center; letter-spacing: 0.5px; }
    .meta { text-align: center; font-size: 9px; margin-bottom: 2mm; }
    .sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
    .line { display: flex; justify-content: space-between; gap: 2mm; line-height: 1.5; }
    .line.name { font-weight: bold; }
    .total { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin: 1mm 0; }
    .thanks { text-align: center; margin-top: 2mm; font-size: 9px; }
  </style></head><body><div class="receipt">
    ${d.logoDataUri ? `<img class="logo" src="${d.logoDataUri}" alt="logo" />` : ''}
    <div class="store">${esc(d.storeName)}</div>
    <div class="meta">${esc(d.code)} · ${esc(d.soldAt)}</div>
    <div class="sep"></div>
    ${itemLines}
    <div class="sep"></div>
    <div class="total"><span>TOTAL</span><span>Rp${nf.format(d.total)}</span></div>
    <div class="line"><span>${d.itemCount} item</span><span>Tunai</span></div>
    ${cashierBlock}
    <div class="sep"></div>
    <div class="thanks">Terima kasih telah berbelanja 🌱</div>
  </div></body></html>`;
}
