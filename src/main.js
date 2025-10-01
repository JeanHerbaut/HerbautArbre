import * as d3 from 'd3';
import './styles/main.scss';

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

function buildHierarchy(individuals) {
  const generations = new Map();

  individuals.forEach((person) => {
    const generationKey = person.generation ?? 'inconnue';
    if (!generations.has(generationKey)) {
      generations.set(generationKey, []);
    }
    generations.get(generationKey).push(person);
  });

  const sortedGenerations = Array.from(generations.entries()).sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;
    const numA = Number.parseInt(keyA, 10);
    const numB = Number.parseInt(keyB, 10);

    if (Number.isNaN(numA) && Number.isNaN(numB)) {
      return keyA.localeCompare(keyB);
    }
    if (Number.isNaN(numA)) {
      return 1;
    }
    if (Number.isNaN(numB)) {
      return -1;
    }
    return numA - numB;
  });

  const children = sortedGenerations.map(([generationKey, persons]) => ({
    name: generationKey === 'inconnue' ? 'G\u00e9n\u00e9ration inconnue' : `G\u00e9n\u00e9ration ${generationKey}`,
    generation: generationKey,
    children: persons.map((person) => ({
      name: person.name ?? person.id,
      person
    }))
  }));

  return {
    name: 'Famille Herbaut',
    children
  };
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
        <div class="tree-view__canvas" tabindex="0">
          <svg class="tree-view__svg" role="img"></svg>
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
    treeSvg: appElement.querySelector('.tree-view__svg')
  };
}

function renderTree(svgElement, canvasElement, hierarchyData, { onPersonSelected }) {
  const margin = { top: 40, right: 160, bottom: 40, left: 160 };
  const width = Math.max(canvasElement.clientWidth, 960);
  const nodeCount = d3.hierarchy(hierarchyData).descendants().length;
  const height = Math.max(600, nodeCount * 20);

  const svg = d3.select(svgElement);
  svg.selectAll('*').remove();
  svg.attr('viewBox', [0, 0, width, height]);

  const root = d3.hierarchy(hierarchyData);
  const treeLayout = d3.tree().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
  treeLayout(root);

  const g = svg
    .append('g')
    .attr('class', 'tree-view__group')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);

  const linkGenerator = d3
    .linkHorizontal()
    .x((d) => d.y)
    .y((d) => d.x);

  g.append('g')
    .attr('class', 'tree-view__links')
    .selectAll('path')
    .data(root.links())
    .join('path')
    .attr('d', linkGenerator);

  const personNodes = new Map();

  const nodes = g
    .append('g')
    .attr('class', 'tree-view__nodes')
    .selectAll('g')
    .data(root.descendants())
    .join('g')
    .attr('transform', (d) => `translate(${d.y}, ${d.x})`)
    .attr('class', (d) => {
      const classes = ['tree-node'];
      if (d.data.person) {
        classes.push('tree-node--person');
      } else {
        classes.push('tree-node--group');
      }
      return classes.join(' ');
    });

  nodes
    .append('circle')
    .attr('class', 'tree-node__marker')
    .attr('r', (d) => (d.data.person ? 5 : 7));

  nodes
    .append('text')
    .attr('class', 'tree-node__label')
    .attr('dy', '0.32em')
    .attr('x', (d) => (d.children ? -12 : 12))
    .attr('text-anchor', (d) => (d.children ? 'end' : 'start'))
    .text((d) => d.data.name);

  nodes.each(function (d) {
    if (!d.data.person) {
      return;
    }
    this.setAttribute('role', 'button');
    this.setAttribute('tabindex', '0');
    this.setAttribute('data-person-id', d.data.person.id);
    this.setAttribute('aria-label', `Afficher les d\u00e9tails de ${d.data.person.name ?? d.data.person.id}`);
    personNodes.set(d.data.person.id, this);
  });

  function handleNodeEvent(event, datum) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onPersonSelected?.(datum.data.person);
  }

  nodes
    .filter((d) => Boolean(d.data.person))
    .on('click', handleNodeEvent)
    .on('keydown', handleNodeEvent);

  return {
    highlightPerson(personId) {
      nodes.classed('tree-node--highlight', false);
      const nodeElement = personNodes.get(personId);
      if (!nodeElement) {
        return;
      }
      d3.select(nodeElement).classed('tree-node--highlight', true);
      const nodeBox = nodeElement.getBoundingClientRect();
      const canvasBox = canvasElement.getBoundingClientRect();
      const offsetX = nodeBox.x + nodeBox.width / 2 - (canvasBox.x + canvasBox.width / 2);
      const offsetY = nodeBox.y + nodeBox.height / 2 - (canvasBox.y + canvasBox.height / 2);
      canvasElement.scrollBy({ left: offsetX, top: offsetY, behavior: 'smooth' });
      nodeElement.focus({ preventScroll: true });
    }
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

function setupSearch(formElements, individuals, { onPersonSelected, highlightPerson }) {
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
        highlightPerson(selectedPerson.id);
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
    const hierarchyData = buildHierarchy(individuals);
    const formElements = renderLayout(individuals);

    const { highlightPerson } = renderTree(formElements.treeSvg, formElements.treeCanvas, hierarchyData, {
      onPersonSelected: (person) => {
        highlightPerson(person.id);
        openPersonModal(person);
      }
    });

    setupSearch(formElements, individuals, {
      onPersonSelected: openPersonModal,
      highlightPerson
    });
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
