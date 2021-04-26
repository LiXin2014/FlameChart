interface INode {
    name: string,
    value: number,
    children: INode[]
}

const MaxWidth: number = 20;  // maximum text width for rect title.
const MinViewHeight: number = 1000;   // maximum view port height, scrolling comes in if height exceeds 1000px

class FlameChart {
    private _nodes: d3.HierarchyRectangularNode<INode>[];
    private _rootNode: d3.HierarchyRectangularNode<INode>;
    private _level: number;
    private _currentFocus: d3.HierarchyRectangularNode<INode>;
    private _nodesWidth: number;
    private _nodesHeight: number;
    private _width: number;
    private _height: number;
    private _div: d3.Selection<HTMLDivElement, any, HTMLElement, any>;
    private _svg: d3.Selection<SVGElement, INode, HTMLElement, any>;
    private _cells: d3.Selection<SVGGElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _rects: d3.Selection<SVGRectElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _texts: d3.Selection<SVGTextElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    //private _spans: d3.Selection<SVGTSpanElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _colorScale = d3.scaleOrdinal(d3.schemeCategory10);
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
        const sorted = summed.sort((a: d3.HierarchyNode<INode>, b: d3.HierarchyNode<INode>) => d3.descending(a.height, b.height) || d3.descending(a.value, b.value));

        this._width = 1900; // container width - 100
        this._height = MinViewHeight > root.height * 15 ? MinViewHeight : root.height * 15 +100;  // take 15 as the minimum cell height
        const partitionLayout = d3.partition<INode>().size([this._height, this._width]).padding(1);

        const partitioned = partitionLayout(sorted);
        this._nodes = partitioned.descendants();
        this._rootNode = this._nodes[0];
        this._level = this._rootNode.height + 1;

        this._currentFocus = this._rootNode;
        this._nodesWidth = this._rootNode.x1 - this._rootNode.x0;
        this._nodesHeight = (this._rootNode.y1 - this._rootNode.y0) * (this._rootNode.height + 1);

        // Define the div for the tooltip
        this._div = d3.select<HTMLDivElement, any>("#container").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        this._svg = d3.select<SVGElement, INode>("svg").attr("width", this._width).attr("height", this._height);

        this._cells = this._svg
            .selectAll<SVGGElement, INode>("g")
            .data(this._nodes)
            .join("g")
            .attr("transform", d => `translate(${this.getScaleX(this._nodesWidth)(d.x0)},${this.getOffsetY(d)})`);
            
        this._rects = this._cells.append("rect")
            .attr("width", d => this.getScaleX(this._nodesWidth)(d.x1 - d.x0))
            .attr("height", d => {
                return this.getRectHeight(d);
            })
            .attr("fill-opacity", 0.6)
            .attr("tabindex", 0)
            .attr("aria-label", d => d.data.name)
            .attr("fill", d => this.colorScale((d.children ? d : d.parent)!.data.name))
            .style("cursor", "pointer")
            .on("click", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onClicked(p))
            .on("mouseover", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onMouseOver(e, p))
            .on("mouseout", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onMouseOut(e, p))
            .on("mousemove", (e: MouseEvent, p: d3.HierarchyRectangularNode<INode>) => this.onMouseMove(e, p));

        this._texts = this._cells.append("text")
            .attr("x", d => this.getScaleX(this._nodesWidth)(d.x1 - d.x0) / 2)
            .attr("y", d => this.getRectHeight(d) / 2)
            .attr("dy", "0.32em")
            .attr("text-anchor", d => "middle")
            .attr("font-size", d => {
                // size should be from 2em to 1em (root node to leave nodes)
                var desiredSize = 2 * ((this._level - d.depth) / this._level);
                return desiredSize < 1 ? "1em" : desiredSize + "em";
            });

        /*this._spans = this._texts.append('tspan')
                .text((d: d3.HierarchyRectangularNode<INode>) => { 
                    let getWidth = (node: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(node.x1 - node.x0);
                    let width = (getWidth(d) - 2 * 2);
                    if(width < MaxWidth) {
                        return "";
                    }
                    return d.data.name; 
                });*/
                //.each((d, i, e) => this.wrap(d, i, e));

        // Hook up search button
        const searchButton = document.getElementById("searchButton") as HTMLButtonElement;
        searchButton.addEventListener("click", () => this.onSearch());

         // Hook up reset zoom button
         const resetZoomButton = document.getElementById("resetZoomButton") as HTMLButtonElement;
         resetZoomButton.addEventListener("click", () => this.onClicked(this._rootNode));

        document.getElementById("flip")?.addEventListener("click", () => this.onFlip());

