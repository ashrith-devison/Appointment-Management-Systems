import User from '../../../models/users.model.js';
import DoctorSchedule from '../../../models/DoctorSchedule.js';
import AvailabilitySlot from '../../../models/AvailabilitySlot.js';
import ApiError from '../../../utils/ApiError.util.js';
import redisCache from '../../../utils/redis.js';
import { generateAccessToken, generateRefreshToken } from '../../../middlewares/auth.js';

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
 * Impersonate login as a doctor (admin only)
 * @param {string} doctorId - Doctor ID
 * @returns {Object} - Impersonation tokens
 */
export const impersonateDoctor = async (doctorId) => {
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  if (!doctor.isActive) {
    throw ApiError.forbidden('Cannot impersonate inactive doctor');
  }

  // Generate tokens for the doctor
  const accessToken = generateAccessToken({ id: doctor._id, role: doctor.role });
  const refreshToken = generateRefreshToken({ id: doctor._id });

  // Save refresh token
  doctor.refreshToken = refreshToken;
  doctor.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await doctor.save();

  return {
    user: {
      id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      role: doctor.role,
      isEmailVerified: doctor.isEmailVerified
    },
    tokens: {
      accessToken,
      refreshToken
    },
    impersonated: true
  };
};