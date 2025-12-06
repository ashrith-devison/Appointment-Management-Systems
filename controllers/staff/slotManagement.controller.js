import AvailabilitySlot from '../../models/AvailabilitySlot.js';
import User from '../../models/users.model.js';
import ApiError from '../../utils/ApiError.util.js';
import redisCache from '../../utils/redis.js';

/**
 * Get all doctors for staff management
 * @param {Object} query - Query parameters
 * @returns {Object} - Doctors list
 */
export const getDoctorsForStaff = async (query) => {
  const { search, specialization, page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  let filter = { role: 'doctor', isActive: true };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  if (specialization) {
    filter['doctorProfile.specialization'] = { $regex: specialization, $options: 'i' };
  }

  const doctors = await User.find(filter)
    .select('name email doctorProfile')
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(filter);

  return {
    doctors,
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
 * Get doctor's slots for staff management
 * @param {string} doctorId - Doctor ID
 * @param {Object} query - Query parameters
 * @returns {Object} - Doctor slots
 */
export const getDoctorSlotsForStaff = async (doctorId, query) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const { date, status, page = 1, limit = 50 } = query;
  const skip = (page - 1) * limit;

  let filter = { doctorId };

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
    .populate('blockedBy', 'name email')
    .sort({ date: 1, startTime: 1 })
    .skip(skip)
    .limit(limit);

  const total = await AvailabilitySlot.countDocuments(filter);

  return {
    doctor: {
      id: doctor._id,
      name: doctor.name,
      email: doctor.email
    },
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
 * Block a slot (staff only)
 * @param {Object} staff - Staff user object
 * @param {string} slotId - Slot ID
 * @param {string} reason - Reason for blocking
 * @returns {Object} - Blocked slot
 */
export const blockSlot = async (staff, slotId, reason) => {
  const slot = await AvailabilitySlot.findById(slotId);

  if (!slot) {
    throw ApiError.notFound('Slot not found');
  }

  if (slot.status === 'booked') {
    throw ApiError.badRequest('Cannot block a booked slot');
  }

  if (slot.status === 'blocked') {
    throw ApiError.badRequest('Slot is already blocked');
  }

  await slot.blockSlot(staff._id, reason);

  // Publish real-time update
  await redisCache.publish('slot_updates', {
    slotId: slot._id,
    doctorId: slot.doctorId,
    blockedBy: staff._id,
    action: 'blocked',
    status: 'blocked',
    timestamp: new Date()
  });

  // Clear cache
  await redisCache.del(`doctor_slots_${slot.doctorId}`);

  return {
    slot
  };
};

/**
 * Unblock a slot (staff only)
 * @param {Object} staff - Staff user object
 * @param {string} slotId - Slot ID
 * @returns {Object} - Unblocked slot
 */
export const unblockSlot = async (staff, slotId) => {
  const slot = await AvailabilitySlot.findById(slotId);

  if (!slot) {
    throw ApiError.notFound('Slot not found');
  }

  if (slot.status !== 'blocked') {
    throw ApiError.badRequest('Slot is not blocked');
  }

  await slot.unblockSlot();

  // Publish real-time update
  await redisCache.publish('slot_updates', {
    slotId: slot._id,
    doctorId: slot.doctorId,
    unblockedBy: staff._id,
    action: 'unblocked',
    status: 'available',
    timestamp: new Date()
  });

  // Clear cache
  await redisCache.del(`doctor_slots_${slot.doctorId}`);

  return {
    slot
  };
};

/**
 * Bulk block slots (staff only)
 * @param {Object} staff - Staff user object
 * @param {Array} slotIds - Array of slot IDs
 * @param {string} reason - Reason for blocking
 * @returns {Object} - Bulk operation results
 */
export const bulkBlockSlots = async (staff, slotIds, reason) => {
  const results = [];
  const errors = [];

  for (const slotId of slotIds) {
    try {
      const result = await blockSlot(staff, slotId, reason);
      results.push(result);
    } catch (error) {
      errors.push({
        slotId,
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

/**
 * Bulk unblock slots (staff only)
 * @param {Object} staff - Staff user object
 * @param {Array} slotIds - Array of slot IDs
 * @returns {Object} - Bulk operation results
 */
export const bulkUnblockSlots = async (staff, slotIds) => {
  const results = [];
  const errors = [];

  for (const slotId of slotIds) {
    try {
      const result = await unblockSlot(staff, slotId);
      results.push(result);
    } catch (error) {
      errors.push({
        slotId,
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

/**
 * Get slot statistics for staff dashboard
 * @param {Object} query - Query parameters
 * @returns {Object} - Slot statistics
 */
export const getSlotStatistics = async (query) => {
  const { doctorId, date } = query;

  let matchConditions = {};

  if (doctorId) {
    matchConditions.doctorId = doctorId;
  }

  if (date) {
    const queryDate = new Date(date);
    matchConditions.date = {
      $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
      $lt: new Date(queryDate.setHours(23, 59, 59, 999))
    };
  }

  const stats = await AvailabilitySlot.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const statistics = {
    available: 0,
    booked: 0,
    blocked: 0,
    cancelled: 0
  };

  stats.forEach(stat => {
    statistics[stat._id] = stat.count;
  });

  return {
    statistics,
    totalSlots: Object.values(statistics).reduce((sum, count) => sum + count, 0)
  };
};