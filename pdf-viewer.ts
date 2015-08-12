module StructuredPDFViewer {
  export interface DisplayParams {
    canvasElem: HTMLCanvasElement
    pdfURL: string
  }

  export class Viewer {
    pageIdx: number

    constructor(public displayParams: DisplayParams,
                private pdfData: PDFStructure.StructureData) {
      this.pageIdx = 0
    }

    advancePage() {
      this.pageIdx += 1
      this.displayPage()
    }

    advancePanel() {

    }

    displayPage() {
      var pd = this.pdfData.pages[this.pageIdx]
      var canvas = this.displayParams.canvasElem
      var scale = 1.0
      var viewport = pd.page.getViewport(scale)
      var canvasCtx = canvas.getContext('2d')
      var renderContext = {
        canvasContext: canvasCtx,
        viewport: viewport
      }
      // Handle Device Pixel Ratio (for retina screens)
      // since Canvas is at bitmap level
      canvas.height = 2 * window.devicePixelRatio * viewport.height
      canvas.width = window.devicePixelRatio * viewport.width
      canvas.style.width = canvas.width/ window.devicePixelRatio + 'px'
      canvas.style.height = canvas.height/ window.devicePixelRatio + 'px'
      //canvas.height /= 2
      //canvas.height = 2
      canvasCtx.setTransform(2*window.devicePixelRatio,0,0,2*window.devicePixelRatio,0, 0)      
      pd.page.render(renderContext)
    }
  }



  export function display(params: DisplayParams) {
    PDFStructure.fetch(params.pdfURL)
      .then(structuredData => {
        var page: PDFPageProxy = structuredData.pages[0].page
        var canvas = params.canvasElem
        var viewer = new Viewer(params, structuredData)
        viewer.displayPage()
        canvas.onclick = e => {
          viewer.advancePage()
        }
      })
  }
}
