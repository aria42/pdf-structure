module StructuredPDFViewer {
  export interface DisplayParams {
    canvasElem: HTMLCanvasElement
    pdfURL: string
  }

  export enum DisplayMode {
      PANEL,
      PAGE
  }

  export class Viewer {
    pageIdx: number
    panelIdx: number
    displayMode: DisplayMode

    constructor(public displayParams: DisplayParams,
                public pdfData: PDFStructure.StructureData) {
      this.pageIdx = 0
      this.panelIdx = 0
    }

    advancePage() {

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

    renderPage() {
      var pd: PDFStructure.PageData = this.pdfData.pages[this.pageIdx]
      var canvas = this.displayParams.canvasElem
      var canvasParentWidth = window.getComputedStyle(canvas.parentElement).width.replace('px','')
      var origViewport = pd.page.getViewport(1.0)
      var scale = parseFloat(canvasParentWidth) / origViewport.width
      var viewport = pd.page.getViewport(scale)
    }

    rerenderPanel() {
      var pd: PDFStructure.PageData = this.pdfData.pages[this.pageIdx]
      var panel: PDFStructure.Panel = pd.panelLayout.panels[this.panelIdx]
      var canvas = this.displayParams.canvasElem
      var canvasParentWidth = window.getComputedStyle(canvas.parentElement).width.replace('px','')
      var origViewport = pd.page.getViewport(1.0)
      var viewportScale = parseFloat(canvasParentWidth) / origViewport.width
      var viewport = pd.page.getViewport(viewportScale)
      var dpiScale = window.devicePixelRatio
      function canvasScale(w: number, h: number) {
        // Pixel width/height
        canvas.width = dpiScale * w
        canvas.height = dpiScale * h
        // DPI
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
      }
      canvasScale(viewport.width, viewport.height)
      var canvasCtx = canvas.getContext('2d')
      var horizStrech = dpiScale
      var verticStrech = dpiScale
      var panelWidthInCanvas = panel.width() * viewportScale * dpiScale
      var panelHorizSkew = canvas.width / panelWidthInCanvas
      var panelVerticalSkew = panelHorizSkew //canvas.height/canvas.width * panelHorizSkew
      var dx = 0.0 //-horizStrech * viewportScale * panel.bounds[0]//(canvas.width - panel.width() * viewportScale * dpiScale)/2.0
      //debugger
      var dy = -verticStrech * viewportScale * panel.bounds[1]
      canvasScale(viewport.width * panelHorizSkew, viewport.height * panelHorizSkew + dy)
      //debugger
      canvasCtx.setTransform(horizStrech * panelHorizSkew, 0, 0, verticStrech * panelVerticalSkew, dx, dy)
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
