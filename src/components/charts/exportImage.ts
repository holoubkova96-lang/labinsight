/**
 * Uloží část stránky (kartu grafu nebo celý dashboard) jako obrázek PNG.
 * Prvky s atributem data-no-export (tlačítka, křížky u filtrů) se do obrázku nedostanou.
 */
export async function saveElementAsPng(node: HTMLElement, fileName: string): Promise<void> {
  const { domToPng } = await import('modern-screenshot'); // knihovna se načte až při prvním exportu
  const url = await domToPng(node, {
    scale: 2,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
  });
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}
