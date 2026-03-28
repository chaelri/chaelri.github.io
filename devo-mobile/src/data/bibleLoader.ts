// Bible data loader
// We load the full JSON once and cache it in memory.
// On web, require() should work for JSON files bundled by Metro.

let nasbData: any = null;
let easyData: any = null;

export function getNASB(): any {
  if (!nasbData) {
    nasbData = require('../../assets/data/nasb2020.json');
  }
  return nasbData;
}

export function getEASY(): any {
  if (!easyData) {
    easyData = require('../../assets/data/easy2024.json');
  }
  return easyData;
}

export function getVerses(
  version: 'NASB' | 'EASY',
  bookName: string,
  chapter: number
): Record<string, string> {
  const data = version === 'NASB' ? getNASB() : getEASY();
  if (!data) return {};
  const bookData = data[bookName] || data[bookName.toUpperCase()];
  if (!bookData) return {};
  return bookData[String(chapter)] || {};
}
