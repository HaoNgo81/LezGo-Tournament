type ModuleValue = boolean | null;

const qrVersions = [
  { version: 1, size: 21, dataCodewords: 19, errorCodewords: 7 },
  { version: 2, size: 25, dataCodewords: 34, errorCodewords: 10 },
  { version: 3, size: 29, dataCodewords: 55, errorCodewords: 15 },
  { version: 4, size: 33, dataCodewords: 80, errorCodewords: 20 },
  { version: 5, size: 37, dataCodewords: 108, errorCodewords: 26 },
] as const;

export interface QrCodeMatrix {
  size: number;
  modules: boolean[][];
}

export function createShareUrl(origin: string, path = "/qr"): string {
  return new URL(path, normalizeOrigin(origin)).toString();
}

export function createQrCodeMatrix(text: string): QrCodeMatrix {
  const bytes = new TextEncoder().encode(text);
  const config = qrVersions.find((candidate) => bytes.length + 2 <= candidate.dataCodewords);

  if (!config) {
    throw new Error("QR-linket er for langt til den lokale QR-generator.");
  }

  const matrix = createEmptyMatrix(config.size);
  const reserved = createReservedMatrix(config.size);
  addFunctionPatterns(matrix, reserved, config.size);
  const dataCodewords = createDataCodewords(bytes, config.dataCodewords);
  const errorCodewords = createErrorCorrectionCodewords(dataCodewords, config.errorCodewords);
  const bits = [...dataCodewords, ...errorCodewords].flatMap((codeword) => toBits(codeword, 8));

  placeDataBits(matrix, reserved, bits);
  applyMaskZero(matrix, reserved);
  addFormatInformation(matrix, reserved, 1, 0);

  return {
    size: config.size,
    modules: matrix.map((row) => row.map(Boolean)),
  };
}

function normalizeOrigin(origin: string): string {
  return origin.endsWith("/") ? origin : `${origin}/`;
}

function createEmptyMatrix(size: number): ModuleValue[][] {
  return Array.from({ length: size }, () => Array.from<ModuleValue>({ length: size }).fill(null));
}

function createReservedMatrix(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array.from<boolean>({ length: size }).fill(false));
}

function addFunctionPatterns(matrix: ModuleValue[][], reserved: boolean[][], size: number): void {
  addFinderPattern(matrix, reserved, 0, 0);
  addFinderPattern(matrix, reserved, size - 7, 0);
  addFinderPattern(matrix, reserved, 0, size - 7);

  for (let index = 8; index < size - 8; index += 1) {
    setModule(matrix, reserved, index, 6, index % 2 === 0, true);
    setModule(matrix, reserved, 6, index, index % 2 === 0, true);
  }

  setModule(matrix, reserved, 8, size - 8, true, true);
  reserveFormatAreas(reserved, size);
}

function addFinderPattern(matrix: ModuleValue[][], reserved: boolean[][], x: number, y: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const currentX = x + dx;
      const currentY = y + dy;

      if (!isInBounds(matrix.length, currentX, currentY)) {
        continue;
      }

      const isOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const isInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;

      setModule(matrix, reserved, currentX, currentY, (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (isOuter || isInner)), true);
    }
  }
}

function reserveFormatAreas(reserved: boolean[][], size: number): void {
  for (let index = 0; index <= 8; index += 1) {
    if (index !== 6) {
      reserved[8][index] = true;
      reserved[index][8] = true;
    }
  }

  for (let index = 0; index < 8; index += 1) {
    reserved[8][size - 1 - index] = true;
    reserved[size - 1 - index][8] = true;
  }
}

function setModule(matrix: ModuleValue[][], reserved: boolean[][], x: number, y: number, value: boolean, reserve: boolean): void {
  matrix[y][x] = value;
  reserved[y][x] = reserve;
}

