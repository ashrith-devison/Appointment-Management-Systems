import User from '../../models/users.model.js';
import DoctorSchedule from '../../models/DoctorSchedule.js';
import AvailabilitySlot from '../../models/AvailabilitySlot.js';
import ApiError from '../../utils/ApiError.util.js';
import redisCache from '../../utils/redis.js';

/**
 * Get all doctors (admin only)
 * @param {Object} query - Query parameters
 * @returns {Object} - Doctors list
 */
export const getAllDoctors = async (query) => {
  const { page = 1, limit = 10, search, specialization, isActive } = query;
  const skip = (page - 1) * limit;

  let filter = { role: 'doctor' };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  if (specialization) {
    filter['doctorProfile.specialization'] = { $regex: specialization, $options: 'i' };
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }

  const doctors = await User.find(filter)
    .select('name email doctorProfile isEmailVerified isActive createdAt lastLogin')
    .sort({ createdAt: -1 })
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
 * Get doctor details by ID (admin only)
 * @param {string} doctorId - Doctor ID
 * @returns {Object} - Doctor details
 */
export const getDoctorById = async (doctorId) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' })
    .select('-password -refreshToken -passwordResetToken -emailVerificationToken')
    .lean();

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  // Get doctor's schedules
  const schedules = await DoctorSchedule.find({
    doctorId,
    isActive: true
  }).sort({ dayOfWeek: 1 });

  // Get upcoming slots count
  const upcomingSlots = await AvailabilitySlot.countDocuments({
    doctorId,
    date: { $gte: new Date() },
    status: 'available'
  });

  return {
    doctor: {
      ...doctor,
      schedules,
      upcomingSlots
    }
  };
};

/**
 * Update doctor profile (admin only)
 * @param {string} doctorId - Doctor ID
 * @param {Object} updates - Profile updates
 * @returns {Object} - Updated doctor
 */
export const updateDoctorByAdmin = async (doctorId, updates) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const allowedFields = ['name', 'email', 'doctorProfile', 'isActive'];
  const filteredUpdates = {};

  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  if (Object.keys(filteredUpdates).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const updatedDoctor = await User.findByIdAndUpdate(
    doctorId,
    filteredUpdates,
    { new: true, runValidators: true }
  ).select('-password -refreshToken -passwordResetToken -emailVerificationToken');

  // Clear cache
  await redisCache.del(`doctor_profile_${doctorId}`);

  return {
    doctor: updatedDoctor
  };
};

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

/**
 * Get doctor's availability slots (admin only)
 * @param {string} doctorId - Doctor ID
 * @param {Object} query - Query parameters
 * @returns {Object} - Availability slots
 */
export const getDoctorSlotsByAdmin = async (doctorId, query) => {
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
 * Generate slots for doctor (admin only)
 * @param {string} doctorId - Doctor ID
 * @param {Object} slotData - Slot generation data
 * @returns {Object} - Generated slots
 */
export const generateDoctorSlotsByAdmin = async (doctorId, slotData) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const { scheduleId, startDate, endDate, overrideExisting = false } = slotData;

  const schedule = await DoctorSchedule.findOne({
    _id: scheduleId,
    doctorId,
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
    const dayName = date.toLocaleLowerCase('en-US', { weekday: 'long' });

    if (dayName !== schedule.dayOfWeek) continue;

    // Check if slots already exist for this date
    if (!overrideExisting) {
      const existingSlots = await AvailabilitySlot.countDocuments({
        doctorId,
        date,
        scheduleId
      });

      if (existingSlots > 0) continue;
    } else {
      // Delete existing slots
      await AvailabilitySlot.deleteMany({
        doctorId,
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
  await redisCache.del(`doctor_slots_${doctorId}`);

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