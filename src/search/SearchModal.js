import { formatPersonDisplayName } from '../utils/person.js';

const TRANSITION_DURATION = 200;

function getSortableLabel(person) {
  const displayName = formatPersonDisplayName(person) || person?.name || person?.id || '';
  return displayName
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    const labelA = getSortableLabel(a);
    const labelB = getSortableLabel(b);
    if (labelA && labelB) {
      return labelA.localeCompare(labelB, 'fr', { sensitivity: 'base' });
    }
    if (labelA) {
      return -1;
    }
    if (labelB) {
      return 1;
    }
    return 0;
  });
}

function createResultItem(person, onSelect) {
  const item = document.createElement('li');
  item.className = 'search-modal__item';
  item.setAttribute('role', 'none');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-modal__result';
  const label = formatPersonDisplayName(person) || person.name || person.id;
  button.textContent = label;
  if (person?.id) {
    button.dataset.personId = person.id;
  }
  if (label) {
    button.setAttribute('aria-label', label);
  }
  button.addEventListener('click', () => onSelect(person));
  item.appendChild(button);
  return item;
}

export class SearchModal {
  constructor({ onSelect } = {}) {
    this.onSelect = onSelect;
    this.previousActiveElement = null;
    this.root = this.#createStructure();
    this.dialog = this.root.querySelector('.search-modal__dialog');
    this.list = this.root.querySelector('.search-modal__list');
    this.body = this.root.querySelector('.search-modal__body');
    this.summary = this.root.querySelector('.search-modal__summary');
    this.closeButton = this.root.querySelector('.search-modal__close');

    this.closeButton.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) {
        this.close();
      }
    });

    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
  }

  mount(container = document.body) {
    container.appendChild(this.root);
  }

  isOpen() {
    return this.root.classList.contains('search-modal--open');
  }

  open(results = []) {
    this.previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.#populate(results);
    this.root.removeAttribute('hidden');
    requestAnimationFrame(() => {
      this.root.classList.add('search-modal--open');
      this.dialog.focus();
    });
  }

  close() {
    if (!this.isOpen()) {
      return;
    }
    this.root.classList.remove('search-modal--open');
    window.setTimeout(() => {
      this.root.setAttribute('hidden', 'true');
      if (this.previousActiveElement) {
        this.previousActiveElement.focus({ preventScroll: true });
      }
    }, TRANSITION_DURATION);
  }

  #createStructure() {
    const root = document.createElement('div');
    root.className = 'search-modal';
    root.setAttribute('role', 'presentation');
    root.setAttribute('hidden', 'true');
    root.innerHTML = `
      <div class="search-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="search-modal-title" tabindex="-1">
        <header class="search-modal__header">
          <h2 id="search-modal-title" class="search-modal__title">Résultats de recherche</h2>
          <button type="button" class="search-modal__close" aria-label="Fermer la fenêtre de résultats">Fermer</button>
        </header>
        <div class="search-modal__body">
          <p class="search-modal__summary" aria-live="polite"></p>
          <ul class="search-modal__list" role="listbox" aria-label="Liste des individus correspondants"></ul>
        </div>
      </div>
    `;
    return root;
  }

  #populate(results) {
    if (this.body) {
      this.body.scrollTop = 0;
    }
    this.list.innerHTML = '';
    const sortedResults = sortResults(results);
    if (sortedResults.length === 0) {
      this.summary.textContent = 'Aucun individu ne correspond aux critères renseignés.';
      const emptyItem = document.createElement('li');
      emptyItem.className = 'search-modal__empty';
      emptyItem.textContent = 'Essayez d’élargir ou d’alléger les critères de recherche.';
      this.list.appendChild(emptyItem);
      return;
    }

    const baseMessage = `${sortedResults.length} résultat${sortedResults.length > 1 ? 's' : ''} trouvé${sortedResults.length > 1 ? 's' : ''}.`;
    this.summary.textContent =
      sortedResults.length > 1
        ? `${baseMessage} Faites défiler la liste pour découvrir tous les individus.`
        : baseMessage;
    const fragment = document.createDocumentFragment();
    sortedResults.forEach((person) => {
      const item = createResultItem(person, (selected) => {
        this.onSelect?.(selected);
        this.close();
      });
      fragment.appendChild(item);
    });
    this.list.appendChild(fragment);
  }
}
