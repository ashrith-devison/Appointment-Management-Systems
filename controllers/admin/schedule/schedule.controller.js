import User from '../../../models/users.model.js';
import DoctorSchedule from '../../../models/DoctorSchedule.js';
import ApiError from '../../../utils/ApiError.util.js';
import redisCache from '../../../utils/redis.js';

/**
 * Get doctor's schedule (admin only)
 * @param {string} doctorId - Doctor ID
 * @returns {Object} - Doctor schedules
 */
export const getDoctorSchedule = async (doctorId) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const schedules = await DoctorSchedule.find({
    doctorId,
    isActive: true
  }).sort({ dayOfWeek: 1 });

  return {
    schedules
  };
};

/**
 * Create schedule for doctor (admin only)
 * @param {string} doctorId - Doctor ID
 * @param {Object} scheduleData - Schedule data
 * @returns {Object} - Created schedule
 */
export const createDoctorScheduleByAdmin = async (doctorId, scheduleData) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const { dayOfWeek, startTime, endTime, slotDuration, breakTimes } = scheduleData;

  // Check if schedule already exists for this day
  const existingSchedule = await DoctorSchedule.findOne({
    doctorId,
    dayOfWeek
  });

  if (existingSchedule) {
    throw ApiError.conflict('Schedule already exists for this day');
  }

  const schedule = new DoctorSchedule({
    doctorId,
    dayOfWeek,
    startTime,
    endTime,
    slotDuration: slotDuration || 30,
    breakTimes: breakTimes || []
  });

  await schedule.save();

  // Clear cache
  await redisCache.del(`doctor_schedule_${doctorId}`);

  return {
    schedule
  };
};

/**
 * Update doctor's schedule (admin only)
 * @param {string} doctorId - Doctor ID
 * @param {string} scheduleId - Schedule ID
 * @param {Object} updates - Schedule updates
 * @returns {Object} - Updated schedule
 */
export const updateDoctorScheduleByAdmin = async (doctorId, scheduleId, updates) => {
  const schedule = await DoctorSchedule.findOne({
    _id: scheduleId,
    doctorId
  });

  if (!schedule) {
    throw ApiError.notFound('Schedule not found');
  }

  const allowedFields = ['startTime', 'endTime', 'slotDuration', 'breakTimes', 'isActive'];
  const filteredUpdates = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  Object.assign(schedule, filteredUpdates);
  await schedule.save();

  // Clear cache
  await redisCache.del(`doctor_schedule_${doctorId}`);

  return {
    schedule
  };
};