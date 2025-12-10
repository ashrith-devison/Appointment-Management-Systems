import DoctorSchedule from '../../../models/DoctorSchedule.js';
import AvailabilitySlot from '../../../models/AvailabilitySlot.js';
import ApiError from '../../../utils/ApiError.util.js';
import redisCache from '../../../utils/redis.js';

/**
 * Generate availability slots for a date range
 * @param {Object} doctor - Doctor user object
 * @param {Object} slotData - Slot generation data
 * @returns {Object} - Generated slots
 */
export const generateAvailabilitySlots = async (doctor, slotData) => {
  const { scheduleId, startDate, endDate, overrideExisting = false } = slotData;

  const schedule = await DoctorSchedule.findOne({
    _id: scheduleId,
    doctorId: doctor._id,
    isActive: true
  });

  if (!schedule) {
    throw ApiError.notFound('Schedule not found');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const slots = [];

  // Validate date range
  if (start > end) {
    throw ApiError.badRequest('Start date cannot be after end date');
  }

  if (end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000) { // 90 days
    throw ApiError.badRequest('Date range cannot exceed 90 days');
  }

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    if (dayName !== schedule.dayOfWeek) continue;

    // Check if slots already exist for this date
    if (!overrideExisting) {
      const existingSlots = await AvailabilitySlot.countDocuments({
        doctorId: doctor._id,
        date,
        scheduleId
      });

      if (existingSlots > 0) continue;
    } else {
      // Delete existing slots
      await AvailabilitySlot.deleteMany({
        doctorId: doctor._id,
        date,
        scheduleId,
        status: 'available'
      });
    }

    // Generate slots for this date
    const daySlots = generateSlotsForDate(schedule, date);
    slots.push(...daySlots);
  }

  if (slots.length > 0) {
    await AvailabilitySlot.insertMany(slots);
  }

  // Clear cache
  await redisCache.del(`doctor_slots_${doctor._id}`);

  return {
    message: `${slots.length} slots generated successfully`,
    slotsCount: slots.length
  };
};

/**
 * Helper function to generate slots for a specific date
 * @param {Object} schedule - Doctor schedule
 * @param {Date} date - Date for slots
 * @returns {Array} - Generated slots
 */
const generateSlotsForDate = (schedule, date) => {
  const slots = [];
  const startTime = new Date(`${date.toISOString().split('T')[0]}T${schedule.startTime}:00`);
  const endTime = new Date(`${date.toISOString().split('T')[0]}T${schedule.endTime}:00`);

  let currentTime = new Date(startTime);

  while (currentTime < endTime) {
    const slotEndTime = new Date(currentTime.getTime() + schedule.slotDuration * 60000);

    // Check if slot overlaps with break times
    const isInBreak = schedule.breakTimes.some(breakTime => {
      const breakStart = new Date(`${date.toISOString().split('T')[0]}T${breakTime.startTime}:00`);
      const breakEnd = new Date(`${date.toISOString().split('T')[0]}T${breakTime.endTime}:00`);

      return (currentTime >= breakStart && currentTime < breakEnd) ||
             (slotEndTime > breakStart && slotEndTime <= breakEnd);
    });

    if (!isInBreak && slotEndTime <= endTime) {
      slots.push({
        doctorId: schedule.doctorId,
        scheduleId: schedule._id,
        date,
        startTime: currentTime.toTimeString().slice(0, 5),
        endTime: slotEndTime.toTimeString().slice(0, 5),
        status: 'available'
      });
    }

    currentTime = slotEndTime;
  }

  return slots;
};

/**
 * Get doctor's availability slots
 * @param {Object} doctor - Doctor user object
 * @param {Object} query - Query parameters
 * @returns {Object} - Availability slots
 */
export const getDoctorSlots = async (doctor, query) => {
  const { date, status, page = 1, limit = 50 } = query;
  const skip = (page - 1) * limit;

  let filter = { doctorId: doctor._id };

  if (date) {
    const queryDate = new Date(date);
    filter.date = {
      $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
      $lt: new Date(queryDate.setHours(23, 59, 59, 999))
    };
  }

  if (status) {
    filter.status = status;
  }

  const slots = await AvailabilitySlot.find(filter)
    .populate('patientId', 'name email')
    .sort({ date: 1, startTime: 1 })
    .skip(skip)
    .limit(limit);

  const total = await AvailabilitySlot.countDocuments(filter);

  return {
    slots,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

/**
 * Update slot status (block/unblock)
 * @param {Object} user - User performing the action
 * @param {string} slotId - Slot ID
 * @param {string} action - Action to perform (block/unblock)
 * @param {string} reason - Reason for blocking (optional)
 * @returns {Object} - Updated slot
 */
export const updateSlotStatus = async (user, slotId, action, reason = '') => {
  const slot = await AvailabilitySlot.findById(slotId);

  if (!slot) {
    throw ApiError.notFound('Slot not found');
  }

  // Check permissions
  if (user.role !== 'admin' && user.role !== 'staff' && user._id.toString() !== slot.doctorId.toString()) {
    throw ApiError.forbidden('Not authorized to modify this slot');
  }

  if (action === 'block') {
    if (!reason || reason.trim() === '') {
      throw ApiError.badRequest('Reason is required when blocking a slot');
    }

    if (slot.status === 'booked') {
      throw ApiError.badRequest('Cannot block a booked slot');
    }

    await slot.blockSlot(user._id, reason);
  } else if (action === 'unblock') {
    if (slot.status !== 'blocked') {
      throw ApiError.badRequest('Slot is not blocked');
    }

    await slot.unblockSlot();
  } else {
    throw ApiError.badRequest('Invalid action. Use "block" or "unblock"');
  }

  // Publish real-time update
  await redisCache.publish('slot_updates', {
    slotId: slot._id,
    doctorId: slot.doctorId,
    action,
    status: slot.status,
    timestamp: new Date()
  });

  // Clear cache
  await redisCache.del(`doctor_slots_${slot.doctorId}`);

  return {
    slot
  };
};

/**
 * Bulk update slot statuses
 * @param {Object} user - User performing the action
 * @param {Array} slotUpdates - Array of slot updates
 * @returns {Object} - Update results
 */
export const bulkUpdateSlotStatus = async (user, slotUpdates) => {
  const results = [];
  const errors = [];

  for (const update of slotUpdates) {
    try {
      const result = await updateSlotStatus(user, update.slotId, update.action, update.reason);
      results.push(result);
    } catch (error) {
      errors.push({
        slotId: update.slotId,
        error: error.message
      });
    }
  }

  return {
    successCount: results.length,
    errorCount: errors.length,
    results,
    errors
  };
};