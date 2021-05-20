import {Color} from './color.js';

interface INode {
    name: string,
    value: number,
    type: string,
    hide: boolean,      // indicates if the rect is hidden
    fade: boolean,      // indicates if the rect is faded
    title: string;      // part of the name shows up in rect cell.
    children: INode[]
}

const MaxWidth: number = 40;  // maximum text width for rect title.
const MinViewHeight: number = 1000;   // maximum view port height, scrolling comes in if height exceeds 1000px

class FlameChart {
    private _nodes: d3.HierarchyRectangularNode<INode>[];
    private _rootNode: d3.HierarchyRectangularNode<INode>;
    private _currentFocus: d3.HierarchyRectangularNode<INode>;
    private _nodesWidth: number;
    private _nodesHeight: number;
    private _rectHeight: number = 0;
    private _width: number;
    private _height: number;
    private _letterLength: number = 0;
    private _div: d3.Selection<HTMLDivElement, any, HTMLElement, any>;
    private _svg: d3.Selection<SVGElement, INode, HTMLElement, any>;
    private _cells: d3.Selection<SVGGElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _rects: d3.Selection<SVGRectElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _texts: d3.Selection<SVGTextElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _spans: d3.Selection<SVGTSpanElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _resizeTimeout: any = 0;
    private _isFlipped: boolean = false;

    constructor(root: d3.HierarchyNode<INode>) {
        this._isFlipped = (document.getElementById("flip") as HTMLInputElement).checked;

        // sum computes value for each node. node's value = whatever returns here + its children value total
        const summed = root.sum((d: INode) => {
            var childrenValueTotal = 0;
            d.children?.forEach((child: INode) => { childrenValueTotal += child.value; })
            return d.value - childrenValueTotal;
        });
        const sorted = summed.sort((a: d3.HierarchyNode<INode>, b: d3.HierarchyNode<INode>) => d3.descending(a.height, b.height) && d3.descending(a.value, b.value));

        this._width = 1900; // container width - 100
        this._height = MinViewHeight > root.height * 15 ? MinViewHeight : root.height * 15 + 100;  // take 15 as the minimum cell height
        const partitionLayout = d3.partition<INode>().size([this._height, this._width]).padding(0);  // padding introduces a lot problems. missing cells, too big gap when zoomed in. So instead of using padding, use strokewidth around rect to achieve padding look.

        const partitioned = partitionLayout(sorted);
        this._nodes = partitioned.descendants();
        this._rootNode = this._nodes[0];
        
        this._currentFocus = this._rootNode;
        this._nodesWidth = this._rootNode.x1 - this._rootNode.x0;
        this._nodesHeight = (this._rootNode.y1 - this._rootNode.y0) * (this._rootNode.height + 1);
        this._rectHeight = this.getScaleY()(this._rootNode.y1 - this._rootNode.y0);

        // Define the div for the tooltip
        this._div = d3.select<HTMLDivElement, any>("#container").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        this._svg = d3.select<SVGElement, INode>("svg").attr("width", this._width).attr("height", this._height);

        this._cells = this._svg
            .selectAll<SVGGElement, INode>("g")
            .data(this._nodes)
            .join("g")
            .attr("transform", d => {
                return `translate(${this.getScaleX()(d.x0)},${this.getOffsetY(d)})`;
            })

        this._rects = this._cells.append("rect")
            .attr("width", d => this.getRectWidth(d))
            .attr("height", d => this._rectHeight)
            .attr("fill-opacity", 0.6)
            .attr("tabindex", 0)
            .attr("aria-label", d => d.data.name)
            .attr("fill", d => {
                return Color.colorHash(d.data.name, d.data.type);
            })
            .attr("stroke-width", 1)
            .attr("stroke", "rgb(255, 255, 255)")
            .style("cursor", "pointer")
            .on("click", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onZoom(p))
            .on("mouseover", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onMouseOver(e, p))
            .on("mouseout", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onMouseOut(e, p))
            .on("mousemove", (e: MouseEvent, p: d3.HierarchyRectangularNode<INode>) => this.onMouseMove(e, p));

        this._texts = this._cells.append("text")
            .attr("x", d => this.getRectWidth(d) / 2)
            .attr("y", this._rectHeight / 2)
            .attr("dy", "0.32em")
            .attr("text-anchor", d => "middle")
            .attr("font-family", "Monospace")   // use Monospace so each character takes same space.
            .attr("font-size", d => this.getFontSize(d));

        this._spans = this._texts.append('tspan')
            .text((d: d3.HierarchyRectangularNode<INode>) => this.getRectText(d));

        // Hook up search button
        const searchButton = document.getElementById("searchButton") as HTMLButtonElement;
        searchButton.addEventListener("click", () => this.onSearch());

        // Hook up reset zoom button
        const resetZoomButton = document.getElementById("resetZoomButton") as HTMLButtonElement;
        resetZoomButton.addEventListener("click", () => this.onZoom(this._rootNode));

        document.getElementById("flip")?.addEventListener("click", () => this.onFlip());

        window.addEventListener("resize", () => this.onResize());
    }

