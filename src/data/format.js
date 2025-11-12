const NAME_SEPARATOR_PATTERN = /\s+/u;

function splitName(value = '') {
  const safeValue = typeof value === 'string' ? value.trim() : '';
  if (!safeValue) {
    return { firstName: '', lastName: '', displayName: '' };
  }
  const parts = safeValue.split(NAME_SEPARATOR_PATTERN).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', displayName: parts[0] };
  }
  const firstName = parts.shift() ?? '';
  const lastName = parts.join(' ');
  return { firstName, lastName, displayName: `${firstName} ${lastName}`.trim() };
}

function sanitizeNotes(notes) {
  if (!Array.isArray(notes)) {
    return [];
  }
  return notes
    .map((note) => (typeof note === 'string' ? note.trim() : ''))
    .filter((note) => note.length > 0);
}

function sanitizeDate(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeIndividual(person) {
  const { firstName, lastName, displayName } = splitName(person?.name ?? '');
  const fallbackName = person?.name?.trim() ?? '';
  return {
    id: person?.id ?? crypto.randomUUID(),
    gender: person?.gender === 'F' ? 'F' : 'M',
    firstName,
    lastName,
    displayName: displayName || fallbackName,
    birthDate: sanitizeDate(person?.birth?.date),
    deathDate: sanitizeDate(person?.death?.date),
    notes: sanitizeNotes(person?.annotations),
    parents: Array.isArray(person?.parents) ? [...person.parents] : [],
    spouses: Array.isArray(person?.spouses) ? [...person.spouses] : [],
    children: Array.isArray(person?.children) ? [...person.children] : []
  };
}

function toChartDatum(record) {
  return {
    id: record.id,
    data: {
      gender: record.gender,
      firstName: record.firstName,
      lastName: record.lastName,
      displayName: record.displayName || [record.firstName, record.lastName].filter(Boolean).join(' '),
      birthDate: record.birthDate,
      deathDate: record.deathDate,
      notes: record.notes
    },
    rels: {
      parents: record.parents,
      spouses: record.spouses,
      children: record.children
    }
  };
}

export function normalizeIndividuals(individuals = []) {
  return individuals.map((person) => normalizeIndividual(person));
}

export function buildChartData(records = []) {
  return records.map((record) => toChartDatum(record));
}

export function buildDisplayName(record) {
  if (!record) {
    return '';
  }
  const parts = [record.firstName, record.lastName].filter((part) => part && part.length > 0);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return record.displayName || record.id;
}

export function formatDates(record) {
  const birth = record?.birthDate ? `Né(e) : ${record.birthDate}` : '';
  const death = record?.deathDate ? `Décédé(e) : ${record.deathDate}` : '';
  return [birth, death].filter(Boolean);
}

export function createRecordFromForm(values, parentId) {
  const firstName = values.firstName?.trim() ?? '';
  const lastName = values.lastName?.trim() ?? '';
  const notes = values.notes?.trim() ? [values.notes.trim()] : [];
  return {
    id: `NEW_${Date.now()}`,
    gender: values.gender === 'F' ? 'F' : 'M',
    firstName,
    lastName,
    displayName: [firstName, lastName].filter(Boolean).join(' ') || `${firstName || lastName || 'Nouvelle personne'}`,
    birthDate: sanitizeDate(values.birthDate),
    deathDate: sanitizeDate(values.deathDate),
    notes,
    parents: parentId ? [parentId] : [],
    spouses: [],
    children: []
  };
}
