/** ADNCO student helpers only — main duty personnel uses `name` field unchanged. */

export const ADNCO_SECTIONS = ['1', '2', '3', 'MAT'];

/** Duty pool for roster generation: sections 1–3 → Academic, MAT → MAT. */
export function sectionToDutyType(section) {
  return section === 'MAT' ? 'MAT' : 'Academic';
}

export function parseAdncoSection(val) {
  const raw = String(val ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === 'MAT') return 'MAT';
  if (raw === '1' || raw === '2' || raw === '3') return raw;
  if (upper === 'ACADEMIC') return '1';
  return null;
}

export function getStudentDutyType(student) {
  if (student?.section) return sectionToDutyType(student.section);
  if (student?.studentType === 'MAT' || student?.studentType === 'Academic') {
    return student.studentType;
  }
  return null;
}

export function formatAdncoSectionLabel(section) {
  if (section === 'MAT') return 'MAT';
  if (section === '1' || section === '2' || section === '3') return `Sec ${section}`;
  return section ?? '';
}

export function parseDriversLicense(val) {
  const v = String(val ?? '').trim().toLowerCase();
  if (!v) return false;
  return v === 'y' || v === 'yes' || v === '1' || v === 'true';
}

export function normalizeStudent(student) {
  const s = { ...student };
  s.phoneNumber = s.phoneNumber ?? '';
  if (!String(s.adncoNonAvailabilityInput ?? '').trim()) {
    const legacy = s.nonAvailabilityInput ?? s.nonAvailability ?? '';
    if (String(legacy).trim()) s.adncoNonAvailabilityInput = String(legacy).trim();
  }
  s.adncoNonAvailabilityInput = s.adncoNonAvailabilityInput ?? '';
  s.driversLicense = s.driversLicense === true || parseDriversLicense(s.driversLicense);

  const fromSection = parseAdncoSection(s.section);
  const fromType = parseAdncoSection(s.studentType);
  s.section = fromSection ?? fromType ?? (s.studentType === 'MAT' ? 'MAT' : s.studentType === 'Academic' ? '1' : '1');
  s.studentType = sectionToDutyType(s.section);

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