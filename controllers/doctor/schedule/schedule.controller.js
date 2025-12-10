import DoctorSchedule from '../../../models/DoctorSchedule.js';
import AvailabilitySlot from '../../../models/AvailabilitySlot.js';
import ApiError from '../../../utils/ApiError.util.js';
import redisCache from '../../../utils/redis.js';

/**
 * Create doctor schedule
 * @param {Object} doctor - Doctor user object
 * @param {Object} scheduleData - Schedule data
 * @returns {Object} - Created schedule
 */
export const createDoctorSchedule = async (doctor, scheduleData) => {
  const { dayOfWeek, startTime, endTime, slotDuration, breakTimes } = scheduleData;

  // Check if schedule already exists for this day
  const existingSchedule = await DoctorSchedule.findOne({
    doctorId: doctor._id,
    dayOfWeek
  });

  if (existingSchedule) {
    throw ApiError.conflict('Schedule already exists for this day');
  }

  const schedule = new DoctorSchedule({
    doctorId: doctor._id,
    dayOfWeek,
    startTime,
    endTime,
    slotDuration: slotDuration || 30,
    breakTimes: breakTimes || []
  });

  try {
    await schedule.save();
  } catch (error) {
    // Handle duplicate key errors from concurrent requests
    if (error.code === 11000) {
      throw ApiError.conflict('Schedule already exists for this day');
    }
    throw error;
  }

  // Clear cache
  await redisCache.del(`doctor_schedule_${doctor._id}`);

  return {
    schedule
  };
};

/**
 * Get doctor's schedules
 * @param {Object} doctor - Doctor user object
 * @returns {Object} - Doctor schedules
 */
export const getDoctorSchedules = async (doctor) => {
  // Try cache first
  const cacheKey = `doctor_schedules_${doctor._id}`;
  let schedules = await redisCache.get(cacheKey);

  if (!schedules) {
    schedules = await DoctorSchedule.find({
      doctorId: doctor._id,
      isActive: true
    }).sort({ dayOfWeek: 1 });

    // Cache for 1 hour
    await redisCache.set(cacheKey, schedules, 3600);
  }

  return {
    schedules
  };
};

/**
 * Update doctor schedule
 * @param {Object} doctor - Doctor user object
 * @param {string} scheduleId - Schedule ID
 * @param {Object} updates - Schedule updates
 * @returns {Object} - Updated schedule
 */
export const updateDoctorSchedule = async (doctor, scheduleId, updates) => {
  const schedule = await DoctorSchedule.findOne({
    _id: scheduleId,
    doctorId: doctor._id
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
  await redisCache.del(`doctor_schedules_${doctor._id}`);
  await redisCache.del(`doctor_schedule_${doctor._id}`);

  return {
    schedule
  };
};

/**
 * Delete doctor schedule
 * @param {Object} doctor - Doctor user object
 * @param {string} scheduleId - Schedule ID
 * @returns {Object} - Success message
 */
export const deleteDoctorSchedule = async (doctor, scheduleId) => {
  const schedule = await DoctorSchedule.findOne({
    _id: scheduleId,
    doctorId: doctor._id
  });

  if (!schedule) {
    throw ApiError.notFound('Schedule not found');
  }

  // Check if there are future slots for this schedule
  const futureDate = new Date();
  futureDate.setHours(0, 0, 0, 0);

  const futureSlots = await AvailabilitySlot.countDocuments({
    scheduleId,
    date: { $gte: futureDate },
    status: { $in: ['available', 'booked'] }
  });

  if (futureSlots > 0) {
    throw ApiError.badRequest('Cannot delete schedule with future appointments. Cancel all appointments first.');
  }

  await DoctorSchedule.findByIdAndDelete(scheduleId);

  // Clear cache
  await redisCache.del(`doctor_schedules_${doctor._id}`);
  await redisCache.del(`doctor_schedule_${doctor._id}`);

  return {
    message: 'Schedule deleted successfully'
  };
};