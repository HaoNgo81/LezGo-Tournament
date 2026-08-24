import qrcode from "qrcode-generator";

export interface QrCodeMatrix {
  size: number;
  modules: boolean[][];
  payload: string;
}

export function createShareUrl(origin: string, path = "/qr"): string {
  return new URL(path, normalizeOrigin(origin)).toString();
}

export function createQrCodeMatrix(text: string): QrCodeMatrix {
  const qrCode = qrcode(0, "M");
  qrCode.addData(text);
  qrCode.make();
  const size = qrCode.getModuleCount();

  return {
    size,
    modules: Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => qrCode.isDark(y, x)),
    ),
    payload: text,
  };
}

function normalizeOrigin(origin: string): string {
  return origin.endsWith("/") ? origin : `${origin}/`;
}
