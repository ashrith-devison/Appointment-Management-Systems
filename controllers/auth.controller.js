import crypto from 'crypto';
import User from '../models/users.model.js';
import ApiError from '../utils/ApiError.util.js';
import { sendEmail } from '../utils/email.js';
import { generateAccessToken, generateRefreshToken } from '../middlewares/auth.js';

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Object} - User data and verification info
 */
export const register = async (userData) => {
  const { name, email, password, role = 'patient' } = userData;

  // Validation
  if (!name || !email || !password) {
    throw ApiError.badRequest('Name, email, and password are required');
  }

  if (password.length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters long');
  }

  if (role && !['patient', 'doctor', 'admin', 'staff'].includes(role)) {
    throw ApiError.badRequest('Invalid role. Must be patient, doctor, admin, or staff');
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict('User with this email already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role
  });

  // Generate email verification token
  const verificationToken = user.generateEmailVerificationToken();
  await user.save();

  // Send verification email (don't fail if email fails)
  try {
    await sendEmail({
      to: user.email,
      subject: 'Email Verification',
      html: `
        <h2>Welcome to our platform!</h2>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
      `
    });
  } catch (emailError) {
    console.error('Email sending failed:', emailError);
  }

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    }
  };
};

/**
 * Login user
 * @param {Object} credentials - User login credentials
 * @returns {Object} - User data and tokens
 */
export const login = async (credentials) => {
  const { email, password } = credentials;

  // Find user and include password for comparison
  const user = await User.findForAuth(email);
  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // Check if account is locked
  if (user.isLocked) {
    throw ApiError.unauthorized('Account is temporarily locked due to too many failed attempts');
  }

  // Update login info
  user.loginAttempts = 0;
  user.lastLogin = new Date();

  // Generate tokens
  const accessToken = generateAccessToken({ id: user._id, role: user.role });
  const refreshToken = generateRefreshToken({ id: user._id });

  // Save refresh token
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    },
    tokens: {
      accessToken,
      refreshToken
    }
  };
};

/**
 * Refresh access token
 * @param {Object} user - User object from middleware
 * @returns {Object} - New access token
 */
export const refreshToken = async (user) => {
  const accessToken = generateAccessToken({ id: user._id, role: user.role });

  return {
    accessToken
  };
};

/**
 * Logout user
 * @param {Object} user - User object from middleware
 */
export const logout = async (user) => {
  user.refreshToken = undefined;
  user.refreshTokenExpires = undefined;
  await user.save();
};

/**
 * Request password reset
 * @param {string} email - User email
 */
export const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists
    return;
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  // Send reset email
  try {
    await sendEmail({
      to: user.email,
      subject: 'Password Reset',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}">Reset Password</a>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
  } catch (emailError) {
    console.error('Email sending failed:', emailError);
    throw ApiError.internal('Failed to send reset email');
  }
};

/**
 * Reset password with token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 */
export const resetPassword = async (token, newPassword) => {
  // Hash the token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  // Update password
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
};

/**
 * Change password
 * @param {Object} user - Current user
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 */
export const changePassword = async (user, currentPassword, newPassword) => {
  // Check current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();
};

/**
 * Verify email
 * @param {string} token - Verification token
 */
export const verifyEmail = async (token) => {
  // Hash the token
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired verification token');
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
};

/**
 * Get current user profile
 * @param {Object} user - Current user
 * @returns {Object} - User profile data
 */
export const getProfile = async (user) => {
  const userData = await User.findById(user._id);

  return {
    user: {
      id: userData._id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      isEmailVerified: userData.isEmailVerified,
      profile: userData.profile,
      doctorProfile: userData.role === 'doctor' ? userData.doctorProfile : undefined,
      patientProfile: userData.role === 'patient' ? userData.patientProfile : undefined,
      lastLogin: userData.lastLogin
    }
  };
};

/**
 * Update user profile
 * @param {Object} user - Current user
 * @param {Object} updates - Profile updates
 * @returns {Object} - Updated user data
 */
export const updateProfile = async (user, updates) => {
  const allowedFields = ['name', 'profile'];
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

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    filteredUpdates,
    { new: true, runValidators: true }
  );

  return {
    user: {
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      profile: updatedUser.profile
    }
  };
};

/**
 * Delete user account
 * @param {Object} user - Current user
 */
export const deleteAccount = async (user) => {
  user.isActive = false;
  await user.save();
};

/**
 * Delete user by ID (admin)
 * @param {string} userId - User ID to delete
 */
export const deleteUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Prevent deleting admin accounts
  if (user.role === 'admin') {
    throw ApiError.forbidden('Cannot delete admin accounts');
  }

  user.isActive = false;
  await user.save();
};

/**
 * Get all users (admin)
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} - Users list with pagination
 */
export const getUsers = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const users = await User.find({})
    .select('name email role isEmailVerified isActive createdAt lastLogin')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments();

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

/**
 * Update user role (admin)
 * @param {string} userId - User ID
 * @param {string} newRole - New role
 * @returns {Object} - Updated user data
 */
export const updateUserRole = async (userId, newRole) => {
  if (!['patient', 'doctor', 'admin', 'staff'].includes(newRole)) {
    throw ApiError.badRequest('Invalid role. Must be patient, doctor, admin, or staff');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  // Prevent demoting the last admin
  if (user.role === 'admin' && newRole !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      throw ApiError.badRequest('Cannot demote the last admin user');
    }
  }

  user.role = newRole;
  await user.save();

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
};

/**
 * Impersonate user (admin)
 * @param {string} userId - User ID to impersonate
 * @returns {Object} - User data and tokens
 */
export const impersonateUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (!user.isActive) {
    throw ApiError.badRequest('Cannot impersonate inactive user');
  }

  // Generate tokens for the target user
  const accessToken = generateAccessToken({ id: user._id, role: user.role });
  const refreshToken = generateRefreshToken({ id: user._id });

  // Save refresh token for the target user
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save();

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified
    },
    tokens: {
      accessToken,
      refreshToken
    }
  };
};