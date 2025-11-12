import { openDialog, closeDialog } from './dialog.js';

const NORMALIZE_PATTERN = /\p{Diacritic}/gu;

function normalizeText(value) {
  if (!value) {
    return '';
  }
  return value
    .normalize('NFD')
    .replace(NORMALIZE_PATTERN, '')
    .replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildSearchValue({ label, firstName, lastName, birthDate, birthPlace, dates }) {
  return normalizeText(
    [label, firstName, lastName, birthDate, birthPlace, dates]
      .filter((part) => part && part.length > 0)
      .join(' ')
  );
}

export function createSearchPanel({ input, results, button, modal, modalMessage, modalResults, onSelect }) {
  if (!input || !results || !button || !modal || !modalMessage || !modalResults) {
    throw new Error('Search panel requires input, button, modal and container elements');
  }
  let searchRecords = [];

  function clearSuggestions() {
    results.innerHTML = '';
  }

  function clearInput() {
    input.value = '';
    clearSuggestions();
  }

  function renderSuggestions(matches) {
    clearSuggestions();
    matches.slice(0, 12).forEach((entry) => {
      const buttonElement = document.createElement('button');
      buttonElement.type = 'button';
      buttonElement.className = 'search-result';
      buttonElement.dataset.personId = entry.id;
      buttonElement.innerHTML = `
        <span class="search-result__name">${entry.label}</span>
        ${entry.dates ? `<span class="search-result__dates">${entry.dates}</span>` : ''}
      `;
      buttonElement.addEventListener('mousedown', (event) => event.preventDefault());
      buttonElement.addEventListener('click', () => {
        clearInput();
        onSelect?.(entry.id);
      });
      results.appendChild(buttonElement);
    });
  }

  function openResultsModal(matches, queryLabel) {
    modalResults.innerHTML = '';
    if (matches.length === 0) {
      modalMessage.textContent = `Aucun membre trouvé pour « ${queryLabel} ».`;
      openDialog(modal);
      return;
    }
    modalMessage.textContent = `Plusieurs membres correspondent à « ${queryLabel} ». Sélectionnez la bonne personne.`;
    matches.forEach((entry) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'search-modal__item';
      option.dataset.personId = entry.id;
      const birthSummary = [entry.birthDate, entry.birthPlace].filter(Boolean).join(' — ');
      option.innerHTML = `
        <span class="search-modal__item-name">${entry.label}</span>
        ${birthSummary ? `<span class="search-modal__item-meta">${birthSummary}</span>` : ''}
      `;
      option.addEventListener('click', () => {
        closeDialog(modal);
        clearInput();
        onSelect?.(entry.id);
      });
      modalResults.appendChild(option);
    });
    openDialog(modal);
  }

  function executeSearch() {
    const rawQuery = input.value.trim();
    const normalized = normalizeText(rawQuery);
    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0) {
      modalResults.innerHTML = '';
      modalMessage.textContent = "Veuillez saisir un nom, un prénom et/ou une date de naissance.";
      openDialog(modal);
      return;
    }
    clearSuggestions();
    const matches = searchRecords.filter((entry) => tokens.every((token) => entry.searchValue.includes(token)));
    if (matches.length === 1) {
      clearInput();
      onSelect?.(matches[0].id);
      return;
    }
    openResultsModal(matches, rawQuery || normalized);
  }

  function handleInput() {
    const query = normalizeText(input.value);
    if (!query) {
      clearSuggestions();
      return;
    }
    const matches = searchRecords.filter((entry) => entry.searchValue.includes(query));
    renderSuggestions(matches);
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      executeSearch();
    } else if (event.key === 'Escape') {
      clearInput();
    }
  });

  input.addEventListener('focus', () => {
    if (input.value) {
      handleInput();
    }
  });

  button.addEventListener('click', () => {
    executeSearch();
  });

  return {
    update(records = []) {
      searchRecords = records.map((record) => ({
        id: record.id,
        label: record.label,
        dates: record.dates,
        birthDate: record.birthDate,
        birthPlace: record.birthPlace,
        searchValue: buildSearchValue(record)
      }));
    },
    clear() {
      clearInput();
    }
  };
}
