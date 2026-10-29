import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ParsedTextOverlay from "./ParsedTextOverlay"

const spans = [
  {
    id: "p00000-w00000",
    text: "Plants",
    source: "native" as const,
    bbox: { x: 0.1, y: 0.2, width: 0.12, height: 0.03 },
    confidence: null,
    lineIndex: null,
  },
  {
    id: "p00000-w00001",
    text: "need",
    source: "native" as const,
    bbox: { x: 0.24, y: 0.2, width: 0.08, height: 0.03 },
    confidence: null,
    lineIndex: null,
  },
]

let container: HTMLDivElement
let root: Root

describe("parsed text overlay", () => {
  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
  })

  it("positions selectable extracted words using normalized page bounds", async () => {
    await act(async () =>
      root.render(
        <ParsedTextOverlay
          spans={spans}
          pagePixelHeight={1000}
          onSelectionChange={() => undefined}
        />,
      ),
    )

    const words = container.querySelectorAll<HTMLElement>(".parsed-text-span")
    expect(words[0].textContent).toBe("Plants")
    expect(words[0].style.left).toBe("10%")
    expect(words[0].style.top).toBe("20%")
    expect(words[0].style.fontSize).toBe("24.6px")
    expect(words[1].textContent).toBe("need")
  })

  it("reports the selected extracted passage", async () => {
    const onSelectionChange = vi.fn()
    await act(async () =>
      root.render(
        <ParsedTextOverlay
          spans={spans}
          pagePixelHeight={1000}
          onSelectionChange={onSelectionChange}
        />,
      ),
    )
    const word = container.querySelector<HTMLElement>(".parsed-text-span")
    const range = document.createRange()
    range.selectNodeContents(word!.firstChild!)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    await act(async () => {
      word?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    })

    expect(onSelectionChange).toHaveBeenLastCalledWith("Plants")
  })
})
