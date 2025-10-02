import './styles/main.scss';
import './styles/search.scss';
import { buildTreeLayout } from './tree/layout.js';
import { createTreeRenderer } from './tree/renderer.js';
import { SearchPanel } from './search/SearchPanel.js';
import { SearchModal } from './search/SearchModal.js';
import { filterIndividuals } from './search/filter.js';
import { formatPersonDisplayName } from './utils/person.js';

const DATA_URL = `${import.meta.env.BASE_URL}data/famille-herbaut.json`;
const ROOT_PERSON_ID = 'S_3072';
const DEFAULT_FOCUS_NAME = 'Jéhovah Herbaut premier du nom';
const FAN_LAYOUT_QUERY = '(max-width: 768px)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

const appElement = document.querySelector('#app');
const modalElement = document.querySelector('#person-modal');
const modalTitle = modalElement.querySelector('.modal__title');
const modalBody = modalElement.querySelector('.modal__body');
const modalClose = modalElement.querySelector('.modal__close');

modalClose.addEventListener('click', () => modalElement.close());
modalElement.addEventListener('cancel', (event) => {
  event.preventDefault();
  modalElement.close();
});

async function fetchData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Impossible de charger les donn\u00e9es (statut ${response.status})`);
  }
  return response.json();
}

const PLACEHOLDER_NAME_PATTERN = /^Personne\s+/i;
const BIRTH_NAME_PATTERN = /naissance d['e]\s*([\p{L}\p{M}\s'\-]+?)(?=\s+(?:n'est|est|,|\.|$))/iu;
const CHRONICLE_NAME_PATTERN = /Chronique familiale de\s+([\p{L}\p{M}\s'\-]+)/iu;

function mergeAnnotationFragments(annotations) {
  if (!Array.isArray(annotations)) {
    return [];
  }
  const merged = [];
  let buffer = '';
  annotations.forEach((entry) => {
    const value = typeof entry === 'string' ? entry.trim() : '';
    if (!value) {
      return;
    }
    if (value.startsWith('- ')) {
      if (buffer) {
        merged.push(buffer);
        buffer = '';
      }
      merged.push(value);
      return;
    }
    buffer = buffer ? `${buffer} ${value}` : value;
    if (/[.!?;:]$/.test(value)) {
      merged.push(buffer);
      buffer = '';
    }
  });
  if (buffer) {
    merged.push(buffer);
  }
  return merged;
}

function deriveNameFromAnnotations(annotations) {
  if (!Array.isArray(annotations)) {
    return null;
  }
  for (const annotation of annotations) {
    const text = typeof annotation === 'string' ? annotation.trim() : '';
    if (!text) {
      continue;
    }
    const birthMatch = text.match(BIRTH_NAME_PATTERN);
    if (birthMatch && birthMatch[1]) {
      return birthMatch[1].replace(/\s+/g, ' ').trim();
    }
  }
  for (const annotation of annotations) {
    const text = typeof annotation === 'string' ? annotation.trim() : '';
    if (!text) {
      continue;
    }
    const chronicleMatch = text.match(CHRONICLE_NAME_PATTERN);
    if (chronicleMatch && chronicleMatch[1]) {
      return text.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

function normalizeComparableText(value) {
  if (!value) {
    return '';
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findPersonIdByName(individuals, targetName) {
  const normalizedTarget = normalizeComparableText(targetName);
  if (!normalizedTarget) {
    return null;
  }
  for (const person of individuals) {
    if (!person) {
      continue;
    }
    const candidates = [person.name, formatPersonDisplayName(person)].filter(Boolean);
    for (const candidate of candidates) {
      if (normalizeComparableText(candidate) === normalizedTarget) {
        return person.id;
      }
    }
  }
  return null;
}

function normalizeIndividuals(individuals) {
  return individuals.map((person) => {
    const normalizedAnnotations = mergeAnnotationFragments(person.annotations);
    const updates = {};
    if (normalizedAnnotations.length > 0) {
      updates.annotations = normalizedAnnotations;
    }
    const annotationSource = normalizedAnnotations.length > 0
      ? normalizedAnnotations
      : Array.isArray(person.annotations)
      ? person.annotations
      : [];
    if (person.name && PLACEHOLDER_NAME_PATTERN.test(person.name)) {
      const derivedName = deriveNameFromAnnotations(annotationSource);
      if (derivedName) {
        updates.name = derivedName;
      }
    }
    if (Object.keys(updates).length === 0) {
      return person;
    }
    return {
      ...person,
      ...updates
    };
  });
}

function renderLayout() {
  appElement.innerHTML = `
    <div class="app__layout">
      <section class="tree-view" aria-label="Arbre généalogique">
        <header class="tree-view__toolbar">
          <div class="tree-toolbar">
            <div class="tree-toolbar__controls" role="group" aria-label="Contrôles du zoom">
              <button type="button" class="tree-toolbar__button" data-tree-action="zoom-out" aria-label="Zoom arrière">−</button>
              <button type="button" class="tree-toolbar__button" data-tree-action="reset" aria-label="Réinitialiser la vue">Réinitialiser</button>
              <button type="button" class="tree-toolbar__button" data-tree-action="zoom-in" aria-label="Zoom avant">+</button>
            </div>
            <div class="tree-legend" aria-hidden="true">
              <div class="tree-legend__item">
                <span class="tree-legend__marker tree-legend__marker--branch"></span>
                <span class="tree-legend__label">Branche familiale</span>
              </div>
              <div class="tree-legend__item">
                <span class="tree-legend__marker tree-legend__marker--union"></span>
                <span class="tree-legend__label">Union / Mariage</span>
              </div>
              <div class="tree-legend__item">
                <span class="tree-legend__marker tree-legend__marker--focus"></span>
                <span class="tree-legend__label">Individu sélectionné</span>
              </div>
            </div>
          </div>
        </header>
        <div class="tree-view__canvas" tabindex="0">
          <svg class="tree-view__svg" role="presentation"></svg>
        </div>
      </section>
      <aside class="search-panel" aria-labelledby="search-panel-title">
        <div class="search-panel__container" id="search-panel-container"></div>
      </aside>
    </div>
  `;

  return {
    searchPanelContainer: appElement.querySelector('#search-panel-container'),
    treeCanvas: appElement.querySelector('.tree-view__canvas'),
    treeSvg: appElement.querySelector('.tree-view__svg'),
    zoomInButton: appElement.querySelector('[data-tree-action="zoom-in"]'),
    zoomOutButton: appElement.querySelector('[data-tree-action="zoom-out"]'),
    resetViewButton: appElement.querySelector('[data-tree-action="reset"]')
  };
}

function formatPersonDetails(person) {
  const details = [];
  if (person.name) {
    details.push(`<strong>Nom</strong> : ${person.name}`);
  }
  if (person.sosa) {
    details.push(`<strong>Num\u00e9ro Sosa</strong> : ${person.sosa}`);
  }
  if (person.birth?.date || person.birth?.place) {
    const birth = [person.birth?.date, person.birth?.place].filter(Boolean).join(' \u2013 ');
    details.push(`<strong>Naissance</strong> : ${birth}`);
  }
  if (person.death?.date || person.death?.place) {
    const death = [person.death?.date, person.death?.place].filter(Boolean).join(' \u2013 ');
    details.push(`<strong>D\u00e9c\u00e8s</strong> : ${death}`);
  }
  if (person.parents) {
    const parentDetails = [person.parents.father, person.parents.mother].filter(Boolean).join(', ');
    if (parentDetails) {
      details.push(`<strong>Parents</strong> : ${parentDetails}`);
    }
  }
  if (person.spouses) {
    const spouseDetails = Array.isArray(person.spouses) ? person.spouses.join(', ') : person.spouses;
    if (spouseDetails) {
      details.push(`<strong>Conjoints</strong> : ${spouseDetails}`);
    }
  }
  if (Array.isArray(person.annotations) && person.annotations.length > 0) {
    const annotations = person.annotations.map((annotation) => `<li>${annotation}</li>`).join('');
    details.push(`<strong>Notes</strong> : <ul class="modal__annotations">${annotations}</ul>`);
  }
  return details.join('<br />');
}

function openPersonModal(person) {
  modalTitle.textContent = formatPersonDisplayName(person) || person.name || person.id;
  modalBody.innerHTML = formatPersonDetails(person);
  if (!modalElement.open) {
    modalElement.showModal();
  }
}

async function init() {
  try {
    const data = await fetchData();
    const rawIndividuals = Array.isArray(data.individuals) ? data.individuals : [];
    const individuals = normalizeIndividuals(rawIndividuals);
    const relationships = Array.isArray(data.relationships) ? data.relationships : [];
    const formElements = renderLayout();
    let treeApi = null;
    let currentLayoutMode = 'fan';
    let layoutMediaQuery = null;
    const defaultFocusId = findPersonIdByName(individuals, DEFAULT_FOCUS_NAME) ?? ROOT_PERSON_ID;
    let preferredFocusId = defaultFocusId;

    const renderTree = (mode, { animateFocus = false } = {}) => {
      const layout = buildTreeLayout(individuals, relationships, { mode });
      const previousHighlight = treeApi?.highlightedId ?? preferredFocusId ?? defaultFocusId;
      treeApi?.destroy();
      treeApi = createTreeRenderer({
        svgElement: formElements.treeSvg,
        containerElement: formElements.treeCanvas,
        layout,
        onPersonSelected: (person) => {
          openPersonModal(person);
        }
      });
      const targetId = previousHighlight || defaultFocusId || ROOT_PERSON_ID;
      const focused = treeApi.focusOnIndividual(targetId, { animate: animateFocus });
      if (!focused) {
        treeApi.highlightIndividual(targetId, { focusView: false });
      }
      preferredFocusId = treeApi.highlightedId ?? targetId ?? preferredFocusId;
      if (typeof window !== 'undefined') {
        window.herbautTree = treeApi;
      }
    };

    if (formElements.zoomInButton) {
      formElements.zoomInButton.addEventListener('click', () => treeApi?.zoomIn());
    }
    if (formElements.zoomOutButton) {
      formElements.zoomOutButton.addEventListener('click', () => treeApi?.zoomOut());
    }
    if (formElements.resetViewButton) {
      formElements.resetViewButton.addEventListener('click', () => treeApi?.resetView());
    }

    const searchModal = new SearchModal({
      onSelect: (person) => {
        const focused = treeApi?.focusOnIndividual(person.id);
        if (!focused) {
          treeApi?.highlightIndividual(person.id);
        }
        preferredFocusId = treeApi?.highlightedId ?? person.id ?? preferredFocusId;
      }
    });
    searchModal.mount(document.body);

    const searchPanel = new SearchPanel({
      onSearch: (criteria) => {
        const hasCriteria =
          (criteria.lastName && criteria.lastName.length > 0) ||
          (criteria.firstName && criteria.firstName.length > 0) ||
          (criteria.birthDate && criteria.birthDate.length > 0);
        if (!hasCriteria) {
          searchModal.close();
          return;
        }
        const results = filterIndividuals(individuals, criteria);
        if (results.length === 1) {
          const [singleResult] = results;
          const focused = treeApi?.focusOnIndividual(singleResult.id);
          if (!focused) {
            treeApi?.highlightIndividual(singleResult.id);
          }
          preferredFocusId = treeApi?.highlightedId ?? singleResult.id ?? preferredFocusId;
          searchModal.close();
          return;
        }
        searchModal.open(results);
      }
    });

    searchPanel.mount(formElements.searchPanelContainer);
    const shouldAutoFocusSearch =
      typeof window === 'undefined' ? true : !window.matchMedia(COARSE_POINTER_QUERY).matches;
    if (shouldAutoFocusSearch && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => searchPanel.focus());
    }

    if (typeof window !== 'undefined') {
      layoutMediaQuery = window.matchMedia(FAN_LAYOUT_QUERY);
      currentLayoutMode = layoutMediaQuery.matches ? 'fan' : 'hierarchical';
      const handleLayoutChange = () => {
        const desiredMode = layoutMediaQuery.matches ? 'fan' : 'hierarchical';
        if (desiredMode === currentLayoutMode) {
          return;
        }
        currentLayoutMode = desiredMode;
        renderTree(currentLayoutMode, { animateFocus: false });
      };
      if (typeof layoutMediaQuery.addEventListener === 'function') {
        layoutMediaQuery.addEventListener('change', handleLayoutChange);
      } else if (typeof layoutMediaQuery.addListener === 'function') {
        layoutMediaQuery.addListener(handleLayoutChange);
      }
    }

    renderTree(currentLayoutMode, { animateFocus: false });
  } catch (error) {
    appElement.innerHTML = `
      <div class="app__error">
        <h1>Erreur de chargement</h1>
        <p>${error.message}</p>
      </div>
    `;
  }
}

init();
