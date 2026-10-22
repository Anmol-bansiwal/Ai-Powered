import { encodePng } from './pdf-png';

describe('PNG encoding', () => {
  it('writes a PNG header for raw RGB pixels', () => {
    const png = encodePng(Uint8ClampedArray.from([255, 0, 0]), 1, 1, 3);

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(png.subarray(12, 16).toString()).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(1);
    expect(png.readUInt32BE(20)).toBe(1);
  });
});
