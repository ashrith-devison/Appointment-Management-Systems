import User from '../../../models/users.model.js';
import ApiError from '../../../utils/ApiError.util.js';
import redisCache from '../../../utils/redis.js';

/**
 * Get doctor's profile
 * @param {Object} doctor - Doctor user object
 * @returns {Object} - Doctor profile data
 */
export const getDoctorProfile = async (doctor) => {
  const doctorData = await User.findById(doctor._id)
    .select('name email role doctorProfile isEmailVerified createdAt lastLogin')
    .lean();

  if (!doctorData) {
    throw ApiError.notFound('Doctor not found');
  }

  return {
    doctor: doctorData
  };
};

/**
 * Update doctor's profile and specialization
 * @param {Object} doctor - Doctor user object
 * @param {Object} updates - Profile updates
 * @returns {Object} - Updated doctor profile
 */
export const updateDoctorProfile = async (doctor, updates) => {
  const allowedFields = ['name', 'doctorProfile'];
  const filteredUpdates = {};

  // Filter allowed fields
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  if (Object.keys(filteredUpdates).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const updatedDoctor = await User.findByIdAndUpdate(
    doctor._id,
    filteredUpdates,
    { new: true, runValidators: true }
  ).select('name email role doctorProfile isEmailVerified');

  // Clear cache
  await redisCache.del(`doctor_profile_${doctor._id}`);

  return {
    doctor: updatedDoctor
  };
};