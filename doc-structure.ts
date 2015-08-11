module PDFStructure {

  interface SectionData {
    title: string,
    pageIdx: number,
    sectionNumber: number,
    // can be null
    subsectionNumber: number,
    // This is used for canvas zooming
    // has the y-offset
    contentItem: MergedTextBlock
  }

  interface StructureData {
    sections: SectionData[]
    // each outer is an array of blocks for each page
    pageBlocks: MergedTextBlock[][]
    numPages: number
  }

  // Adjcant TextContentItems at the same y-offset
  class MergedTextBlock {
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
      });
      return result
    }

    xSpan(): [number, number] {
      var minX = 100000
      var maxX = 0.0
      this.contentItems.forEach(item => {
        if (item.transform[4] < minX) {
          minX = item.transform[4]
        }
        if (item.transform[4] + item.width > maxX) {
          maxX = item.transform[4] + item.width
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
    return new Promise<T>((success, fail) => pdfPromise.then(success, fail));
  }

  interface PageData {
    viewBounds: number[],
    textContent: TextContent
  }

  function toPageData(page: PDFPageProxy): Promise<PageData> {
    return toPromise(page.getTextContent())
      .then(content => {
        return {viewBounds: page.view, textContent: content}
      })
  }

  export function getSectionData(pdf: PDFDocumentProxy): Promise<StructureData> {
    var pagePromises: Promise<PageData>[] = [];
    for (var idx=0; idx < pdf.numPages; ++idx) {
      var page = pdf.getPage(idx + 1)
      pagePromises.push(toPromise(page).then(toPageData))
    }
    return Promise.all(pagePromises)
      .then(toStructuredData,(e) => { console.error("Error reading PDF:", e) })
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


  function toStructuredData(pageBoundContentPairs: PageData[]): StructureData {
    var sectonData: SectionData[] = []
    var blocks: MergedTextBlock[][] = []
    for (var idx in pageBoundContentPairs) {
      idx = parseInt(idx)
      var pd: PageData = pageBoundContentPairs[idx]
      var mergedBlocks = findMergedTextBlocks(pd.textContent.items)
      var midX = (pd.viewBounds[2] - pd.viewBounds[0]) / 2.0
      mergedBlocks.forEach(block => {
        var span = block.xSpan()
        if (midX >= span[0] && midX <= span[1]) {
          console.info("mid-spanning:", block.str())
        } else {
          // long runs are multiple columns
        }
      })
      blocks.push(mergedBlocks)
      var pageSections = mergedBlocks.map(block => {
          var sectionData = toSectionData(block)
          sectonData.pageIdx = idx
          return sectionData
        })
        .filter(x => x != null)
      pageSections.forEach(content => {
        console.info("SECTION: " + content.contentItem.str())
        sectonData.push(content)
      })
    }
    return {numPages: pageBoundContentPairs.length,
            sections: sectonData,
            pageBlocks: blocks}
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
    return {contentItem: item,
            title: sectionTitle,
            sectionNumber: sectionNumber,
            subsectionNumber: subsectionNumber}
}
