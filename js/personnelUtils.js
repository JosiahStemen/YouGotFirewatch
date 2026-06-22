/** Shared personnel name / display helpers */

export function formatPersonName(lastName, firstName) {
  const ln = (lastName ?? '').trim();
  const fn = (firstName ?? '').trim();
  if (!ln && !fn) return '';
  return fn ? `${ln}, ${fn}` : ln;
}

export function parseLegacyName(name) {
  if (!name) return { lastName: '', firstName: '' };
  const parts = String(name).split(',').map((s) => s.trim());
  return { lastName: parts[0] || '', firstName: parts[1] || '' };
}

export function normalizePerson(person) {
  const p = { ...person };
  if (!p.lastName && p.name) {
    const parsed = parseLegacyName(p.name);
    p.lastName = parsed.lastName;
    p.firstName = parsed.firstName;
  }
  if (!p.name && p.lastName) {
    p.name = formatPersonName(p.lastName, p.firstName);
  }
  p.phoneNumber = p.phoneNumber ?? '';
  p.studentType = p.studentType === 'Academic' || p.studentType === 'MAT' ? p.studentType : (p.studentType || undefined);
  p.adncoNonAvailabilityInput = p.adncoNonAvailabilityInput ?? '';
  if (p.adncoPoints == null) p.adncoPoints = p.points ?? 0;
  p.nonAvailability = p.nonAvailability ?? [];
  return p;
}

export function normalizePersonnelList(personnel) {
  return (personnel ?? []).map(normalizePerson);
}

export function displayName(p) {
  if (p.lastName) return formatPersonName(p.lastName, p.firstName);
  return p.name || '';
}

export function adncoDisplayName(p) {
  const ln = p.lastName || parseLegacyName(p.name).lastName;
  const fn = p.firstName || parseLegacyName(p.name).firstName;
  return `${p.rank} ${ln}, ${fn}`;
}

export function getAdncoStudents(personnel) {
  return personnel.filter((p) => p.studentType === 'Academic' || p.studentType === 'MAT');
}