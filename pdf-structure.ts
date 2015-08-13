module PDFStructure {

  export interface PageData {
    page: PDFPageProxy,
    textContent: TextContent,
    textBlocks: MergedTextBlock[]
    panelLayout?: PanelLayout
  }

  export interface SectionData {
    title: string,
    pageIdx?: number,
    sectionNumber: number,
    // can be null
    subsectionNumber: number,
    // This is used for canvas zooming
    // has the y-offset
    contentHeader: MergedTextBlock
  }

  export enum PanelLayoutType {
    // No column splits
    SingleColumn,
    // Whole page splits into two column
    TwoColumn,
    // Top of page has some full-width figure/table/etc.
    // below some point two column
    TopFullWidthTwoColumn
  }

  export enum PanelType {
    FullPage,
    LeftColumn,
    RightColumn,
    TopHeader,
  }

  export class Panel {
    // [x0,y0, x1, y1]  <- canvas coordinates
    constructor(public type: PanelType, public bounds: number[]) {}

    width() {
      return this.bounds[2] - this.bounds[0]
    }

    height() {
      return this.bounds[3] - this.bounds[1]
    }

    contains(block: MergedTextBlock): boolean {
      var blockBounds = block.bounds()
      return this.bounds[0] <= blockBounds[0] &&
             this.bounds[1] <= blockBounds[1] &&
             this.bounds[2] >= blockBounds[2] &&
             this.bounds[3] >= blockBounds[3]
    }
  }

  export interface PanelLayout {
    type: PanelLayoutType,
    panels: Panel[]
  }

  export interface StructureData {
    sections: SectionData[]
    pages: PageData[],
    numPages: number
  }

  function toPanelLayout(blocks: MergedTextBlock[], page: PDFPageProxy): PanelLayout {
    var blocksByYOffset: {[k: string]: MergedTextBlock[]; } = {}
      blocks.forEach(block => {
      var blockKey = "" + block.yOffset()
      if (blocksByYOffset[blockKey] == null) {
        blocksByYOffset[blockKey] = []
      }
      blocksByYOffset[blockKey].push(block)
    })
    // top to bottom of page - ascending
    var sortedHeights = Object.keys(blocksByYOffset).map(parseFloat)
      .sort((a,b) => a-b)
    var numMidStraddlingForward = new Array(sortedHeights.length)
    var numBlocksForward = new Array(sortedHeights.length)
    var numMidStraddlingSoFar = new Array(sortedHeights.length)
    var numBlocksSoFar = new Array(sortedHeights.length)

    var midX = (page.view[2] - page.view[0]) / 2.0
    function isMidStraddler(block: MergedTextBlock) {
      var span = block.xSpan()
      return midX >= span[0] && midX <= span[1]
    }

    // forward pass
    sortedHeights.forEach((height, idx) => {
        var heightKey = "" + height
        var rowBlocks = blocksByYOffset[heightKey]
        numMidStraddlingSoFar[idx] = idx > 0 ? numMidStraddlingSoFar[idx-1] : 0
        numBlocksSoFar[idx] = idx > 0 ? numBlocksSoFar[idx-1] : 0
        var numStraddlers = rowBlocks.filter(isMidStraddler).length
        numMidStraddlingSoFar[idx] += numStraddlers > 0 ? 1 : 0
        numBlocksSoFar[idx] += 1// rowBlocks.length
    })
    var totalBlocks = numBlocksSoFar[sortedHeights.length-1]
    var totalStraddlers = numMidStraddlingSoFar[sortedHeights.length-1]
    var bestBreakScore = -1
    var bestBreakIdx = -1
    var breakScores = new Array(sortedHeights.length-1)
    sortedHeights.forEach((height, idx) => {
        var heightKey = "" + height
        numMidStraddlingForward[idx] = totalStraddlers - numMidStraddlingSoFar[idx]
        numBlocksForward[idx] = totalBlocks - numBlocksSoFar[idx]
        var straddlerRatioSoFar = numMidStraddlingSoFar[idx] / numBlocksSoFar[idx]
        var straddlerRatioForward = numMidStraddlingForward[idx] / numBlocksForward[idx]
        var breakScore = straddlerRatioSoFar - straddlerRatioForward
        var pageFraction = height / page.getViewport(1.0).height
        if (pageFraction < 0.1) {
          breakScores[idx] = 0.0
          return
        }
        var figureTableBlocks = blocksByYOffset[heightKey].filter(block =>
          isMidStraddler(block) && block.str().match(/^(figure)|(table)/i) != null
        )
        if (figureTableBlocks.length > 0) {
          breakScore = 10.0
        }
        var straddleBlocks = blocksByYOffset[heightKey].filter(isMidStraddler)
        if (straddleBlocks.length == 0) {
          breakScore = -1
        }
        if (breakScore > bestBreakScore) {
          bestBreakScore = breakScore
          bestBreakIdx = idx
        }
        breakScores[idx] = breakScore
    })
    var totalStraddlerRatio = totalStraddlers / totalBlocks
    var panelLayout: PanelLayout
    var bestTopFraction = (bestBreakIdx + 1) / sortedHeights.length

    if (totalStraddlerRatio > 0.75) {
      var panels = [new Panel(PanelType.FullPage, page.view)]
      panelLayout = {type: PanelLayoutType.SingleColumn, panels: panels}
    }
    else if (bestBreakScore > 0.2) {
      var bottomOfBreak = sortedHeights[bestBreakIdx]
      var breakBlocks = blocksByYOffset["" + bottomOfBreak]
      var maxHeight = Math.max.apply(null, breakBlocks.map(b => b.maxHeight()))
      var topViewBounds = [0,0,page.view[2], bottomOfBreak - maxHeight]
      var topPanel = new Panel(PanelType.TopHeader, topViewBounds)
      var leftColumn = new Panel(PanelType.LeftColumn, [0, bottomOfBreak, midX, page.view[3]])
      var rightColumn = new Panel(PanelType.RightColumn, [midX, bottomOfBreak, page.view[2], page.view[3]])
      panelLayout = {type: PanelLayoutType.TopFullWidthTwoColumn, panels: [topPanel, leftColumn, rightColumn]}
    } else {
      var leftColumn = new Panel(PanelType.LeftColumn, [0, 0, midX, page.view[3]])
      var rightColumn = new Panel(PanelType.RightColumn, [midX, 0, page.view[2], page.view[3]])
      panelLayout = {type: PanelLayoutType.TwoColumn, panels: [leftColumn, rightColumn]}
    }
    //console.info("page num: " + page.pageNumber)
    //console.info("panel type: " + panelLayout.type)
    //if (breakBlocks != null) {
    //    console.info("break block: " + breakBlocks.map(b => b.str()).join(" "))
    //}
    //debugger
    return panelLayout
  }

  // Adjcant TextContentItems at the same y-offset
  export class MergedTextBlock {
    constructor(public contentItems: TextContentItem[], public page: PDFPageProxy) { }

    /**
     * Content of merged text block
     */
    str(): string {
      var result = ""
      var contentItems = this.contentItems
      this.contentItems.forEach((item, idx, outerThis) => {
        result += item.str
        // HACK(aria42) try to guess where a space was by
        // looking at block width and offsets
        if (idx + 1 < contentItems.length) {
          var nextItem = contentItems[idx+1]
          if (nextItem.transform[4] > item.transform[4] + item.width) {
            result += " "
          }
        }
      })
      return result
    }

    yOffset(): number {
      return this.page.getViewport(1.0).height - this.contentItems[0].transform[5]
    }

    bounds(): [number, number,number, number] {
      var xspan = this.xSpan()
      var x0 = xspan[0]
      var x1 = xspan[1]
      var y0 = this.yOffset()
      var y1 = y0 + this.maxHeight()
      return [x0, y0, x1, y1]
    }

    maxHeight(): number {
      return Math.max.apply(null, this.contentItems.map(x => x.height))
    }

    ySpan(): [number, number] {
      var yStart = this.yOffset()
      return [yStart -  this.maxHeight(), yStart]
    }

    xSpan(): [number, number] {
      var minX = 100000
      var maxX = 0.0
      this.contentItems.forEach(item => {
        var startX = item.transform[4]
        var stopX = startX + item.width
        if (startX < minX) {
          minX = startX
        }
        if (stopX > maxX) {
          maxX = stopX
        }
      })
      return [minX, maxX]
    }

    width(): number {
      return this.contentItems.map(item => item.width).reduce((x,y) => x+y)
    }
  }

  /**
   * Convert PDF.js PDFPromise to a normal ES6 Promise
   */
  export function toPromise<T>(pdfPromise: PDFPromise<T>): Promise<T> {
    return new Promise<T>((success, fail) => pdfPromise.then(success, fail))
  }

  function toPageData(page: PDFPageProxy): Promise<PageData> {
    return toPromise(page.getTextContent())
      .then(content => {
        var pageTextBlocks = findMergedTextBlocks(content.items, page)
        var panelLayout = toPanelLayout(pageTextBlocks, page)
        return {page: page,
                textContent: content,
                panelLayout: panelLayout,
                textBlocks: pageTextBlocks}
      })
  }

  export function getStructuredData(pdf: PDFDocumentProxy): Promise<StructureData> {
    var pagePromises: Promise<PageData>[] = []
    for (var idx=0; idx < pdf.numPages; ++idx) {
      var page = pdf.getPage(idx + 1)
      pagePromises.push(toPromise(page).then(toPageData))
    }
    return Promise.all(pagePromises)
      .then(toStructuredData,(e) => { console.error("Error reading PDF:", e) })
  }

  export function fetch(url: string): Promise<StructureData> {
    return toPromise(PDFJS.getDocument(url)).then(getStructuredData)
  }

  function findMergedTextBlocks(contentItems: TextContentItem[], page: PDFPageProxy): MergedTextBlock[] {
    var allBlocks: MergedTextBlock[] = []
    if (contentItems.length == 0) {
      return allBlocks
    }
    var blockItemsInProgress: TextContentItem[] = [contentItems[0]]
    for (var idx = 1; idx < contentItems.length; ++idx) {
      // what is the y-offset of the current block
      var curYOffset = blockItemsInProgress[0].transform[5]
      var curItem = contentItems[idx]
      // is this on the same line?
      if (curItem.transform[5] == curYOffset) {
        blockItemsInProgress.push(curItem)
      } else {
        allBlocks.push(new MergedTextBlock(blockItemsInProgress.slice(0), page))
        blockItemsInProgress = [curItem]
      }
    }
    if (blockItemsInProgress.length > 0) {
      allBlocks.push(new MergedTextBlock(blockItemsInProgress.slice(0), page))
    }
    return allBlocks
  }


  function toStructuredData(pages: PageData[]): StructureData {
    var sectonData: SectionData[] = []
    pages.forEach((pd, idx) => {
      var pageSections = pd.textBlocks.map(toSectionData)
          .filter(x => x != null)
      pageSections.forEach(content => {
        //console.info("SECTION: " + content.contentHeader.str(), content.contentHeader)
        content.pageIdx = idx
        sectonData.push(content)
      })
    })
    return {numPages: pages.length,
            sections: sectonData,
            pages: pages }
  }

  var sectionHeader = /^([1-9]\d?)(?:[.](\d*))?\s+(.+)/

  var sectionStopwords = {
    "stop": 1,
    "in": 1,
    "of": 1,
    "and": 1
  }

  function toSectionData(item: MergedTextBlock): SectionData {
    var ms = sectionHeader.exec(item.str())
    if (ms == null || ms.length == 0) {
      return null
    }
    var sectionNumber = parseInt(ms[1])
    var subsectionNumber = ms[2] != null ? parseInt(ms[2]) : null
    var sectionTitle = ms[3]
    // bogus section title length
    if (sectionTitle.length < 4 || sectionTitle.length > 100) {
      return null
    }
    // typically no more than this many sections
    if (sectionNumber > 20) {
      return null
    }
    // check that all non-stop words are capitalzied
    var words = sectionTitle.split(" ")
    var lowercaseWords = words.filter(s => s.toLowerCase() == s)
    var nonStopwordLowercaseWords =
      lowercaseWords.filter(w => sectionStopwords[w] == null)
    if (nonStopwordLowercaseWords.length > 0) {
      return null
    }
    return {contentHeader: item,
            title: sectionTitle,
            sectionNumber: sectionNumber,
            subsectionNumber: subsectionNumber}
  }
}
