module PDFStructure {

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

  export interface StructureData {
    sections: SectionData[]
    pages: PageData[],
    numPages: number
  }

  export interface PageData {
    page: PDFPageProxy,
    textContent: TextContent,
    textBlocks: MergedTextBlock[]
  }

  // Adjcant TextContentItems at the same y-offset
  export class MergedTextBlock {
    constructor(public contentItems: TextContentItem[]) { }

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
  function toPromise<T>(pdfPromise: PDFPromise<T>): Promise<T> {
    return new Promise<T>((success, fail) => pdfPromise.then(success, fail))
  }

  function toPageData(page: PDFPageProxy): Promise<PageData> {
    return toPromise(page.getTextContent())
      .then(content => {
        return {page: page,
                textContent: content,
                textBlocks: findMergedTextBlocks(content.items)}
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

  function findMergedTextBlocks(contentItems: TextContentItem[]): MergedTextBlock[] {
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
        allBlocks.push(new MergedTextBlock(blockItemsInProgress.slice(0)))
        blockItemsInProgress = [curItem]
      }
    }
    if (blockItemsInProgress.length > 0) {
      allBlocks.push(new MergedTextBlock(blockItemsInProgress.slice(0)))
    }
    return allBlocks
  }


  function toStructuredData(pages: PageData[]): StructureData {
    var sectonData: SectionData[] = []
    pages.forEach((pd, idx) => {
      var midX = (pd.page.view[2] - pd.page.view[0]) / 2.0
      pd.textBlocks.forEach(block => {
        var span = block.xSpan()
        if (midX >= span[0] && midX <= span[1]) {
          console.info("mid-spanning:", block.str())
        } else {
          // long runs are multiple columns
        }
      })
      var pageSections = pd.textBlocks.map(toSectionData)
          .filter(x => x != null)
      pageSections.forEach(content => {
        console.info("SECTION: " + content.contentHeader.str(), content.contentHeader)
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
