import { hierarchy, tree } from 'd3';

const DEFAULT_VERTICAL_GAP = 180;
const DEFAULT_HORIZONTAL_GAP = 180;
const HORIZONTAL_PADDING = 200;
const VERTICAL_PADDING = 200;
const BRANCH_COLORS = 6;
const NAME_COLLATOR = new Intl.Collator('fr', {
  sensitivity: 'base',
  ignorePunctuation: true
});

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

function annotateBranch(node, branchIndex) {
  node.branchIndex = branchIndex;
  node.children.forEach((child) => {
    annotateBranch(child, branchIndex);
  });
}

function compareNodes(a, b) {
  const genA = parseGeneration(a.person?.generation);
  const genB = parseGeneration(b.person?.generation);
  if (genA != null && genB != null && genA !== genB) {
    return genA - genB;
  }
  if (genA != null && genB == null) {
    return -1;
  }
  if (genA == null && genB != null) {
    return 1;
  }
  const labelA = a.person?.name ?? a.person?.id ?? a.id;
  const labelB = b.person?.name ?? b.person?.id ?? b.id;
  return NAME_COLLATOR.compare(labelA, labelB);
}

function selectPrimaryParent(entries) {
  if (!entries.length) {
    return null;
  }
  const maleEntry = entries.find((entry) => {
    const gender = entry.parentNode.person?.gender;
    if (!gender) {
      return false;
    }
    const normalized = String(gender).toLowerCase();
    return normalized === 'm' || normalized === 'male';
  });
  if (maleEntry) {
    return maleEntry.parentNode;
  }
  const ranked = entries
    .map((entry) => ({
      entry,
      generation: parseGeneration(entry.parentNode.person?.generation)
    }))
    .sort((a, b) => {
      if (a.generation == null && b.generation == null) {
        return 0;
      }
      if (a.generation == null) {
        return 1;
      }
      if (b.generation == null) {
        return -1;
      }
      return a.generation - b.generation;
    });
  return ranked[0]?.entry.parentNode ?? entries[0].parentNode;
}

export function buildTreeLayout(individuals = [], relationships = []) {
  const nodesById = new Map();
  individuals.forEach((person) => {
    ensureNode(nodesById, person);
  });

  const additionalRelationships = [];
  const parentRelationsByChild = new Map();

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
      if (!parentRelationsByChild.has(targetNode.id)) {
        parentRelationsByChild.set(targetNode.id, []);
      }
      parentRelationsByChild.get(targetNode.id).push({
        relation,
        parentNode: sourceNode
      });
    } else {
      additionalRelationships.push(relation);
    }
  });

  const secondaryRelationships = [];

  parentRelationsByChild.forEach((entries, childId) => {
    const childNode = nodesById.get(childId);
    if (!childNode) {
      return;
    }
    const validEntries = entries.filter((entry) => Boolean(entry.parentNode));
    if (validEntries.length === 0) {
      return;
    }
    validEntries.sort((a, b) => compareNodes(a.parentNode, b.parentNode));
    const primaryParent = selectPrimaryParent(validEntries);
    if (primaryParent && !primaryParent.children.includes(childNode)) {
      primaryParent.children.push(childNode);
      childNode.parents.add(primaryParent);
    }
    validEntries.forEach((entry) => {
      if (!entry.parentNode || entry.parentNode === primaryParent) {
        return;
      }
      secondaryRelationships.push({
        type: 'relationship',
        source: entry.parentNode.id,
        target: childId,
        context: entry.relation.context ?? 'secondary-parent'
      });
    });
  });

  nodesById.forEach((node) => {
    node.children.sort(compareNodes);
  });

  let roots = collectRoots(nodesById);
  if (roots.length === 0) {
    roots = Array.from(nodesById.values());
  }

  roots.sort(compareNodes);

  const virtualRoot = {
    id: '__root__',
    person: null,
    children: roots,
    parents: new Set(),
    isVirtual: true
  };

  const hierarchyRoot = hierarchy(virtualRoot, (node) => node.children);
  const treeLayout = tree().nodeSize([DEFAULT_HORIZONTAL_GAP, DEFAULT_VERTICAL_GAP]);
  treeLayout(hierarchyRoot);

  const nodes = [];
  const stats = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  hierarchyRoot.each((hierNode) => {
    const dataNode = hierNode.data;
    if (dataNode === virtualRoot) {
      return;
    }
    dataNode.depth = hierNode.depth - 1;
    dataNode.x = hierNode.x;
    dataNode.y = hierNode.y;

    stats.minX = Math.min(stats.minX, dataNode.x);
    stats.maxX = Math.max(stats.maxX, dataNode.x);
    stats.minY = Math.min(stats.minY, dataNode.y);
    stats.maxY = Math.max(stats.maxY, dataNode.y);

    nodes.push(dataNode);
  });

  if (!Number.isFinite(stats.minX)) {
    stats.minX = 0;
    stats.maxX = 0;
  }
  if (!Number.isFinite(stats.minY)) {
    stats.minY = 0;
    stats.maxY = 0;
  }

  const offsetX = HORIZONTAL_PADDING - stats.minX;
  const offsetY = VERTICAL_PADDING - stats.minY;

  nodes.forEach((node) => {
    node.x += offsetX;
    node.y += offsetY;
  });

  const dimensions = {
    width: stats.maxX - stats.minX + HORIZONTAL_PADDING * 2,
    height: stats.maxY - stats.minY + VERTICAL_PADDING * 2
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
      node.generation = Math.max(0, node.depth ?? 0);
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

  const allRelationships = additionalRelationships.concat(secondaryRelationships);
  const relationshipLinks = allRelationships
    .map((relation) => {
      const sourceNode = nodesById.get(relation.source);
      const targetNode = nodesById.get(relation.target);
      if (
        !sourceNode ||
        !targetNode ||
        sourceNode.isVirtual ||
        targetNode.isVirtual ||
        sourceNode.x == null ||
        sourceNode.y == null ||
        targetNode.x == null ||
        targetNode.y == null
      ) {
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
