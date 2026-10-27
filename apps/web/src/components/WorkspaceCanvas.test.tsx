import { act } from "react"

import { createRoot, type Root } from "react-dom/client"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LearningDocument } from "../features/documents/service"

import WorkspaceCanvas from "./WorkspaceCanvas"

let container: HTMLDivElement

let root: Root

const documents: LearningDocument[] = [
  { id: "paper-1", filename: "Attention Is All You Need.pdf", pageCount: 15 },
]

beforeEach(() => {
  ;(globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean
  }).IS_REACT_ACT_ENVIRONMENT = true

  container = document.createElement("div")

  document.body.append(container)

  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())

  container?.remove()
})

describe("multi-source workspace canvas", () => {
  it("adds a library PDF and opens it in Learning mode", async () => {
    const onOpenDocument = vi.fn()

    await act(async () => {
      root.render(
        <WorkspaceCanvas
          hidden={false}
          ownerId="user-1"
          documents={documents}
          onOpenDocument={onOpenDocument}
        />,
      )
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("button[aria-expanded]")
        ?.click()
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".workspace-document-picker > button")
        ?.click()
    })

    expect(container.textContent).toContain("Attention Is All You Need.pdf")

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          ".workspace-source-card footer button",
        )
        ?.click()
    })

    expect(onOpenDocument).toHaveBeenCalledWith(documents[0])
  })

  it("pins a web link and reports invalid URLs instead of adding them", async () => {
    await act(async () => {
      root.render(
        <WorkspaceCanvas
          hidden={false}
          ownerId="user-1"
          documents={[]}
          onOpenDocument={() => undefined}
        />,
      )
    })

    const urlInput = container.querySelector<HTMLInputElement>(
      "#workspace-website-url",
    )!

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(urlInput, "https://example.org/attention")

      urlInput.dispatchEvent(new Event("input", { bubbles: true }))

      container
        .querySelector<HTMLButtonElement>(".workspace-link-form button")
        ?.click()
    })

    expect(
      container.querySelector(".workspace-source-card")?.textContent,
    ).toContain("example.org")

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(urlInput, "javascript:alert(1)")

      urlInput.dispatchEvent(new Event("input", { bubbles: true }))

      container
        .querySelector<HTMLButtonElement>(".workspace-link-form button")
        ?.click()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "public http:// or https:// URL",
    )

    expect(container.querySelectorAll(".workspace-source-card")).toHaveLength(1)
  })
})
