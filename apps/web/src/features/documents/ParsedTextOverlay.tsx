import type { SyntheticEvent } from "react"
import type { PageText } from "./service"

export default function ParsedTextOverlay({
  spans,
  pagePixelHeight,
  onSelectionChange,
}: {
  spans: PageText["spans"]
  pagePixelHeight: number
  onSelectionChange: (text: string) => void
}) {
  function readSelection(event: SyntheticEvent<HTMLDivElement>) {
    const selection = window.getSelection()
    if (!selection?.rangeCount) {
      onSelectionChange("")
      return
    }

    const range = selection.getRangeAt(0)
    if (!event.currentTarget.contains(range.commonAncestorContainer)) {
      onSelectionChange("")
      return
    }
    onSelectionChange(selection.toString().trim())
  }

  return (
    <div
      className="parsed-text-overlay"
      aria-label="Selectable text extracted from this document page"
      onMouseUp={readSelection}
      onKeyUp={readSelection}
    >
      {spans.map((span) => (
        <span
          key={span.id}
          className="parsed-text-span"
          data-span-id={span.id}
          style={{
            left: `${span.bbox.x * 100}%`,
            top: `${span.bbox.y * 100}%`,
            width: `${span.bbox.width * 100}%`,
            height: `${span.bbox.height * 100}%`,
            fontSize: `${Math.max(8, Math.round(span.bbox.height * pagePixelHeight * 0.82 * 100) / 100)}px`,
          }}
        >
          {span.text}
        </span>
      ))}
    </div>
  )
}
