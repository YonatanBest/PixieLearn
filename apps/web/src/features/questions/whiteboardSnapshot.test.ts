import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createWhiteboardSnapshot } from "./whiteboardSnapshot"

describe("createWhiteboardSnapshot", () => {
  let urlCreateObjectUrl: PropertyDescriptor | undefined

  let urlRevokeObjectUrl: PropertyDescriptor | undefined

  let canvasGetContext: PropertyDescriptor | undefined

  let canvasToDataUrl: PropertyDescriptor | undefined

  beforeEach(() => {
    urlCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL")

    urlRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL")

    canvasGetContext = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    )

    canvasToDataUrl = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "toDataURL",
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()

    vi.unstubAllGlobals()

    if (urlCreateObjectUrl)
      Object.defineProperty(URL, "createObjectURL", urlCreateObjectUrl)
    else Reflect.deleteProperty(URL, "createObjectURL")

    if (urlRevokeObjectUrl)
      Object.defineProperty(URL, "revokeObjectURL", urlRevokeObjectUrl)
    else Reflect.deleteProperty(URL, "revokeObjectURL")

    if (canvasGetContext)
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        "getContext",
        canvasGetContext,
      )
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, "getContext")

    if (canvasToDataUrl)
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        "toDataURL",
        canvasToDataUrl,
      )
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, "toDataURL")
  })

  it("returns no image when the learner has not drawn", async () => {
    const imageConstructor = vi.fn()

    vi.stubGlobal("Image", imageConstructor)

    await expect(createWhiteboardSnapshot([])).resolves.toBeNull()

    expect(imageConstructor).not.toHaveBeenCalled()
  })

  it("rasterizes a bounded learner drawing to a JPEG data URL", async () => {
    class ImageMock {
      onload: (() => void) | null = null

      onerror: (() => void) | null = null

      set src(_url: string) {
        this.onload?.()
      }
    }

    vi.stubGlobal("Image", ImageMock)

    const createObjectUrl = vi.fn(() => "blob:whiteboard-svg")

    const revokeObjectUrl = vi.fn()

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    })

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    })

    const drawImage = vi.fn()

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,

      value: () => ({ drawImage }),
    })

    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,

      value: () => "data:image/jpeg;base64,/9j/board",
    })

    const snapshot = await createWhiteboardSnapshot([
      {
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],

        color: "#6f62d9",

        width: 3,
      },
    ])

    expect(snapshot).toBe("data:image/jpeg;base64,/9j/board")

    expect(drawImage).toHaveBeenCalledOnce()

    expect(createObjectUrl).toHaveBeenCalledOnce()

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:whiteboard-svg")
  })

  it("rejects a snapshot larger than the API limit", async () => {
    class ImageMock {
      onload: (() => void) | null = null

      onerror: (() => void) | null = null

      set src(_url: string) {
        this.onload?.()
      }
    }

    vi.stubGlobal("Image", ImageMock)

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:whiteboard-svg"),
    })

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    })

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,

      value: () => ({ drawImage: vi.fn() }),
    })

    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      configurable: true,

      value: () => `data:image/jpeg;base64,${"a".repeat(1_398_200)}`,
    })

    await expect(
      createWhiteboardSnapshot([
        {
          points: [{ x: 0.1, y: 0.2 }],

          color: "#6f62d9",

          width: 3,
        },
      ]),
    ).rejects.toThrow("The whiteboard snapshot is too large to send.")
  })
})