function isInBounds(size: number, x: number, y: number): boolean {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function createDataCodewords(bytes: Uint8Array, capacity: number): number[] {
  const bits = [
    ...toBits(0b0100, 4),
    ...toBits(bytes.length, 8),
    ...[...bytes].flatMap((byte) => toBits(byte, 8)),
  ];
  const maxBits = capacity * 8;
  const terminatorLength = Math.min(4, maxBits - bits.length);

  bits.push(...Array.from<number>({ length: terminatorLength }).fill(0));

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords: number[] = [];

  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(fromBits(bits.slice(index, index + 8)));
  }

  for (let padIndex = 0; codewords.length < capacity; padIndex += 1) {
    codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return codewords;
}

function placeDataBits(matrix: ModuleValue[][], reserved: boolean[][], bits: number[]): void {
  const size = matrix.length;
  let bitIndex = 0;
  let upward = true;

  for (let rightColumn = size - 1; rightColumn > 0; rightColumn -= 2) {
    if (rightColumn === 6) {
      rightColumn -= 1;
    }

    for (let verticalIndex = 0; verticalIndex < size; verticalIndex += 1) {
      const y = upward ? size - 1 - verticalIndex : verticalIndex;

      for (let dx = 0; dx < 2; dx += 1) {
        const x = rightColumn - dx;

        if (reserved[y][x]) {
          continue;
        }

        matrix[y][x] = bits[bitIndex] === 1;
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function applyMaskZero(matrix: ModuleValue[][], reserved: boolean[][]): void {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (!reserved[y][x] && (x + y) % 2 === 0) {
        matrix[y][x] = !matrix[y][x];
      }
    }
  }
}

function addFormatInformation(matrix: ModuleValue[][], reserved: boolean[][], errorCorrectionLevel: number, maskPattern: number): void {
  const size = matrix.length;
  const bits = toBits(createFormatBits(errorCorrectionLevel, maskPattern), 15).reverse();
  const firstPositions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const secondPositions = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];

  for (let index = 0; index < bits.length; index += 1) {
    const [x1, y1] = firstPositions[index];
    const [x2, y2] = secondPositions[index];

    setModule(matrix, reserved, x1, y1, bits[index] === 1, true);
    setModule(matrix, reserved, x2, y2, bits[index] === 1, true);
  }
}

function createFormatBits(errorCorrectionLevel: number, maskPattern: number): number {
  let value = ((errorCorrectionLevel & 0b11) << 3) | (maskPattern & 0b111);
  value <<= 10;

  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((value >> bit) & 1) === 1) {
      value ^= 0b10100110111 << (bit - 10);
    }
  }

  return ((((errorCorrectionLevel & 0b11) << 3) | (maskPattern & 0b111)) << 10 | value) ^ 0b101010000010010;
}

function createErrorCorrectionCodewords(dataCodewords: number[], errorCodewordCount: number): number[] {
  const generator = createGeneratorPolynomial(errorCodewordCount);
  const message = [...dataCodewords, ...Array.from<number>({ length: errorCodewordCount }).fill(0)];

  for (let index = 0; index < dataCodewords.length; index += 1) {
    const coefficient = message[index];

    if (coefficient === 0) {
      continue;
    }

    for (let generatorIndex = 0; generatorIndex < generator.length; generatorIndex += 1) {
      message[index + generatorIndex] ^= gfMultiply(generator[generatorIndex], coefficient);
    }
  }

  return message.slice(message.length - errorCodewordCount);
}

function createGeneratorPolynomial(degree: number): number[] {
  let polynomial = [1];

  for (let index = 0; index < degree; index += 1) {
    polynomial = multiplyPolynomials(polynomial, [1, gfPow(2, index)]);
  }

  return polynomial;
}

function multiplyPolynomials(left: number[], right: number[]): number[] {
  const result = Array.from<number>({ length: left.length + right.length - 1 }).fill(0);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      result[leftIndex + rightIndex] ^= gfMultiply(left[leftIndex], right[rightIndex]);
    }
  }

  return result;
}

function gfPow(value: number, power: number): number {
  let result = 1;

  for (let index = 0; index < power; index += 1) {
    result = gfMultiply(result, value);
  }

  return result;
}

function gfMultiply(left: number, right: number): number {
  let result = 0;
  let currentLeft = left;
  let currentRight = right;

  while (currentRight > 0) {
    if ((currentRight & 1) !== 0) {
      result ^= currentLeft;
    }

    currentLeft <<= 1;
    if ((currentLeft & 0x100) !== 0) {
      currentLeft ^= 0x11d;
    }

    currentRight >>= 1;
  }

  return result;
}

function toBits(value: number, length: number): number[] {
  return Array.from({ length }, (_, index) => (value >> (length - 1 - index)) & 1);
}

function fromBits(bits: number[]): number {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}