        window.addEventListener("resize", () => this.onResize());
    }

    /*private wrap(node: d3.HierarchyRectangularNode<INode>, index: number, elementGroup: SVGTSpanElement[] | ArrayLike<SVGTSpanElement>) {
        let tspanElement: SVGTSpanElement = elementGroup[index];
        tspanElement.textContent = node.data.name;
        let textContent: string | null = tspanElement.textContent;
        let textLength: number = tspanElement.getComputedTextLength();
        let getWidth = (node: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(node.x1 - node.x0);
        let width = (getWidth(node) - 2 * 2);

        // If the width is less than 20px, don't show function name.
        if(width < MaxWidth) {
            tspanElement.textContent = '';
            return;
        }

        while (textLength > width && textLength > 0) {
            textContent = textContent?.slice(0, -1) || null;
            tspanElement.textContent = textContent + '...';
            textLength = tspanElement.getComputedTextLength();
        }
    }*/

    private getScaleX(nodesWidth: number) {
        return d3.scaleLinear().domain([0, nodesWidth]).range([0, this._width]);
    }

    private getScaleY() {
        return d3.scaleLinear().domain([0, this._nodesHeight]).range([0, this._height]);
    }

    private getRectHeight(node: d3.HierarchyRectangularNode<INode>) {
        return this.getScaleY()(node.y1 - node.y0);
    }

    private colorScale(value: string) {
        return this._colorScale(value);
    }

    private getOffsetY(d: d3.HierarchyRectangularNode<INode>) {
        const y = this.getScaleY()(d.y0);
        return this._isFlipped ? y : this._height - this.getRectHeight(d) - y;
    }

    private onResize(forceRender: boolean = false) {
        const render = () => {
            this._svg
                .attr("width", this._width).attr("height", this._height);

            this._cells
                .attr("transform", (d: d3.HierarchyRectangularNode<INode>) => `translate(${this.getScaleX(this._nodesWidth)(d.x0)},${this.getOffsetY(d)})`);

            this._rects
                .attr("width", (d: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(d.x1 - d.x0))
                .attr("height", (d: d3.HierarchyRectangularNode<INode>) => this.getRectHeight(d));

            this._texts
                .attr("x", (d: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(d.x1 - d.x0) / 2)
                .attr("y", (d: d3.HierarchyRectangularNode<INode>) => this.getRectHeight(d) / 2);

            /*this._spans
            .text((d: d3.HierarchyRectangularNode<INode>) => { 
                let getWidth = (node: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(node.x1 - node.x0);
                let width = (getWidth(d) - 2 * 2);
                if(width < MaxWidth) {
                    return "";
                }
                return d.data.name; 
            });*/
                //.each((d, i, e) => this.wrap(d, i, e));
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

    private onClicked(p: d3.HierarchyRectangularNode<INode>) {
        // p became the new root.
        this._currentFocus = this._currentFocus === p ? p = p.parent ?? p : p;

        if (!p) {
            return;
        }

        let rootx0 = p.x0;
        let rooty0 = p.y0;

        this._nodesWidth = p.x1 - p.x0;
        this._nodesHeight = (p.y1 - p.y0) * (p.height + 1);
        // reset this._height so rect height will scale accordingly.
        this._height = MinViewHeight > p.height * 15 ? MinViewHeight : p.height * 15 +100; 
        // reset svg height so the scroll bar can go away.
        this._svg.attr("height", this._height);

        this._rootNode.each((d: d3.HierarchyRectangularNode<INode>) => {
            d.x0 = d.x0 - rootx0;
            d.x1 = d.x1 - rootx0;
            d.y0 = d.y0 - rooty0;
            d.y1 = d.y1 - rooty0;
        });

    const t = this._cells.transition()
        .duration(750)
        .attr("transform", (d: d3.HierarchyRectangularNode<INode>) => {
            //console.log(`${d.data.name} translate to...  (${this.getScaleX(this._nodesWidth)(d.x0)} ,${this.getOffsetY(d)})`);
            return `translate(${this.getScaleX(this._nodesWidth)(d.x0)},${this.getOffsetY(d)})`;
        });

    this._rects.transition(t as any)
        .attr("width", (d: d3.HierarchyRectangularNode<INode>) => {
            //console.log(`${d.data.name} width...  (${this.getScaleX(this._nodesWidth)(d.x1 - d.x0)})`);
            return this.getScaleX(this._nodesWidth)(d.x1 - d.x0);
        })
        .attr("height", (d: d3.HierarchyRectangularNode<INode>) => {
            //console.log(`${d.data.name} height...  (${this.getRectHeight(d)})`);
            return this.getRectHeight(d);
        });

    this._texts.transition(t as any)
        .attr("x", (d: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(d.x1 - d.x0) / 2)
        .attr("y", (d: d3.HierarchyRectangularNode<INode>) => this.getScaleY()(d.y1 - d.y0) / 2);

        /*this._spans
            .style("opacity", 0)
            .text((d: d3.HierarchyRectangularNode<INode>) => { 
                let getWidth = (node: d3.HierarchyRectangularNode<INode>) => this.getScaleX(this._nodesWidth)(node.x1 - node.x0);
                let width = (getWidth(d) - 2 * 2);
                if(width < MaxWidth) {
                    return "";
                }
                return d.data.name; 
            })
            //.each((d, i, e) => this.wrap(d, i, e))
            .transition()
            .duration(750)
            .style("opacity", 1);*/
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
            .style("left", event.clientX + scrollLeft +  "px")
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
                return d.highlighted ? "red" : this.colorScale((d.children ? d : d.parent).data.name);
            });
    }

    private onFlip() {
        this._isFlipped = (document.getElementById("flip") as HTMLInputElement).checked;
        this.onResize(true);
    }
}

let flameChart: FlameChart;
async function initialize() {
    const data: any = await d3.json("PrimeVisualizer.json");
    flameChart = new FlameChart(d3.hierarchy(data));
}
initialize();