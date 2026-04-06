import Tesseract from 'tesseract.js';
import { ExtractedDetails } from '@/types/product';

/** Minimum long edge for label text (FSSAI digits) to decode reliably */
const TARGET_LONG_EDGE = 2400;

let cachedWorker: Tesseract.Worker | null = null;
let prewarmPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (cachedWorker) return cachedWorker;
  if (prewarmPromise) return prewarmPromise;
  prewarmPromise = (async () => {
    const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY);
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    cachedWorker = worker;
    return worker;
  })();
  return prewarmPromise;
}

export function prewarmOCR(): void {
  void getWorker();
}

function loadImageToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const revoke = () => URL.revokeObjectURL(url);

    img.onload = () => {
      const maxDim = Math.max(img.width, img.height);
      const scale = Math.max(1, TARGET_LONG_EDGE / maxDim);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        revoke();
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      revoke();
      resolve({ canvas });
    };

    img.onerror = () => {
      revoke();
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function grayAndHistogramStretch(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const gray = new Uint8Array((width * height) | 0);
  let min = 255;
  let max = 0;
  let gIdx = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[gIdx++] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = max - min || 1;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(((gray[i] - min) / range) * 255);
  }
  return gray;
}

function applyGrayToImageData(imageData: ImageData, gray: Uint8Array): void {
  const { data } = imageData;
  let j = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = gray[j++];
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
}

function otsuThreshold(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between >= maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

async function canvasToPngDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL('image/png');
}

/** Grayscale + histogram stretch — usually better for LSTM than harsh global binarize */
async function preprocessEnhanced(file: File): Promise<string> {
  const { canvas } = await loadImageToCanvas(file);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = grayAndHistogramStretch(imageData);
  // Mild contrast curve (lift mids)
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] / 255;
    const adj = Math.max(0, Math.min(1, (v - 0.5) * 1.25 + 0.5));
    gray[i] = Math.round(adj * 255);
  }
  applyGrayToImageData(imageData, gray);
  ctx.putImageData(imageData, 0, 0);
  return canvasToPngDataUrl(canvas);
}

/** Adaptive binarize (Otsu) — helps when label is low-contrast */
async function preprocessBinary(file: File): Promise<string> {
  const { canvas } = await loadImageToCanvas(file);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = grayAndHistogramStretch(imageData);
  const thr = otsuThreshold(gray);
  const data = imageData.data;
  let gi = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = gray[gi++] > thr ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvasToPngDataUrl(canvas);
}

function toDigits(s: string): string {
  return s
    .replace(/[oOQ]/g, '0')
    .replace(/[lI|!]/g, '1')
    .replace(/[sS]/g, '5')
    .replace(/[bB]/g, '8')
    .replace(/[zZ]/g, '2')
    .replace(/[gG]/g, '6')
    .replace(/[tT]/g, '7')
    .replace(/\D/g, '');
}

function coerceFssaiDigits(digits: string): string | undefined {
  const d = digits.replace(/\D/g, '');
  if (d.length < 12 || d.length > 16) return undefined;
  if (d.length === 14) return d;
  if (d.length === 12 || d.length === 13) return d.padStart(14, '0');
  if (d.length === 15) return d.slice(0, 14);
  if (d.length === 16) return d.slice(0, 14);
  return d.slice(-14);
}

function addCandidate(set: Set<string>, digits: string | undefined): void {
  const c = coerceFssaiDigits(digits ?? '');
  if (c && c.length === 14) set.add(c);
}

function scoreFssaiGuess(d: string): number {
  let s = 0;
  if (d.startsWith('1')) s += 3;
  if (/^[1-2]\d{13}$/.test(d)) s += 2;
  return s;
}

function pickBestFssai(candidates: Set<string>): string | undefined {
  if (candidates.size === 0) return undefined;
  return [...candidates].sort((a, b) => scoreFssaiGuess(b) - scoreFssaiGuess(a))[0];
}

function extractNearFssaiKeyword(text: string, candidates: Set<string>): void {
  const re = /fssai[^\d]{0,40}/gi;
  let m: RegExpExecArray | null;
  const hay = text;
  while ((m = re.exec(hay))) {
    const start = m.index + m[0].length;
    const slice = hay.slice(start, start + 80);
    const digits = toDigits(slice);
    addCandidate(candidates, digits);
  }
}

