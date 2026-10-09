/** 将扁平 Git 变更列表建成可折叠目录树。 */
import type { GitChangedFile } from "@thinker-workbench/shared";

export type ChangeTreeDir = {
  kind: "dir";
  name: string;
  path: string;
  children: ChangeTreeNode[];
};

export type ChangeTreeFile = {
  kind: "file";
  name: string;
  path: string;
  added: number;
  removed: number;
  status: string;
};

export type ChangeTreeNode = ChangeTreeDir | ChangeTreeFile;

/** 节点改动量：文件用自身 +/-，目录汇总子树。 */
function nodeChurn(node: ChangeTreeNode): number {
  if (node.kind === "file") return node.added + node.removed;
  let sum = 0;
  for (const child of node.children) sum += nodeChurn(child);
  return sum;
}

/** 改动量高的排前；同量再目录优先、再按名。 */
function compareNodes(a: ChangeTreeNode, b: ChangeTreeNode): number {
  const byChurn = nodeChurn(b) - nodeChurn(a);
  if (byChurn !== 0) return byChurn;
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

function sortTree(nodes: ChangeTreeNode[]): ChangeTreeNode[] {
  for (const n of nodes) {
    if (n.kind === "dir") n.children = sortTree(n.children);
  }
  return nodes.sort(compareNodes);
}

/** 由扁平 Git 变更列表构建目录树。 */
export function buildChangeTree(files: GitChangedFile[]): ChangeTreeNode[] {
  type MutableDir = {
    kind: "dir";
    name: string;
    path: string;
    children: ChangeTreeNode[];
    map: Map<string, MutableDir>;
  };

  const root: MutableDir = { kind: "dir", name: "", path: "", children: [], map: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    if (!parts.length) continue;
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]!;
      const dirPath = parts.slice(0, i + 1).join("/");
      let next = cur.map.get(name);
      if (!next) {
        next = { kind: "dir", name, path: dirPath, children: [], map: new Map() };
        cur.map.set(name, next);
        cur.children.push(next);
      }
      cur = next;
    }
    const name = parts[parts.length - 1]!;
    cur.children.push({
      kind: "file",
      name,
      path: file.path,
      added: file.added,
      removed: file.removed,
      status: file.status,
    });
  }

  return sortTree(root.children);
}

/** 按查询过滤目录/文件，并为匹配项收集需展开的路径。 */
export function filterChangeTree(
  nodes: ChangeTreeNode[],
  query: string,
): { nodes: ChangeTreeNode[]; expandPaths: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { nodes, expandPaths: new Set() };

  const expandPaths = new Set<string>();

  function walk(list: ChangeTreeNode[]): ChangeTreeNode[] {
    const out: ChangeTreeNode[] = [];
    for (const node of list) {
      if (node.kind === "file") {
        if (node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q)) {
          out.push(node);
        }
        continue;
      }
      const kids = walk(node.children);
      const selfMatch = node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
      if (kids.length || selfMatch) {
        if (kids.length) expandPaths.add(node.path);
        out.push({ ...node, children: kids.length ? kids : node.children });
        // 展开匹配项的祖先目录
        if (kids.length) {
          let p = node.path;
          while (p) {
            expandPaths.add(p);
            const i = p.lastIndexOf("/");
            p = i >= 0 ? p.slice(0, i) : "";
          }
        }
      }
    }
    return out;
  }

  return { nodes: walk(nodes), expandPaths };
}
