import { formatPersonDisplayName } from '../utils/person.js';

const NAME_PATTERN = /[^\p{L}\p{M}\s'\-]/gu;
const COLLATOR = new Intl.Collator('fr', { sensitivity: 'base', ignorePunctuation: true });

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
    this.parentSelect = this.dialogElement.querySelector('select[name="parentId"]');
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
    this.#populateParentOptions(parentId);
    this.#setParentRole(parentRole);
    if (parentId && this.parentSelect) {
      this.parentSelect.value = parentId;
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
    if (!this.parentSelect) {
      return;
    }
    const individuals = typeof this.getIndividuals === 'function' ? this.getIndividuals() ?? [] : [];
    const sorted = [...individuals].sort((a, b) => {
      const labelA = formatPersonDisplayName(a) || a.name || a.id;
      const labelB = formatPersonDisplayName(b) || b.name || b.id;
      return COLLATOR.compare(labelA, labelB);
    });
    this.parentSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Sélectionnez un parent existant';
    this.parentSelect.appendChild(placeholder);
    sorted.forEach((person) => {
      if (!person?.id) {
        return;
      }
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = formatPersonDisplayName(person) || person.name || person.id;
      this.parentSelect.appendChild(option);
    });
    if (selectedId) {
      this.parentSelect.value = selectedId;
    }
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
    if (this.parentSelect) {
      this.parentSelect.value = cleanedValues.parentId;
    }

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
            <div class="add-person-modal__field">
              <label class="add-person-modal__label" for="add-person-parent">Parent</label>
              <select id="add-person-parent" class="add-person-modal__input" name="parentId" required></select>
            </div>
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
