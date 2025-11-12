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

export function createSearchPanel({ input, results, onSelect }) {
  if (!input || !results) {
    throw new Error('Search panel requires valid input and results elements');
  }
  let searchRecords = [];

  function render(matches) {
    results.innerHTML = '';
    matches.slice(0, 12).forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.dataset.personId = entry.id;
      button.innerHTML = `
        <span class="search-result__name">${entry.label}</span>
        ${entry.dates ? `<span class="search-result__dates">${entry.dates}</span>` : ''}
      `;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        input.value = '';
        results.innerHTML = '';
        onSelect?.(entry.id);
      });
      results.appendChild(button);
    });
  }

  function handleInput() {
    const query = normalizeText(input.value);
    if (!query) {
      results.innerHTML = '';
      return;
    }
    const matches = searchRecords.filter((entry) => entry.searchValue.includes(query));
    render(matches);
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const firstResult = results.querySelector('.search-result');
      if (firstResult) {
        event.preventDefault();
        firstResult.click();
      }
    } else if (event.key === 'Escape') {
      input.value = '';
      results.innerHTML = '';
    }
  });

  input.addEventListener('focus', () => {
    if (input.value) {
      handleInput();
    }
  });

  return {
    update(records = []) {
      searchRecords = records.map((record) => ({
        id: record.id,
        label: record.label,
        dates: record.dates,
        searchValue: normalizeText(`${record.label} ${record.dates || ''}`)
      }));
    },
    clear() {
      input.value = '';
      results.innerHTML = '';
    }
  };
}
