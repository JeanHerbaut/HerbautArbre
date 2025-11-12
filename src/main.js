import 'family-chart/styles/family-chart.css';
import './styles/app.css';

import * as f3 from 'family-chart';
import {
  normalizeIndividuals,
  buildChartData,
  buildDisplayName,
  formatLifeEvents,
  createRecordFromForm
} from './data/format.js';
import { setupDialog, openDialog, closeDialog } from './ui/dialog.js';
import { createSearchPanel } from './ui/search.js';

const DATA_URL = `${import.meta.env.BASE_URL}data/famille-herbaut.json`;
const DEFAULT_ROOT_ID = 'S_3072';

const chartContainer = document.querySelector('#family-chart');
const personModal = setupDialog(document.querySelector('#person-modal'));
const personModalTitle = document.querySelector('#person-modal-title');
const personModalMeta = document.querySelector('#person-modal-meta');
const personModalNotes = document.querySelector('#person-modal-notes');
const addModal = setupDialog(document.querySelector('#add-person-modal'));
const addForm = document.querySelector('#add-person-form');
const addParentSelect = document.querySelector('#add-parent');
const focusRootButton = document.querySelector('#focus-root');
const openAddModalButton = document.querySelector('#open-add-modal');
const searchButton = document.querySelector('#search-button');
const searchModal = setupDialog(document.querySelector('#search-modal'));
const searchModalMessage = document.querySelector('#search-modal-message');
const searchModalResults = document.querySelector('#search-modal-results');

const searchPanel = createSearchPanel({
  fields: {
    lastName: document.querySelector('#search-last-name'),
    firstName: document.querySelector('#search-first-name'),
    birth: document.querySelector('#search-birth')
  },
  results: document.querySelector('#search-results'),
  button: searchButton,
  modal: searchModal,
  modalMessage: searchModalMessage,
  modalResults: searchModalResults,
  onSelect: (personId) => focusOnPerson(personId, { openModal: true })
});

let records = [];
let chartData = [];
let chartInstance = null;
const recordById = new Map();

