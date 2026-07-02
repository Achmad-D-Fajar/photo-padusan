declare module "piexifjs" {
  type IfdValue = string | number | number[] | number[][] | Uint8Array;

  interface ExifObj {
    "0th": Record<number, IfdValue>;
    Exif: Record<number, IfdValue>;
    GPS: Record<number, IfdValue>;
    Interop: Record<number, IfdValue>;
    "1st": Record<number, IfdValue>;
    thumbnail: string | null;
  }

  const ImageIFD: {
    readonly ImageDescription: 270;
    readonly Make: 271;
    readonly Model: 272;
    readonly Software: 305;
    readonly DateTime: 306;
    readonly Artist: 315;
    readonly Copyright: 33432;
  };

  const ExifIFD: {
    readonly DateTimeOriginal: 36867;
    readonly DateTimeDigitized: 36868;
    readonly UserComment: 37510;
    readonly ColorSpace: 40961;
    readonly PixelXDimension: 40962;
    readonly PixelYDimension: 40963;
  };

  function load(jpegBinaryString: string): ExifObj;
  function dump(exifObj: ExifObj): string;
  function insert(exifBytes: string, jpegBinaryString: string): string;
  function remove(jpegBinaryString: string): string;
}