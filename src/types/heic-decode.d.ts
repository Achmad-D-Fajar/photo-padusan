declare module "heic-decode" {
  interface DecodedImage { width: number; height: number; data: Uint8ClampedArray; }
  interface ImageHandle { width: number; height: number; decode(): Promise<DecodedImage>; }
  interface ImageCollection extends Array<ImageHandle> { dispose(): void; }
  function decode(options: { buffer: Uint8Array }): Promise<DecodedImage>;
  namespace decode { function all(options: { buffer: Uint8Array }): Promise<ImageCollection>; }
  export = decode;
}
