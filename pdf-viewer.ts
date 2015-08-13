module StructuredPDFViewer {
  export interface DisplayParams {
    canvasElem: HTMLCanvasElement
    pdfURL: string
  }

  export class Viewer {
    pageIdx: number
    panelIdx: number

    constructor(public displayParams: DisplayParams,
                public pdfData: PDFStructure.StructureData) {
      this.pageIdx = 0
      this.panelIdx = 0
    }

    advancePanel(): boolean {
      var numPanels = this.pdfData.pages[this.pageIdx].panelLayout.panels.length
      if (this.panelIdx + 1 < numPanels) {
        this.panelIdx += 1
      } else if (this.pageIdx + 1 < this.pdfData.numPages) {
        this.pageIdx += 1
        this.panelIdx = 0
      } else {
        return false
      }
      this.rerenderPanel()
      return true
    }

    rerenderPanel() {
      var pd: PDFStructure.PageData = this.pdfData.pages[this.pageIdx]
      var panel: PDFStructure.Panel = pd.panelLayout.panels[this.panelIdx]
      var canvas = this.displayParams.canvasElem
      var canvasParentWidth = window.getComputedStyle(canvas.parentElement).width.replace('px','')
      var origViewport = pd.page.getViewport(1.0)
      if (panel.type == PDFStructure.PanelType.LeftColumn ||
          panel.type == PDFStructure.PanelType.RightColumn) {
        origViewport.width = origViewport.width/2
        origViewport.height = panel.height()
      }
      if (panel.type == PDFStructure.PanelType.TopHeader) {
        origViewport.height = panel.height()
      }
      var scale = parseFloat(canvasParentWidth) / origViewport.width
      var viewport = pd.page.getViewport(scale)
      if (panel.type == PDFStructure.PanelType.TopHeader) {
        viewport.height = scale * panel.height()
      }
      canvas.width = window.devicePixelRatio * viewport.width
      canvas.height = window.devicePixelRatio * viewport.height
      var horizStrech = window.devicePixelRatio
      var verticStrech = window.devicePixelRatio
      canvas.style.width = viewport.width + 'px'
      canvas.style.height = viewport.height + 'px'
      var canvasCtx = canvas.getContext('2d')
      var dx = 0
      var dy = 0
      if (panel.type == PDFStructure.PanelType.TopHeader) {
        dy = (canvas.height - panel.height())/2
      }
      if (panel.type == PDFStructure.PanelType.RightColumn) {
        dx = -canvas.width/2
      }
      canvasCtx.setTransform(horizStrech,0,0, verticStrech, dx, dy)
      var renderContext = {
        canvasContext: canvasCtx,
        viewport: viewport
      }
      pd.page.render(renderContext)
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
