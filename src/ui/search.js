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

function buildEntryTokens({ firstName, lastName, birthDate, birthPlace, label, dates }) {
  const nameParts = [firstName, lastName].filter(Boolean).join(' ');
  const birthInfo = [birthDate, birthPlace].filter(Boolean).join(' ');
  const combined = [label, dates, birthInfo].filter(Boolean).join(' ');
  return {
    lastName: normalizeText(lastName),
    firstName: normalizeText(firstName),
    birth: normalizeText(birthInfo),
    combined: normalizeText(combined || nameParts)
  };
}

function buildQueryLabel({ lastName, firstName, birth }) {
  const parts = [];
  if (lastName) {
    parts.push(`Nom : ${lastName}`);
  }
  if (firstName) {
    parts.push(`Prénom : ${firstName}`);
  }
  if (birth) {
    parts.push(`Naissance : ${birth}`);
  }
  return parts.join(' · ');
}

export function createSearchPanel({ fields, results, button, modal, modalMessage, modalResults, onSelect }) {
  const lastNameInput = fields?.lastName ?? null;
  const firstNameInput = fields?.firstName ?? null;
  const birthInput = fields?.birth ?? null;
  if (!lastNameInput || !firstNameInput || !birthInput || !results || !button || !modal || !modalMessage || !modalResults) {
    throw new Error('Search panel requires three input fields, results container, button and modal elements');
  }
  const inputs = [lastNameInput, firstNameInput, birthInput];
  let searchRecords = [];

  function clearSuggestions() {
    results.innerHTML = '';
  }

  function clearInputs() {
    inputs.forEach((input) => {
      input.value = '';
    });
    clearSuggestions();
  }

  function getRawQuery() {
    return {
      lastName: lastNameInput.value.trim(),
      firstName: firstNameInput.value.trim(),
      birth: birthInput.value.trim()
    };
  }

  function getNormalizedQuery() {
    const raw = getRawQuery();
    return {
      lastName: normalizeText(raw.lastName),
      firstName: normalizeText(raw.firstName),
      birth: normalizeText(raw.birth)
    };
  }

  function hasQuery(query) {
    return Object.values(query).some((value) => value && value.length > 0);
  }

  function matchesQuery(entry, query) {
    if (query.lastName && !entry.tokens.lastName.includes(query.lastName)) {
      return false;
    }
    if (query.firstName && !entry.tokens.firstName.includes(query.firstName)) {
      return false;
    }
    if (query.birth) {
      const birthMatches = entry.tokens.birth.includes(query.birth) || entry.tokens.combined.includes(query.birth);
      if (!birthMatches) {
        return false;
      }
    }
    return true;
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
        clearInputs();
        onSelect?.(entry.id);
      });
      results.appendChild(buttonElement);
    });
  }

  function openResultsModal(matches, queryLabel) {
    modalResults.innerHTML = '';
    if (matches.length === 0) {
      modalMessage.textContent = queryLabel
        ? `Aucun membre trouvé pour « ${queryLabel} ».`
        : 'Aucun membre ne correspond à votre recherche.';
      openDialog(modal);
      return;
    }
    modalMessage.textContent = queryLabel
      ? `Plusieurs membres correspondent à « ${queryLabel} ». Sélectionnez la bonne personne.`
      : 'Plusieurs membres correspondent à votre recherche. Sélectionnez la bonne personne.';
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
        clearInputs();
        onSelect?.(entry.id);
      });
      modalResults.appendChild(option);
    });
    openDialog(modal);
  }

  function executeSearch() {
    const normalizedQuery = getNormalizedQuery();
    if (!hasQuery(normalizedQuery)) {
      modalResults.innerHTML = '';
      modalMessage.textContent = 'Veuillez renseigner au moins un champ de recherche.';
      openDialog(modal);
      return;
    }
    clearSuggestions();
    const matches = searchRecords.filter((entry) => matchesQuery(entry, normalizedQuery));
    if (matches.length === 1) {
      clearInputs();
      onSelect?.(matches[0].id);
      return;
    }
    const queryLabel = buildQueryLabel(getRawQuery());
    openResultsModal(matches, queryLabel);
  }

  function handleInput() {
    const normalizedQuery = getNormalizedQuery();
    if (!hasQuery(normalizedQuery)) {
      clearSuggestions();
      return;
    }
    const matches = searchRecords.filter((entry) => matchesQuery(entry, normalizedQuery));
    renderSuggestions(matches);
  }

  inputs.forEach((input) => {
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        executeSearch();
      } else if (event.key === 'Escape') {
        input.value = '';
        handleInput();
      }
    });
    input.addEventListener('focus', () => {
      const normalizedQuery = getNormalizedQuery();
      if (hasQuery(normalizedQuery)) {
        handleInput();
      }
    });
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
        tokens: buildEntryTokens(record)
      }));
    },
    clear() {
      clearInputs();
    }
  };
}
