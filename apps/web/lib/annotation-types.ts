export const annotationColors = ["yellow", "green", "blue", "red"] as const
export type AnnotationColor = (typeof annotationColors)[number]
export const annotationLimits = {
  rectangles: 80,
  quote: 4000,
  body: 4000,
  perMaterial: 500,
} as const

/**
 * Unit coordinates from the unrotated PDF page's top-left, independent of zoom.
 * Convert selection corners through viewport.convertToPdfPoint first. For
 * page.view=[x0,y0,x1,y1], x=(minX-x0)/(x1-x0), y=(y1-maxY)/(y1-y0).
 * Reconstruct PDF corners and use convertToViewportPoint for the current view.
 */
export interface PdfHighlightRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfHighlightLocator {
  type: "page"
  page: number
  rects: PdfHighlightRectangle[]
  quote: string
}

/** A fixed excerpt from one owned transcript segment in the saved extraction. */
export interface TimeHighlightLocator {
  type: "time"
  segmentId: string
  startMs: number
  endMs: number
  quote: string
}

export type AnnotationLocator = PdfHighlightLocator | TimeHighlightLocator

export interface MaterialAnnotation<
  Locator extends AnnotationLocator = PdfHighlightLocator,
> {
  id: string
  materialId: string
  extractionVersion: number
  locator: Locator
  body: string
  color: AnnotationColor
  revision: number
  createdAt: string
  updatedAt: string
}

export interface MaterialAnnotationList<
  Locator extends AnnotationLocator = PdfHighlightLocator,
> {
  annotations: MaterialAnnotation<Locator>[]
  currentExtractionVersion: number
}

export interface MaterialAnnotationResult<
  Locator extends AnnotationLocator = PdfHighlightLocator,
> {
  annotation: MaterialAnnotation<Locator>
  currentExtractionVersion: number
}

export interface MaterialAnnotationDeletion {
  deleted: true
  currentExtractionVersion: number
}

export interface CreateMaterialAnnotationInput {
  id: string
  extractionVersion: number
  locator: AnnotationLocator
  body?: string
  color?: AnnotationColor
}

export interface EditMaterialAnnotationInput {
  extractionVersion: number
  revision: number
  body: string
  color: AnnotationColor
}

export interface DeleteMaterialAnnotationInput {
  extractionVersion: number
  revision: number
}
