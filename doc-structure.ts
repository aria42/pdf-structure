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
    blocks: MergedTextBlock[]
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

    width(): number {
      return this.contentItems.map(item => item.width).reduce((x,y) => x+y)
    }
  }

  /**
   * Convert PDF.js PDFPromise to a normal ES6 Promise
   */
  function toPromise<T>(pdfPromise: PDFPromise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => pdfPromise.then(resolve, reject));
  }

  export function getSectionData(pdf: PDFDocumentProxy): Promise<StructureData> {
    var pagePromises: Promise<TextContent>[] = [];
    for (var idx=0; idx < pdf.numPages; ++idx) {
      var textContentPromise = toPromise(pdf.getPage(idx + 1))
        .then(x =>  x.getTextContent())
      pagePromises.push(textContentPromise)
    }
    return Promise.all(pagePromises)
      .then(toStructuredData,
            (e) => { console.error("Error reading PDF:", e) })
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


  function toStructuredData(pages: TextContent[]): StructureData {
    var sectonData: SectionData[] = []
    var blocks: MergedTextBlock[] = []
    for (var idx in pages) {
      var pageContent = pages[idx]
      var mergedBlocks = findMergedTextBlocks(pageContent.items)
      mergedBlocks.forEach(x => blocks.push(x))
      var pageSections = mergedBlocks.map(block => toSectionData(block, parseInt(idx)))
        .filter(x => x != null)
      pageSections.forEach(content => {
        console.info("SECTION: " + content.contentItem.str())
        sectonData.push(content)
      })
    }
    return {numPages: pages.length, sections: sectonData, blocks: blocks}
  }

  var sectionHeader = /^([1-9]\d?)(?:[.](\d*))?\s+(.+)/

  var sectionStopwords = {
    "stop": 1,
    "in": 1,
    "of": 1,
    "and": 1
  }

  function toSectionData(item: MergedTextBlock, pageIdx: number): SectionData {
    var ms = sectionHeader.exec(item.str())
    if (ms == null || ms.length == 0) {
      return null
    }
    var sectionNumber = parseInt(ms[1])
    var subsectionNumber = ms[2] != null ? parseInt(ms[2]) : null
    var sectionTitle = ms[3]
    // typically no more than this many sections
    if (sectionNumber > 20) {
      return null
    }
    // check that all non-stop words are capitalzied
    var words = sectionTitle.split(" ")
    var lowercaseWords = words.filter(s => s.toLowerCase() == s)
    var nonStopwordLowercaseWords = lowercaseWords.filter(w => sectionStopwords[w] == null)
    return {contentItem: item,
            pageIdx: pageIdx,
            title: sectionTitle,
            sectionNumber: sectionNumber, subsectionNumber: subsectionNumber}
  }
}

var url = "test-pdfs/prototype-driven-sequence.pdf"
PDFJS.getDocument(url)
  .then(PDFStructure.getSectionData)
  .then(value => {debugger;})
