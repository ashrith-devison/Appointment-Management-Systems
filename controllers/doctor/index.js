// Re-export all doctor controller functions for backward compatibility
export { getDoctorProfile, updateDoctorProfile } from './profile/profile.controller.js';
export {
  createDoctorSchedule,
  getDoctorSchedules,
  updateDoctorSchedule,
  deleteDoctorSchedule
} from './schedule/schedule.controller.js';
export {
  generateAvailabilitySlots,
  getDoctorSlots,
  updateSlotStatus,
  bulkUpdateSlotStatus
} from './slots/slots.controller.js';