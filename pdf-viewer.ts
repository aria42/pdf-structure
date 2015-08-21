module StructuredPDFViewer {
  export interface DisplayParams {
    canvasElem: HTMLCanvasElement
    pdfURL: string
    sectionJumpVerticalPad: number
  }

  export enum DisplayMode {
      PANEL,
      PAGE
  }

  export class Viewer {
    pageIdx: number
    panelIdx: number
    displayMode: DisplayMode
    panelSkew: number
    viewportScale: number

    constructor(public displayParams: DisplayParams,
                public pdfData: PDFStructure.StructureData) {
      this.pageIdx = 0
      this.panelIdx = 0
      this.displayMode = DisplayMode.PANEL
    }

    jumpToPage(pageNum: number): Promise<PDFPageProxy> {
      this.pageIdx = pageNum
      this.panelIdx = 0
      return this.rerenderPanel()
    }

    jumpToPanel(pageIdx: number, panelIdx: number): Promise<PDFPageProxy> {
      this.pageIdx = pageIdx
      this.panelIdx = panelIdx
      return this.rerenderPanel()
    }

    jumpToSection(section: PDFStructure.SectionData): Promise<PDFPageProxy> {
      this.pageIdx = section.pageIdx
      var pd = this.pdfData.pages[this.pageIdx]
      var sectionHeader = section.contentHeader
      var matchingPanels = pd.panelLayout.panels.filter(panel => panel.contains(sectionHeader))
      var matchPanel = matchingPanels[0]
      this.panelIdx = pd.panelLayout.panels.indexOf(matchPanel)
      var renderPromise = this.rerenderPanel()
      // scroll on panel render
      var panelY = matchPanel.bounds[1]
      var sectionY = sectionHeader.yOffset()
      var dy = this.viewportScale * this.panelSkew * (sectionY - panelY)
      var scrollTop = dy - (this.displayParams.sectionJumpVerticalPad || 40)
      this.displayParams.canvasElem.parentElement.scrollTop = scrollTop
      return renderPromise
    }

    nextPanel(): boolean {
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
    previousPanel(): boolean {
      var numPanels = this.pdfData.pages[this.pageIdx].panelLayout.panels.length
      if (this.panelIdx > 0) {
        this.panelIdx -= 1
      } else if (this.pageIdx > 0) {
        this.pageIdx -= 1
        this.panelIdx = this.pdfData.pages[this.pageIdx].panelLayout.panels.length - 1
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
      var parentStyles = window.getComputedStyle(canvas.parentElement)
      var dpiScale = window.devicePixelRatio
      var horizontalPadding = parseFloat(parentStyles.paddingLeft) + parseFloat(parentStyles.paddingRight)
      var canvasParentWidth = canvas.parentElement.offsetWidth - horizontalPadding;
      var origViewport = pd.page.getViewport(1.0)
      this.viewportScale = canvasParentWidth / origViewport.width
      var viewport = pd.page.getViewport(this.viewportScale)
      function canvasScale(w: number, h: number) {
        // Pixel width/height
        canvas.width = dpiScale * w
        canvas.height = dpiScale * h
        // DPI
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
      }
      canvasScale(canvasParentWidth, viewport.height * this.viewportScale);
      var canvasCtx = canvas.getContext('2d')
      var horizStrech = dpiScale
      var verticStrech = dpiScale
      var panelWidthInCanvas = panel.width() * this.viewportScale * dpiScale
      this.panelSkew = canvas.width / panelWidthInCanvas
      var dx = - this.panelSkew * horizStrech * this.viewportScale * panel.bounds[0];
      var dy = - this.panelSkew * verticStrech * this.viewportScale * panel.bounds[1];

      canvasScale(viewport.width * this.panelSkew, viewport.height * this.panelSkew + dy / dpiScale)
      canvasCtx.setTransform(horizStrech * this.panelSkew, 0, 0, verticStrech * this.panelSkew, dx, dy)
      var renderContext = {
        canvasContext: canvasCtx,
        viewport: viewport
      }
      var renderPromise = PDFStructure.toPromise(pd.page.render(renderContext))
      renderPromise.then(ignore => {
        if (false && panel.type == PDFStructure.PanelType.TopHeader) {
          canvasCtx.globalAlpha = 0.1
          var panelHeight = this.panelSkew * verticStrech * this.viewportScale * panel.height()
          canvasCtx.fillStyle="black"
          canvasCtx.fillRect(0,0,canvas.width,canvas.height-panelHeight)
          //debugger
        }
      })
      return renderPromise
    }
  }

  export function display(params: DisplayParams): Promise<Viewer> {
    return PDFStructure.fetch(params.pdfURL).then(structuredData => {
        return new Viewer(params, structuredData)
      })
  }
}
