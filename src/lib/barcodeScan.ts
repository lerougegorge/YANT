export function hasNativeBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

/** Live-scans a video stream with the native BarcodeDetector, resolving on the first hit. */
export function scanVideoStream(
  video: HTMLVideoElement,
  onResult: (value: string) => void,
  onError: (message: string) => void
): () => void {
  let stopped = false;
  let raf = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Detector = (window as any).BarcodeDetector;
  const detector = new Detector({ formats: BARCODE_FORMATS });

  async function tick() {
    if (stopped) return;
    try {
      const results = await detector.detect(video);
      if (results.length > 0 && results[0].rawValue) {
        onResult(results[0].rawValue);
        return;
      }
    } catch {
      // transient decode errors are expected mid-stream; keep trying
    }
    raf = requestAnimationFrame(tick);
  }

  tick().catch((e) => onError(String(e)));

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export async function startCameraStream(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  await video.play();
  return stream;
}

/** Decodes a barcode from a still photo using zxing-wasm (for browsers without BarcodeDetector, e.g. iOS Safari/Firefox). */
export async function decodeBarcodeFromFile(file: File): Promise<string | null> {
  const { readBarcodesFromImageFile } = await import('zxing-wasm/reader');
  const results = await readBarcodesFromImageFile(file, { tryHarder: true, formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128', 'Code39', 'QRCode'] });
  return results[0]?.text ?? null;
}

export function vibrateOnScan(): void {
  navigator.vibrate?.(50);
}
