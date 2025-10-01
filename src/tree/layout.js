const DEFAULT_VERTICAL_GAP = 180;
const DEFAULT_HORIZONTAL_GAP = 180;
const HORIZONTAL_PADDING = 200;
const VERTICAL_PADDING = 200;
const BRANCH_COLORS = 6;

function parseGeneration(rawValue) {
  if (rawValue == null) {
    return null;
  }
  const numeric = Number.parseInt(rawValue, 10);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return numeric;
}

function ensureNode(map, person) {
  if (!person || !person.id) {
    return null;
  }
  if (!map.has(person.id)) {
    map.set(person.id, {
      id: person.id,
      person,
      children: [],
      parents: new Set(),
      isVirtual: false
    });
  }
  return map.get(person.id);
}

function collectRoots(nodes) {
  const roots = [];
  nodes.forEach((node) => {
    if (node.parents.size === 0) {
      roots.push(node);
    }
  });
  return roots;
}

function assignDepth(node, depth) {
  node.depth = depth;
  node.children.forEach((child) => {
    assignDepth(child, depth + 1);
  });
}

function firstWalk(node, nextX) {
  if (!node.children.length) {
    node._x = nextX.value;
    nextX.value += 1;
    return;
  }

  node.children.forEach((child) => {
    firstWalk(child, nextX);
  });

  const firstChild = node.children[0];
  const lastChild = node.children[node.children.length - 1];
  node._x = (firstChild._x + lastChild._x) / 2;
}

function secondWalk(node, nodes, stats, gaps) {
  const depthOffset = node.depth + 1; // Compense la racine virtuelle (-1)
  const x = node._x * gaps.horizontal;
  const y = depthOffset * gaps.vertical;

  node.x = x;
  node.y = y;

  if (!node.isVirtual) {
    stats.minX = Math.min(stats.minX, x);
    stats.maxX = Math.max(stats.maxX, x);
    stats.maxDepth = Math.max(stats.maxDepth, node.depth);
    nodes.push(node);
  }

  node.children.forEach((child) => {
    secondWalk(child, nodes, stats, gaps);
  });
}

function annotateBranch(node, branchIndex) {
  node.branchIndex = branchIndex;
  node.children.forEach((child) => {
    annotateBranch(child, branchIndex);
  });
}

export function buildTreeLayout(individuals = [], relationships = []) {
  const nodesById = new Map();
  individuals.forEach((person) => {
    ensureNode(nodesById, person);
  });

  const additionalRelationships = [];

  relationships.forEach((relation) => {
    if (!relation || !relation.source || !relation.target) {
      return;
    }
    const sourceNode = nodesById.get(relation.source);
    const targetNode = nodesById.get(relation.target);
    if (!sourceNode || !targetNode) {
      return;
    }
    if (relation.type === 'parent-child') {
      if (!sourceNode.children.includes(targetNode)) {
        sourceNode.children.push(targetNode);
      }
      targetNode.parents.add(sourceNode);
    } else {
      additionalRelationships.push(relation);
    }
  });

  let roots = collectRoots(nodesById);
  if (roots.length === 0) {
    roots = Array.from(nodesById.values());
  }

  const virtualRoot = {
    id: '__root__',
    person: null,
    children: roots,
    parents: new Set(),
    isVirtual: true,
    depth: -1
  };

  assignDepth(virtualRoot, -1);

  // Attache les nœuds orphelins (non atteints) à la racine virtuelle
  nodesById.forEach((node) => {
    if (node.depth == null) {
      virtualRoot.children.push(node);
      node.parents.add(virtualRoot);
      assignDepth(node, 0);
    }
  });

  // Recalcule les profondeurs avec les nouveaux enfants potentiels
  assignDepth(virtualRoot, -1);

  const nextX = { value: 0 };
  firstWalk(virtualRoot, nextX);

  const nodes = [];
  const stats = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxDepth: Number.NEGATIVE_INFINITY
  };

  secondWalk(
    virtualRoot,
    nodes,
    stats,
    {
      horizontal: DEFAULT_HORIZONTAL_GAP,
      vertical: DEFAULT_VERTICAL_GAP
    }
  );

  if (!Number.isFinite(stats.minX)) {
    stats.minX = 0;
    stats.maxX = 0;
  }

  if (!Number.isFinite(stats.maxDepth)) {
    stats.maxDepth = 0;
  }

  const offsetX = HORIZONTAL_PADDING - stats.minX;
  nodes.forEach((node) => {
    node.x += offsetX;
  });

  const dimensions = {
    width: stats.maxX - stats.minX + HORIZONTAL_PADDING * 2,
    height: (stats.maxDepth + 2) * DEFAULT_VERTICAL_GAP + VERTICAL_PADDING
  };

  const topLevelChildren = virtualRoot.children.filter((child) => !child.isVirtual);
  topLevelChildren.forEach((child, index) => {
    annotateBranch(child, index % BRANCH_COLORS);
  });

  nodes.forEach((node) => {
    const declaredGeneration = parseGeneration(node.person?.generation);
    if (declaredGeneration != null) {
      node.generation = declaredGeneration;
    } else {
      node.generation = Math.max(0, node.depth);
    }
  });

  const hierarchicalLinks = [];
  nodes.forEach((node) => {
    node.children.forEach((child) => {
      if (child.isVirtual) {
        return;
      }
      hierarchicalLinks.push({
        type: 'parent-child',
        sourceId: node.id,
        targetId: child.id,
        source: { x: node.x, y: node.y },
        target: { x: child.x, y: child.y }
      });
    });
  });

  const relationshipLinks = additionalRelationships
    .map((relation) => {
      const sourceNode = nodesById.get(relation.source);
      const targetNode = nodesById.get(relation.target);
      if (!sourceNode || !targetNode || sourceNode.isVirtual || targetNode.isVirtual) {
        return null;
      }
      return {
        type: relation.type,
        context: relation.context ?? null,
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        source: { x: sourceNode.x, y: sourceNode.y },
        target: { x: targetNode.x, y: targetNode.y }
      };
    })
    .filter(Boolean);

  const renderableNodes = nodes.filter((node) => !node.isVirtual);
  const renderableNodesMap = new Map(renderableNodes.map((node) => [node.id, node]));

  return {
    root: virtualRoot,
    nodes: renderableNodes,
    nodeById: renderableNodesMap,
    hierarchicalLinks,
    relationshipLinks,
    dimensions
  };
}
