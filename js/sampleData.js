import { generateId } from './dateUtils.js';

export function createSamplePersonnel() {
  return [
    { id: generateId(), rank: 'SSgt', name: 'Martinez, J.', points: 12, lastDutyDate: '2026-05-28', section: 'Admin', nonAvailabilityInput: '', nonAvailability: [] },
    { id: generateId(), rank: 'Sgt', name: 'Thompson, R.', points: 18, lastDutyDate: '2026-05-25', section: 'Operations', nonAvailabilityInput: '1-5', nonAvailability: [] },
    { id: generateId(), rank: 'Cpl', name: 'Williams, K.', points: 8, lastDutyDate: '2026-05-30', section: 'Supply', nonAvailabilityInput: '', nonAvailability: [] },
    { id: generateId(), rank: 'Cpl', name: 'Davis, M.', points: 15, lastDutyDate: '2026-05-22', section: 'Communications', nonAvailabilityInput: '20-25', nonAvailability: [] },
    { id: generateId(), rank: 'LCpl', name: 'Johnson, A.', points: 6, lastDutyDate: '2026-05-31', section: 'Motor T', nonAvailabilityInput: '', nonAvailability: [] },
    { id: generateId(), rank: 'LCpl', name: 'Brown, T.', points: 10, lastDutyDate: '2026-05-27', section: 'Admin', nonAvailabilityInput: '', nonAvailability: [] },
    { id: generateId(), rank: 'PFC', name: 'Garcia, L.', points: 4, lastDutyDate: '2026-06-01', section: 'Operations', nonAvailabilityInput: '', nonAvailability: [] },
    { id: generateId(), rank: 'PFC', name: 'Anderson, S.', points: 9, lastDutyDate: '2026-05-29', section: 'Supply', nonAvailabilityInput: '10-14', nonAvailability: [] },
    { id: generateId(), rank: 'PFC', name: 'Lee, D.', points: 22, lastDutyDate: '2026-05-20', section: 'Communications', nonAvailabilityInput: '', nonAvailability: [], notes: 'High points — prime supernumerary candidate' },
    { id: generateId(), rank: 'Pvt', name: 'Taylor, N.', points: 3, lastDutyDate: '2026-06-02', section: 'Motor T', nonAvailabilityInput: '', nonAvailability: [] },
  ];
}

export function createSampleAdncoStudents() {
  return [
    { id: generateId(), rank: 'LCpl', lastName: 'Garcia', firstName: 'Luis', phoneNumber: '831-555-0101', studentType: 'MAT', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'Cpl', lastName: 'Anderson', firstName: 'Sarah', phoneNumber: '831-555-0102', studentType: 'Academic', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '10-12' },
    { id: generateId(), rank: 'PFC', lastName: 'Miller', firstName: 'James', phoneNumber: '831-555-0103', studentType: 'MAT', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'PFC', lastName: 'Chen', firstName: 'Amy', phoneNumber: '831-555-0104', studentType: 'Academic', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '5, 15-17' },
    { id: generateId(), rank: 'LCpl', lastName: 'Rivera', firstName: 'Marcus', phoneNumber: '831-555-0105', studentType: 'MAT', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'Cpl', lastName: 'Thompson', firstName: 'Ryan', phoneNumber: '831-555-0106', studentType: 'MAT', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'PFC', lastName: 'Nguyen', firstName: 'Kim', phoneNumber: '831-555-0107', studentType: 'MAT', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'LCpl', lastName: 'Brooks', firstName: 'Tyler', phoneNumber: '831-555-0108', studentType: 'Academic', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'PFC', lastName: 'Patel', firstName: 'Dev', phoneNumber: '831-555-0109', studentType: 'Academic', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
    { id: generateId(), rank: 'Cpl', lastName: 'Santos', firstName: 'Maria', phoneNumber: '831-555-0110', studentType: 'MAT', lastAdncoDutyDate: null, adncoNonAvailabilityInput: '' },
  ];
}