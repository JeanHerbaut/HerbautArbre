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

function computeViewportCenterCoordinate(base, offset, viewportSpan, viewBoxSpan) {
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const safeViewportSpan = Number.isFinite(viewportSpan) && viewportSpan > 0
    ? viewportSpan
    : Number.isFinite(viewBoxSpan) && viewBoxSpan > 0
    ? viewBoxSpan
    : 0;
  return safeBase + safeOffset + safeViewportSpan / 2;
}

function resolveViewportCenter(metrics = {}) {
  if (
    metrics.viewCenter &&
    Number.isFinite(metrics.viewCenter.x) &&
    Number.isFinite(metrics.viewCenter.y)
  ) {
    return metrics.viewCenter;
  }
  const {
    viewBoxX = 0,
    viewBoxY = 0,
    viewportWidth,
    viewportHeight,
    viewBoxWidth,
    viewBoxHeight,
    offsetX = 0,
    offsetY = 0
  } = metrics;
  return {
    x: computeViewportCenterCoordinate(viewBoxX, offsetX, viewportWidth, viewBoxWidth),
    y: computeViewportCenterCoordinate(viewBoxY, offsetY, viewportHeight, viewBoxHeight)
  };
}

export function createTreeRenderer({ svgElement, containerElement, layout, onPersonSelected }) {
  const { nodes, hierarchicalLinks, relationshipLinks, dimensions, nodeById, bounds, mode } = layout;
  const layoutMode = mode ?? 'fan';
  const layoutOrientation = layout.orientation ?? (layoutMode === 'fan' ? 'radial' : 'horizontal');
  const preserveVerticalSpan = layoutMode === 'hierarchical' && layoutOrientation !== 'vertical';

  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
  svg.attr('role', 'presentation');
  svg.style('cursor', 'grab');
  svg.style('touch-action', 'none');
  svg.attr('data-tree-layout', mode ?? 'fan');
  if (layoutOrientation) {
    svg.attr('data-tree-orientation', layoutOrientation);
  } else {
    svg.attr('data-tree-orientation', null);
  }

  if (containerElement) {
    if (layoutOrientation) {
      containerElement.dataset.treeOrientation = layoutOrientation;
    } else {
      delete containerElement.dataset.treeOrientation;
    }
  }

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

  function setHighlight(personId, { focusNodeElement = false } = {}) {
    nodeElements.classed('tree-node--highlight', (d) => d.person?.id === personId);
    highlightedId = personId ?? null;
    if (!focusNodeElement || !personId) {
      return;
    }
    const nodeElement = nodeElementMap.get(personId);
    if (typeof nodeElement?.focus === 'function') {
      nodeElement.focus({ preventScroll: true });
    }
  }

  function getViewportMetrics() {
    const containerRect = containerElement?.getBoundingClientRect?.() ?? null;
    const svgElementNode = svg.node();
    const svgRect = svgElementNode?.getBoundingClientRect?.() ?? null;
    const viewBoxBase = svgElementNode?.viewBox?.baseVal ?? null;
    const viewBoxWidth = Number.isFinite(viewBoxBase?.width) && viewBoxBase.width > 0
      ? viewBoxBase.width
      : dimensions.width;
    const viewBoxHeight = Number.isFinite(viewBoxBase?.height) && viewBoxBase.height > 0
      ? viewBoxBase.height
      : dimensions.height;
    const viewBoxX = Number.isFinite(viewBoxBase?.x) ? viewBoxBase.x : 0;
    const viewBoxY = Number.isFinite(viewBoxBase?.y) ? viewBoxBase.y : 0;
    const widthRatio = Number.isFinite(svgRect?.width) && svgRect.width > 0 && viewBoxWidth > 0
      ? svgRect.width / viewBoxWidth
      : null;
    const heightRatio = Number.isFinite(svgRect?.height) && svgRect.height > 0 && viewBoxHeight > 0
      ? svgRect.height / viewBoxHeight
      : null;
    let renderScale = 1;
    if (Number.isFinite(widthRatio) && Number.isFinite(heightRatio)) {
      renderScale = Math.min(widthRatio, heightRatio);
    } else if (Number.isFinite(widthRatio)) {
      renderScale = widthRatio;
    } else if (Number.isFinite(heightRatio)) {
      renderScale = heightRatio;
    }
    if (!Number.isFinite(renderScale) || renderScale <= 0) {
      renderScale = 1;
    }
    const offsetXPx = Number.isFinite(renderScale) && renderScale > 0 && Number.isFinite(svgRect?.width)
      ? Math.max(0, (svgRect.width - viewBoxWidth * renderScale) / 2)
      : 0;
    const offsetYPx = Number.isFinite(renderScale) && renderScale > 0 && Number.isFinite(svgRect?.height)
      ? Math.max(0, (svgRect.height - viewBoxHeight * renderScale) / 2)
      : 0;
    const offsetX = Number.isFinite(renderScale) && renderScale > 0
      ? offsetXPx / renderScale
      : 0;
    const offsetY = Number.isFinite(renderScale) && renderScale > 0
      ? offsetYPx / renderScale
      : 0;
    const candidateWidths = [
      containerElement?.clientWidth,
      containerRect?.width,
      containerElement?.offsetWidth,
      svgRect?.width
    ].filter((value) => Number.isFinite(value) && value > 0);
    const candidateHeights = [
      containerElement?.clientHeight,
      containerRect?.height,
      containerElement?.offsetHeight,
      svgRect?.height
    ].filter((value) => Number.isFinite(value) && value > 0);
    const width = candidateWidths.length > 0 ? Math.min(...candidateWidths) : 1;
    const height = candidateHeights.length > 0 ? Math.min(...candidateHeights) : 1;
    const scaleX = width / (dimensions.width || 1);
    const scaleY = height / (dimensions.height || 1);
    const effectiveScale = Math.max(Math.min(scaleX, scaleY), Number.EPSILON);
    const visibleWidthPx = Number.isFinite(svgRect?.width)
      ? Math.max(1, svgRect.width - offsetXPx * 2)
      : width;
    const visibleHeightPx = Number.isFinite(svgRect?.height)
      ? Math.max(1, svgRect.height - offsetYPx * 2)
      : height;
    const viewportWidthUnits = Number.isFinite(renderScale) && renderScale > 0
      ? Math.max(1, visibleWidthPx / renderScale)
      : Math.max(1, viewBoxWidth);
    const viewportHeightUnits = Number.isFinite(renderScale) && renderScale > 0
      ? Math.max(1, visibleHeightPx / renderScale)
      : Math.max(1, viewBoxHeight);
    const safeViewBoxX = Number.isFinite(viewBoxX) ? viewBoxX : 0;
    const safeViewBoxY = Number.isFinite(viewBoxY) ? viewBoxY : 0;
    const safeOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
    const safeOffsetY = Number.isFinite(offsetY) ? offsetY : 0;
    const safeViewportWidthUnits = Number.isFinite(viewportWidthUnits) && viewportWidthUnits > 0
      ? viewportWidthUnits
      : Math.max(1, viewBoxWidth);
    const safeViewportHeightUnits = Number.isFinite(viewportHeightUnits) && viewportHeightUnits > 0
      ? viewportHeightUnits
      : Math.max(1, viewBoxHeight);
    const viewCenter = {
      x: safeViewBoxX + safeViewportWidthUnits / 2,
      y: safeViewBoxY + safeViewportHeightUnits / 2
    };
    return {
      width,
      height,
      scaleX,
      scaleY,
      scale: effectiveScale,
      viewportWidth: viewportWidthUnits,
      viewportHeight: viewportHeightUnits,
      viewportWidthPx: visibleWidthPx,
      viewportHeightPx: visibleHeightPx,
      viewBoxWidth,
      viewBoxHeight,
      viewBoxX,
      viewBoxY,
      renderScale,
      offsetX: safeOffsetX,
      offsetY: safeOffsetY,
      offsetXPx,
      offsetYPx,
      viewCenter
    };
  }

  function computeAutoFitTransform() {
    const {
      viewportWidth,
      viewportHeight,
      viewBoxWidth,
      viewBoxHeight,
      viewBoxX,
      viewBoxY,
      offsetX,
      offsetY,
      viewCenter
    } = getViewportMetrics();
    const fallbackViewportCenterX = computeViewportCenterCoordinate(viewBoxX, offsetX, viewportWidth, viewBoxWidth);
    const fallbackViewportCenterY = computeViewportCenterCoordinate(viewBoxY, offsetY, viewportHeight, viewBoxHeight);
    const viewportCenterX = Number.isFinite(viewCenter?.x) ? viewCenter.x : fallbackViewportCenterX;
    const viewportCenterY = Number.isFinite(viewCenter?.y) ? viewCenter.y : fallbackViewportCenterY;
    const safeViewportCenterX = Number.isFinite(viewportCenterX) ? viewportCenterX : fallbackViewportCenterX;
    const safeViewportCenterY = Number.isFinite(viewportCenterY) ? viewportCenterY : fallbackViewportCenterY;
    const layoutWidth = bounds && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX)
      ? Math.max(bounds.maxX - bounds.minX, 1)
      : dimensions.width;
    const layoutHeight = bounds && Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY)
      ? Math.max(bounds.maxY - bounds.minY, 1)
      : dimensions.height;
    const paddedWidth = layoutWidth * (1 + AUTO_FIT_PADDING);
    const paddedHeight = layoutHeight * (1 + AUTO_FIT_PADDING);
    const ratios = [];
    if (viewportWidth > 0) {
      ratios.push(viewportWidth / paddedWidth);
    }
    if (viewportHeight > 0 && !preserveVerticalSpan) {
      ratios.push(viewportHeight / paddedHeight);
    }
    let scale = ratios.length > 0 ? Math.min(...ratios) : 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = 1;
    }
    if (preserveVerticalSpan) {
      scale = Math.max(0.45, Math.min(1.1, scale));
    } else {
      scale = Math.max(AUTO_FIT_MIN_SCALE, scale);
    }
    scale = Math.max(ZOOM_EXTENT[0], Math.min(ZOOM_EXTENT[1], scale));
    const layoutCenterX = bounds && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX)
      ? (bounds.minX + bounds.maxX) / 2
      : dimensions.width / 2;
    const layoutCenterY = bounds && Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY)
      ? (bounds.minY + bounds.maxY) / 2
      : dimensions.height / 2;
    let translateX = safeViewportCenterX - layoutCenterX * scale;
    let translateY = safeViewportCenterY - layoutCenterY * scale;
    if (preserveVerticalSpan && bounds) {
      if (Number.isFinite(bounds.minY)) {
        const marginTop = Number.isFinite(viewBoxHeight)
          ? Math.min(120, Math.max(48, viewBoxHeight * 0.12))
          : 72;
        translateY = marginTop - bounds.minY * scale;
      }
      if (Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
        const horizontalCenter = (bounds.minX + bounds.maxX) / 2;
        translateX = safeViewportCenterX - horizontalCenter * scale;
      }
    }
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

  function focusOnIndividual(personId, { animate = true, focusNode = true } = {}) {
    const node = nodeById.get(personId);
    if (!node) {
      return false;
    }
    setHighlight(personId);
    if (containerElement) {
      if (typeof containerElement.scrollTo === 'function') {
        containerElement.scrollTo({ left: 0, top: 0 });
      } else {
        containerElement.scrollLeft = 0;
        containerElement.scrollTop = 0;
      }
    }
    const viewportMetrics = getViewportMetrics();
    const { viewportWidth, viewportHeight, viewCenter } = viewportMetrics;
    const safeViewportWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
      ? viewportWidth
      : dimensions.width;
    const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : dimensions.height;
    const safeCenterX = Number.isFinite(viewCenter?.x) ? viewCenter.x : dimensions.width / 2;
    const safeCenterY = Number.isFinite(viewCenter?.y) ? viewCenter.y : dimensions.height / 2;
    const shortestSide = Math.min(safeViewportWidth, safeViewportHeight);
    const desiredScale = Number.isFinite(shortestSide) && shortestSide > 0
      ? shortestSide / FOCUS_TARGET_SPAN
      : FOCUS_MIN_SCALE;
    const baseScale = Math.max(FOCUS_MIN_SCALE, desiredScale);
    const targetScale = Math.min(
      ZOOM_EXTENT[1],
      Math.max(baseScale, Number.isFinite(currentTransform.k) ? currentTransform.k : 1)
    );
    const translateX = safeCenterX - node.x * targetScale;
    const translateY = safeCenterY - node.y * targetScale;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);

    applyTransform(targetTransform, { animate, duration: FOCUS_TRANSITION_DURATION });

    if (focusNode) {
      setHighlight(personId, { focusNodeElement: true });
    }
    return true;
  }

  function adjustZoom(factor) {
    const viewportMetrics = getViewportMetrics();
    const { viewportWidth, viewportHeight } = viewportMetrics;
    const { x: centerX, y: centerY } = resolveViewportCenter(viewportMetrics);
    const safeCenterX = Number.isFinite(centerX) ? centerX : dimensions.width / 2;
    const safeCenterY = Number.isFinite(centerY) ? centerY : dimensions.height / 2;
    const targetScale = Math.max(
      ZOOM_EXTENT[0],
      Math.min(ZOOM_EXTENT[1], currentTransform.k * factor)
    );
    const center = currentTransform.invert([safeCenterX, safeCenterY]);
    const translateX = safeCenterX - center[0] * targetScale;
    const translateY = safeCenterY - center[1] * targetScale;
    const targetTransform = d3.zoomIdentity.translate(translateX, translateY).scale(targetScale);
    applyTransform(targetTransform);
  }

  function resetView({ animate = true, preserveFocus = false } = {}) {
    if (highlightedId) {
      const success = focusOnIndividual(highlightedId, {
        animate,
        focusNode: !preserveFocus
      });
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
    focusOnIndividual(datum.person.id, { animate: true });
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
          resetView({ animate: false, preserveFocus: true });
        });
      })
    : null;

  if (resizeObserver) {
    resizeObserver.observe(containerElement);
  }

  const api = {
    focusOnIndividual,
    highlightIndividual(personId, { focusView = true, animate = true, focusNode = true } = {}) {
      if (!personId) {
        setHighlight(null);
        return false;
      }
      const node = nodeById.get(personId);
      if (node && focusView) {
        return focusOnIndividual(personId, { animate, focusNode });
      }
      setHighlight(personId, { focusNodeElement: focusNode });
      return Boolean(node);
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
