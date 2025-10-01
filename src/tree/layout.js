import { cluster, hierarchy, tree } from 'd3';

const DEFAULT_RADIAL_GAP = 220;
const RADIAL_PADDING = 280;
const FAN_START_ANGLE = (-5 * Math.PI) / 6;
const FAN_END_ANGLE = (5 * Math.PI) / 6;
const FAN_ANGLE_RANGE = FAN_END_ANGLE - FAN_START_ANGLE;
const NODE_BOUNDS_PADDING = 32;
const BRANCH_COLORS = 6;
const CARTESIAN_HORIZONTAL_GAP = 260;
const CARTESIAN_VERTICAL_GAP = 140;
const CARTESIAN_HORIZONTAL_PADDING = 260;
const CARTESIAN_VERTICAL_PADDING = 200;
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

function createGraph(individuals = [], relationships = []) {
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

  return {
    nodesById,
    virtualRoot,
    additionalRelationships,
    secondaryRelationships
  };
}

function annotateBranches(virtualRoot) {
  const topLevelChildren = virtualRoot.children.filter((child) => !child.isVirtual);
  topLevelChildren.forEach((child, index) => {
    annotateBranch(child, index % BRANCH_COLORS);
  });
}

function assignGenerations(nodes) {
  nodes.forEach((node) => {
    const declaredGeneration = parseGeneration(node.person?.generation);
    if (declaredGeneration != null) {
      node.generation = declaredGeneration;
    } else {
      node.generation = Math.max(0, node.depth ?? 0);
    }
  });
}

function buildHierarchicalLinks(nodes) {
  const links = [];
  nodes.forEach((node) => {
    node.children.forEach((child) => {
      if (child.isVirtual) {
        return;
      }
      links.push({
        type: 'parent-child',
        sourceId: node.id,
        targetId: child.id,
        source: { x: node.x, y: node.y, angle: node.angle, radius: node.radius },
        target: { x: child.x, y: child.y, angle: child.angle, radius: child.radius }
      });
    });
  });
  return links;
}

function buildRelationshipLinks(nodesById, relationships) {
  return relationships
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
        source: {
          x: sourceNode.x,
          y: sourceNode.y,
          angle: sourceNode.angle,
          radius: sourceNode.radius
        },
        target: {
          x: targetNode.x,
          y: targetNode.y,
          angle: targetNode.angle,
          radius: targetNode.radius
        }
      };
    })
    .filter(Boolean);
}

function collectRenderableNodes(nodes) {
  const renderableNodes = nodes.filter((node) => !node.isVirtual);
  return {
    nodes: renderableNodes,
    nodeById: new Map(renderableNodes.map((node) => [node.id, node]))
  };
}

function combineRelationships(additionalRelationships, secondaryRelationships) {
  return additionalRelationships.concat(secondaryRelationships);
}

