export function extractBirthDate(person) {
  if (!person || !person.birth) {
    return '';
  }
  const rawDate = typeof person.birth.date === 'string' ? person.birth.date.trim() : '';
  if (rawDate) {
    const [datePart] = rawDate.split(' à ');
    return datePart.trim();
  }
  const rawYear = person.birth.year;
  if (rawYear != null) {
    return String(rawYear).trim();
  }
  return '';
}

export function formatPersonDisplayName(person) {
  const baseName = person?.name ?? person?.id ?? '';
  if (!baseName) {
    return '';
  }
  const birthDate = extractBirthDate(person);
  if (!birthDate) {
    return baseName;
  }
  return `${baseName} (${birthDate})`;
}
