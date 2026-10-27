/** Format rupiah tanpa desimal: 12500 -> "Rp12.500" */
export function rupiah(n: number): string {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(n));
}
