const NAME_PATTERN = /[^\p{L}\p{M}\s'\-]/gu;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeName(value) {
  const safeValue = typeof value === 'string' ? value : '';
  return collapseWhitespace(safeValue.replace(NAME_PATTERN, ''));
}

function sanitizeDate(value) {
  const safeValue = typeof value === 'string' ? value : '';
  const trimmed = safeValue.trim();
  if (!trimmed) {
    return '';
  }
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return '';
  }
  return trimmed;
}

export class SearchPanel {
  constructor({ onSearch } = {}) {
    this.onSearch = onSearch;
    this.rootElement = this.#createPanel();
    this.formElement = this.rootElement.querySelector('.search-panel__form');
    this.errorListElement = this.rootElement.querySelector('.search-panel__errors');
    this.lastNameInput = this.rootElement.querySelector('input[name="lastName"]');
    this.firstNameInput = this.rootElement.querySelector('input[name="firstName"]');
    this.birthDateInput = this.rootElement.querySelector('input[name="birthDate"]');
    this.birthYearToggle = this.rootElement.querySelector('input[name="birthDateUseYear"]');

    if (this.errorListElement) {
      this.errorListElement.hidden = true;
    }

    this.formElement.addEventListener('submit', (event) => this.#handleSubmit(event));
    this.formElement.addEventListener('reset', () => this.#handleReset());
    if (this.birthDateInput && this.birthYearToggle) {
      this.birthDateInput.addEventListener('input', () => {
        if (!this.birthDateInput.value) {
          this.birthYearToggle.checked = false;
        }
      });
    }
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
        <div class="search-panel__field search-panel__field--date">
          <label class="search-panel__label" for="search-birth-date">Date de naissance</label>
          <input id="search-birth-date" class="search-panel__input" type="date" name="birthDate" autocomplete="bday" />
          <label class="search-panel__option" for="search-birth-date-use-year">
            <input id="search-birth-date-use-year" type="checkbox" name="birthDateUseYear" />
            <span>Inclure l'année</span>
          </label>
        </div>
        <div class="search-panel__actions">
          <button type="submit" class="search-panel__submit">Rechercher</button>
          <button type="reset" class="search-panel__reset">Effacer</button>
        </div>
        <ul class="search-panel__errors" role="alert" aria-live="assertive"></ul>
      </form>
      <p class="search-panel__hint">Astuce : sélectionnez un jour et un mois, puis cochez l'option si vous souhaitez filtrer aussi par année.</p>
    `;
    return panel;
  }

  #handleReset() {
    this.#renderErrors([]);
    window.requestAnimationFrame(() => this.focus());
    if (this.birthDateInput) {
      this.birthDateInput.value = '';
    }
    if (this.birthYearToggle) {
      this.birthYearToggle.checked = false;
    }
    this.onSearch?.({ lastName: '', firstName: '', birthDate: '', birthDateUseYear: false });
  }

  #handleSubmit(event) {
    event.preventDefault();
    const rawValues = {
      lastName: this.lastNameInput?.value ?? '',
      firstName: this.firstNameInput?.value ?? '',
      birthDate: this.birthDateInput?.value ?? '',
      birthDateUseYear: this.birthYearToggle?.checked ?? false
    };

    const cleanedValues = {
      lastName: sanitizeName(rawValues.lastName),
      firstName: sanitizeName(rawValues.firstName),
      birthDate: sanitizeDate(rawValues.birthDate),
      birthDateUseYear: Boolean(rawValues.birthDateUseYear)
    };

    if (this.lastNameInput) {
      this.lastNameInput.value = cleanedValues.lastName;
    }
    if (this.firstNameInput) {
      this.firstNameInput.value = cleanedValues.firstName;
    }
    if (this.birthDateInput) {
      this.birthDateInput.value = cleanedValues.birthDate;
    }
    if (this.birthYearToggle) {
      this.birthYearToggle.checked = cleanedValues.birthDateUseYear;
    }

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
    const hasInput =
      values.lastName.length > 0 || values.firstName.length > 0 || values.birthDate.length > 0;
    if (!hasInput) {
      issues.push('Renseignez au moins un critère de recherche.');
    }
    if (values.birthDate && !ISO_DATE_PATTERN.test(values.birthDate)) {
      issues.push("La date de naissance doit être une valeur valide du calendrier.");
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