    private getLetterLength(): number {
        if(this._letterLength !== 0) {
            return this._letterLength;
        }
        let text: SVGTextElement = this._texts.nodes()[0];
        let textContent: string | null = text.textContent;
        let textLength: number = text.getComputedTextLength();
        this._letterLength = textContent ? textLength / textContent.length : 0;
        return Math.ceil(this._letterLength);
    }

    private wrap(node: d3.HierarchyRectangularNode<INode>, index: number, elementGroup: SVGTSpanElement[] | ArrayLike<SVGTSpanElement>) {
        if(this.hideRect(node)) {
            return;
        }

        let letterLength: number = this.getLetterLength();
        let tspanElement: SVGTSpanElement = elementGroup[index];
        let width = (this.getRectWidth(node)- 2 * 2);

        // If the width is less than 40px, don't show function name.
        if (width < MaxWidth) {
            tspanElement.textContent = '';
            return;
        }

        let textContent: string | null = tspanElement.textContent;
        let textLength: number = textContent ? textContent.length * letterLength : 0;

        if (textLength < width) {
            return;
        }

        let numOfLetters = width / letterLength - 3;
        textContent = textContent?.slice(0, numOfLetters) || "";
        tspanElement.textContent = textContent + '...';
    }

    private getFontSize(node: d3.HierarchyRectangularNode<INode>) {
        if (this._rectHeight < 20) {
            return "1.2em";
        }
        else if (this._rectHeight < 30) {
            return "1.5em";
        }
        else if (this._rectHeight < 50) {
            return "2em";
        }
        return "2.5em";
    }

    private hideRect(node: d3.HierarchyRectangularNode<INode>) : boolean {
        return node.data.hide;
    }

    private getRectText(node: d3.HierarchyRectangularNode<INode>) {
        let width = (this.getRectWidth(node) - 2 * 2);
        let letterLength: number = this.getLetterLength();
        let textLength: number = node.data.name.length * letterLength;

        if (width < MaxWidth) {
            node.data.title = "";
        } else if (textLength < width) {
            node.data.title = node.data.name;
        } else {
            let numOfLetters = width / letterLength - 3;
            node.data.title = node.data.name.slice(0, numOfLetters) + '...';
        }
        return node.data.title;
    }

    private getScaleX() {
        return d3.scaleLinear().domain([0, this._nodesWidth]).range([0, this._width]);
    }

    private getScaleY() {
        return d3.scaleLinear().domain([0, this._nodesHeight]).range([0, this._height]);
    }

    private getRectWidth(node: d3.HierarchyRectangularNode<INode>) {
        return this.getScaleX()(node.x1 - node.x0);
    }

    private getOffsetY(d: d3.HierarchyRectangularNode<INode>) {
        const y = this.getScaleY()(d.y0);
        return this._isFlipped ? y : this._height - this._rectHeight - y;
    }

    private onResize(forceRender: boolean = false) {
        const render = () => {
            this._svg
                .attr("width", this._width).attr("height", this._height);

            this._cells
                .attr("transform", (d: d3.HierarchyRectangularNode<INode>) => `translate(${this.getScaleX()(d.x0)},${this.getOffsetY(d)})`);

            this._rects
                .attr("width", (d: d3.HierarchyRectangularNode<INode>) => this.getRectWidth(d))
                .attr("height", this._rectHeight);

            this._texts
                .attr("x", (d: d3.HierarchyRectangularNode<INode>) => {
                    return d.data.fade ? this._width / 2 - this.getScaleX()(d.x0) : this.getRectWidth(d) / 2;
                })
                .attr("y", this._rectHeight / 2);

            this._spans
                .text((d: d3.HierarchyRectangularNode<INode>) => this.hideRect(d) ? "" : this.getRectText(d))
                .each((d, i, e) => this.wrap(d, i, e));
        }

        if (forceRender) {
            render();
            return;
        }

        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = 0;
        }

