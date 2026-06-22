/** ADNCO student helpers only — main duty personnel uses `name` field unchanged. */

export function parseDriversLicense(val) {
  const v = String(val ?? '').trim().toLowerCase();
  if (!v) return false;
  return v === 'y' || v === 'yes' || v === '1' || v === 'true';
}

export function normalizeStudent(student) {
  const s = { ...student };
  s.phoneNumber = s.phoneNumber ?? '';
  s.adncoNonAvailabilityInput = s.adncoNonAvailabilityInput ?? '';
  s.driversLicense = s.driversLicense === true || parseDriversLicense(s.driversLicense);
  return s;
}

export function normalizeStudentList(students) {
  return (students ?? []).map(normalizeStudent);
}

export function adncoDisplayName(s) {
  return `${s.rank} ${s.lastName}, ${s.firstName}`;
}

export function studentMatchKey(s) {
  return `${s.rank}|${s.lastName}|${s.firstName}`.toLowerCase();
}