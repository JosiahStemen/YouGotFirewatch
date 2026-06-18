import { generateId } from './dateUtils.js';

export function createSamplePersonnel() {
  return [
    { id: generateId(), rank: 'SSgt', name: 'Martinez, J.', points: 12, lastDutyDate: '2026-05-28', section: 'Admin', nonAvailability: [] },
    { id: generateId(), rank: 'Sgt', name: 'Thompson, R.', points: 18, lastDutyDate: '2026-05-25', section: 'Operations', nonAvailability: [{ start: '2026-06-01', end: '2026-06-05', reason: '96-hour liberty' }] },
    { id: generateId(), rank: 'Cpl', name: 'Williams, K.', points: 8, lastDutyDate: '2026-05-30', section: 'Supply', nonAvailability: [] },
    { id: generateId(), rank: 'Cpl', name: 'Davis, M.', points: 15, lastDutyDate: '2026-05-22', section: 'Communications', nonAvailability: [{ start: '2026-06-20', end: '2026-06-25', reason: 'TDY' }] },
    { id: generateId(), rank: 'LCpl', name: 'Johnson, A.', points: 6, lastDutyDate: '2026-05-31', section: 'Motor T', nonAvailability: [] },
    { id: generateId(), rank: 'LCpl', name: 'Brown, T.', points: 10, lastDutyDate: '2026-05-27', section: 'Admin', nonAvailability: [] },
    { id: generateId(), rank: 'PFC', name: 'Garcia, L.', points: 4, lastDutyDate: '2026-06-01', section: 'Operations', nonAvailability: [] },
    { id: generateId(), rank: 'PFC', name: 'Anderson, S.', points: 9, lastDutyDate: '2026-05-29', section: 'Supply', nonAvailability: [{ start: '2026-06-10', end: '2026-06-14', reason: 'Leave' }] },
    { id: generateId(), rank: 'PFC', name: 'Lee, D.', points: 22, lastDutyDate: '2026-05-20', section: 'Communications', nonAvailability: [], notes: 'High points — prime supernumerary candidate' },
    { id: generateId(), rank: 'Pvt', name: 'Taylor, N.', points: 3, lastDutyDate: '2026-06-02', section: 'Motor T', nonAvailability: [] },
  ];
}