        this._resizeTimeout = setTimeout(() => render(), 100);
    }

    private onZoom(p: d3.HierarchyRectangularNode<INode>) {
        var startTime = new Date().getTime();
        this._currentFocus = this._currentFocus === p ? p = p.parent ?? p : p;
        
        if (!p) {
            return;
        }

        this._letterLength = 0;
        let rootx0 = p.x0;
        this._nodesWidth = p.x1 - p.x0;

        this._rootNode.each((d: d3.HierarchyRectangularNode<INode>) => {
            d.x0 = d.x0 - rootx0;
            d.x1 = d.x1 - rootx0;
        });

        this.hideSiblings(p);
        this.fadeAncestors(p);
        this.show(p);

        const t = this._cells.transition()
            .duration(750)
            .attr("transform", (d: d3.HierarchyRectangularNode<INode>) => `translate(${this.getScaleX()(d.x0)},${this.getOffsetY(d)})`)

        this._rects.transition(t as any)
            .attr("width", (d: d3.HierarchyRectangularNode<INode>) => this.getRectWidth(d))
            .attr("height", (d: d3.HierarchyRectangularNode<INode>) => this._rectHeight)
            .style("opacity", (d: d3.HierarchyRectangularNode<INode>) => d.data.fade ? 0.5 : 1);

        this._texts.transition(t as any)
            .attr("x", (d: d3.HierarchyRectangularNode<INode>) => {
                if(this.hideRect(d)) return 0;
                return d.data.fade ? this._width / 2 - this.getScaleX()(d.x0) : this.getRectWidth(d) / 2;
            })
            .attr("y", (d: d3.HierarchyRectangularNode<INode>) => this.hideRect(d) ? 0 : this.getScaleY()(d.y1 - d.y0) / 2)
            .text((d: d3.HierarchyRectangularNode<INode>) => d.data.title);

        var endTime = new Date().getTime();
        console.log("startTime: ", startTime);
        console.log("endTime", endTime);
        console.log("elapsed: ", endTime - startTime);
    }

    private hideSiblings(node: d3.HierarchyRectangularNode<INode>) {
        let child: d3.HierarchyRectangularNode<INode> = node;
        let parent: d3.HierarchyRectangularNode<INode> | null = child.parent;
        let children: d3.HierarchyRectangularNode<INode>[] | undefined, i: number, sibling: d3.HierarchyRectangularNode<INode>;
        while (parent) {
            children = parent.children;
            if(children === undefined) {
                children = [];
            }
            i = children.length;
            while (i--) {
                sibling = children[i];
                if (sibling !== child) {
                    sibling.data.hide = true;
                    sibling.data.title = "";
                }
            }
            child = parent;
            parent = child.parent;
        }
    }

    private show(d: d3.HierarchyRectangularNode<INode>) {
        this.getRectText(d);
        d.data.fade = false
        d.data.hide = false
        if (d.children) {
            d.children.forEach((d: d3.HierarchyRectangularNode<INode>) => this.show(d));
        }
    }

    private fadeAncestors (d: d3.HierarchyRectangularNode<INode>) {
        if (d.parent) {
            if(!d.parent.data.fade) {
                this.getRectText(d);
            }
            d.parent.data.fade = true;
            this.fadeAncestors(d.parent)
        }
    }
   
    private onMouseOver(event: Event, d: d3.HierarchyRectangularNode<INode>) {
        this._div.transition()
            .duration(200)
            .style("opacity", .9);
    }

    private onMouseOut(event: Event, d: d3.HierarchyRectangularNode<INode>) {
        this._div.transition()
            .duration(500)
            .style("opacity", 0);
    }

    private onMouseMove(event: MouseEvent, d: d3.HierarchyRectangularNode<INode>) {
        let container: HTMLDivElement | null = document.querySelector('#container');
        let scrollTop: number = container ? container.scrollTop : 0;
        let scrollLeft: number = container ? container.scrollLeft : 0;

        this._div.html("<b>name:</b> " + d.data.name + ", <b>value:</b> " + d.data.value)
            .style("left", event.clientX + scrollLeft + "px")
            .style("top", event.clientY + scrollTop + "px");
    }

    private onSearch() {
        const term = (document.getElementById("term") as HTMLInputElement)!.value;
        this._rects.each((rect: any) => {
            const index = rect.data.name.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
            if (index !== -1) {
                rect.highlighted = true;
            } else {
                rect.highlighted = false;
            }
        });

        // Color on highlighted
        this._rects.transition()
            .duration(750)
            .attr("fill", (d: any) => {
                return d.highlighted ? "red" : Color.colorHash(d.data.name, d.data.type);
            });
    }

    private onFlip() {
        this._isFlipped = (document.getElementById("flip") as HTMLInputElement).checked;
        this.onResize(true);
    }
}

async function initialize() {
    const data: any = await d3.json("PrimeVisualizer.json");
    new FlameChart(d3.hierarchy(data));
}
initialize();