function buildFanLayout(graph) {
  const { nodesById, virtualRoot, additionalRelationships, secondaryRelationships } = graph;

  const hierarchyRoot = hierarchy(virtualRoot, (node) => node.children);
  const effectiveDepth = Math.max(1, hierarchyRoot.height - 1);
  const radialLimit = Math.max(DEFAULT_RADIAL_GAP, effectiveDepth * DEFAULT_RADIAL_GAP);

  const radialCluster = cluster()
    .size([FAN_ANGLE_RANGE, radialLimit])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.35));

  radialCluster(hierarchyRoot);

  const nodes = [];
  const stats = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  const canvasRadius = RADIAL_PADDING + radialLimit;
  const centerX = canvasRadius;
  const centerY = canvasRadius;

  hierarchyRoot.each((hierNode) => {
    const dataNode = hierNode.data;
    if (dataNode === virtualRoot) {
      return;
    }
    dataNode.depth = Math.max(0, hierNode.depth - 1);
    const angle = FAN_START_ANGLE + hierNode.x;
    const radialDistance = RADIAL_PADDING + hierNode.y;
    const polarAngle = angle - Math.PI / 2;
    const cartesianX = centerX + radialDistance * Math.cos(polarAngle);
    const cartesianY = centerY + radialDistance * Math.sin(polarAngle);

    dataNode.angle = angle;
    dataNode.radius = radialDistance;
    dataNode.x = cartesianX;
    dataNode.y = cartesianY;

    stats.minX = Math.min(stats.minX, cartesianX);
    stats.maxX = Math.max(stats.maxX, cartesianX);
    stats.minY = Math.min(stats.minY, cartesianY);
    stats.maxY = Math.max(stats.maxY, cartesianY);

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

  const dimensions = {
    width: canvasRadius * 2,
    height: canvasRadius * 2
  };

  const bounds = {
    minX: stats.minX - NODE_BOUNDS_PADDING,
    minY: stats.minY - NODE_BOUNDS_PADDING,
    maxX: stats.maxX + NODE_BOUNDS_PADDING,
    maxY: stats.maxY + NODE_BOUNDS_PADDING
  };

  annotateBranches(virtualRoot);
  assignGenerations(nodes);

  const hierarchicalLinks = buildHierarchicalLinks(nodes);
  const relationshipLinks = buildRelationshipLinks(
    nodesById,
    combineRelationships(additionalRelationships, secondaryRelationships)
  );

  const { nodes: renderableNodes, nodeById } = collectRenderableNodes(nodes);

  return {
    root: virtualRoot,
    nodes: renderableNodes,
    nodeById,
    hierarchicalLinks,
    relationshipLinks,
    dimensions,
    bounds,
    mode: 'fan'
  };
}

function buildHierarchicalLayout(graph) {
  const { nodesById, virtualRoot, additionalRelationships, secondaryRelationships } = graph;

  const hierarchyRoot = hierarchy(virtualRoot, (node) => node.children);
  const cartesianTree = tree()
    .nodeSize([CARTESIAN_VERTICAL_GAP, CARTESIAN_HORIZONTAL_GAP])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.25));

  cartesianTree(hierarchyRoot);

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
    dataNode.depth = Math.max(0, hierNode.depth - 1);
    const cartesianX = hierNode.y;
    const cartesianY = hierNode.x;

    dataNode.angle = null;
    dataNode.radius = null;
    dataNode.x = cartesianX;
    dataNode.y = cartesianY;

    stats.minX = Math.min(stats.minX, cartesianX);
    stats.maxX = Math.max(stats.maxX, cartesianX);
    stats.minY = Math.min(stats.minY, cartesianY);
    stats.maxY = Math.max(stats.maxY, cartesianY);

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

  const spanX = Math.max(1, stats.maxX - stats.minX);
  const spanY = Math.max(1, stats.maxY - stats.minY);

  const offsetX = CARTESIAN_HORIZONTAL_PADDING - stats.minX;
  const offsetY = CARTESIAN_VERTICAL_PADDING - stats.minY;

  nodes.forEach((node) => {
    node.x += offsetX;
    node.y += offsetY;
  });

  const adjustedMinX = stats.minX + offsetX;
  const adjustedMaxX = stats.maxX + offsetX;
  const adjustedMinY = stats.minY + offsetY;
  const adjustedMaxY = stats.maxY + offsetY;

  const dimensions = {
    width: spanX + CARTESIAN_HORIZONTAL_PADDING * 2,
    height: spanY + CARTESIAN_VERTICAL_PADDING * 2
  };

  const bounds = {
    minX: adjustedMinX - NODE_BOUNDS_PADDING,
    maxX: adjustedMaxX + NODE_BOUNDS_PADDING,
    minY: adjustedMinY - NODE_BOUNDS_PADDING,
    maxY: adjustedMaxY + NODE_BOUNDS_PADDING
  };

  annotateBranches(virtualRoot);
  assignGenerations(nodes);

  const hierarchicalLinks = buildHierarchicalLinks(nodes);
  const relationshipLinks = buildRelationshipLinks(
    nodesById,
    combineRelationships(additionalRelationships, secondaryRelationships)
  );

  const { nodes: renderableNodes, nodeById } = collectRenderableNodes(nodes);

  return {
    root: virtualRoot,
    nodes: renderableNodes,
    nodeById,
    hierarchicalLinks,
    relationshipLinks,
    dimensions,
    bounds,
    mode: 'hierarchical'
  };
}

export function buildTreeLayout(individuals = [], relationships = [], options = {}) {
  const { mode = 'fan' } = options ?? {};
  const graph = createGraph(individuals, relationships);
  if (mode === 'hierarchical') {
    return buildHierarchicalLayout(graph);
  }
  return buildFanLayout(graph);
}
