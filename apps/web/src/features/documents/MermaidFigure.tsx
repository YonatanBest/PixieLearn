import mermaid from "mermaid"
import { useEffect, useId, useState } from "react"

let initialized = false

export default function MermaidFigure({ source, title }: {
  source: string
  title: string
}) {
  const reactId = useId()
  const [imageUrl, setImageUrl] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let objectUrl = ""
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        flowchart: { htmlLabels: false, useMaxWidth: true },
        suppressErrorRendering: true,
      })
      initialized = true
    }

    const render = async () => {
      try {
        const id = `pixielearn-diagram-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`
        const { svg } = await mermaid.render(id, source)
        if (!active) return
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
        setImageUrl(objectUrl)
        setError("")
      } catch {
        if (active) {
          setImageUrl("")
          setError("This diagram source could not be rendered. Check its Mermaid syntax.")
        }
      }
    }
    void render()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [reactId, source])

  return (
    <figure className="whiteboard-figure">
      <figcaption>{title}</figcaption>
      {imageUrl ? (
        <img src={imageUrl} alt={title} />
      ) : error ? (
        <p className="whiteboard-figure-error" role="alert">{error}</p>
      ) : (
        <p className="whiteboard-figure-loading" role="status">Rendering figure…</p>
      )}
    </figure>
  )
}
