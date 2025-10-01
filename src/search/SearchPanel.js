const NAME_PATTERN = /[^\p{L}\p{M}\s'\-]/gu;
const DATE_ALLOWED_PATTERN = /[^0-9./\-\s]/g;
const DATE_FORMAT_PATTERN = /^(\d{1,4})([./\-](\d{1,2})([./\-](\d{1,4}))?)?$/;

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeName(value) {
  const safeValue = typeof value === 'string' ? value : '';
  return collapseWhitespace(safeValue.replace(NAME_PATTERN, ''));
}

function sanitizeDate(value) {
  const safeValue = typeof value === 'string' ? value : '';
  return collapseWhitespace(safeValue.replace(DATE_ALLOWED_PATTERN, ''));
}

export class SearchPanel {
  constructor({ onSearch } = {}) {
    this.onSearch = onSearch;
    this.rootElement = this.#createPanel();
    this.formElement = this.rootElement.querySelector('.search-panel__form');
    this.errorListElement = this.rootElement.querySelector('.search-panel__errors');
    this.lastNameInput = this.rootElement.querySelector('input[name="lastName"]');
    this.firstNameInput = this.rootElement.querySelector('input[name="firstName"]');
    this.dateInput = this.rootElement.querySelector('input[name="date"]');

    if (this.errorListElement) {
      this.errorListElement.hidden = true;
    }

    this.formElement.addEventListener('submit', (event) => this.#handleSubmit(event));
    this.formElement.addEventListener('reset', () => this.#handleReset());
  }

  mount(container) {
    if (!container) {
      throw new Error('SearchPanel requires a valid container element');
    }
    container.innerHTML = '';
    container.appendChild(this.rootElement);
  }

  focus() {
    this.lastNameInput?.focus();
  }

  #createPanel() {
    const panel = document.createElement('div');
    panel.className = 'search-panel__inner';
    panel.innerHTML = `
      <h1 id="search-panel-title" class="search-panel__title">Exploration ciblée</h1>
      <p class="search-panel__intro">Filtrez la généalogie par nom, prénom ou date clé pour faire apparaître les individus correspondants.</p>
      <form class="search-panel__form" novalidate>
        <div class="search-panel__field">
          <label class="search-panel__label" for="search-last-name">Nom</label>
          <input id="search-last-name" class="search-panel__input" type="search" name="lastName" autocomplete="family-name" placeholder="Ex. Herbaut" />
        </div>
        <div class="search-panel__field">
          <label class="search-panel__label" for="search-first-name">Prénom</label>
          <input id="search-first-name" class="search-panel__input" type="search" name="firstName" autocomplete="given-name" placeholder="Ex. Jeanne" />
        </div>
        <div class="search-panel__field">
          <label class="search-panel__label" for="search-date">Date</label>
          <input id="search-date" class="search-panel__input" type="search" name="date" inputmode="numeric" placeholder="JJ/MM/AAAA ou AAAA" />
        </div>
        <div class="search-panel__actions">
          <button type="submit" class="search-panel__submit">Rechercher</button>
          <button type="reset" class="search-panel__reset">Effacer</button>
        </div>
        <ul class="search-panel__errors" role="alert" aria-live="assertive"></ul>
      </form>
      <p class="search-panel__hint">Astuce : vous pouvez saisir uniquement un nom ou affiner avec plusieurs critères.</p>
    `;
    return panel;
  }

  #handleReset() {
    this.#renderErrors([]);
    window.requestAnimationFrame(() => this.focus());
    this.onSearch?.({ lastName: '', firstName: '', date: '' });
  }

  #handleSubmit(event) {
    event.preventDefault();
    const rawValues = {
      lastName: this.lastNameInput.value,
      firstName: this.firstNameInput.value,
      date: this.dateInput.value
    };

    const cleanedValues = {
      lastName: sanitizeName(rawValues.lastName),
      firstName: sanitizeName(rawValues.firstName),
      date: sanitizeDate(rawValues.date)
    };

    this.lastNameInput.value = cleanedValues.lastName;
    this.firstNameInput.value = cleanedValues.firstName;
    this.dateInput.value = cleanedValues.date;

    const errors = this.#validate(cleanedValues);
    if (errors.length > 0) {
      this.#renderErrors(errors);
      return;
    }

    this.#renderErrors([]);
    this.onSearch?.(cleanedValues);
  }

  #validate(values) {
    const issues = [];
    const hasInput = Object.values(values).some((value) => value.length > 0);
    if (!hasInput) {
      issues.push('Renseignez au moins un critère de recherche.');
    }
    if (values.date && !DATE_FORMAT_PATTERN.test(values.date.replace(/\s+/g, ''))) {
      issues.push('Le format de date doit correspondre à AAAA ou JJ/MM/AAAA.');
    }
    return issues;
  }

  #renderErrors(errors) {
    if (!this.errorListElement) {
      return;
    }
    this.errorListElement.innerHTML = '';
    errors.forEach((message) => {
      const item = document.createElement('li');
      item.className = 'search-panel__error';
      item.textContent = message;
      this.errorListElement.appendChild(item);
    });
    this.errorListElement.hidden = errors.length === 0;
  }
}
