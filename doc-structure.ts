var url = "test-pdfs/prototype-driven-sequence.pdf"

function toPromise<T>(pdfPromise: PDFPromise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => pdfPromise.then(resolve, reject));
}

function onDocumentLoad(pdf: PDFDocumentProxy) {
  console.info("Num-pages: " + pdf.numPages)
  var pagePromises: Promise<PDFPageProxy>[] = [];
  for (var idx=0; idx < pdf.numPages; ++idx) {
    pagePromises.push(toPromise(pdf.getPage(idx + 1)))
  }
  Promise.all(pagePromises).then(withPages, (e) => {
      window.alert("Error " + e)
  })
}

function withPages(pages: PDFPageProxy[]) {

}

PDFJS.getDocument(url).then(onDocumentLoad)
