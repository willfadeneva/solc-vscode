import * as vscode from 'vscode';

import {
  ExtensionContext,
  window
} from "vscode";

// FIXME: figure out how to export
export interface SolcAstNode {
  /* The following attributes are essential, and indicates an that object
     is an AST node. */
  readonly id: number;  // This is unique across all nodes in an AST tree
  readonly nodeType: string;
  readonly src: string;

  readonly absolutePath?: string;
  readonly exportedSymbols?: Object;
  readonly nodes?: Array<SolcAstNode>;
  readonly literals?: Array<string>;
  readonly file?: string;
  readonly scope?: number;
  readonly sourceUnit?: number;
  readonly symbolAliases?: Array<string>;
  readonly [x: string]: any;
  // These are filled in
  children?: Array<SolcAstNode>;
  parent?: SolcAstNode | null;
}

/*** These are copied from vscode.proposed.d.ts *******/
interface TreeItemLabel {

    /**
     * A human-readable string describing the [Tree item](#TreeItem).
     */
    label: string;

    /**
     * Ranges in the label to highlight. A range is defined as a tuple of two number where the
     * first is the inclusive start index and the second the exclusive end index
     */
    highlights?: [number, number][];

}

export class TreeItem2 extends vscode.TreeItem {
    /**
     * Label describing this item. When `falsy`, it is derived from [resourceUri](#TreeItem.resourceUri).
     */
    label?: string | TreeItemLabel | /* for compilation */ any;

    /**
     * @param label Label describing this item
     * @param collapsibleState [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item. Default is [TreeItemCollapsibleState.None](#TreeItemCollapsibleState.None)
     */
    // constructor(label: TreeItemLabel, collapsibleState?: TreeItemCollapsibleState);
}

/***********************************************************/


import { LspManager } from "solc-lsp";

// Keyed by external filename, we keep track of the ast Roots
const astRoots: any = {};

// create a decorator type that we use to show AST range associations
export const astRangeDecorationType = vscode.window.createTextEditorDecorationType({
	borderWidth: '1px',
	borderStyle: 'solid',
	overviewRulerColor: 'blue',
	overviewRulerLane: vscode.OverviewRulerLane.Right,
	light: {
		// this color will be used in light color themes
		borderColor: 'darkblue'
	},
	dark: {
		// this color will be used in dark color themes
		borderColor: 'lightblue'
	}
});

export class SolidityASTView {

  astRoot: SolcAstNode | null;
  lspMgr: LspManager;

  // Mapping from Solc AST id to solc AST node.
  id2Node: any = {};

  // Last selected tree node. Used in toggling highlighted source region.
  lastSelected: string = '';

  constructor(context: ExtensionContext,
              lspMgr: LspManager, astRoot: SolcAstNode | null) {
    const view = vscode.window.createTreeView("solcAstView", {
      treeDataProvider: this.aNodeWithIdTreeDataProvider(), showCollapseAll: true
    });
    this.lspMgr = lspMgr;
    this.astRoot = astRoot;
    if (astRoot !== null && astRoot.absolutePath !== undefined)
      astRoots[astRoot.absolutePath] = this;

    // Bogus use of variables to keep typescript compiler happy.
    view; context;

  }


  getTreeItem(node: SolcAstNode): TreeItem2 {
    if (!node) return {
      label: <TreeItemLabel>{ label: "???", "foo": void 0},
      collapsibleState: vscode.TreeItemCollapsibleState.None
    };
    let label: string = '';
    let highlights: Array<[number, number]> = [];
    if ("name" in node) {
      highlights = [[0, node.name.length]]
      label = `${node.name} ${node.nodeType}`;
    } else {
      label = node.nodeType;
    }

    const idStr = node.id.toString();
    this.id2Node[idStr] = node;
    const item: TreeItem2 = {
      label: <TreeItemLabel>{label, highlights},
      tooltip: this.lspMgr.textFromSrc(node.src),
      collapsibleState: (node && node.children && node.children.length)
        ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    };

    if (this.astRoot !== null) {
      item.id = `${idStr} ${this.astRoot.absolutePath}`;
    }

    item.command = {
      command: "solidity.astView.selectNode",
      title: "SelectNode",
      arguments: [item]
    }
    return item;
  }

  aNodeWithIdTreeDataProvider(): vscode.TreeDataProvider<SolcAstNode> {
    return {
      getChildren: (element: SolcAstNode): Array<SolcAstNode> => {
        return this.getChildren(element);
      },
      getTreeItem: (element: SolcAstNode): vscode.TreeItem => {
        const treeItem = this.getTreeItem(element);
        return treeItem;
      },
      getParent: (element: SolcAstNode): SolcAstNode | null | undefined => {
        return element.parent;
      }
    };
  }

  getChildren(astItem: SolcAstNode): Array<SolcAstNode> {
    if (!astItem) {
      if (!this.astRoot) return [];
      astItem = this.astRoot;
    }
    if (astItem.children) return astItem.children;
    return [];
  }

  selectTreeItemToggle(item: TreeItem2) {
    if (item.id === undefined) return;

    // FIXME: Don't assume activeTextEditor
	  const activeEditor = window.activeTextEditor;
    if (!activeEditor) return;

    // FIXME: Split should split on 1st blank only and preserve other blanks
    const [id, astRoot] = item.id.split(" ");

    if (!(astRoot in astRoots)) return;
    const self = astRoots[astRoot];
    if (self.lastSelected == item.id) {
		  activeEditor.setDecorations(astRangeDecorationType, []);
      self.lastSelected = null;
      return;
    }
    const node = self.id2Node[id];
    const fileIndex = node.src.split(":")[2];
    const filePath = self.lspMgr.fileInfo.sourceList[fileIndex];
    const finfo = self.lspMgr.fileInfo[filePath];
    const targetRange = finfo.sourceMapping.lineColRangeFromSrc(node.src, 0, 0);
		const decoration = { range: targetRange, hoverMessage: `Span for ${item.label.label}` };

		activeEditor.setDecorations(astRangeDecorationType, [decoration]);
    self.lastSelected = item.id;
  }

}
