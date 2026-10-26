// src/utils/configTransfer.ts

import * as pako from "pako";

// 文字列からSHA-256 Checksumを生成
export const calculateChecksum = async (
  value: string
): Promise<string> => {
  const data =
    new TextEncoder().encode(value);

  const hashBuffer =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hashBuffer)
  )
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
};

// 文字列をgzip圧縮
export const compressText = async (
  text: string
): Promise<Uint8Array> => {
  const bytes =
    new TextEncoder().encode(text);

  return pako.gzip(bytes);
};

// gzip圧縮データを文字列へ展開
export const decompressText = async (
  bytes: Uint8Array
): Promise<string> => {
  const decompressed =
    pako.ungzip(bytes);

  return new TextDecoder().decode(
    decompressed
  );
};

// src/utils/configTransfer.ts

// Uint8ArrayをBase64文字列へ変換
export const bytesToBase64 = (
  bytes: Uint8Array
): string => {
  let binary = "";

  const blockSize = 8192;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += blockSize
  ) {
    const block =
      bytes.subarray(
        offset,
        offset + blockSize
      );

    binary +=
      String.fromCharCode(...block);
  }

  return btoa(binary);
};

// Base64文字列をUint8Arrayへ変換
export const base64ToBytes = (
  base64: string
): Uint8Array => {
  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
};