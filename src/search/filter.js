function normalize(value) {
  return value
    ? value
        .toString()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
    : '';
}

function normalizeNameParts(name) {
  const normalized = normalize(name);
  if (!normalized) {
    return { full: '', first: '', last: '' };
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { full: normalized, first: '', last: '' };
  }
  const last = tokens[tokens.length - 1] ?? '';
  const first = tokens.slice(0, -1).join(' ');
  return { full: normalized, first, last };
}

function matchFragment(haystack, needle) {
  if (!needle) {
    return true;
  }
  return haystack.includes(needle);
}

function matchDate(person, dateQuery) {
  if (!dateQuery) {
    return true;
  }
  const dateFields = [person.birth?.date, person.death?.date, person.birth?.year, person.death?.year]
    .filter(Boolean)
    .map((value) => normalize(value));
  return dateFields.some((field) => field.includes(dateQuery));
}

export function filterIndividuals(individuals, criteria = {}) {
  const { lastName = '', firstName = '', date = '' } = criteria;
  const normalizedCriteria = {
    lastName: normalize(lastName),
    firstName: normalize(firstName),
    date: normalize(date)
  };

  return individuals.filter((person) => {
    const { full, first, last } = normalizeNameParts(person.name ?? person.id ?? '');
    const matchesLastName = matchFragment(full, normalizedCriteria.lastName) || matchFragment(last, normalizedCriteria.lastName);
    const matchesFirstName = matchFragment(full, normalizedCriteria.firstName) || matchFragment(first, normalizedCriteria.firstName);
    const matchesDate = matchDate(person, normalizedCriteria.date);
    return matchesLastName && matchesFirstName && matchesDate;
  });
}
