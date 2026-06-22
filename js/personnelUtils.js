/** ADNCO student helpers only — main duty personnel uses `name` field unchanged. */

export function normalizeStudent(student) {
  const s = { ...student };
  s.phoneNumber = s.phoneNumber ?? '';
  s.adncoNonAvailabilityInput = s.adncoNonAvailabilityInput ?? '';
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