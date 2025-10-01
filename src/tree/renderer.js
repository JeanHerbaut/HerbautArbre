import * as d3 from 'd3';

const ZOOM_EXTENT = [0.35, 3];
const FOCUS_TRANSITION_DURATION = 650;
const ZOOM_TRANSITION_DURATION = 320;
const FOCUS_MIN_SCALE = 1.15;
const FOCUS_AUTO_DIVISOR = 420;

function buildLinkPath(link) {
  const { source, target } = link;
  if (link.type === 'parent-child') {
    const midY = (source.y + target.y) / 2;
    return `M${source.x},${source.y}C${source.x},${midY} ${target.x},${midY} ${target.x},${target.y}`;
  }
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

function nodeClasses(datum) {
  const classes = ['tree-node'];
  if (datum.person) {
    classes.push('tree-node--person');
  } else {
    classes.push('tree-node--group');
  }
  if (typeof datum.branchIndex === 'number') {
    classes.push(`tree-node--branch-${datum.branchIndex}`);
  }
  if (datum.person?.gender) {
    const gender = datum.person.gender.toLowerCase();
    if (gender === 'f' || gender === 'female') {
      classes.push('tree-node--female');
    } else if (gender === 'm' || gender === 'male') {
      classes.push('tree-node--male');
    }
  }
  return classes.join(' ');
}

function linkClassName(type) {
  const normalized = String(type ?? 'relationship')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return `tree-link tree-link--${normalized}`;
}

export function createTreeRenderer({ svgElement, containerElement, layout, onPersonSelected }) {
  const { nodes, hierarchicalLinks, relationshipLinks, dimensions, nodeById } = layout;

  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
  svg.attr('role', 'presentation');
  svg.style('cursor', 'grab');
  svg.style('touch-action', 'none');

  const rootGroup = svg.append('g').attr('class', 'tree-canvas__viewport');
  const linksGroup = rootGroup.append('g').attr('class', 'tree-links');
  const relationshipsGroup = rootGroup.append('g').attr('class', 'tree-links tree-links--relationships');
  const nodesGroup = rootGroup.append('g').attr('class', 'tree-nodes');

  linksGroup
    .selectAll('path')
    .data(hierarchicalLinks)
    .join('path')
    .attr('class', (d) => linkClassName(d.type))
    .attr('d', buildLinkPath);

  relationshipsGroup
    .selectAll('path')
    .data(relationshipLinks)
    .join('path')
    .attr('class', (d) => linkClassName(d.type))
    .attr('d', buildLinkPath);

  const nodeElements = nodesGroup
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', nodeClasses)
    .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
    .attr('tabindex', (d) => (d.person ? 0 : null))
    .attr('role', (d) => (d.person ? 'button' : null))
    .attr('data-person-id', (d) => d.person?.id ?? null)
    .attr('aria-label', (d) => (d.person ? `Afficher les détails de ${d.person.name ?? d.person.id}` : null));

  nodeElements
    .append('circle')
    .attr('class', 'tree-node__marker')
    .attr('r', (d) => (d.person ? 12 : 9));

  const labels = nodeElements
    .append('text')
    .attr('class', 'tree-node__label')
    .attr('dy', '0.32em')
    .attr('x', 18)
    .text((d) => d.person?.name ?? d.person?.id ?? d.person ?? d.id);

  labels
    .filter((d) => Boolean(d.person?.sosa) || d.generation != null)
    .append('tspan')
    .attr('class', 'tree-node__subtitle')
    .attr('x', 18)
    .attr('dy', '1.2em')
    .text((d) => {
      const fragments = [];
      if (d.person?.sosa) {
        fragments.push(`Sosa ${d.person.sosa}`);
      }
      if (d.generation != null) {
        fragments.push(`Génération ${d.generation}`);
      }
      return fragments.join(' • ');
    });

  const nodeElementMap = new Map();
  nodeElements.each(function (d) {
    if (d.person) {
      nodeElementMap.set(d.person.id, this);
    }
  });

  let highlightedId = null;
  let currentTransform = d3.zoomIdentity;

  function setHighlight(personId) {
    nodeElements.classed('tree-node--highlight', (d) => d.person?.id === personId);
    highlightedId = personId ?? null;
  }

  function focusOnIndividual(personId, { animate = true } = {}) {
    const node = nodeById.get(personId);
    if (!node) {
      return false;
    }
    setHighlight(personId);
    const nodeElement = nodeElementMap.get(personId);
    const { width, height } = containerElement.getBoundingClientRect();
    const shortestSide = Math.min(width, height);
    const autoScale = Number.isFinite(shortestSide) && shortestSide > 0
      ? shortestSide / FOCUS_AUTO_DIVISOR
      : FOCUS_MIN_SCALE;
    const baseScale = Math.min(
      ZOOM_EXTENT[1],
      Math.max(ZOOM_EXTENT[0], Math.max(autoScale, FOCUS_MIN_SCALE))
    );
    const targetScale = Math.min(ZOOM_EXTENT[1], Math.max(baseScale, currentTransform.k || 0));
    const translateX = width / 2 - node.x * targetScale;
    const translateY = height / 2 - node.y * targetScale;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);

    const zoomTarget = animate ? svg.transition().duration(FOCUS_TRANSITION_DURATION) : svg;
    zoomTarget.call(zoomBehavior.transform, targetTransform);

    if (typeof nodeElement?.focus === 'function') {
      nodeElement.focus({ preventScroll: true });
    }
    return true;
  }

  function adjustZoom(factor) {
    const { width, height } = containerElement.getBoundingClientRect();
    const targetScale = Math.max(
      ZOOM_EXTENT[0],
      Math.min(ZOOM_EXTENT[1], currentTransform.k * factor)
    );
    const centerX = (width / 2 - currentTransform.x) / currentTransform.k;
    const centerY = (height / 2 - currentTransform.y) / currentTransform.k;
    const translateX = width / 2 - centerX * targetScale;
    const translateY = height / 2 - centerY * targetScale;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);
    svg.transition().duration(ZOOM_TRANSITION_DURATION).call(zoomBehavior.transform, targetTransform);
  }

  function resetView() {
    const { width, height } = containerElement.getBoundingClientRect();
    const scale = Math.max(
      ZOOM_EXTENT[0],
      Math.min(ZOOM_EXTENT[1], Math.min(width / dimensions.width, 0.85))
    );
    const translateX = width / 2 - (dimensions.width / 2) * scale;
    const translateY = 80;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    svg.transition().duration(ZOOM_TRANSITION_DURATION).call(zoomBehavior.transform, targetTransform);
  }

  function handleNodeActivate(event, datum) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    focusOnIndividual(datum.person.id);
    onPersonSelected?.(datum.person);
  }

  nodeElements
    .filter((d) => Boolean(d.person))
    .on('click', handleNodeActivate)
    .on('keydown', handleNodeActivate);

  function onZoom(event) {
    currentTransform = event.transform;
    rootGroup.attr('transform', currentTransform);
  }

  function onZoomStart() {
    svg.style('cursor', 'grabbing');
  }

  function onZoomEnd() {
    svg.style('cursor', 'grab');
  }

  const zoomBehavior = d3
    .zoom()
    .extent([[0, 0], [dimensions.width, dimensions.height]])
    .scaleExtent(ZOOM_EXTENT)
    .on('start', onZoomStart)
    .on('zoom', onZoom)
    .on('end', onZoomEnd);

  svg.call(zoomBehavior);
  resetView();

  const api = {
    focusOnIndividual,
    highlightIndividual(personId) {
      setHighlight(personId);
      const nodeElement = nodeElementMap.get(personId);
      if (typeof nodeElement?.focus === 'function') {
        nodeElement.focus({ preventScroll: true });
      }
    },
    resetView,
    zoomIn() {
      adjustZoom(1.25);
    },
    zoomOut() {
      adjustZoom(0.8);
    },
    get highlightedId() {
      return highlightedId;
    }
  };

  return api;
}
