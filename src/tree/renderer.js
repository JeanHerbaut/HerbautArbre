import { createApp, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import VueECharts from 'vue-echarts';
import { use } from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { formatPersonDisplayName } from '../utils/person.js';

use([GraphChart, TooltipComponent, GridComponent, CanvasRenderer]);

const BRANCH_COLORS = ['#2c6e49', '#4c956c', '#386fa4', '#7f4f24', '#bc4749', '#9c89b8'];
const HIERARCHY_LINK_COLOR = 'rgba(44, 110, 73, 0.35)';
const UNION_LINK_COLOR = '#c96480';
const SECONDARY_LINK_COLOR = '#9c89b8';
const HIGHLIGHT_COLOR = '#f2545b';
const VIEW_PADDING = 48;

function resolveBranchColor(branchIndex) {
  if (!Number.isInteger(branchIndex)) {
    return BRANCH_COLORS[0];
  }
  const normalized = ((branchIndex % BRANCH_COLORS.length) + BRANCH_COLORS.length) % BRANCH_COLORS.length;
  return BRANCH_COLORS[normalized];
}

function resolveLabelPlacement(node, layout) {
  const fallback = { position: 'right', offset: [14, 0] };
  if (!node) {
    return fallback;
  }
  if (layout?.orientation === 'radial' && typeof node.angle === 'number') {
    const polarAngle = node.angle - Math.PI / 2;
    const isLeft = Math.cos(polarAngle) < 0;
    return {
      position: isLeft ? 'left' : 'right',
      offset: isLeft ? [-14, 0] : [14, 0]
    };
  }
  if (layout?.orientation === 'vertical') {
    const centerX = (layout?.dimensions?.width ?? 0) / 2;
    const isLeft = Number.isFinite(centerX) && node.x > centerX;
    return {
      position: isLeft ? 'left' : 'right',
      offset: isLeft ? [-14, 0] : [14, 0]
    };
  }
  return fallback;
}

function buildLabelText(node) {
  if (!node) {
    return '';
  }
  const fragments = [];
  const label = node.person
    ? formatPersonDisplayName(node.person) || node.person.name || node.person.id
    : node.id;
  if (label) {
    fragments.push(label);
  }
  const meta = [];
  if (node.person?.sosa) {
    meta.push(`Sosa ${node.person.sosa}`);
  }
  if (node.generation != null) {
    meta.push(`Génération ${node.generation}`);
  }
  if (meta.length > 0) {
    fragments.push(meta.join(' • '));
  }
  return fragments.join('\n');
}

function buildTooltipContent(person) {
  if (!person) {
    return '';
  }
  const content = [];
  const displayName = formatPersonDisplayName(person) || person.name || person.id;
  if (displayName) {
    content.push(`<strong>${displayName}</strong>`);
  }
  if (person.sosa) {
    content.push(`<div><span>Sosa :</span> ${person.sosa}</div>`);
  }
  if (person.birth?.date || person.birth?.place) {
    const birth = [person.birth?.date, person.birth?.place].filter(Boolean).join(' – ');
    content.push(`<div><span>Naissance :</span> ${birth}</div>`);
  }
  if (person.death?.date || person.death?.place) {
    const death = [person.death?.date, person.death?.place].filter(Boolean).join(' – ');
    content.push(`<div><span>Décès :</span> ${death}</div>`);
  }
  if (person.parents) {
    const parents = [person.parents.father, person.parents.mother].filter(Boolean).join(', ');
    if (parents) {
      content.push(`<div><span>Parents :</span> ${parents}</div>`);
    }
  }
  if (person.spouses) {
    const spouses = Array.isArray(person.spouses) ? person.spouses.join(', ') : person.spouses;
    if (spouses) {
      content.push(`<div><span>Conjoints :</span> ${spouses}</div>`);
    }
  }
  return content.join('');
}

function buildChartNodes(layout) {
  const nodes = Array.isArray(layout?.nodes) ? layout.nodes : [];
  const bounds = layout?.bounds ?? {
    minX: 0,
    maxX: layout?.dimensions?.width ?? 0,
    minY: 0,
    maxY: layout?.dimensions?.height ?? 0
  };
  const offsetX = (bounds?.minX ?? 0) - VIEW_PADDING;
  const offsetY = (bounds?.minY ?? 0) - VIEW_PADDING;
  return nodes.map((node) => {
    const branchColor = resolveBranchColor(node.branchIndex);
    const labelPlacement = resolveLabelPlacement(node, layout);
    const labelText = buildLabelText(node);
    const normalizedX = (node.x ?? 0) - offsetX;
    const normalizedY = (node.y ?? 0) - offsetY;
    return {
      id: node.person?.id ?? node.id,
      value: node.person?.id ?? node.id,
      name: labelText,
      x: normalizedX,
      y: normalizedY,
      person: node.person ?? null,
      nodeId: node.id,
      branchIndex: node.branchIndex ?? null,
      symbol: 'circle',
      symbolSize: node.person ? 16 : 12,
      itemStyle: {
        color: branchColor,
        borderColor: '#ffffff',
        borderWidth: 2,
        shadowBlur: 6,
        shadowColor: 'rgba(31, 41, 51, 0.18)'
      },
      labelText,
      tooltipHtml: buildTooltipContent(node.person ?? null),
      label: {
        show: true,
        formatter: () => labelText,
        position: labelPlacement.position,
        offset: labelPlacement.offset,
        color: '#1f2933',
        backgroundColor: 'rgba(255, 255, 255, 0.82)',
        borderRadius: 8,
        padding: [4, 8],
        fontSize: 12,
        lineHeight: 16,
        rich: {}
      },
      emphasis: {
        label: {
          show: true
        }
      }
    };
  });
}

function buildLinkStyle(type) {
  if (type === 'parent-child') {
    return { color: HIERARCHY_LINK_COLOR, width: 1.8, opacity: 0.95 };
  }
  if (type === 'union' || type === 'marriage' || type === 'mariage' || type === 'couple' || type === 'spouse') {
    return { color: UNION_LINK_COLOR, width: 2, type: 'dashed', opacity: 0.95 };
  }
  return { color: SECONDARY_LINK_COLOR, width: 1.4, type: 'dotted', opacity: 0.85 };
}

function buildChartLinks(layout) {
  const hierarchicalLinks = Array.isArray(layout?.hierarchicalLinks) ? layout.hierarchicalLinks : [];
  const relationshipLinks = Array.isArray(layout?.relationshipLinks) ? layout.relationshipLinks : [];
  return hierarchicalLinks
    .concat(relationshipLinks)
    .map((link) => ({
      source: link.sourceId,
      target: link.targetId,
      value: link.type,
      lineStyle: buildLinkStyle(link.type),
      emphasis: {
        lineStyle: {
          width: (buildLinkStyle(link.type).width ?? 1.5) + 0.6
        }
      }
    }));
}

function buildChartOption(layout) {
  const chartNodes = buildChartNodes(layout);
  const chartLinks = buildChartLinks(layout);
  const bounds = layout?.bounds ?? {
    minX: 0,
    maxX: layout?.dimensions?.width ?? 0,
    minY: 0,
    maxY: layout?.dimensions?.height ?? 0
  };
  const viewWidth = Math.max((bounds.maxX ?? 0) - (bounds.minX ?? 0) + VIEW_PADDING * 2, 0);
  const viewHeight = Math.max((bounds.maxY ?? 0) - (bounds.minY ?? 0) + VIEW_PADDING * 2, 0);
  return {
    animation: false,
    tooltip: {
      trigger: 'item',
      className: 'tree-chart__tooltip',
      backgroundColor: 'rgba(255, 255, 255, 0.94)',
      borderColor: '#d1d5db',
      borderWidth: 1,
      textStyle: { color: '#1f2933' },
      formatter: (params) => {
        const data = params?.data ?? {};
        if (data.tooltipHtml) {
          return data.tooltipHtml;
        }
        return params?.name ?? '';
      }
    },
    series: [
      {
        type: 'graph',
        coordinateSystem: null,
        layout: 'none',
        data: chartNodes,
        links: chartLinks,
        roam: true,
        draggable: false,
        left: 0,
        top: 0,
        width: viewWidth,
        height: viewHeight,
        silent: false,
        focusNodeAdjacency: true,
        edgeSymbol: ['none', 'none'],
        edgeLabel: { show: false },
        lineStyle: { color: HIERARCHY_LINK_COLOR, width: 1.6, opacity: 0.85 },
        emphasis: {
          focus: 'adjacency',
          scale: true
        },
        select: {
          itemStyle: {
            borderColor: HIGHLIGHT_COLOR,
            borderWidth: 3,
            shadowBlur: 14,
            shadowColor: 'rgba(242, 84, 91, 0.35)'
          },
          label: {
            fontWeight: 'bold'
          }
        }
      }
    ]
  };
}

export function createTreeRenderer({ chartElement, containerElement, layout, onPersonSelected }) {
  if (!chartElement) {
    throw new Error('Tree renderer requires a valid chart element');
  }

  if (containerElement) {
    if (layout?.orientation) {
      containerElement.dataset.treeOrientation = layout.orientation;
    } else {
      delete containerElement.dataset.treeOrientation;
    }
  }

  const mountElement = document.createElement('div');
  mountElement.className = 'tree-chart__root';
  mountElement.setAttribute('role', 'presentation');
  chartElement.innerHTML = '';
  chartElement.appendChild(mountElement);

  const optionRef = shallowRef(buildChartOption(layout));
  const pendingActions = [];
  let chartInstance = null;
  let highlightedId = null;
  const dataIndexByPersonId = new Map();
  const positionByPersonId = new Map();

  const chartNodes = Array.isArray(optionRef.value?.series?.[0]?.data)
    ? optionRef.value.series[0].data
    : [];

  chartNodes.forEach((node, index) => {
    const personId = node.person?.id ?? null;
    if (personId) {
      dataIndexByPersonId.set(personId, index);
      positionByPersonId.set(personId, [node.x, node.y]);
    }
  });

  const flushPendingActions = () => {
    if (!chartInstance || typeof chartInstance.getModel !== 'function') {
      return;
    }
    const model = chartInstance.getModel();
    if (!model) {
      return;
    }
    const tasks = pendingActions.splice(0);
    tasks.forEach((task) => {
      try {
        task(chartInstance);
      } catch (error) {
        console.error('Tree renderer task failed', error);
      }
    });
  };

  const runWhenReady = (action) => {
    if (chartInstance && typeof chartInstance.getModel === 'function' && chartInstance.getModel()) {
      action(chartInstance);
      return;
    }
    pendingActions.push(action);
  };

  const detachChartListeners = () => {
    if (chartInstance && typeof chartInstance.off === 'function') {
      chartInstance.off('finished', flushPendingActions);
    }
  };

  const handleChartReady = (chart) => {
    if (chartInstance && chartInstance !== chart) {
      detachChartListeners();
    }
    chartInstance = chart;
    if (chartInstance && typeof chartInstance.on === 'function') {
      chartInstance.off('finished', flushPendingActions);
      chartInstance.on('finished', flushPendingActions);
    }
    flushPendingActions();
  };

  const handleNodeClick = (params) => {
    const person = params?.data?.person ?? null;
    if (!person) {
      return;
    }
    focusOnIndividual(person.id, { animate: true });
    onPersonSelected?.(person);
  };

  const ChartRoot = defineComponent({
    name: 'TreeChartRoot',
    setup() {
      const chartRef = ref(null);

      onMounted(() => {
        if (chartRef.value?.chart) {
          handleChartReady(chartRef.value.chart);
        }
      });

      onBeforeUnmount(() => {
        detachChartListeners();
        chartInstance = null;
      });

      return () =>
        h(VueECharts, {
          ref: chartRef,
          option: optionRef.value,
          autoresize: true,
          style: { width: '100%', height: '100%' },
          onChartReady: handleChartReady,
          onClick: handleNodeClick
        });
    }
  });

  const vueApp = createApp(ChartRoot);
  vueApp.component('VChart', VueECharts);
  vueApp.mount(mountElement);

  const ensureSelectionState = (chart, personId) => {
    if (!personId) {
      return;
    }
    const dataIndex = dataIndexByPersonId.get(personId);
    if (dataIndex == null) {
      return;
    }
    chart.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex });
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex });
  };

  function highlightIndividual(personId, { focusView = true } = {}) {
    const dataIndex = dataIndexByPersonId.get(personId);
    if (dataIndex == null) {
      highlightedId = null;
      return false;
    }
    const previousId = highlightedId;
    highlightedId = personId;
    runWhenReady((chart) => {
      if (previousId && previousId !== personId) {
        const previousIndex = dataIndexByPersonId.get(previousId);
        if (previousIndex != null) {
          chart.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex: previousIndex });
          chart.dispatchAction({ type: 'unselect', seriesIndex: 0, dataIndex: previousIndex });
        }
      } else {
        chart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
        chart.dispatchAction({ type: 'unselect', seriesIndex: 0 });
      }
      ensureSelectionState(chart, personId);
      if (focusView) {
        focusOnIndividual(personId, { animate: true, ensureHighlight: false });
      }
    });
    return true;
  }

  function focusOnIndividual(personId, { animate = true, ensureHighlight = true } = {}) {
    const position = positionByPersonId.get(personId);
    const dataIndex = dataIndexByPersonId.get(personId);
    if (!position || dataIndex == null) {
      return false;
    }
    if (ensureHighlight) {
      highlightIndividual(personId, { focusView: false });
    }
    runWhenReady((chart) => {
      const pixel = chart.convertToPixel({ seriesIndex: 0 }, position);
      if (!Array.isArray(pixel)) {
        return;
      }
      const [px, py] = pixel;
      const dom = chart.getDom();
      const centerX = dom?.clientWidth ? dom.clientWidth / 2 : 0;
      const centerY = dom?.clientHeight ? dom.clientHeight / 2 : 0;
      const dx = centerX - px;
      const dy = centerY - py;
      chart.dispatchAction({ type: 'graphRoam', dx, dy });
      if (animate) {
        ensureSelectionState(chart, personId);
      }
    });
    highlightedId = personId;
    return true;
  }

  function zoom(factor) {
    runWhenReady((chart) => {
      const dom = chart.getDom();
      const originX = dom?.clientWidth ? dom.clientWidth / 2 : 0;
      const originY = dom?.clientHeight ? dom.clientHeight / 2 : 0;
      chart.dispatchAction({ type: 'graphRoam', zoom: factor, originX, originY });
      if (highlightedId) {
        ensureSelectionState(chart, highlightedId);
      }
    });
  }

  function resetView() {
    runWhenReady((chart) => {
      chart.dispatchAction({ type: 'restore' });
      if (highlightedId) {
        ensureSelectionState(chart, highlightedId);
      }
    });
  }

  function destroy() {
    detachChartListeners();
    vueApp.unmount();
    if (chartElement.contains(mountElement)) {
      chartElement.removeChild(mountElement);
    }
    chartElement.innerHTML = '';
    highlightedId = null;
    if (containerElement) {
      delete containerElement.dataset.treeOrientation;
    }
  }

  return {
    destroy,
    focusOnIndividual,
    highlightIndividual,
    zoomIn() {
      zoom(1.25);
    },
    zoomOut() {
      zoom(0.8);
    },
    resetView,
    get highlightedId() {
      return highlightedId;
    }
  };
}
