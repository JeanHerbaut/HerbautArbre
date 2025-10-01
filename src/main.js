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

function normalizeIndividuals(individuals) {
  return individuals.map((person) => {
    const normalizedAnnotations = mergeAnnotationFragments(person.annotations);
    if (normalizedAnnotations.length === 0) {
      return person;
    }
    return {
      ...person,
      annotations: normalizedAnnotations
    };
  });
}

function renderLayout() {
  appElement.innerHTML = `
    <div class="app__layout">
      <aside class="search-panel" aria-labelledby="search-panel-title">
        <div class="search-panel__container" id="search-panel-container"></div>
      </aside>
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
    const layout = buildTreeLayout(individuals, relationships);
    const formElements = renderLayout();

    const treeApi = createTreeRenderer({
      svgElement: formElements.treeSvg,
      containerElement: formElements.treeCanvas,
      layout,
      onPersonSelected: (person) => {
        openPersonModal(person);
      }
    });

    if (formElements.zoomInButton) {
      formElements.zoomInButton.addEventListener('click', () => treeApi.zoomIn());
    }
    if (formElements.zoomOutButton) {
      formElements.zoomOutButton.addEventListener('click', () => treeApi.zoomOut());
    }
    if (formElements.resetViewButton) {
      formElements.resetViewButton.addEventListener('click', () => treeApi.resetView());
    }

    const searchModal = new SearchModal({
      onSelect: (person) => {
        const focused = treeApi.focusOnIndividual(person.id);
        if (!focused) {
          treeApi.highlightIndividual(person.id);
        }
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
        searchModal.open(results);
      }
    });

    searchPanel.mount(formElements.searchPanelContainer);
    window.requestAnimationFrame(() => searchPanel.focus());

    const focusRoot = () => {
      const success = treeApi.focusOnIndividual(ROOT_PERSON_ID, { animate: false });
      if (!success) {
        treeApi.highlightIndividual(ROOT_PERSON_ID);
      }
    };
    window.requestAnimationFrame(focusRoot);

    if (typeof window !== 'undefined') {
      window.herbautTree = treeApi;
    }
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
