import type { ChartOutput, StudyOutputContent } from "@/lib/study-output-types"

function download(
  title: string,
  content: string,
  extension: string,
  mime: string
) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement("a")
  link.href = url
  link.download = `${
    title
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 80) || "abstruck-output"
  }.${extension}`
  link.click()
  URL.revokeObjectURL(url)
}

export function exportStudyOutput(output: StudyOutputContent) {
  download(
    output.title,
    JSON.stringify(output, null, 2),
    "json",
    "application/json;charset=utf-8"
  )
}

function csvCell(value: string | number): string {
  // Spreadsheet formulas should stay ordinary labels when a CSV is opened.
  const text =
    typeof value === "number"
      ? String(value)
      : /^[=+\-@\t\r]/.test(value)
        ? `'${value}`
        : value
  return `"${text.replaceAll('"', '""')}"`
}

export function exportStudyChart(output: ChartOutput) {
  const rows: (string | number)[][] = [
    [output.xLabel, "Series", output.yLabel, "Unit", "Source references"],
  ]
  output.series.forEach((series) => {
    series.points.forEach((point) => {
      rows.push([
        point.label,
        series.name,
        point.value,
        output.unit,
        point.citations
          .map(
            (citation) =>
              `${citation.material_id} · location ${citation.page}: ${citation.quote}`
          )
          .join(" | "),
      ])
    })
  })
  download(
    output.title,
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    "csv",
    "text/csv;charset=utf-8"
  )
}

export function exportStudyDiagram(title: string, source: SVGSVGElement) {
  const copy = source.cloneNode(true) as SVGSVGElement
  const originalElements = [source, ...source.querySelectorAll("*")]
  const copiedElements = [copy, ...copy.querySelectorAll("*")]
  originalElements.forEach((element, index) => {
    const style = getComputedStyle(element)
    const target = copiedElements[index]
    if (!target) return
    for (const property of [
      "fill",
      "stroke",
      "stroke-width",
      "font-family",
      "font-size",
      "font-weight",
    ]) {
      target.setAttribute(property, style.getPropertyValue(property))
    }
    target.removeAttribute("class")
    target.removeAttribute("tabindex")
  })
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  download(
    title,
    new XMLSerializer().serializeToString(copy),
    "svg",
    "image/svg+xml;charset=utf-8"
  )
}
