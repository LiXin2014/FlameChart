import { Color } from './color.js';
import * as Utils from './flamechartUtils.js';

export interface INode {
    name: string,
    id: number,         // an id that marks navigation order
    value: number,
    type: string,
    hide: boolean,      // indicates if the rect is hidden
    fade: boolean,      // indicates if the rect is faded
    children: INode[]
}

const MaxWidth: number = 80;  // maximum text width for showing rect title.
const RectHeight: number = 15;  // each rect has height 15.

class FlameChart {
    private _nodes: d3.HierarchyRectangularNode<INode>[];
    private _rootNode: d3.HierarchyRectangularNode<INode>;
    private _currentFocus: d3.HierarchyRectangularNode<INode>;
    private _divContainer: HTMLElement;
    private _nodesWidth: number;
    private _nodesHeight: number;
    private _width: number;
    private _height: number;
    private _letterLength: number = 0;
    private _tooltipDiv: d3.Selection<HTMLDivElement, any, HTMLElement, any>;
    private _svg: d3.Selection<SVGElement, INode, HTMLElement, any>;
    private _cells: d3.Selection<SVGGElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _rects: d3.Selection<SVGRectElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _texts: d3.Selection<SVGTextElement, d3.HierarchyRectangularNode<INode>, SVGElement, INode>;
    private _resizeTimeout: any = 0;
    private _isFlipped: KnockoutObservable<boolean> = ko.observable(true);
    private _id: number = 0;
    private _scaleX: d3.ScaleLinear<number, number, never>;
    private _scaleY: d3.ScaleLinear<number, number, never>;

    constructor(root: d3.HierarchyNode<INode>) {
        // sum computes value for each node. node's value = whatever returns here + its children value total
        const summed = root.sum((d: INode) => {
            var childrenValueTotal = 0;
            d.children?.forEach((child: INode) => { childrenValueTotal += child.value; })
            return d.value - childrenValueTotal;
        });
        const sorted = summed.sort((a: d3.HierarchyNode<INode>, b: d3.HierarchyNode<INode>) => d3.descending(a.height, b.height) && d3.descending(a.value, b.value));

        this._width = document.body.clientWidth;
        this._height = (root.height + 1) * RectHeight;
        const partitionLayout = d3.partition<INode>().size([this._height, this._width]).padding(0);  // padding introduces a lot problems. missing cells, too big gap when zoomed in. So instead of using padding, use strokewidth around rect to achieve padding look.

        const partitioned = partitionLayout(sorted);
        this._nodes = partitioned.descendants();
        this._rootNode = this._nodes[0];

        this._currentFocus = this._rootNode;
        this._nodesWidth = this._rootNode.x1 - this._rootNode.x0;
        this._nodesHeight = (this._rootNode.y1 - this._rootNode.y0) * (this._rootNode.height + 1);
        this._scaleX = d3.scaleLinear().domain([0, this._nodesWidth]).range([0, this._width]);
        this._scaleY = d3.scaleLinear().domain([0, this._nodesHeight]).range([0, this._height]);

        // Define the div for the tooltip
        this._tooltipDiv = d3.select<HTMLDivElement, any>("#container").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        this._svg = d3.select<SVGElement, INode>("svg").attr("width", this._width).attr("height", this._height);

        // set width and height for container, so the scroll shows up when overflow.
        this._divContainer = document.querySelector("#container") as HTMLElement;
        this._divContainer.style.width = document.body.clientWidth.toString() + "px";
        this._divContainer.style.height = document.body.clientHeight.toString() + "px";

        this._cells = this._svg
        .selectAll<SVGGElement, INode>("g")
        .data(this._nodes)
        .join("g")
        .attr("transform", d => {
            d.data.id = this._id++;
            return `translate(${this._scaleX(d.x0)},${this.getOffsetY(d)})`;
        })

        this._rects = this._cells.append("rect")
            .attr("width", d => this.getRectWidth(d))
            .attr("height", RectHeight)
            .attr("opacity", 0.6)
            .attr("tabindex", 0)
            .attr("aria-label", d => d.data.name)
            .attr("fill", d => {
                return Color.colorHash(d.data.name, d.data.type);
            })
            .attr("stroke-width", 1)
            .attr("stroke", "rgb(255, 255, 255)")
            .style("cursor", "pointer")
            .on("click", (e: Event, p: d3.HierarchyRectangularNode<INode>) => this.onZoom(p))
            .on("keydown", (e: KeyboardEvent, p: d3.HierarchyRectangularNode<INode>) => this.onKeyDown(e, p))
            .on("mouseover", (e: MouseEvent, p: d3.HierarchyRectangularNode<INode>) => Utils.onMouseOver(e, p, this._tooltipDiv))
            .on("mouseout", (e: Event, p: d3.HierarchyRectangularNode<INode>) => Utils.onMouseOut(e, p, this._tooltipDiv))
            .on("mousemove", (e: MouseEvent, p: d3.HierarchyRectangularNode<INode>) => Utils.onMouseMove(e, p, this._tooltipDiv));

        this._texts = this._cells.append("text")
            .attr("x", d => this.getRectWidth(d) / 2)
            .attr("y", RectHeight / 2)
            .attr("dy", "0.32em")
            .attr("text-anchor", d => "middle")
            .attr("font-family", "Monospace")   // use Monospace so each character takes same space.
            .attr("font-size", "1.2em");

        this._texts.text((d: d3.HierarchyRectangularNode<INode>) => this.getRectText(d));
        this._isFlipped.subscribe(this.onFlip, this);

        window.addEventListener("resize", () => this.onResize());
    }

