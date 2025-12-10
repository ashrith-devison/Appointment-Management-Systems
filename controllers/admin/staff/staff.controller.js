import User from '../../../models/users.model.js';
import ApiError from '../../../utils/ApiError.util.js';
import { generateAccessToken, generateRefreshToken } from '../../../middlewares/auth.js';

/**
 * Impersonate login as a staff member (admin only)
 * @param {string} staffId - Staff ID
 * @returns {Object} - Impersonation tokens
 */
export const impersonateStaff = async (staffId) => {
  const staff = await User.findOne({ _id: staffId, role: 'staff' });

  if (!staff) {
    throw ApiError.notFound('Staff member not found');
  }

  if (!staff.isActive) {
    throw ApiError.forbidden('Cannot impersonate inactive staff member');
  }

  // Generate tokens for the staff member
  const accessToken = generateAccessToken({ id: staff._id, role: staff.role });
  const refreshToken = generateRefreshToken({ id: staff._id });

  // Save refresh token
  staff.refreshToken = refreshToken;
  staff.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await staff.save();

  return {
    user: {
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      isEmailVerified: staff.isEmailVerified
    },
    tokens: {
      accessToken,
      refreshToken
    },
    impersonated: true
  };
};