async function loadData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Impossible de charger les données (statut ${response.status})`);
  }
  const data = await response.json();
  records = normalizeIndividuals(data?.individuals ?? []);
  records.forEach((record) => {
    recordById.set(record.id, record);
  });
  chartData = buildChartData(records);
}

function createCardTemplate() {
  if (!chartInstance) {
    return;
  }
  const card = chartInstance.setCardHtml();
  card.setStyle('rect');
  card.setOnCardUpdate(function (datum) {
    const cardElement = this.querySelector('.card');
    if (!cardElement) {
      return;
    }
    const record = recordById.get(datum?.data?.id ?? datum?.id ?? '');
    const genderValue = (record?.gender || datum?.data?.data?.gender || '').toUpperCase();
    let genderClass = 'f3-card--unknown';
    if (genderValue === 'F') {
      genderClass = 'f3-card--female';
    } else if (genderValue === 'M') {
      genderClass = 'f3-card--male';
    }
    cardElement.classList.add('f3-card');
    cardElement.classList.remove('f3-card--female', 'f3-card--male', 'f3-card--unknown');
    cardElement.classList.add(genderClass);
  });
  card.setCardInnerHtmlCreator((datum) => {
    const payload = datum?.data || {};
    const personId = payload?.id || datum?.id;
    const record = personId ? recordById.get(personId) : null;
    const dataDetails = payload?.data || {};
    const name = buildDisplayName(record) || dataDetails.displayName || personId;
    const birthSource = record?.birthDate || dataDetails.birthDate || '';
    const deathSource = record?.deathDate || dataDetails.deathDate || '';
    const birth = birthSource ? `° ${birthSource}` : '';
    const death = deathSource ? `† ${deathSource}` : '';
    const dates = [birth, death].filter(Boolean).join('<br />');
    return `
      <div class="card-inner f3-card-body">
        <div class="f3-card-title">${name || datum.id}</div>
        ${dates ? `<div class="f3-card-subtitle">${dates}</div>` : ''}
      </div>
    `;
  });
  card.setOnCardClick((event, datum) => {
    event?.stopPropagation();
    const targetId = datum?.data?.id || datum?.id;
    if (targetId) {
      focusOnPerson(targetId);
      openPersonModal(targetId);
    }
  });
}

function initializeChart() {
  if (!chartContainer) {
    throw new Error('Impossible de trouver le conteneur du graphique');
  }
  chartInstance = f3.createChart(chartContainer, chartData);
  createCardTemplate();
  chartInstance.updateTree({ initial: true, tree_position: 'fit', transition_time: 600 });
}

function openPersonModal(personId) {
  const record = recordById.get(personId);
  if (!record) {
    return;
  }
  const name = buildDisplayName(record);
  if (personModalTitle) {
    personModalTitle.textContent = name;
  }
  if (personModalMeta) {
    personModalMeta.innerHTML = '';
    const metaEntries = [];
    if (record.birthDate || record.birthPlace) {
      metaEntries.push({
        label: 'Naissance',
        value: [record.birthDate, record.birthPlace].filter(Boolean).join(' — ')
      });
    }
    if (record.deathDate || record.deathPlace) {
      metaEntries.push({
        label: 'Décès',
        value: [record.deathDate, record.deathPlace].filter(Boolean).join(' — ')
      });
    }
    if (record.sosa) {
      metaEntries.push({ label: 'Numéro Sosa', value: record.sosa });
    }
    if (record.generation) {
      metaEntries.push({ label: 'Génération', value: record.generation });
    }
    if (metaEntries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'person-modal__note';
      empty.textContent = 'Aucune information chronologique disponible.';
      personModalMeta.appendChild(empty);
    } else {
      metaEntries.forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'person-modal__meta-item';
        const label = document.createElement('span');
        label.className = 'person-modal__meta-label';
        label.textContent = entry.label;
        const value = document.createElement('span');
        value.className = 'person-modal__meta-value';
        value.textContent = entry.value;
        item.appendChild(label);
        item.appendChild(value);
        personModalMeta.appendChild(item);
      });
    }
  }
  if (personModalNotes) {
    personModalNotes.innerHTML = '';
    if (record.notes.length === 0) {
      const emptyNote = document.createElement('p');
      emptyNote.className = 'person-modal__note';
      emptyNote.textContent = 'Aucune note enregistrée.';
      personModalNotes.appendChild(emptyNote);
    } else {
      record.notes.forEach((note) => {
        const paragraph = document.createElement('p');
        paragraph.className = 'person-modal__note';
        paragraph.textContent = note;
        personModalNotes.appendChild(paragraph);
      });
    }
  }
  openDialog(personModal);
}

function focusOnPerson(personId, { openModal = false } = {}) {
  if (!chartInstance || !personId) {
    return;
  }
  const target = recordById.get(personId);
  if (!target) {
    return;
  }
  chartInstance.store.updateMainId(personId);
  chartInstance.updateTree({ tree_position: 'main_to_middle', transition_time: 650 });
  if (openModal) {
    openPersonModal(personId);
  }
}

function refreshSearchIndex() {
  const entries = records.map((record) => ({
    id: record.id,
    label: buildDisplayName(record),
    dates: formatLifeEvents(record).join(' — '),
    firstName: record.firstName,
    lastName: record.lastName,
    birthDate: record.birthDate,
    birthPlace: record.birthPlace
  }));
  searchPanel.update(entries);
}

function populateParentSelect(defaultId = '') {
  if (!addParentSelect) {
    return;
  }
  addParentSelect.innerHTML = '';
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'Sans parent direct';
  addParentSelect.appendChild(emptyOption);
  records
    .slice()
    .sort((a, b) => buildDisplayName(a).localeCompare(buildDisplayName(b), 'fr', { sensitivity: 'base' }))
    .forEach((record) => {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = buildDisplayName(record);
      addParentSelect.appendChild(option);
    });
  if (defaultId) {
    addParentSelect.value = defaultId;
  }
}

function setupAddModal() {
  if (!addModal || !addForm) {
    return;
  }
  addModal.addEventListener('close', () => {
    addForm.reset();
  });
  if (openAddModalButton) {
    openAddModalButton.addEventListener('click', () => {
      const currentMain = chartInstance?.store.getMainId?.() ?? DEFAULT_ROOT_ID;
      populateParentSelect(currentMain);
      openDialog(addModal);
      const firstNameInput = addForm.querySelector('#add-first-name');
      window.requestAnimationFrame(() => {
        firstNameInput?.focus();
      });
    });
  }
  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(addForm);
    const values = Object.fromEntries(formData.entries());
    const parentId = typeof values.parentId === 'string' ? values.parentId.trim() : '';
    const newRecord = createRecordFromForm(values, parentId);
    records.push(newRecord);
    recordById.set(newRecord.id, newRecord);
    if (parentId) {
      const parentRecord = recordById.get(parentId);
      if (parentRecord) {
        if (!parentRecord.children.includes(newRecord.id)) {
          parentRecord.children.push(newRecord.id);
        }
        if (!newRecord.parents.includes(parentId)) {
          newRecord.parents.push(parentId);
        }
      }
    }
    chartData = buildChartData(records);
    chartInstance.updateData(chartData);
    refreshSearchIndex();
    closeDialog(addModal);
    focusOnPerson(newRecord.id, { openModal: true });
  });
}

function setupRootFocus() {
  if (!focusRootButton) {
    return;
  }
  focusRootButton.addEventListener('click', () => {
    const rootId = recordById.has(DEFAULT_ROOT_ID) ? DEFAULT_ROOT_ID : records[0]?.id;
    if (rootId) {
      focusOnPerson(rootId);
    }
  });
}

async function bootstrap() {
  await loadData();
  initializeChart();
  refreshSearchIndex();
  setupAddModal();
  setupRootFocus();
  const initialId = recordById.has(DEFAULT_ROOT_ID) ? DEFAULT_ROOT_ID : records[0]?.id;
  if (initialId) {
    focusOnPerson(initialId);
  }
}

bootstrap().catch((error) => {
  console.error(error);
  const errorBanner = document.createElement('p');
  errorBanner.textContent = 'Une erreur est survenue lors du chargement des données.';
  errorBanner.style.padding = '1rem 2rem';
  errorBanner.style.color = '#b91c1c';
  chartContainer?.replaceChildren(errorBanner);
});
