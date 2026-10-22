import { crc32, deflateSync } from 'zlib';

export function encodePng(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 3 | 4,
): Buffer {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new Error('Image dimensions are not valid.');
  }
  const rowBytes = width * channels;
  if (pixels.length < rowBytes * height) {
    throw new Error('Image data is incomplete.');
  }

  const raw = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y += 1) {
    const offset = y * (rowBytes + 1);
    raw[offset] = 0;
    const start = y * rowBytes;
    for (let byte = 0; byte < rowBytes; byte += 1) {
      raw[offset + 1 + byte] = pixels[start + byte];
    }
  }

  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(Number(crc32(Buffer.concat([name, data]))) >>> 0, 0);
  return Buffer.concat([length, name, data, checksum]);
}
