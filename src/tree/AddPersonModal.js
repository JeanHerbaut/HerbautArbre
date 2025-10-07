import { formatPersonDisplayName } from '../utils/person.js';

const NAME_PATTERN = /[^\p{L}\p{M}\s'\-]/gu;
const COLLATOR = new Intl.Collator('fr', { sensitivity: 'base', ignorePunctuation: true });
const DIACRITIC_PATTERN = /\p{Diacritic}/gu;

function sanitizeName(value) {
  const safeValue = typeof value === 'string' ? value : '';
  return safeValue.replace(NAME_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function sanitizeDate(value) {
  const safeValue = typeof value === 'string' ? value.trim() : '';
  if (!safeValue) {
    return '';
  }
  const date = new Date(safeValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return safeValue;
}

export class AddPersonModal {
  constructor({ onSubmit, getIndividuals } = {}) {
    this.onSubmit = onSubmit;
    this.getIndividuals = getIndividuals;
    this.dialogElement = this.#createDialog();
    this.formElement = this.dialogElement.querySelector('form');
    this.closeButton = this.dialogElement.querySelector('.modal__close');
    this.cancelButton = this.dialogElement.querySelector('.add-person-modal__cancel');
    this.errorListElement = this.dialogElement.querySelector('.add-person-modal__errors');
    this.parentSearchInput = this.dialogElement.querySelector('#add-person-parent-search');
    this.parentSummary = this.dialogElement.querySelector('.add-person-modal__parent-summary');
    this.parentList = this.dialogElement.querySelector('.add-person-modal__parent-list');
    this.parentHiddenInput = this.dialogElement.querySelector('input[name="parentId"]');
    this.parentOptions = [];
    this.parentRoleInputs = this.dialogElement.querySelectorAll('input[name="parentRole"]');
    this.lastNameInput = this.dialogElement.querySelector('input[name="lastName"]');
    this.firstNameInput = this.dialogElement.querySelector('input[name="firstName"]');
    this.birthDateInput = this.dialogElement.querySelector('input[name="birthDate"]');
    this.birthPlaceInput = this.dialogElement.querySelector('input[name="birthPlace"]');
    this.genderSelect = this.dialogElement.querySelector('select[name="gender"]');

    this.closeButton?.addEventListener('click', () => this.close());
    this.cancelButton?.addEventListener('click', () => this.close());
    this.dialogElement.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });

    this.parentSearchInput?.addEventListener('input', () => {
      const query = this.parentSearchInput.value;
      const selectedId = this.parentHiddenInput?.value ?? '';
      const selectedOption = this.parentOptions.find((option) => option.id === selectedId);
      if (selectedOption && query.trim() !== selectedOption.label) {
        if (this.parentHiddenInput) {
          this.parentHiddenInput.value = '';
        }
      }
      this.#renderParentResults(query, this.parentHiddenInput?.value ?? '');
    });

    this.parentSearchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const [firstOption] = this.#getParentOptionButtons();
        firstOption?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const options = this.#getParentOptionButtons();
        if (options.length > 0) {
          options[options.length - 1].focus();
        }
      }
    });

    this.parentList?.addEventListener('keydown', (event) => this.#handleParentListKeydown(event));

    this.formElement?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#handleSubmit();
    });
  }

  mount(container) {
    if (!container) {
      throw new Error('AddPersonModal requires a valid container');
    }
    container.appendChild(this.dialogElement);
  }

  open({ parentId = '', parentRole = null } = {}) {
    if (!this.formElement) {
      return;
    }
    this.formElement.reset();
    this.#renderErrors([]);
    if (this.parentSearchInput) {
      this.parentSearchInput.value = '';
    }
    if (this.parentHiddenInput) {
      this.parentHiddenInput.value = '';
    }
    this.#populateParentOptions(parentId);
    this.#setParentRole(parentRole);
    if (parentId) {
      this.#selectParent(parentId, { updateSearchValue: true });
      this.#focusParentOption(parentId);
    }
    if (this.lastNameInput) {
      this.lastNameInput.value = '';
    }
    if (this.firstNameInput) {
      this.firstNameInput.value = '';
    }
    if (this.birthDateInput) {
      this.birthDateInput.value = '';
    }
    if (this.birthPlaceInput) {
      this.birthPlaceInput.value = '';
    }
    if (this.genderSelect) {
      this.genderSelect.value = '';
    }
    if (!this.dialogElement.open) {
      this.dialogElement.showModal();
    }
    window.requestAnimationFrame(() => {
      this.firstNameInput?.focus();
    });
  }

  close() {
    if (this.dialogElement.open) {
      this.dialogElement.close();
    }
  }

  #setParentRole(preferredRole) {
    const normalizedRole = preferredRole === 'mother' ? 'mother' : preferredRole === 'father' ? 'father' : null;
    let targetRole = normalizedRole;
    if (!targetRole && this.parentRoleInputs) {
      const [firstOption] = Array.from(this.parentRoleInputs);
      targetRole = firstOption?.value ?? 'father';
    }
    this.parentRoleInputs?.forEach((input) => {
      input.checked = input.value === targetRole;
    });
  }

  #populateParentOptions(selectedId = '') {
    if (!this.parentList) {
      return;
    }
    const individuals = typeof this.getIndividuals === 'function' ? this.getIndividuals() ?? [] : [];
    const sorted = [...individuals]
      .filter((person) => person?.id)
      .map((person) => {
        const label = formatPersonDisplayName(person) || person.name || person.id;
        return {
          id: person.id,
          label,
          searchLabel: this.#normalizeSearchValue(label)
        };
      })
      .sort((a, b) => COLLATOR.compare(a.label, b.label));
    this.parentOptions = sorted;
    this.#renderParentResults(this.parentSearchInput?.value ?? '', selectedId);
  }

  async #handleSubmit() {
    if (!this.formElement) {
      return;
    }
    const formData = new FormData(this.formElement);
    const cleanedValues = {
      firstName: sanitizeName(formData.get('firstName')),
      lastName: sanitizeName(formData.get('lastName')),
      gender: sanitizeText(formData.get('gender')).toUpperCase(),
      birthDate: sanitizeDate(formData.get('birthDate')),
      birthPlace: sanitizeText(formData.get('birthPlace')),
      parentId: sanitizeText(formData.get('parentId')),
      parentRole: sanitizeText(formData.get('parentRole')).toLowerCase() === 'mother' ? 'mother' : 'father'
    };

    if (this.firstNameInput) {
      this.firstNameInput.value = cleanedValues.firstName;
    }
    if (this.lastNameInput) {
      this.lastNameInput.value = cleanedValues.lastName;
    }
    if (this.genderSelect) {
      this.genderSelect.value = cleanedValues.gender;
    }
    if (this.birthDateInput) {
      this.birthDateInput.value = cleanedValues.birthDate;
    }
    if (this.birthPlaceInput) {
      this.birthPlaceInput.value = cleanedValues.birthPlace;
    }
    if (this.parentHiddenInput) {
      this.parentHiddenInput.value = cleanedValues.parentId;
    }
    this.#selectParent(cleanedValues.parentId);

    const errors = [];
    if (!cleanedValues.firstName) {
      errors.push('Le prénom est requis.');
    }
    if (!cleanedValues.lastName) {
      errors.push('Le nom est requis.');
    }
    if (!cleanedValues.parentId) {
      errors.push('Sélectionnez un parent existant.');
    }
    if (cleanedValues.gender && !['M', 'F'].includes(cleanedValues.gender)) {
      errors.push("Le genre doit être 'M' pour masculin ou 'F' pour féminin.");
    }

    if (errors.length > 0) {
      this.#renderErrors(errors);
      return;
    }

    this.#renderErrors([]);

    try {
      const result = await Promise.resolve(this.onSubmit?.(cleanedValues));
      if (result && result.success) {
        this.formElement.reset();
        this.close();
        return;
      }
      if (result && result.error) {
        this.#renderErrors([result.error]);
        return;
      }
      this.close();
    } catch (error) {
      this.#renderErrors(['Une erreur est survenue lors de la création de la personne.']);
      console.error(error);
    }
  }

  #renderErrors(messages) {
    if (!this.errorListElement) {
      return;
    }
    this.errorListElement.innerHTML = '';
    messages.forEach((message) => {
      const item = document.createElement('li');
      item.className = 'add-person-modal__error';
      item.textContent = message;
      this.errorListElement.appendChild(item);
    });
    this.errorListElement.hidden = messages.length === 0;
  }

  #normalizeSearchValue(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(DIACRITIC_PATTERN, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  #renderParentResults(query = '', preferredId = this.parentHiddenInput?.value ?? '') {
    if (!this.parentList) {
      return;
    }
    const rawQuery = typeof query === 'string' ? query : '';
    const normalizedQuery = this.#normalizeSearchValue(rawQuery);
    const filtered = normalizedQuery
      ? this.parentOptions.filter((option) => option.searchLabel.includes(normalizedQuery))
      : [...this.parentOptions];

    this.parentList.innerHTML = '';
    this.parentList.scrollTop = 0;

    if (this.parentSearchInput) {
      this.parentSearchInput.setAttribute('aria-expanded', filtered.length > 0 ? 'true' : 'false');
    }

    const trimmedQuery = rawQuery.trim().replace(/\s+/g, ' ');
    this.#updateParentSummary(filtered.length, trimmedQuery);

    if (filtered.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'add-person-modal__parent-empty';
      emptyItem.setAttribute('role', 'none');
      emptyItem.textContent = trimmedQuery
        ? 'Aucun parent ne correspond à votre recherche actuelle.'
        : 'Aucun parent n’est disponible pour le moment.';
      this.parentList.appendChild(emptyItem);
      this.#refreshParentOptionSelection('');
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((option) => {
      const item = document.createElement('li');
      item.className = 'add-person-modal__parent-item';
      item.setAttribute('role', 'none');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'add-person-modal__parent-option';
      button.textContent = option.label;
      button.setAttribute('role', 'option');
      button.dataset.value = option.id;
      button.addEventListener('click', () => {
        this.#selectParent(option.id);
      });
      item.appendChild(button);
      fragment.appendChild(item);
    });
    this.parentList.appendChild(fragment);
    this.#refreshParentOptionSelection(preferredId);
  }

  #updateParentSummary(count, query) {
    if (!this.parentSummary) {
      return;
    }
    const displayQuery = query;
    if (count === 0) {
      this.parentSummary.textContent = displayQuery
        ? `Aucun parent ne correspond à « ${displayQuery} ». Modifiez les termes de recherche.`
        : 'Aucun parent n’est disponible pour le moment.';
      return;
    }
    const plural = count > 1 ? 's' : '';
    const base = `${count} parent${plural} disponible${plural}`;
    if (displayQuery) {
      this.parentSummary.textContent = `${base} pour « ${displayQuery} ». Utilisez les flèches du clavier pour parcourir les résultats.`;
    } else {
      this.parentSummary.textContent = `${base}. Utilisez les flèches du clavier pour parcourir la liste ou tapez pour filtrer.`;
    }
  }

  #refreshParentOptionSelection(selectedId) {
    const buttons = this.#getParentOptionButtons();
    buttons.forEach((button) => {
      const isSelected = Boolean(selectedId) && button.dataset.value === selectedId;
      button.classList.toggle('add-person-modal__parent-option--selected', isSelected);
      button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
  }

  #selectParent(parentId, { updateSearchValue = false } = {}) {
    if (!this.parentHiddenInput) {
      return;
    }
    const option = this.parentOptions.find((entry) => entry.id === parentId);
    if (!option) {
      this.parentHiddenInput.value = '';
      if (updateSearchValue && this.parentSearchInput) {
        this.parentSearchInput.value = '';
      }
      this.#refreshParentOptionSelection('');
      return;
    }
    this.parentHiddenInput.value = option.id;
    if (updateSearchValue && this.parentSearchInput) {
      this.parentSearchInput.value = option.label;
    }
    this.#refreshParentOptionSelection(option.id);
  }

  #focusParentOption(parentId) {
    const buttons = this.#getParentOptionButtons();
    const target = buttons.find((button) => button.dataset.value === parentId);
    target?.focus();
  }

  #getParentOptionButtons() {
    if (!this.parentList) {
      return [];
    }
    return Array.from(this.parentList.querySelectorAll('.add-person-modal__parent-option'));
  }

  #handleParentListKeydown(event) {
    if (event.target?.getAttribute('role') !== 'option') {
      return;
    }
    const buttons = this.#getParentOptionButtons();
    if (buttons.length === 0) {
      return;
    }
    const currentIndex = buttons.indexOf(event.target);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : buttons.length - 1;
      buttons[nextIndex]?.focus();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      buttons[nextIndex]?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      buttons[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      buttons[buttons.length - 1]?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.target.click();
    }
  }

  #createDialog() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal add-person-modal';
    dialog.innerHTML = `
      <article class="modal__content">
        <button type="button" class="modal__close" aria-label="Fermer">&times;</button>
        <header class="modal__header">
          <h2 class="modal__title">Ajouter une personne</h2>
        </header>
        <form class="modal__body add-person-modal__form">
          <div class="add-person-modal__row">
            <div class="add-person-modal__field">
              <label class="add-person-modal__label" for="add-person-first-name">Prénom</label>
              <input id="add-person-first-name" class="add-person-modal__input" type="text" name="firstName" autocomplete="given-name" required />
            </div>
            <div class="add-person-modal__field">
              <label class="add-person-modal__label" for="add-person-last-name">Nom</label>
              <input id="add-person-last-name" class="add-person-modal__input" type="text" name="lastName" autocomplete="family-name" required />
            </div>
          </div>
          <div class="add-person-modal__row add-person-modal__row--split">
            <div class="add-person-modal__field">
              <label class="add-person-modal__label" for="add-person-gender">Genre</label>
              <select id="add-person-gender" class="add-person-modal__input" name="gender">
                <option value="">Non précisé</option>
                <option value="F">Féminin</option>
                <option value="M">Masculin</option>
              </select>
            </div>
            <div class="add-person-modal__field">
              <label class="add-person-modal__label" for="add-person-birth-date">Date de naissance</label>
              <input id="add-person-birth-date" class="add-person-modal__input" type="date" name="birthDate" />
            </div>
          </div>
          <div class="add-person-modal__field">
            <label class="add-person-modal__label" for="add-person-birth-place">Lieu de naissance</label>
            <input id="add-person-birth-place" class="add-person-modal__input" type="text" name="birthPlace" placeholder="Ex. Bournonville (62)" />
          </div>
          <fieldset class="add-person-modal__fieldset">
            <legend class="add-person-modal__legend">Lien de parenté</legend>
            <div class="add-person-modal__field add-person-modal__field--search">
              <label class="add-person-modal__label" for="add-person-parent-search">Rechercher un parent</label>
              <input
                id="add-person-parent-search"
                class="add-person-modal__input add-person-modal__parent-search"
                type="search"
                autocomplete="off"
                placeholder="Ex. Herbaut, Jeanne…"
                aria-describedby="add-person-parent-summary"
                aria-controls="add-person-parent-results"
                aria-autocomplete="list"
                aria-expanded="false"
              />
            </div>
            <div class="add-person-modal__field add-person-modal__field--results">
              <p id="add-person-parent-summary" class="add-person-modal__parent-summary" aria-live="polite">
                Tapez pour filtrer les parents existants, puis choisissez un résultat dans la liste.
              </p>
              <ul
                id="add-person-parent-results"
                class="add-person-modal__parent-list"
                role="listbox"
                aria-label="Parents disponibles"
              ></ul>
            </div>
            <input type="hidden" name="parentId" />
            <div class="add-person-modal__choice-group" role="radiogroup" aria-label="Type de parent">
              <label class="add-person-modal__choice">
                <input type="radio" name="parentRole" value="father" checked />
                <span>Père</span>
              </label>
              <label class="add-person-modal__choice">
                <input type="radio" name="parentRole" value="mother" />
                <span>Mère</span>
              </label>
            </div>
          </fieldset>
          <ul class="add-person-modal__errors" role="alert" aria-live="assertive" hidden></ul>
          <footer class="add-person-modal__actions">
            <button type="submit" class="add-person-modal__submit">Ajouter</button>
            <button type="button" class="add-person-modal__cancel">Annuler</button>
          </footer>
        </form>
      </article>
    `;
    return dialog;
  }
}
