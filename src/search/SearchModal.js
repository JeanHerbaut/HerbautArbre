import { formatPersonDisplayName } from '../utils/person.js';

const TRANSITION_DURATION = 200;

function createResultItem(person, onSelect) {
  const item = document.createElement('li');
  item.className = 'search-modal__item';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-modal__result';
  button.textContent = formatPersonDisplayName(person) || person.name || person.id;
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
          <ul class="search-modal__list"></ul>
        </div>
      </div>
    `;
    return root;
  }

  #populate(results) {
    this.list.innerHTML = '';
    if (results.length === 0) {
      this.summary.textContent = 'Aucun individu ne correspond aux critères renseignés.';
      const emptyItem = document.createElement('li');
      emptyItem.className = 'search-modal__empty';
      emptyItem.textContent = 'Essayez d’élargir ou d’alléger les critères de recherche.';
      this.list.appendChild(emptyItem);
      return;
    }

    this.summary.textContent = `${results.length} résultat${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}.`;
    const fragment = document.createDocumentFragment();
    results.forEach((person) => {
      const item = createResultItem(person, (selected) => {
        this.onSelect?.(selected);
        this.close();
      });
      fragment.appendChild(item);
    });
    this.list.appendChild(fragment);
  }
}
