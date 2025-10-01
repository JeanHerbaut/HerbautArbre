import './styles/main.scss';
import { buildTreeLayout } from './tree/layout.js';
import { createTreeRenderer } from './tree/renderer.js';

const DATA_URL = '/data/famille-herbaut.json';

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

function renderLayout(individuals) {
  const uniqueGenerations = Array.from(new Set(individuals.map((person) => person.generation).filter(Boolean))).sort(
    (a, b) => Number(a) - Number(b)
  );

  appElement.innerHTML = `
    <div class="app__layout">
      <aside class="search-panel">
        <h1 class="search-panel__title">Explorateur familial</h1>
        <form class="search-panel__form" autocomplete="off">
          <label class="search-panel__field">
            <span class="search-panel__label">Nom</span>
            <input type="search" name="name" class="search-panel__input" placeholder="Rechercher un nom" />
          </label>
          <label class="search-panel__field">
            <span class="search-panel__label">Num\u00e9ro Sosa</span>
            <input type="search" name="sosa" class="search-panel__input" placeholder="Ex. 1536" />
          </label>
          <label class="search-panel__field">
            <span class="search-panel__label">G\u00e9n\u00e9ration</span>
            <select name="generation" class="search-panel__select">
              <option value="">Toutes les g\u00e9n\u00e9rations</option>
              ${uniqueGenerations
                .map((generation) => `<option value="${generation}">G\u00e9n\u00e9ration ${generation}</option>`)
                .join('')}
              <option value="inconnue">G\u00e9n\u00e9ration inconnue</option>
            </select>
          </label>
        </form>
        <div class="search-panel__results">
          <h2 class="search-panel__subtitle">R\u00e9sultats</h2>
          <p class="search-panel__hint">S\u00e9lectionnez une personne pour centrer l'arbre.</p>
          <ul class="search-panel__list" aria-live="polite"></ul>
        </div>
      </aside>
      <section class="tree-view" aria-label="Arbre g\u00e9n\u00e9alogique">
        <header class="tree-view__toolbar">
          <div class="tree-toolbar">
            <div class="tree-toolbar__controls" role="group" aria-label="Contr\u00f4les du zoom">
              <button type="button" class="tree-toolbar__button" data-tree-action="zoom-out" aria-label="Zoom arri\u00e8re">\u2212</button>
              <button type="button" class="tree-toolbar__button" data-tree-action="reset" aria-label="R\u00e9initialiser la vue">R\u00e9initialiser</button>
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
                <span class="tree-legend__label">Individu s\u00e9lectionn\u00e9</span>
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
    form: appElement.querySelector('.search-panel__form'),
    nameInput: appElement.querySelector('input[name="name"]'),
    sosaInput: appElement.querySelector('input[name="sosa"]'),
    generationSelect: appElement.querySelector('select[name="generation"]'),
    resultsList: appElement.querySelector('.search-panel__list'),
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
  modalTitle.textContent = person.name ?? person.id;
  modalBody.innerHTML = formatPersonDetails(person);
  if (!modalElement.open) {
    modalElement.showModal();
  }
}

function createSearchResult(person, onSelect) {
  const item = document.createElement('li');
  item.className = 'search-panel__item';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-panel__result-button';
  button.textContent = person.name ?? person.id;
  button.addEventListener('click', () => onSelect(person));
  item.appendChild(button);
  return item;
}

function setupSearch(formElements, individuals, { onPersonSelected, focusOnIndividual }) {
  const { form, nameInput, sosaInput, generationSelect, resultsList } = formElements;

  function filterResults() {
    const nameQuery = nameInput.value.trim().toLowerCase();
    const sosaQuery = sosaInput.value.trim().toLowerCase();
    const generationQuery = generationSelect.value;

    const filtered = individuals.filter((person) => {
      const matchesName = !nameQuery || (person.name ?? '').toLowerCase().includes(nameQuery);
      const matchesSosa = !sosaQuery || (person.sosa ?? '').toLowerCase().includes(sosaQuery);
      const generationValue = person.generation ?? 'inconnue';
      const matchesGeneration = !generationQuery || generationValue === generationQuery;
      return matchesName && matchesSosa && matchesGeneration;
    });

    resultsList.innerHTML = '';
    filtered.slice(0, 20).forEach((person) => {
      const item = createSearchResult(person, (selectedPerson) => {
        focusOnIndividual(selectedPerson.id);
        onPersonSelected(selectedPerson);
      });
      resultsList.appendChild(item);
    });
  }

  form.addEventListener('input', filterResults);
  filterResults();
}

async function init() {
  try {
    const data = await fetchData();
    const individuals = Array.isArray(data.individuals) ? data.individuals : [];
    const relationships = Array.isArray(data.relationships) ? data.relationships : [];
    const layout = buildTreeLayout(individuals, relationships);
    const formElements = renderLayout(individuals);

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

    setupSearch(formElements, individuals, {
      onPersonSelected: openPersonModal,
      focusOnIndividual: (personId) => treeApi.focusOnIndividual(personId)
    });

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
