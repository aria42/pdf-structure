var PDFStructure;
(function (PDFStructure) {
    (function (PanelLayoutType) {
        PanelLayoutType[PanelLayoutType["SingleColumn"] = 0] = "SingleColumn";
        PanelLayoutType[PanelLayoutType["TwoColumn"] = 1] = "TwoColumn";
        PanelLayoutType[PanelLayoutType["TopFullWidthTwoColumn"] = 2] = "TopFullWidthTwoColumn";
    })(PDFStructure.PanelLayoutType || (PDFStructure.PanelLayoutType = {}));
    var PanelLayoutType = PDFStructure.PanelLayoutType;
    (function (PanelType) {
        PanelType[PanelType["FullPage"] = 0] = "FullPage";
        PanelType[PanelType["LeftColumn"] = 1] = "LeftColumn";
        PanelType[PanelType["RightColumn"] = 2] = "RightColumn";
        PanelType[PanelType["TopHeader"] = 3] = "TopHeader";
    })(PDFStructure.PanelType || (PDFStructure.PanelType = {}));
    var PanelType = PDFStructure.PanelType;
    var Panel = (function () {
        function Panel(type, bounds) {
            this.type = type;
            this.bounds = bounds;
        }
        Panel.prototype.width = function () {
            return this.bounds[2] - this.bounds[0];
        };
        Panel.prototype.height = function () {
            return this.bounds[3] - this.bounds[1];
        };
        Panel.prototype.contains = function (block) {
            var blockBounds = block.bounds();
            return this.bounds[0] <= blockBounds[0] &&
                this.bounds[1] <= blockBounds[1] &&
                this.bounds[2] >= blockBounds[2] &&
                this.bounds[3] >= blockBounds[3];
        };
        return Panel;
    })();
    PDFStructure.Panel = Panel;
    function toPanelLayout(blocks, page) {
        var blocksByYOffset = {};
        blocks.forEach(function (block) {
            var blockKey = "" + block.yOffset();
            if (blocksByYOffset[blockKey] == null) {
                blocksByYOffset[blockKey] = [];
            }
            blocksByYOffset[blockKey].push(block);
        });
        var sortedHeights = Object.keys(blocksByYOffset).map(parseFloat)
            .sort(function (a, b) { return a - b; });
        var numMidStraddlingForward = new Array(sortedHeights.length);
        var numBlocksForward = new Array(sortedHeights.length);
        var numMidStraddlingSoFar = new Array(sortedHeights.length);
        var numBlocksSoFar = new Array(sortedHeights.length);
        var midX = (page.view[2] - page.view[0]) / 2.0;
        function isMidStraddler(block) {
            var span = block.xSpan();
            return midX >= span[0] && midX <= span[1];
        }
        sortedHeights.forEach(function (height, idx) {
            var heightKey = "" + height;
            var rowBlocks = blocksByYOffset[heightKey];
            numMidStraddlingSoFar[idx] = idx > 0 ? numMidStraddlingSoFar[idx - 1] : 0;
            numBlocksSoFar[idx] = idx > 0 ? numBlocksSoFar[idx - 1] : 0;
            var rowTextLength = 0;
            var nonSpace = /\S/;
            rowBlocks.forEach(function (b) {
                b.contentItems.forEach(function (c) {
                    for (var idx = 0; idx < c.str.length; ++idx) {
                        var ch = c.str.charAt(idx);
                        if (ch != ' ' || ch != '\t') {
                            rowTextLength += 1;
                        }
                    }
                });
            });
            if (rowTextLength < 10) {
                return;
            }
            var numStraddlers = rowBlocks.filter(isMidStraddler).length;
            numMidStraddlingSoFar[idx] += numStraddlers > 0 ? 1 : 0;
            numBlocksSoFar[idx] += 1;
        });
        var totalBlocks = numBlocksSoFar[sortedHeights.length - 1];
        var totalStraddlers = numMidStraddlingSoFar[sortedHeights.length - 1];
        var bestBreakScore = -1;
        var bestBreakIdx = -1;
        var breakScores = sortedHeights.length > 0 ? new Array(sortedHeights.length - 1) : null;
        sortedHeights.forEach(function (height, idx) {
            var heightKey = "" + height;
            numMidStraddlingForward[idx] = totalStraddlers - numMidStraddlingSoFar[idx];
            numBlocksForward[idx] = totalBlocks - numBlocksSoFar[idx];
            var straddlerRatioSoFar = numMidStraddlingSoFar[idx] / numBlocksSoFar[idx];
            var straddlerRatioForward = numMidStraddlingForward[idx] / numBlocksForward[idx];
            var breakScore = straddlerRatioSoFar - straddlerRatioForward;
            var pageFraction = height / page.getViewport(1.0).height;
            if (pageFraction < 0.1) {
                breakScores[idx] = 0.0;
                return;
            }
            var figureTableBlocks = blocksByYOffset[heightKey].filter(function (block) {
                return isMidStraddler(block) && block.str().match(/^(figure)|(table)/i) != null;
            });
            if (figureTableBlocks.length > 0) {
                breakScore = 10.0;
            }
            var straddleBlocks = blocksByYOffset[heightKey].filter(isMidStraddler);
            if (straddleBlocks.length == 0) {
                breakScore = -1;
            }
            if (breakScore > bestBreakScore) {
                bestBreakScore = breakScore;
                bestBreakIdx = idx;
            }
            breakScores[idx] = breakScore;
        });
        var totalStraddlerRatio = totalStraddlers / totalBlocks;
        var bestTopFraction = (bestBreakIdx + 1) / sortedHeights.length;
        if (totalStraddlerRatio > 0.50) {
            var xSpans = blocks.map(function (b) { return b.xSpan(); });
            var minX = Math.min.apply(null, xSpans.map(function (s) { return s[0]; }));
            var maxX = Math.max.apply(null, xSpans.map(function (s) { return s[1]; }));
            var panels = [new Panel(PanelType.FullPage, [minX, page.view[1], maxX, page.view[2]])];
            return { type: PanelLayoutType.SingleColumn, panels: panels };
        }
        var panelLayout;
        var bottomBlocks = bestBreakIdx < 0 ? blocks : blocks.slice(bestBreakIdx + 1);
        var leftBottomBlocks = bottomBlocks.filter(function (b) { return b.xSpan()[1] <= midX; });
        var rightBottomBlocks = bottomBlocks.filter(function (b) { return b.xSpan()[0] > midX; });
        function xSpanForBlocks(bs) {
            var minX = Math.min.apply(null, bs.map(function (b) { return b.xSpan()[0]; }));
            var maxX = Math.max.apply(null, bs.map(function (b) { return b.xSpan()[1]; }));
            return [minX, maxX];
        }
        if (leftBottomBlocks.length === 0 || rightBottomBlocks.length === 0) {
            leftXSpan = [0, midX];
            rightXSpan = [midX, page.view[2]];
        }
        else {
            var leftXSpan = xSpanForBlocks(leftBottomBlocks);
            var rightXSpan = xSpanForBlocks(rightBottomBlocks);
        }
        var leftBottom, rightBottom;
        if (leftBottomBlocks.length === 0 || rightBottomBlocks.length === 0) {
            leftBottom = page.view[3];
            rightBottom = page.view[3];
        }
        else {
            leftBottom = Math.max.apply(null, leftBottomBlocks.map(function (b) { return b.ySpan()[1]; })) + 15;
            rightBottom = Math.max.apply(null, rightBottomBlocks.map(function (b) { return b.ySpan()[1]; })) + 15;
        }
        var topOfBottomColumn;
        if (leftBottomBlocks.length > 0 && rightBottomBlocks.length > 0) {
            var leftTop = Math.min.apply(null, leftBottomBlocks.map(function (b) { return b.ySpan()[0]; }));
            var rightTop = Math.min.apply(null, rightBottomBlocks.map(function (b) { return b.ySpan()[0]; }));
            topOfBottomColumn = Math.max.apply(null, [leftTop, rightTop]);
        }
        else if (bestBreakScore > 0.2) {
            topOfBottomColumn = sortedHeights[bestBreakIdx];
        }
        if (bestBreakScore > 0.2) {
            var topXSpan;
            if (page.pageNumber == 1) {
                var topBlocks = blocks.slice(0, bestBreakIdx + 1);
                topXSpan = xSpanForBlocks(topBlocks);
            }
            else {
                topXSpan = [0, page.view[2]];
            }
            var bottomOfBreak = sortedHeights[bestBreakIdx];
            var breakBlocks = blocksByYOffset["" + bottomOfBreak];
            var maxHeight = Math.max.apply(null, breakBlocks.map(function (b) { return b.maxHeight(); }));
            var topViewBounds = [topXSpan[0], 0, topXSpan[1], bottomOfBreak - maxHeight];
            var topPanel = new Panel(PanelType.TopHeader, topViewBounds);
            var topOfBottomColumn;
            if (leftBottomBlocks.length > 0 && rightBottomBlocks.length > 0) {
                var leftTop = Math.min.apply(null, leftBottomBlocks.map(function (b) { return b.ySpan()[0]; }));
                var rightTop = Math.min.apply(null, rightBottomBlocks.map(function (b) { return b.ySpan()[0]; }));
                topOfBottomColumn = Math.max.apply(null, [leftTop, rightTop]);
            }
            else {
                topOfBottomColumn = bottomOfBreak;
            }
            var topBottomBreak = topOfBottomColumn - 5;
            var leftColumn = new Panel(PanelType.LeftColumn, [leftXSpan[0], topBottomBreak, leftXSpan[1], leftBottom]);
            var rightColumn = new Panel(PanelType.RightColumn, [rightXSpan[0], topBottomBreak, rightXSpan[1], rightBottom]);
            panelLayout = { type: PanelLayoutType.TopFullWidthTwoColumn, panels: [topPanel, leftColumn, rightColumn] };
        }
        else {
            var top = 0;
            if (leftBottomBlocks.length > 0 && rightBottomBlocks.length > 0) {
                var leftTop = Math.min.apply(null, leftBottomBlocks.map(function (b) { return b.ySpan()[0]; }));
                var rightTop = Math.min.apply(null, rightBottomBlocks.map(function (b) { return b.ySpan()[0]; }));
                top = Math.max.apply(null, [leftTop, rightTop]);
            }
            var leftColumn = new Panel(PanelType.LeftColumn, [leftXSpan[0], top, leftXSpan[1], leftBottom]);
            var rightColumn = new Panel(PanelType.RightColumn, [rightXSpan[0], top, rightXSpan[1], rightBottom]);
            panelLayout = { type: PanelLayoutType.TwoColumn, panels: [leftColumn, rightColumn] };
        }
        return panelLayout;
    }
    var MergedTextBlock = (function () {
        function MergedTextBlock(contentItems, page) {
            this.contentItems = contentItems;
            this.page = page;
        }
        MergedTextBlock.prototype.str = function () {
            var result = "";
            var contentItems = this.contentItems;
            this.contentItems.forEach(function (item, idx, outerThis) {
                result += item.str;
                if (idx + 1 < contentItems.length) {
                    var nextItem = contentItems[idx + 1];
                    if (nextItem.transform[4] > item.transform[4] + item.width) {
                        result += " ";
                    }
                }
            });
            return result;
        };
        MergedTextBlock.prototype.yOffset = function () {
            return this.page.getViewport(1.0).height - this.contentItems[0].transform[5];
        };
        MergedTextBlock.prototype.bounds = function () {
            var xspan = this.xSpan();
            var x0 = xspan[0];
            var x1 = xspan[1];
            var y0 = this.yOffset();
            var y1 = y0 + this.maxHeight();
            return [x0, y0, x1, y1];
        };
        MergedTextBlock.prototype.maxHeight = function () {
            return Math.max.apply(null, this.contentItems.map(function (x) { return x.height; }));
        };
        MergedTextBlock.prototype.ySpan = function () {
            var yStart = this.yOffset();
            return [yStart - this.maxHeight(), yStart];
        };
        MergedTextBlock.prototype.xSpan = function () {
            var minX = 100000;
            var maxX = 0.0;
            this.contentItems.forEach(function (item) {
                var startX = item.transform[4];
                var stopX = startX + item.width;
                if (startX < minX) {
                    minX = startX;
                }
                if (stopX > maxX) {
                    maxX = stopX;
                }
            });
            return [minX, maxX];
        };
        MergedTextBlock.prototype.width = function () {
            return this.contentItems.map(function (item) { return item.width; }).reduce(function (x, y) { return x + y; });
        };
        return MergedTextBlock;
    })();
    PDFStructure.MergedTextBlock = MergedTextBlock;
    function toPromise(pdfPromise) {
        return new Promise(function (success, fail) { return pdfPromise.then(success, fail); });
    }
    PDFStructure.toPromise = toPromise;
    function toPageData(page) {
        return toPromise(page.getTextContent())
            .then(function (content) {
            var pageTextBlocks = findMergedTextBlocks(content.items, page);
            var panelLayout = toPanelLayout(pageTextBlocks, page);
            return { page: page,
                textContent: content,
                panelLayout: panelLayout,
                textBlocks: pageTextBlocks };
        });
    }
    function getStructuredData(pdf) {
        var pagePromises = [];
        for (var idx = 0; idx < pdf.numPages; ++idx) {
            var page = pdf.getPage(idx + 1);
            pagePromises.push(toPromise(page).then(toPageData));
        }
        return Promise.all(pagePromises)
            .then(toStructuredData, function (e) { console.error("Error reading PDF:", e); });
    }
    PDFStructure.getStructuredData = getStructuredData;
    function fetch(url) {
        return toPromise(PDFJS.getDocument(url)).then(getStructuredData);
    }
    PDFStructure.fetch = fetch;
    function findMergedTextBlocks(contentItems, page) {
        var allBlocks = [];
        if (contentItems.length == 0) {
            return allBlocks;
        }
        var blockItemsInProgress = [contentItems[0]];
        for (var idx = 1; idx < contentItems.length; ++idx) {
            var curYOffset = blockItemsInProgress[0].transform[5];
            var curItem = contentItems[idx];
            if (curItem.transform[5] == curYOffset) {
                blockItemsInProgress.push(curItem);
            }
            else {
                allBlocks.push(new MergedTextBlock(blockItemsInProgress.slice(0), page));
                blockItemsInProgress = [curItem];
            }
        }
        if (blockItemsInProgress.length > 0) {
            allBlocks.push(new MergedTextBlock(blockItemsInProgress.slice(0), page));
        }
        return allBlocks;
    }
    function toStructuredData(pages) {
        var sectonData = [];
        pages.forEach(function (pd, idx) {
            var pageSections = pd.textBlocks.map(toSectionData)
                .filter(function (x) { return x != null; });
            pageSections.forEach(function (content) {
                content.pageIdx = idx;
                sectonData.push(content);
            });
        });
        return { numPages: pages.length,
            sections: sectonData,
            pages: pages };
    }
    var sectionHeader = /^([1-9]\d?)[.]?(\d*)[.]?\s+(.+)/;
    var sectionStopwords = {
        "stop": 1,
        "in": 1,
        "of": 1,
        "and": 1,
        "to": 1,
        "the": 1,
        "a": 1,
        "on": 1
    };
    function toSectionData(item) {
        var ms = sectionHeader.exec(item.str());
        if (ms == null || ms.length == 0) {
            return null;
        }
        var sectionNumber = parseInt(ms[1]);
        var subsectionNumber = ms[2] != null && ms[2].length > 0 ? parseInt(ms[2]) : null;
        var sectionTitle = ms[3];
        if (sectionTitle.length < 4 || sectionTitle.length > 100) {
            return null;
        }
        if (sectionNumber > 20) {
            return null;
        }
        var words = sectionTitle.split(" ");
        var lowercaseWords = words.filter(function (s) { return s.toLowerCase() == s; });
        var nonStopwordLowercaseWords = lowercaseWords.filter(function (w) { return sectionStopwords[w] == null; });
        if (nonStopwordLowercaseWords.length > 0) {
            return null;
        }
        return { contentHeader: item,
            title: sectionTitle,
            sectionNumber: sectionNumber,
            subsectionNumber: subsectionNumber };
    }
})(PDFStructure || (PDFStructure = {}));
var StructuredPDFViewer;
(function (StructuredPDFViewer) {
    (function (DisplayMode) {
        DisplayMode[DisplayMode["PANEL"] = 0] = "PANEL";
        DisplayMode[DisplayMode["PAGE"] = 1] = "PAGE";
    })(StructuredPDFViewer.DisplayMode || (StructuredPDFViewer.DisplayMode = {}));
    var DisplayMode = StructuredPDFViewer.DisplayMode;
    var Viewer = (function () {
        function Viewer(displayParams, pdfData) {
            this.displayParams = displayParams;
            this.pdfData = pdfData;
            this.pageIdx = 0;
            this.panelIdx = 0;
            this.displayMode = DisplayMode.PANEL;
        }
        Viewer.prototype.jumpToPage = function (pageNum) {
            this.pageIdx = pageNum;
            this.panelIdx = 0;
            return this.rerenderPanel();
        };
        Viewer.prototype.jumpToPanel = function (pageIdx, panelIdx) {
            this.pageIdx = pageIdx;
            this.panelIdx = panelIdx;
            return this.rerenderPanel();
        };
        Viewer.prototype.panelSections = function (pageIdx, panelIdx) {
            var panel = this.panel(pageIdx, panelIdx);
            return this.pdfData.sections.filter(function (s) { return s.pageIdx === pageIdx && panel.contains(s.contentHeader); });
        };
        Viewer.prototype.jumpToSection = function (section) {
            this.pageIdx = section.pageIdx;
            var pd = this.pdfData.pages[this.pageIdx];
            var sectionHeader = section.contentHeader;
            var matchingPanels = pd.panelLayout.panels.filter(function (panel) { return panel.contains(sectionHeader); });
            var matchPanel = matchingPanels[0];
            this.panelIdx = pd.panelLayout.panels.indexOf(matchPanel);
            var renderPromise = this.rerenderPanel();
            var panelY = matchPanel.bounds[1];
            var sectionY = sectionHeader.yOffset();
            var dy = this.viewportScale * this.panelSkew * (sectionY - panelY);
            var scrollTop = dy - (this.displayParams.sectionJumpVerticalPad || 40);
            this.displayParams.scrollParent.scrollTop = scrollTop;
            return renderPromise.then(function () {
                return dy;
            });
        };
        Viewer.prototype.panel = function (pageIdx, panelIdx) {
            return this.pdfData.pages[pageIdx].panelLayout.panels[panelIdx];
        };
        Viewer.prototype.nextPanel = function () {
            var numPanels = this.pdfData.pages[this.pageIdx].panelLayout.panels.length;
            if (this.panelIdx + 1 < numPanels) {
                this.panelIdx += 1;
            }
            else if (this.pageIdx + 1 < this.pdfData.numPages) {
                this.pageIdx += 1;
                this.panelIdx = 0;
            }
            else {
                return false;
            }
            this.rerenderPanel();
            return true;
        };
        Viewer.prototype.previousPanel = function () {
            var numPanels = this.pdfData.pages[this.pageIdx].panelLayout.panels.length;
            if (this.panelIdx > 0) {
                this.panelIdx -= 1;
            }
            else if (this.pageIdx > 0) {
                this.pageIdx -= 1;
                this.panelIdx = this.pdfData.pages[this.pageIdx].panelLayout.panels.length - 1;
            }
            else {
                return false;
            }
            this.rerenderPanel();
            return true;
        };
        Viewer.prototype.rerenderPanel = function () {
            var _this = this;
            var pd = this.pdfData.pages[this.pageIdx];
            var panel = pd.panelLayout.panels[this.panelIdx];
            var canvas = this.displayParams.canvasElem;
            var parentStyles = window.getComputedStyle(canvas.parentElement);
            var dpiScale = window.devicePixelRatio;
            var horizontalPadding = parseFloat(parentStyles.paddingLeft) + parseFloat(parentStyles.paddingRight);
            var canvasParentWidth = canvas.parentElement.offsetWidth - horizontalPadding;
            var origViewport = pd.page.getViewport(1.0);
            this.viewportScale = canvasParentWidth / origViewport.width;
            var viewport = pd.page.getViewport(this.viewportScale);
            function canvasScale(w, h) {
                canvas.width = dpiScale * w;
                canvas.height = dpiScale * h;
                canvas.style.width = w + 'px';
                canvas.style.height = h + 'px';
            }
            canvasScale(canvasParentWidth, viewport.height * this.viewportScale);
            var canvasCtx = canvas.getContext('2d');
            var panelWidthInCanvas = panel.width() * this.viewportScale * dpiScale;
            this.panelSkew = canvas.width / panelWidthInCanvas;
            var dx = -this.panelSkew * dpiScale * this.viewportScale * panel.bounds[0];
            var dy = -this.panelSkew * dpiScale * this.viewportScale * panel.bounds[1];
            var adjustedPanelHeight = panel.height() * this.viewportScale * this.panelSkew;
            canvasScale(canvasParentWidth, adjustedPanelHeight);
            canvasCtx.setTransform(dpiScale * this.panelSkew, 0, 0, dpiScale * this.panelSkew, dx, dy);
            var renderContext = {
                canvasContext: canvasCtx,
                viewport: viewport
            };
            var renderPromise = PDFStructure.toPromise(pd.page.render(renderContext));
            renderPromise.then(function (ignore) {
                if (false && panel.type == PDFStructure.PanelType.TopHeader) {
                    canvasCtx.globalAlpha = 0.1;
                    var panelHeight = _this.panelSkew * dpiScale * _this.viewportScale * panel.height();
                    canvasCtx.fillStyle = "black";
                    canvasCtx.fillRect(0, 0, canvas.width, canvas.height - panelHeight);
                }
            });
            return renderPromise;
        };
        return Viewer;
    })();
    StructuredPDFViewer.Viewer = Viewer;
    function display(params) {
        return PDFStructure.fetch(params.pdfURL).then(function (structuredData) {
            return new Viewer(params, structuredData);
        });
    }
    StructuredPDFViewer.display = display;
})(StructuredPDFViewer || (StructuredPDFViewer = {}));
//# sourceMappingURL=pdf-structure.tsc.js.map