    private getRectText(node: d3.HierarchyRectangularNode<INode>) {
        let width = (this.getRectWidth(node) - 2 * 2);
        if (this._letterLength === 0) {
            this._letterLength = Utils.getLetterLength(this._texts.nodes()[0]);
        }
        let textLength: number = node.data.name.length * this._letterLength;

        if (width < MaxWidth) {
            return "";
        } else if (textLength < width) {
            return node.data.name;
        } else {
            let numOfLetters = width / this._letterLength - 3;
            return node.data.name.slice(0, numOfLetters) + '...';
        }
    }

    private getRectWidth(node: d3.HierarchyRectangularNode<INode>) {
        return this._scaleX(node.x1 - node.x0);
    }

    private getOffsetY(d: d3.HierarchyRectangularNode<INode>) {
        const y = this._scaleY(d.y0);
        return this.isFlipped() ? y : this._height - RectHeight - y;
    }

    private onResize(forceRender: boolean = false) {
        const render = () => {
            var startTime = new Date().getTime();
            this._width = document.body.clientWidth;
            this._scaleX = d3.scaleLinear().domain([0, this._nodesWidth]).range([0, this._width]);
            this._divContainer.style.width = document.body.clientWidth.toString() + "px";
            this._divContainer.style.height = document.body.clientHeight.toString() + "px";

            this._svg
                .attr("width", this._width).attr("height", this._height);

            this._cells
                .attr("transform", (d: d3.HierarchyRectangularNode<INode>) => `translate(${this._scaleX(d.x0)},${this.getOffsetY(d)})`);

            var transitionCells = new Date().getTime();
            console.log("transition cells: ", transitionCells - startTime);

            this._rects
                .attr("width", (d: d3.HierarchyRectangularNode<INode>) => this.getRectWidth(d))

            var transitionRects = new Date().getTime();
            console.log("transition rects: ", transitionRects - transitionCells);

            this._texts
                .attr("x", (d: d3.HierarchyRectangularNode<INode>) => {
                    return d.data.fade ? this._width / 2 - this._scaleX(d.x0) : this.getRectWidth(d) / 2;
                })
                .attr("y", RectHeight / 2)
                .text((d: d3.HierarchyRectangularNode<INode>) => this.getRectText(d));

            var endTime = new Date().getTime();

            console.log("transition Texts: ", endTime - transitionRects);

            console.log("resize total: ", endTime - startTime);
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

    public onResetZoom() {
        this.onZoom(this._rootNode);
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
        this._scaleX = d3.scaleLinear().domain([0, this._nodesWidth]).range([0, this._width]);

        this._rootNode.each((d: d3.HierarchyRectangularNode<INode>) => {
            d.x0 = d.x0 - rootx0;
            d.x1 = d.x1 - rootx0;
        });

        Utils.hideSiblings(p);
        Utils.fadeAncestors(p);
        Utils.show(p);

        this._cells.each((d, i, e) => this.zoomCells(d, i, e));

        var transitionCells = new Date().getTime();
        console.log("transition cells: ", transitionCells - startTime);

        this._rects.each((d, i, e) => this.zoomRects(d, i, e));

        var transitionRects = new Date().getTime();
        console.log("transition rects: ", transitionRects - transitionCells);

        this._texts.each((d, i, e) => this.zoomTexts(d, i, e));

        var endTime = new Date().getTime();

        console.log("transition Texts: ", endTime - transitionRects);

        console.log("elapsed total: ", endTime - startTime);
    }

    private zoomCells(node: d3.HierarchyRectangularNode<INode>, index: number, elementGroup: SVGGElement[] | ArrayLike<SVGGElement>) {
        let rectElement: SVGGElement = elementGroup[index];
        rectElement.setAttribute("transform", `translate(${node.data.fade ? 0 : this._scaleX(node.x0)},${this.getOffsetY(node)})`);
    }

    private zoomRects(node: d3.HierarchyRectangularNode<INode>, index: number, elementGroup: SVGRectElement[] | ArrayLike<SVGRectElement>) {
        let rectElement: SVGRectElement = elementGroup[index];
        if (node.data.hide) {
            rectElement.setAttribute("tabindex", "-1");
        } else if (node.data.fade) {
            rectElement.setAttribute("opacity", "0.3");
            rectElement.setAttribute("width", this._width.toString());
        } else {
            rectElement.setAttribute("opacity", "0.6");
            rectElement.setAttribute("tabindex", "0");
            rectElement.setAttribute("width", this.getRectWidth(node).toString());
        }
    }

    private zoomTexts(node: d3.HierarchyRectangularNode<INode>, index: number, elementGroup: SVGTextElement[] | ArrayLike<SVGTextElement>) {
        let textElement: SVGTextElement = elementGroup[index];
        if (node.data.fade) {
            textElement.setAttribute("x", (this._width / 2).toString());
            textElement.textContent = node.data.name;
        } else {
            textElement.setAttribute("x", (this.getRectWidth(node) / 2).toString());
            textElement.textContent = this.getRectText(node);
        }
    }

    private onKeyDown(e: KeyboardEvent, p: d3.HierarchyRectangularNode<INode>) {
        // zoom in / out with Enter
        if (e.keyCode === 13) {
            this.onZoom(p);
        }
        // go to root with Escape
        else if (e.keyCode === 27) {
            let rect: SVGRectElement = (this._rects as any)._groups[0][0];
            rect.focus();
        }
        // go to parent with Up
        else if (e.keyCode === 38) {
            if (!p.data.id === undefined) {
                console.log("the id should be set in constructor!");
            }
            let parent: d3.HierarchyRectangularNode<INode> = !p.parent ? this._rootNode : p.parent;
            let rect: SVGRectElement = (this._rects as any)._groups[0][parent.data.id];
            rect.focus();
            e.preventDefault();
            e.stopPropagation();
        }
        // go to left most visible child with Down
        else if (e.keyCode === 40) {
            if (!p.data.id === undefined) {
                console.log("the id should be set in constructor!");
            }
            let child: d3.HierarchyRectangularNode<INode> = !p.children ? this._rootNode : p.children.filter(node => !node.data.hide)[0];
            let rect: SVGRectElement = (this._rects as any)._groups[0][child.data.id];
            rect.focus();
            e.preventDefault();
            e.stopPropagation();
        }
        // go to left sibling with Left
        else if (e.keyCode === 37) {
            if (!p.data.id) {
                console.log("the id should be set in constructor!");
            }
            if (p.parent?.children) {
                let leftSibling = p.parent?.children.filter(node => node.data.id === p.data.id - 1).filter(node => !node.data.hide)[0]
                if (leftSibling) {
                    let rect: SVGRectElement = (this._rects as any)._groups[0][leftSibling.data.id];
                    rect.focus();
                }
            }
        }
        // go to right sibling with Right
        else if (e.keyCode === 39) {
            if (!p.data.id) {
                console.log("the id should be set in constructor!");
            }
            if (p.parent?.children) {
                let rightSibling = p.parent?.children.filter(node => node.data.id === p.data.id + 1).filter(node => !node.data.hide)[0]
                if (rightSibling) {
                    let rect: SVGRectElement = (this._rects as any)._groups[0][rightSibling.data.id];
                    rect.focus();
                }
            }
        }
    }

    public onSearch() {
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

    public onClearSearch() {
        (document.getElementById("term") as HTMLInputElement)!.value = "";
        this._rects.each((rect: any) => {
            rect.highlighted = false;
        });

        this._rects.transition()
            .duration(750)
            .attr("fill", (d: any) => {
                return Color.colorHash(d.data.name, d.data.type);
            });
    }

    private onFlip() {
        this.onResize(true);
    }

    public get isFlipped(): KnockoutObservable<boolean> {
        return this._isFlipped;
    }
}

async function initialize() {
    const data: any = await d3.json("PrimeVisualizer.json");
    const flameChart = new FlameChart(d3.hierarchy(data));
    ko.applyBindings(flameChart);
}
initialize();