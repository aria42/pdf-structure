module StructuredPDFViewer {
  export interface DisplayParams {
    canvasElem: HTMLCanvasElement
    pdfURL: string
  }

  export class Viewer {
    pageIdx: number
    panelIdx: number

    constructor(public displayParams: DisplayParams,
                private pdfData: PDFStructure.StructureData) {
      this.pageIdx = 0
      this.panelIdx = 0
    }

    advancePanel(): boolean {
      this.pageIdx += 1
      this.panelIdx = 0
      this.rerenderPanel()
      return true
    }

    rerenderPanel() {
      var pd: PDFStructure.PageData = this.pdfData.pages[this.pageIdx]
      var panel: PDFStructure.Panel = pd.panelLayout.panels[this.panelIdx]
      var canvas = this.displayParams.canvasElem
      var scale = 1.0
      var viewport = pd.page.getViewport(scale);
      canvas.width = window.devicePixelRatio * viewport.width
      canvas.height = window.devicePixelRatio *viewport.height
      var horizStrech = window.devicePixelRatio
      var verticStrech = window.devicePixelRatio
      canvas.style.width = viewport.width + 'px'
      canvas.style.height = viewport.height + 'px'
      var canvasCtx = canvas.getContext('2d')
      canvasCtx.setTransform(horizStrech,0,0, verticStrech,0, 0)
      var renderContext = {
        canvasContext: canvasCtx,
        viewport: viewport
      }
      pd.page.render(renderContext)
      debugger
    }
  }

  export function display(params: DisplayParams): Promise<Viewer> {
    return PDFStructure.fetch(params.pdfURL).then(structuredData => {
        var page: PDFPageProxy = structuredData.pages[0].page
        var canvas = params.canvasElem
        return new Viewer(params, structuredData)
      })
  }
}
