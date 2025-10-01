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

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = new Map([
  ['janvier', 1],
  ['fevrier', 2],
  ['février', 2],
  ['mars', 3],
  ['avril', 4],
  ['mai', 5],
  ['juin', 6],
  ['juillet', 7],
  ['aout', 8],
  ['août', 8],
  ['septembre', 9],
  ['octobre', 10],
  ['novembre', 11],
  ['decembre', 12],
  ['décembre', 12]
]);
const DAYS_OF_WEEK = new Set([
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche'
]);
const STOP_WORDS = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'd', 'l', 'et', 'a', 'au', 'aux']);
const BIRTH_CACHE = new WeakMap();

function parseFrenchDate(dateText) {
  const normalized = normalize(dateText);
  if (!normalized) {
    return null;
  }
  const [rawDatePart] = normalized.split(' a ');
  const cleaned = rawDatePart.replace(/[^a-z0-9\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let day = null;
  let month = null;
  let year = null;

  tokens.forEach((token) => {
    if (STOP_WORDS.has(token) || DAYS_OF_WEEK.has(token)) {
      return;
    }
    if (MONTHS.has(token)) {
      month = MONTHS.get(token);
      return;
    }
    const numeric = Number.parseInt(token, 10);
    if (Number.isNaN(numeric)) {
      return;
    }
    if (numeric > 999 && token.length === 4) {
      year = numeric;
      return;
    }
    if (numeric >= 1 && numeric <= 31 && day == null) {
      day = numeric;
      return;
    }
    if (numeric > 31 && year == null) {
      year = numeric;
    }
  });

  if (day == null && month == null && year == null) {
    return null;
  }
  return { day, month, year };
}

function extractBirthInfo(person) {
  if (!person) {
    return null;
  }
  if (BIRTH_CACHE.has(person)) {
    return BIRTH_CACHE.get(person);
  }

  const info = { day: null, month: null, year: null };
  const birthDateText = person.birth?.date ?? null;
  const parsed = birthDateText ? parseFrenchDate(birthDateText) : null;
  if (parsed) {
    if (parsed.day != null) {
      info.day = parsed.day;
    }
    if (parsed.month != null) {
      info.month = parsed.month;
    }
    if (parsed.year != null) {
      info.year = parsed.year;
    }
  }

  const birthYearRaw = person.birth?.year ?? null;
  if (birthYearRaw != null) {
    const numericYear = Number.parseInt(birthYearRaw, 10);
    if (!Number.isNaN(numericYear)) {
      info.year = numericYear;
    }
  }

  BIRTH_CACHE.set(person, info);
  return info;
}

function buildBirthQuery(dateValue, useYear) {
  if (!dateValue) {
    return null;
  }
  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  const query = { day, month };
  if (useYear && !Number.isNaN(year)) {
    query.year = year;
  }
  return query;
}

function matchBirthDate(person, birthQuery) {
  if (!birthQuery) {
    return true;
  }
  const info = extractBirthInfo(person);
  if (!info || info.day == null || info.month == null) {
    return false;
  }
  if (info.day !== birthQuery.day || info.month !== birthQuery.month) {
    return false;
  }
  if (birthQuery.year != null) {
    if (info.year == null) {
      return false;
    }
    return info.year === birthQuery.year;
  }
  return true;
}

export function filterIndividuals(individuals, criteria = {}) {
  const { lastName = '', firstName = '', birthDate = '', birthDateUseYear = false } = criteria;
  const normalizedCriteria = {
    lastName: normalize(lastName),
    firstName: normalize(firstName),
    birthQuery: buildBirthQuery(birthDate, birthDateUseYear)
  };

  return individuals.filter((person) => {
    const { full, first, last } = normalizeNameParts(person.name ?? person.id ?? '');
    const matchesLastName = matchFragment(full, normalizedCriteria.lastName) || matchFragment(last, normalizedCriteria.lastName);
    const matchesFirstName = matchFragment(full, normalizedCriteria.firstName) || matchFragment(first, normalizedCriteria.firstName);
    const matchesBirth = matchBirthDate(person, normalizedCriteria.birthQuery);
    return matchesLastName && matchesFirstName && matchesBirth;
  });
}
