import { afterEach, describe, expect, it, vi } from "vitest";
import { AVATAR_IMAGE_SIZE, createAvatarImage, MAX_AVATAR_FILE_SIZE } from "./avatar";

describe("profile avatar image processing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects unsupported images and files larger than 100 KB", async () => {
    const createImageBitmapMock = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    await expect(createAvatarImage(new File(["text"], "avatar.gif", { type: "image/gif" })))
      .rejects.toThrow("Choose a JPEG, PNG, or WebP image.");
    await expect(createAvatarImage(new File(
      [new Uint8Array(MAX_AVATAR_FILE_SIZE + 1)],
      "avatar.png",
      { type: "image/png" },
    ))).rejects.toThrow("Profile pictures must be 100 KB or smaller.");
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("crops the image to a centered 32-pixel square avatar", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
      width: 80,
      height: 60,
      close,
    }));
    const createdCanvas: { value?: HTMLCanvasElement } = {};
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (this: HTMLCanvasElement) {
        createdCanvas.value = this;
        return { drawImage };
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,avatar");

    const image = await createAvatarImage(new File(["image"], "avatar.png", { type: "image/png" }));

    expect(createdCanvas.value?.width).toBe(AVATAR_IMAGE_SIZE);
    expect(createdCanvas.value?.height).toBe(AVATAR_IMAGE_SIZE);
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 80, height: 60 }),
      10,
      0,
      60,
      60,
      0,
      0,
      AVATAR_IMAGE_SIZE,
      AVATAR_IMAGE_SIZE,
    );
    expect(image).toBe("data:image/png;base64,avatar");
    expect(close).toHaveBeenCalledOnce();
  });
});