function extractFSSAINumber(text: string): string | undefined {
  const raw = text.replace(/\r\n/g, '\n');
  const normalizedLineBreaks = raw.replace(/\s+/g, ' ');
  const confusableNormalized = normalizedLineBreaks
    .replace(/[oOQ]/g, '0')
    .replace(/[lI|!]/g, '1');

  const candidates = new Set<string>();

  extractNearFssaiKeyword(raw, candidates);
  extractNearFssaiKeyword(confusableNormalized, candidates);

  const contextPatterns: RegExp[] = [
    /FSSAI\s*(?:Lic(?:ense|\.?)?\s*(?:No\.?|Number|#)?\s*)?[:\s.-]*([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gi,
    /FSSAI\s*(?:Reg\.?\s*No\.?|Registration\s*No\.?)?\s*[:\s.-]*([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gi,
    /(?:^|\n)\s*Lic(?:ense|ence)?\.?\s*(?:No\.?|Number|#)?\s*[:\s.-]*([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gim,
    /(?:^|\n)\s*(?:License|Licence)\s*(?:No\.?|Number)?\s*[:\s.-]*([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gim,
    /(?:Reg(?:istration)?\.?\s*(?:No\.?|#)?\s*[:\s.-]*)([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gi,
    /(?:Food\s*)?(?:Safety\s*)?(?:Standards?\s*)?(?:Lic\.?\s*No\.?)\s*[:\s.-]*([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gi,
    /(?:F\.?S\.?S\.?A\.?I\.?\s*[:\s#.-]*)([\d\sOoQlI|!sSbBzZgGtT.-]{10,28})/gi,
  ];

  for (const pattern of contextPatterns) {
    pattern.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = pattern.exec(raw))) addCandidate(candidates, toDigits(mm[1]));
    pattern.lastIndex = 0;
    while ((mm = pattern.exec(confusableNormalized))) addCandidate(candidates, toDigits(mm[1]));
  }

  // Digit clusters that look like spaced FSSAI lines
  const cluster = /(?:\d[\d\s.\-_oOlI|!sSbBzZgGtT]){12,40}/g;
  for (const src of [raw, confusableNormalized]) {
    cluster.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = cluster.exec(src))) addCandidate(candidates, toDigits(cm[0]));
  }

  // Pure digit runs (fallback)
  const runs = raw.match(/\d[\d\s]{10,40}\d/g) ?? [];
  for (const block of runs) addCandidate(candidates, toDigits(block));

  return pickBestFssai(candidates);
}

const PRODUCT_SKIP =
  /^(license|fssai|lic\.?|batch|b\.?no|mfg|manufactured|packed|marketed|ingredients|weight|mrp|net\s*w|best\s*before|use\s*by|exp\.?|date|reg|nutritional|storage|contains|allergen|address|for\s*customer|customer\s*care|imported|distributed|\d{6,}|www\.|http)/i;

function cleanProductLine(s: string): string {
  return s
    .replace(/[|_~`®™©•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—\s.,]+|[:\-–—\s.,]+$/g, '')
    .trim();
}

function isReasonableProductName(s: string): boolean {
  if (s.length < 3 || s.length > 120) return false;
  const letters = s.replace(/[^a-zA-Z]/g, '').length;
  if (letters < 3) return false;
  if (/^\d[\d\s,/%-]*$/.test(s)) return false;
  if (/^\d{10,}$/.test(s.replace(/\s/g, ''))) return false;
  if (PRODUCT_SKIP.test(s)) return false;
  return true;
}

function extractProductName(text: string): string | undefined {
  const raw = text.replace(/\r\n/g, '\n');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const labelKeyOnly =
    /^(?:Product|Brand|Food)\s*Name\s*$|^(?:Name|Type)\s*of\s*(?:the\s*)?(?:Food|Product)\s*$|^Product\s*Type\s*$|^Article\s*Name\s*$/i;

  for (let i = 0; i < lines.length - 1; i++) {
    if (labelKeyOnly.test(lines[i])) {
      const candidate = cleanProductLine(lines[i + 1]);
      if (isReasonableProductName(candidate)) return candidate;
    }
  }

  const inlinePatterns: RegExp[] = [
    /(?:Product|Brand)\s*Name\s*[:.\-–]?\s*(.+?)(?=\n{2,}|\n\s*(?:FSSAI|Batch|Mfg|Lic|Ingredients|Net|Mrp|Weight)\b|$)/is,
    /Name\s*of\s*(?:the\s*)?(?:Food|Product)\s*[:.\-–]?\s*(.+?)(?=\n{2,}|\n\s*(?:FSSAI|Batch|Mfg)\b|$)/is,
    /(?:^|\n)\s*(?:Food|Item)\s*Name\s*[:.\-–]?\s*(.+?)(?=\n|$)/is,
    /(?:^|\n)\s*(?:ITEM|ARTICLE)\s*(?:DESCRIPTION|NAME)?\s*[:.\-–]?\s*(.+?)(?=\n|$)/is,
    /(?:Marketing|Trade)\s*Name\s*[:.\-–]?\s*(.+?)(?=\n|$)/is,
  ];

  for (const p of inlinePatterns) {
    const m = raw.match(p);
    if (m) {
      const name = cleanProductLine(m[1]);
      const firstLine = name.split('\n')[0]?.trim() ?? name;
      if (isReasonableProductName(firstLine)) return firstLine;
      if (isReasonableProductName(name)) return name;
    }
  }

  const skipLine =
    /^(license|fssai|batch|mfg|manufactured|packed|ingredients|weight|mrp|net\s*w|best\s*before|use\s*by|date|reg|nutritional|storage|contains|allergen|m\.r\.p|\d{8,})/i;

  const capsLines = lines.filter(
    (l) =>
      l.replace(/[^a-zA-Z]/g, '').length > 2 &&
      l.replace(/[^a-zA-Z]/g, '') === l.replace(/[^a-zA-Z]/g, '').toUpperCase() &&
      !skipLine.test(l) &&
      !/^\d+[\s.,-]*$/.test(l) &&
      l.length < 80,
  );

  for (const line of capsLines.slice(0, 8)) {
    const cleaned = cleanProductLine(line);
    if (isReasonableProductName(cleaned)) return cleaned;
  }

  for (const line of lines.slice(0, 15)) {
    if (skipLine.test(line) || line.length < 3 || line.length > 100) continue;
    if (/^[\d\s./%-]+$/.test(line)) continue;
    const cleaned = cleanProductLine(line);
    if (isReasonableProductName(cleaned)) return cleaned;
  }

  return undefined;
}

function extractManufacturer(text: string): string | undefined {
  const raw = text.replace(/\r\n/g, '\n');
  const patterns = [
    /(?:Mfg\.?\s*(?:by)?|Manufactured\s*by|Packed\s*by|Marketed\s*by)\s*[.:-]?\s*(.+?)(?:\n|,\s*(?:Plot|Survey|At\s*Address|Address|Tel|Ph\.?|Dist\.?)\b)/is,
    /(?:Mfg\.?\s*(?:by)?|Manufactured\s*by|Packed\s*by|Marketed\s*by)\s*[.:-]?\s*(.+?)(?=\n\n|\nFSSAI|\nBatch|\nLic|\nMRP|$)/is,
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (m) {
      let name = cleanProductLine(m[1].split('\n')[0]);
      name = name.replace(/\s*(?:Plot|Survey|Village|Dist|At|Address|India)\b.*$/i, '').trim();
      if (name.length > 2 && name.length < 120) return name;
    }
  }
  return undefined;
}

function mergeOcrPasses(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join('\n---ocr-pass---\n');
}

export async function performOCR(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<{ details: ExtractedDetails; rawText: string }> {
  onProgress?.('Preparing enhanced image...');
  const enhancedDataUrl = await preprocessEnhanced(file);
  onProgress?.('Preparing high-contrast image...');
  const binaryDataUrl = await preprocessBinary(file);

  onProgress?.('Running OCR (layout)...');
  const worker = await getWorker();

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  const r1 = await worker.recognize(enhancedDataUrl);

  onProgress?.('Running OCR (sparse text)...');
  await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
  const r2 = await worker.recognize(enhancedDataUrl);

  onProgress?.('Running OCR (block)...');
  await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
  const r3 = await worker.recognize(binaryDataUrl);

  await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });

  const merged = mergeOcrPasses([r1.data.text, r2.data.text, r3.data.text]);

  const licenseFromMerged = extractFSSAINumber(merged);
  const licenseFromR1 = extractFSSAINumber(r1.data.text);

  const details: ExtractedDetails = {
    licenseNumber: licenseFromMerged ?? licenseFromR1,
    manufacturer: extractManufacturer(merged) ?? extractManufacturer(r1.data.text),
    productName: extractProductName(merged) ?? extractProductName(r1.data.text),
  };

  return { details, rawText: merged };
}
