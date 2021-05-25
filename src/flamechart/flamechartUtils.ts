import {INode} from './flamechart.js';

// call back when mouse moves into a flamechart rect
export function onMouseOver(event: Event, d: d3.HierarchyRectangularNode<INode>, tooltip: d3.Selection<HTMLDivElement, any, HTMLElement, any>) {
    tooltip.transition()
        .duration(200)
        .style("opacity", .9);
}

// call back when mouse moves out a flamechart rect
export function onMouseOut(event: Event, d: d3.HierarchyRectangularNode<INode>, tooltip: d3.Selection<HTMLDivElement, any, HTMLElement, any>) {
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
}

// call back when mouse moves inside a flamechart rect
export function onMouseMove(event: MouseEvent, d: d3.HierarchyRectangularNode<INode>, tooltip: d3.Selection<HTMLDivElement, any, HTMLElement, any>) {
    let container: HTMLDivElement | null = document.querySelector('#container');
    let scrollTop: number = container ? container.scrollTop : 0;
    let scrollLeft: number = container ? container.scrollLeft : 0;

    tooltip.html("<b>name:</b> " + d.data.name + ", <b>value:</b> " + d.data.value)
        .style("left", event.clientX + scrollLeft + "px")
        .style("top", event.clientY + scrollTop + "px");
}

// Compute current font size.
export function getFontSize(rectHeight: number) {
    if (rectHeight < 20) {
        return "1.2em";
    }
    else if (rectHeight < 30) {
        return "1.5em";
    }
    else if (rectHeight < 50) {
        return "2em";
    }
    return "2.5em";
}

// Compute how much space each letter takes with current front size.
export function getLetterLength(text: SVGTextElement): number {
    let textContent: string | null = text.textContent;
    let textLength: number = text.getComputedTextLength();
    let letterLength = textContent ? textLength / textContent.length : 0;
    return Math.ceil(letterLength);
}

// Hide all sibling and their children for node
export function hideSiblings(node: d3.HierarchyRectangularNode<INode>) {
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
                sibling.each(node => {
                    node.data.hide = true;
                });
            }
        }
        child = parent;
        parent = child.parent;
    }
}

// Show d and all its children
export function show(d: d3.HierarchyRectangularNode<INode>) {
    d.data.fade = false
    d.data.hide = false
    if (d.children) {
        d.children.forEach((d: d3.HierarchyRectangularNode<INode>) => show(d));
    }
}

// Fade out all d's ancestors
export function fadeAncestors (d: d3.HierarchyRectangularNode<INode>) {
    if (d.parent) {
        d.parent.data.fade = true;
        fadeAncestors(d.parent)
    }
}