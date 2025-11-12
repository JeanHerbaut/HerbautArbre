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

function sanitizeText(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function sanitizeRelationIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const unique = new Set();
  const sanitized = [];
  values.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    sanitized.push(trimmed);
  });
  return sanitized;
}

function normalizeIndividual(person) {
  const { firstName, lastName, displayName } = splitName(person?.name ?? '');
  const fallbackName = person?.name?.trim() ?? '';
  const birth = person?.birth ?? {};
  const death = person?.death ?? {};
  return {
    id: person?.id ?? crypto.randomUUID(),
    gender: person?.gender === 'F' ? 'F' : person?.gender === 'M' ? 'M' : 'U',
    firstName,
    lastName,
    displayName: displayName || fallbackName,
    birthDate: sanitizeText(birth?.date),
    birthPlace: sanitizeText(birth?.place),
    deathDate: sanitizeText(death?.date),
    deathPlace: sanitizeText(death?.place),
    generation: sanitizeText(person?.generation),
    sosa: sanitizeText(person?.sosa),
    notes: sanitizeNotes(person?.annotations),
    parents: sanitizeRelationIds(person?.parents),
    spouses: sanitizeRelationIds(person?.spouses),
    children: sanitizeRelationIds(person?.children)
  };
}

function toChartDatum(record) {
  return {
    id: record.id,
    data: {
      id: record.id,
      gender: record.gender,
      firstName: record.firstName,
      lastName: record.lastName,
      displayName: record.displayName || [record.firstName, record.lastName].filter(Boolean).join(' '),
      birthDate: record.birthDate,
      birthPlace: record.birthPlace,
      deathDate: record.deathDate,
      deathPlace: record.deathPlace,
      generation: record.generation,
      sosa: record.sosa,
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
  const normalized = individuals.map((person) => normalizeIndividual(person));
  const validIds = new Set(normalized.map((record) => record.id));
  normalized.forEach((record) => {
    record.parents = record.parents.filter((id) => validIds.has(id));
    record.spouses = record.spouses.filter((id) => validIds.has(id));
    record.children = record.children.filter((id) => validIds.has(id));
  });
  return normalized;
}

export function buildChartData(records = []) {
  return records.map((record) => toChartDatum(record));
}

export function buildDisplayName(record) {
  if (!record) {
    return '';
  }
  const preferred = record.displayName?.trim();
  if (preferred) {
    return preferred;
  }
  const parts = [record.firstName, record.lastName].filter((part) => part && part.length > 0);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return record.id;
}

export function formatLifeEvents(record) {
  const birthParts = [record?.birthDate, record?.birthPlace].filter((value) => value && value.length > 0);
  const deathParts = [record?.deathDate, record?.deathPlace].filter((value) => value && value.length > 0);
  const birth = birthParts.length > 0 ? `Naissance : ${birthParts.join(' — ')}` : '';
  const death = deathParts.length > 0 ? `Décès : ${deathParts.join(' — ')}` : '';
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
    birthDate: sanitizeText(values.birthDate),
    birthPlace: '',
    deathDate: sanitizeText(values.deathDate),
    deathPlace: '',
    generation: '',
    sosa: '',
    notes,
    parents: parentId ? [parentId] : [],
    spouses: [],
    children: []
  };
}
