export const MAX_AVATAR_FILE_SIZE = 100 * 1024;
export const AVATAR_IMAGE_SIZE = 30;

const supportedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function createAvatarImage(file: File): Promise<string> {
  if (!supportedAvatarTypes.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_AVATAR_FILE_SIZE) {
    throw new Error("Profile pictures must be 100 KB or smaller.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be opened. Choose a valid image file.");
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - side) / 2;
    const sourceY = (bitmap.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_IMAGE_SIZE;
    canvas.height = AVATAR_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Profile picture processing is unavailable in this browser.");
    context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, AVATAR_IMAGE_SIZE, AVATAR_IMAGE_SIZE);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
