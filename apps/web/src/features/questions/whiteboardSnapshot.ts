import type { WhiteboardStroke } from "../documents/learningProgress"

const snapshotWidth = 960

const snapshotHeight = 576

const maxEncodedImageLength = 1_398_200

const boardColors = new Set(["#6f62d9", "#d75d51", "#318b72"])

function createSvg(strokes: WhiteboardStroke[]): string | null {
  const polylines = strokes.flatMap((stroke) => {
    if (!boardColors.has(stroke.color) || !Number.isFinite(stroke.width))
      return []

    const points = stroke.points

      .filter(
        (point) =>
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= 0 &&
          point.x <= 1 &&
          point.y >= 0 &&
          point.y <= 1,
      )

      .filter(
        (_point, index, all) =>
          index % Math.ceil(all.length / 80) === 0 || index === all.length - 1,
      )

    if (!points.length) return []

    const pointList = points

      .map((point) => `${point.x * snapshotWidth},${point.y * snapshotHeight}`)

      .join(" ")

    const width = Math.max(1, Math.min(20, stroke.width))

    return [
      `<polyline points="${pointList}" fill="none" stroke="${stroke.color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ]
  })

  if (!polylines.length) return null

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${snapshotWidth}" height="${snapshotHeight}" viewBox="0 0 ${snapshotWidth} ${snapshotHeight}"><rect width="100%" height="100%" fill="#ffffff"/>${polylines.join("")}</svg>`
}

export async function createWhiteboardSnapshot(
  strokes: WhiteboardStroke[],
): Promise<string | null> {
  const svg = createSvg(strokes)

  if (!svg) return null

  const image = new Image()

  const imageUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  )

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()

      image.onerror = () =>
        reject(
          new Error("The whiteboard drawing could not be prepared for Pixie."),
        )

      image.src = imageUrl
    })

    const canvas = document.createElement("canvas")

    canvas.width = snapshotWidth

    canvas.height = snapshotHeight

    const context = canvas.getContext("2d")

    if (!context)
      throw new Error("Image preparation is not supported by this browser.")

    context.drawImage(image, 0, 0, snapshotWidth, snapshotHeight)

    const snapshot = canvas.toDataURL("image/jpeg", 0.72)

    if (snapshot.length > maxEncodedImageLength) {
      throw new Error(
        "The whiteboard snapshot is too large to send. Simplify the drawing and try again.",
      )
    }

    return snapshot
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}
