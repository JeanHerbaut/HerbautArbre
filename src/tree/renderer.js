import * as d3 from 'd3';
import { formatPersonDisplayName } from '../utils/person.js';

const ZOOM_EXTENT = [0.12, 36];
const FOCUS_TRANSITION_DURATION = 650;
const ZOOM_TRANSITION_DURATION = 320;
const FOCUS_MIN_SCALE = 2.1;
const FOCUS_TARGET_SPAN = 260;
const AUTO_FIT_PADDING = 0.35;
const AUTO_FIT_MIN_SCALE = 0.9;
const LABEL_MAX_LINE_LENGTH = 18;

const LINK_TYPE_CLASS_MAP = new Map([
  ['parent-child', 'parent'],
  ['parentchild', 'parent'],
  ['parent', 'parent'],
  ['union', 'union'],
  ['marriage', 'marriage'],
  ['mariage', 'marriage'],
  ['married', 'marriage'],
  ['couple', 'union'],
  ['spouse', 'union']
]);

function polarToCartesian(angle, radius, center) {
  if (!center || !Number.isFinite(angle) || !Number.isFinite(radius)) {
    return null;
  }
  const polarAngle = angle - Math.PI / 2;
  return {
    x: center.x + radius * Math.cos(polarAngle),
    y: center.y + radius * Math.sin(polarAngle)
  };
}

