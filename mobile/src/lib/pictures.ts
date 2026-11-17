// Choosing a picture from the phone and getting it ready to upload.

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export interface Picture {
  /** Where the picture is on this phone. */
  uri: string;
  width: number;
  height: number;
}

/**
 * Lets the person choose one picture from their phone. Resolves with null when they back out.
 * `square` asks the phone's own cropper for a square, where the phone has one.
 */
export async function pickPicture(square = false): Promise<Picture | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/** The largest centred square inside a picture of this size. */
export function centreSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
}

/** The size a picture becomes when its longer side is brought down to `max`. Never made bigger. */
export function fitWithin(width: number, height: number, max: number) {
  const longer = Math.max(width, height);
  if (longer <= max) return { width, height };
  const scale = max / longer;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A square JPEG of the picture's middle, `side` pixels across at most. For logos. */
export async function squareJpeg(picture: Picture, side: number): Promise<Picture> {
  const crop = centreSquare(picture.width, picture.height);
  const image = await ImageManipulator.manipulate(picture.uri)
    .crop(crop)
    .resize({ width: Math.min(side, crop.width) })
    .renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** A JPEG of the whole picture with its longer side brought down to `max`. For pictures in posts. */
export async function fittedJpeg(picture: Picture, max: number): Promise<Picture> {
  const size = fitWithin(picture.width, picture.height, max);
  const image = await ImageManipulator.manipulate(picture.uri).resize({ width: size.width }).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Reads a picture on this phone into bytes, ready to upload. */
export async function pictureBytes(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}