function buildLinkPath(link, center) {
  const { source, target } = link;
  if (!source || !target) {
    return '';
  }
  if (link.type === 'parent-child') {
    const path = d3.path();
    path.moveTo(source.x, source.y);
    if (
      typeof source.angle === 'number' &&
      typeof source.radius === 'number' &&
      typeof target.angle === 'number' &&
      typeof target.radius === 'number'
    ) {
      const midAngle = (source.angle + target.angle) / 2;
      const midRadius = (source.radius + target.radius) / 2;
      const midPoint = polarToCartesian(midAngle, midRadius, center);
      if (midPoint) {
        path.quadraticCurveTo(midPoint.x, midPoint.y, target.x, target.y);
        return path.toString();
      }
    }
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    path.quadraticCurveTo(midX, midY, target.x, target.y);
    return path.toString();
  }
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

function computeLabelOrientation(datum) {
  if (!datum || typeof datum.angle !== 'number') {
    return { anchor: 'start', offset: 18 };
  }
  const polarAngle = datum.angle - Math.PI / 2;
  const isLeft = Math.cos(polarAngle) < 0;
  return {
    anchor: isLeft ? 'end' : 'start',
    offset: isLeft ? -18 : 18
  };
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
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const preferred = LINK_TYPE_CLASS_MAP.get(normalized) ?? LINK_TYPE_CLASS_MAP.get(normalized.replace(/[^a-z0-9]+/g, ''));
  if (preferred) {
    return `tree-link tree-link--${preferred}`;
  }
  const fallback = normalized.replace(/[^a-z0-9]+/g, '-') || 'relationship';
  return `tree-link tree-link--${fallback}`;
}

function splitLabelLines(label) {
  if (!label) {
    return [];
  }
  const sanitized = label.replace(/\s+/g, ' ').trim();
  if (!sanitized) {
    return [];
  }
  if (sanitized.length <= LABEL_MAX_LINE_LENGTH) {
    return [sanitized];
  }
  const tokens = sanitized.split(' ');
  const lines = [];
  let currentLine = '';

  const pushCurrent = () => {
    if (currentLine) {
      lines.push(currentLine);
      currentLine = '';
    }
  };

  tokens.forEach((token) => {
    if (!token) {
      return;
    }
    const candidate = currentLine ? `${currentLine} ${token}` : token;
    const forceBreak = token.startsWith('(') && currentLine;
    if (forceBreak) {
      pushCurrent();
      currentLine = token;
      return;
    }
    if (candidate.length > LABEL_MAX_LINE_LENGTH && currentLine) {
      pushCurrent();
      currentLine = token;
      return;
    }
    if (!currentLine && token.length > LABEL_MAX_LINE_LENGTH) {
      lines.push(token);
      currentLine = '';
      return;
    }
    currentLine = candidate;
  });

  pushCurrent();

  if (!lines.length) {
    lines.push(sanitized);
  }

  if (lines.length > 3) {
    const first = lines[0];
    const second = lines[1];
    const remainder = lines.slice(2).join(' ');
    return [first, second, remainder];
  }

  return lines;
}

export function createTreeRenderer({ svgElement, containerElement, layout, onPersonSelected }) {
  const { nodes, hierarchicalLinks, relationshipLinks, dimensions, nodeById, bounds, mode } = layout;

  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
  svg.attr('role', 'presentation');
  svg.style('cursor', 'grab');
  svg.style('touch-action', 'none');
  svg.attr('data-tree-layout', mode ?? 'fan');

  const rootGroup = svg.append('g').attr('class', 'tree-canvas__viewport');
  const linksGroup = rootGroup.append('g').attr('class', 'tree-links');
  const relationshipsGroup = rootGroup.append('g').attr('class', 'tree-links tree-links--relationships');
  const nodesGroup = rootGroup.append('g').attr('class', 'tree-nodes');

  const layoutCenter = {
    x: dimensions.width / 2,
    y: dimensions.height / 2
  };

  linksGroup
    .selectAll('path')
    .data(hierarchicalLinks)
    .join('path')
    .attr('class', (d) => linkClassName(d.type))
    .attr('d', (d) => buildLinkPath(d, layoutCenter));

  relationshipsGroup
    .selectAll('path')
    .data(relationshipLinks)
    .join('path')
    .attr('class', (d) => linkClassName(d.type))
    .attr('d', (d) => buildLinkPath(d, layoutCenter));

  const nodeElements = nodesGroup
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', nodeClasses)
    .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
    .attr('tabindex', (d) => (d.person ? 0 : null))
    .attr('role', (d) => (d.person ? 'button' : null))
    .attr('data-person-id', (d) => d.person?.id ?? null)
    .attr('aria-label', (d) => {
      if (!d.person) {
        return null;
      }
      const displayName = formatPersonDisplayName(d.person);
      return `Afficher les détails de ${displayName || d.person.id}`;
    });

  nodeElements
    .append('circle')
    .attr('class', 'tree-node__marker')
    .attr('r', (d) => (d.person ? 12 : 9));

  const labels = nodeElements
    .append('text')
    .attr('class', 'tree-node__label')
    .attr('dy', '0.32em')
    .attr('text-anchor', (d) => computeLabelOrientation(d).anchor)
    .each(function (d) {
      const orientation = computeLabelOrientation(d);
      const label = d.person
        ? formatPersonDisplayName(d.person) || d.person.id || d.id
        : d.person?.id ?? d.person ?? d.id;
      const lines = splitLabelLines(label);
      const selection = d3.select(this);
      selection.attr('x', orientation.offset);
      selection.text(null);
      const effectiveLines = lines.length > 0 ? lines : [label ?? ''];
      effectiveLines.forEach((line, index) => {
        selection
          .append('tspan')
          .attr('x', orientation.offset)
          .attr('dy', index === 0 ? 0 : '1.1em')
          .text(line);
      });
    });

  labels
    .filter((d) => Boolean(d.person?.sosa) || d.generation != null)
    .append('tspan')
    .attr('class', 'tree-node__subtitle')
    .attr('x', (d) => computeLabelOrientation(d).offset)
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

  function getContainerSize() {
    const rect = containerElement.getBoundingClientRect();
    const width = Math.max(rect?.width || 0, containerElement.clientWidth || 0, containerElement.offsetWidth || 0, 1);
    const height = Math.max(rect?.height || 0, containerElement.clientHeight || 0, containerElement.offsetHeight || 0, 1);
    return { width, height };
  }

  function computeAutoFitTransform() {
    const { width, height } = getContainerSize();
    const layoutWidth = bounds && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX)
      ? Math.max(bounds.maxX - bounds.minX, 1)
      : dimensions.width;
    const layoutHeight = bounds && Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY)
      ? Math.max(bounds.maxY - bounds.minY, 1)
      : dimensions.height;
    const paddedWidth = layoutWidth * (1 + AUTO_FIT_PADDING);
    const paddedHeight = layoutHeight * (1 + AUTO_FIT_PADDING);
    const ratios = [];
    if (width > 0) {
      ratios.push(width / paddedWidth);
    }
    if (height > 0) {
      ratios.push(height / paddedHeight);
    }
    let scale = ratios.length > 0 ? Math.min(...ratios) : 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = 1;
    }
    scale = Math.max(AUTO_FIT_MIN_SCALE, scale);
    scale = Math.max(ZOOM_EXTENT[0], Math.min(ZOOM_EXTENT[1], scale));
    const centerX = bounds && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX)
      ? (bounds.minX + bounds.maxX) / 2
      : dimensions.width / 2;
    const centerY = bounds && Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY)
      ? (bounds.minY + bounds.maxY) / 2
      : dimensions.height / 2;
    const translateX = width / 2 - centerX * scale;
    const translateY = height / 2 - centerY * scale;
    return d3.zoomIdentity.translate(translateX, translateY).scale(scale);
  }

  function applyTransform(targetTransform, { animate = true, duration = ZOOM_TRANSITION_DURATION } = {}) {
    if (!targetTransform) {
      return;
    }
    svg.interrupt();
    const zoomTarget = animate ? svg.transition().duration(duration) : svg;
    zoomTarget.call(zoomBehavior.transform, targetTransform);
  }

  function focusOnIndividual(personId, { animate = true } = {}) {
    const node = nodeById.get(personId);
    if (!node) {
      return false;
    }
    setHighlight(personId);
    const nodeElement = nodeElementMap.get(personId);
    if (containerElement) {
      if (typeof containerElement.scrollTo === 'function') {
        containerElement.scrollTo({ left: 0, top: 0 });
      } else {
        containerElement.scrollLeft = 0;
        containerElement.scrollTop = 0;
      }
    }
    const { width, height } = getContainerSize();
    const shortestSide = Math.min(width, height);
    const desiredScale = Number.isFinite(shortestSide) && shortestSide > 0
      ? shortestSide / FOCUS_TARGET_SPAN
      : FOCUS_MIN_SCALE;
    const baseScale = Math.max(FOCUS_MIN_SCALE, desiredScale);
    const targetScale = Math.min(
      ZOOM_EXTENT[1],
      Math.max(baseScale, Number.isFinite(currentTransform.k) ? currentTransform.k : 1)
    );
    const translateX = width / 2 - node.x * targetScale;
    const translateY = height / 2 - node.y * targetScale;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);

    applyTransform(targetTransform, { animate, duration: FOCUS_TRANSITION_DURATION });

    if (typeof nodeElement?.focus === 'function') {
      nodeElement.focus({ preventScroll: true });
    }
    return true;
  }

  function adjustZoom(factor) {
    const { width, height } = getContainerSize();
    const targetScale = Math.max(
      ZOOM_EXTENT[0],
      Math.min(ZOOM_EXTENT[1], currentTransform.k * factor)
    );
    const centerX = (width / 2 - currentTransform.x) / currentTransform.k;
    const centerY = (height / 2 - currentTransform.y) / currentTransform.k;
    const translateX = width / 2 - centerX * targetScale;
    const translateY = height / 2 - centerY * targetScale;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);
    applyTransform(targetTransform);
  }

  function resetView({ animate = true } = {}) {
    if (highlightedId) {
      const success = focusOnIndividual(highlightedId, { animate });
      if (success) {
        return;
      }
    }
    const targetTransform = computeAutoFitTransform();
    applyTransform(targetTransform, { animate });
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

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
        window.requestAnimationFrame(() => {
          resetView({ animate: false });
        });
      })
    : null;

  if (resizeObserver) {
    resizeObserver.observe(containerElement);
  }

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
    },
    destroy() {
      resizeObserver?.disconnect();
    }
  };

  return api;
}
