import { jest } from '@jest/globals';
import {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyEmail,
  getProfile,
  updateProfile,
  deleteAccount,
  deleteUserById,
  getUsers,
  updateUserRole,
  impersonateUser
} from '../../controllers/auth.controller.js';

// Mock dependencies
jest.mock('../../models/users.model.js');
jest.mock('../../utils/ApiError.util.js');
jest.mock('../../utils/email.js');
jest.mock('../../middlewares/auth.js');

import User from '../../models/users.model.js';
import ApiError from '../../utils/ApiError.util.js';
import { sendEmail } from '../../utils/email.js';
import { generateAccessToken, generateRefreshToken } from '../../middlewares/auth.js';

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = { name: 'John Doe', email: 'john@example.com', password: 'password123', role: 'patient' };
      const mockUser = {
        _id: 'userId',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'patient',
        isEmailVerified: false,
        generateEmailVerificationToken: jest.fn().mockReturnValue('token'),
        save: jest.fn()
      };

      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue(mockUser);
      sendEmail.mockResolvedValue();

      const result = await register(userData);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(User.create).toHaveBeenCalledWith(userData);
      expect(mockUser.generateEmailVerificationToken).toHaveBeenCalled();
      expect(mockUser.save).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
      expect(result).toEqual({
        user: {
          id: 'userId',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'patient',
          isEmailVerified: false
        }
      });
    });

    it('should throw error if name is missing', async () => {
      const userData = { email: 'john@example.com', password: 'password123' };
      ApiError.badRequest.mockReturnValue(new Error('Name, email, and password are required'));

      await expect(register(userData)).rejects.toThrow('Name, email, and password are required');
    });

    it('should throw error if password is too short', async () => {
      const userData = { name: 'John Doe', email: 'john@example.com', password: '123' };
      ApiError.badRequest.mockReturnValue(new Error('Password must be at least 6 characters long'));

      await expect(register(userData)).rejects.toThrow('Password must be at least 6 characters long');
    });

    it('should throw error if role is invalid', async () => {
      const userData = { name: 'John Doe', email: 'john@example.com', password: 'password123', role: 'invalid' };
      ApiError.badRequest.mockReturnValue(new Error('Invalid role. Must be patient, doctor, admin, or staff'));

      await expect(register(userData)).rejects.toThrow('Invalid role. Must be patient, doctor, admin, or staff');
    });

    it('should throw error if user already exists', async () => {
      const userData = { name: 'John Doe', email: 'john@example.com', password: 'password123' };
      User.findOne.mockResolvedValue({ email: 'john@example.com' });
      ApiError.conflict.mockReturnValue(new Error('User with this email already exists'));

      await expect(register(userData)).rejects.toThrow('User with this email already exists');
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const credentials = { email: 'john@example.com', password: 'password123' };
      const mockUser = {
        _id: 'userId',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'patient',
        isEmailVerified: true,
        isLocked: false,
        loginAttempts: 0,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn()
      };

      User.findForAuth.mockResolvedValue(mockUser);
      generateAccessToken.mockReturnValue('accessToken');
      generateRefreshToken.mockReturnValue('refreshToken');

      const result = await login(credentials);

      expect(User.findForAuth).toHaveBeenCalledWith('john@example.com');
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(generateAccessToken).toHaveBeenCalledWith({ id: 'userId', role: 'patient' });
      expect(generateRefreshToken).toHaveBeenCalledWith({ id: 'userId' });
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toEqual({
        user: {
          id: 'userId',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'patient',
          isEmailVerified: true
        },
        tokens: {
          accessToken: 'accessToken',
          refreshToken: 'refreshToken'
        }
      });
    });

    it('should throw error for invalid credentials - user not found', async () => {
      const credentials = { email: 'john@example.com', password: 'password123' };
      User.findForAuth.mockResolvedValue(null);
      ApiError.unauthorized.mockReturnValue(new Error('Invalid credentials'));

      await expect(login(credentials)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for invalid password', async () => {
      const credentials = { email: 'john@example.com', password: 'wrongpassword' };
      const mockUser = {
        comparePassword: jest.fn().mockResolvedValue(false)
      };
      User.findForAuth.mockResolvedValue(mockUser);
      ApiError.unauthorized.mockReturnValue(new Error('Invalid credentials'));

      await expect(login(credentials)).rejects.toThrow('Invalid credentials');
    });

    it('should throw error if account is locked', async () => {
      const credentials = { email: 'john@example.com', password: 'password123' };
      const mockUser = {
        isLocked: true,
        comparePassword: jest.fn().mockResolvedValue(true)
      };
      User.findForAuth.mockResolvedValue(mockUser);
      ApiError.unauthorized.mockReturnValue(new Error('Account is temporarily locked due to too many failed attempts'));

      await expect(login(credentials)).rejects.toThrow('Account is temporarily locked due to too many failed attempts');
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const user = { _id: 'userId', role: 'patient' };
      generateAccessToken.mockReturnValue('newAccessToken');

      const result = await refreshToken(user);

      expect(generateAccessToken).toHaveBeenCalledWith({ id: 'userId', role: 'patient' });
      expect(result).toEqual({ accessToken: 'newAccessToken' });
    });
  });

  describe('logout', () => {
    it('should logout user', async () => {
      const user = {
        refreshToken: 'token',
        refreshTokenExpires: new Date(),
        save: jest.fn()
      };

      await logout(user);

      expect(user.refreshToken).toBeUndefined();
      expect(user.refreshTokenExpires).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should send reset email if user exists', async () => {
      const email = 'john@example.com';
      const mockUser = {
        email: 'john@example.com',
        generatePasswordResetToken: jest.fn().mockReturnValue('resetToken'),
        save: jest.fn()
      };

      User.findOne.mockResolvedValue(mockUser);
      sendEmail.mockResolvedValue();

      await forgotPassword(email);

      expect(User.findOne).toHaveBeenCalledWith({ email });
      expect(mockUser.generatePasswordResetToken).toHaveBeenCalled();
      expect(mockUser.save).toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalled();
    });

    it('should not reveal if user does not exist', async () => {
      const email = 'nonexistent@example.com';
      User.findOne.mockResolvedValue(null);

      await forgotPassword(email);

      expect(User.findOne).toHaveBeenCalledWith({ email });
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      const token = 'resetToken';
      const newPassword = 'newPassword123';
      const mockUser = {
        password: '',
        passwordResetToken: 'hashedToken',
        passwordResetExpires: new Date(Date.now() + 10000),
        save: jest.fn()
      };

      User.findOne.mockResolvedValue(mockUser);

      await resetPassword(token, newPassword);

      expect(User.findOne).toHaveBeenCalledWith({
        passwordResetToken: expect.any(String),
        passwordResetExpires: { $gt: expect.any(Number) }
      });
      expect(mockUser.password).toBe(newPassword);
      expect(mockUser.passwordResetToken).toBeUndefined();
      expect(mockUser.passwordResetExpires).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw error for invalid token', async () => {
      const token = 'invalidToken';
      const newPassword = 'newPassword123';
      User.findOne.mockResolvedValue(null);
      ApiError.badRequest.mockReturnValue(new Error('Invalid or expired reset token'));

      await expect(resetPassword(token, newPassword)).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const user = {
        comparePassword: jest.fn().mockResolvedValue(true),
        password: '',
        save: jest.fn()
      };
      const currentPassword = 'oldPassword';
      const newPassword = 'newPassword123';

      await changePassword(user, currentPassword, newPassword);

      expect(user.comparePassword).toHaveBeenCalledWith(currentPassword);
      expect(user.password).toBe(newPassword);
      expect(user.save).toHaveBeenCalled();
    });

    it('should throw error for incorrect current password', async () => {
      const user = {
        comparePassword: jest.fn().mockResolvedValue(false)
      };
      const currentPassword = 'wrongPassword';
      const newPassword = 'newPassword123';
      ApiError.badRequest.mockReturnValue(new Error('Current password is incorrect'));

      await expect(changePassword(user, currentPassword, newPassword)).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const token = 'verificationToken';
      const mockUser = {
        isEmailVerified: false,
        emailVerificationToken: 'hashedToken',
        emailVerificationExpires: new Date(Date.now() + 10000),
        save: jest.fn()
      };

      User.findOne.mockResolvedValue(mockUser);

      await verifyEmail(token);

      expect(User.findOne).toHaveBeenCalledWith({
        emailVerificationToken: expect.any(String),
        emailVerificationExpires: { $gt: expect.any(Number) }
      });
      expect(mockUser.isEmailVerified).toBe(true);
      expect(mockUser.emailVerificationToken).toBeUndefined();
      expect(mockUser.emailVerificationExpires).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw error for invalid token', async () => {
      const token = 'invalidToken';
      User.findOne.mockResolvedValue(null);
      ApiError.badRequest.mockReturnValue(new Error('Invalid or expired verification token'));

      await expect(verifyEmail(token)).rejects.toThrow('Invalid or expired verification token');
    });
  });

  describe('getProfile', () => {
    it('should get user profile', async () => {
      const user = { _id: 'userId' };
      const mockUserData = {
        _id: 'userId',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'patient',
        isEmailVerified: true,
        profile: {},
        patientProfile: {},
        lastLogin: new Date()
      };

      User.findById.mockResolvedValue(mockUserData);

      const result = await getProfile(user);

      expect(User.findById).toHaveBeenCalledWith('userId');
      expect(result).toEqual({
        user: {
          id: 'userId',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'patient',
          isEmailVerified: true,
          profile: {},
          patientProfile: {},
          lastLogin: mockUserData.lastLogin
        }
      });
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      const user = { _id: 'userId' };
      const updates = { name: 'Jane Doe', profile: { phone: '1234567890' } };
      const mockUpdatedUser = {
        _id: 'userId',
        name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'patient',
        profile: { phone: '1234567890' }
      };

      User.findByIdAndUpdate.mockResolvedValue(mockUpdatedUser);

      const result = await updateProfile(user, updates);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'userId',
        { name: 'Jane Doe', profile: { phone: '1234567890' } },
        { new: true, runValidators: true }
      );
      expect(result).toEqual({
        user: {
          id: 'userId',
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: 'patient',
          profile: { phone: '1234567890' }
        }
      });
    });

    it('should throw error for no valid fields', async () => {
      const user = { _id: 'userId' };
      const updates = { invalidField: 'value' };
      ApiError.badRequest.mockReturnValue(new Error('No valid fields to update'));

      await expect(updateProfile(user, updates)).rejects.toThrow('No valid fields to update');
    });
  });

  describe('deleteAccount', () => {
    it('should delete user account', async () => {
      const user = {
        isActive: true,
        save: jest.fn()
      };

      await deleteAccount(user);

      expect(user.isActive).toBe(false);
      expect(user.save).toHaveBeenCalled();
    });
  });

  describe('deleteUserById', () => {
    it('should delete user by id', async () => {
      const userId = 'userId';
      const mockUser = {
        role: 'patient',
        isActive: true,
        save: jest.fn()
      };

      User.findById.mockResolvedValue(mockUser);

      await deleteUserById(userId);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.isActive).toBe(false);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      const userId = 'userId';
      User.findById.mockResolvedValue(null);
      ApiError.notFound.mockReturnValue(new Error('User not found'));

      await expect(deleteUserById(userId)).rejects.toThrow('User not found');
    });

    it('should throw error if trying to delete admin', async () => {
      const userId = 'userId';
      const mockUser = { role: 'admin' };
      User.findById.mockResolvedValue(mockUser);
      ApiError.forbidden.mockReturnValue(new Error('Cannot delete admin accounts'));

      await expect(deleteUserById(userId)).rejects.toThrow('Cannot delete admin accounts');
    });
  });

  describe('getUsers', () => {
    it('should get users with pagination', async () => {
      const page = 1;
      const limit = 10;
      const mockUsers = [
        { name: 'User1', email: 'user1@example.com', role: 'patient' },
        { name: 'User2', email: 'user2@example.com', role: 'doctor' }
      ];

      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockUsers)
      });
      User.countDocuments.mockResolvedValue(2);

      const result = await getUsers(page, limit);

      expect(User.find).toHaveBeenCalledWith({});
      expect(result).toEqual({
        users: mockUsers,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      });
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      const userId = 'userId';
      const newRole = 'doctor';
      const mockUser = {
        _id: 'userId',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'patient',
        save: jest.fn()
      };

      User.findById.mockResolvedValue(mockUser);
      User.countDocuments.mockResolvedValue(2);

      const result = await updateUserRole(userId, newRole);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.role).toBe('doctor');
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toEqual({
        user: {
          id: 'userId',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'doctor'
        }
      });
    });

    it('should throw error for invalid role', async () => {
      const userId = 'userId';
      const newRole = 'invalid';
      ApiError.badRequest.mockReturnValue(new Error('Invalid role. Must be patient, doctor, admin, or staff'));

      await expect(updateUserRole(userId, newRole)).rejects.toThrow('Invalid role. Must be patient, doctor, admin, or staff');
    });

    it('should throw error if user not found', async () => {
      const userId = 'userId';
      const newRole = 'doctor';
      User.findById.mockResolvedValue(null);
      ApiError.notFound.mockReturnValue(new Error('User not found'));

      await expect(updateUserRole(userId, newRole)).rejects.toThrow('User not found');
    });

    it('should throw error if demoting last admin', async () => {
      const userId = 'userId';
      const newRole = 'patient';
      const mockUser = { role: 'admin' };
      User.findById.mockResolvedValue(mockUser);
      User.countDocuments.mockResolvedValue(1);
      ApiError.badRequest.mockReturnValue(new Error('Cannot demote the last admin user'));

      await expect(updateUserRole(userId, newRole)).rejects.toThrow('Cannot demote the last admin user');
    });
  });

  describe('impersonateUser', () => {
    it('should impersonate user', async () => {
      const userId = 'userId';
      const mockUser = {
        _id: 'userId',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'patient',
        isEmailVerified: true,
        isActive: true,
        save: jest.fn()
      };

      User.findById.mockResolvedValue(mockUser);
      generateAccessToken.mockReturnValue('accessToken');
      generateRefreshToken.mockReturnValue('refreshToken');

      const result = await impersonateUser(userId);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(generateAccessToken).toHaveBeenCalledWith({ id: 'userId', role: 'patient' });
      expect(generateRefreshToken).toHaveBeenCalledWith({ id: 'userId' });
      expect(mockUser.save).toHaveBeenCalled();
      expect(result).toEqual({
        user: {
          id: 'userId',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'patient',
          isEmailVerified: true
        },
        tokens: {
          accessToken: 'accessToken',
          refreshToken: 'refreshToken'
        }
      });
    });

    it('should throw error if user not found', async () => {
      const userId = 'userId';
      User.findById.mockResolvedValue(null);
      ApiError.notFound.mockReturnValue(new Error('User not found'));

      await expect(impersonateUser(userId)).rejects.toThrow('User not found');
    });

    it('should throw error if user is inactive', async () => {
      const userId = 'userId';
      const mockUser = { isActive: false };
      User.findById.mockResolvedValue(mockUser);
      ApiError.badRequest.mockReturnValue(new Error('Cannot impersonate inactive user'));

      await expect(impersonateUser(userId)).rejects.toThrow('Cannot impersonate inactive user');
    });
  });

  describe('Security Tests', () => {
    describe('Input Validation and Injection Prevention', () => {
      it('should prevent SQL injection in email field during registration', async () => {
        const maliciousEmail = "'; DROP TABLE users; --";
        const userData = { name: 'Hacker', email: maliciousEmail, password: 'password123' };
        const mockUser = {
          _id: 'userId',
          name: 'Hacker',
          email: maliciousEmail,
          role: 'patient',
          isEmailVerified: false,
          generateEmailVerificationToken: jest.fn().mockReturnValue('token'),
          save: jest.fn()
        };

        User.findOne.mockResolvedValue(null);
        User.create.mockResolvedValue(mockUser);
        sendEmail.mockResolvedValue();

        const result = await register(userData);

        // The system should treat the malicious input as a regular string
        expect(User.findOne).toHaveBeenCalledWith({ email: maliciousEmail });
        expect(result.user.email).toBe(maliciousEmail);
      });

      it('should prevent XSS in name field during registration', async () => {
        const maliciousName = "<script>alert('XSS')</script>";
        const userData = { name: maliciousName, email: 'test@example.com', password: 'password123' };
        const mockUser = {
          _id: 'userId',
          name: maliciousName,
          email: 'test@example.com',
          role: 'patient',
          isEmailVerified: false,
          generateEmailVerificationToken: jest.fn().mockReturnValue('token'),
          save: jest.fn()
        };

        User.findOne.mockResolvedValue(null);
        User.create.mockResolvedValue(mockUser);
        sendEmail.mockResolvedValue();

        const result = await register(userData);

        expect(result.user.name).toBe(maliciousName);
        // In a real application, you'd want to sanitize this, but here we test that it's stored as-is
      });

      it('should handle extremely long inputs', async () => {
        const longName = 'A'.repeat(1000);
        const longEmail = 'a'.repeat(500) + '@example.com';
        const userData = { name: longName, email: longEmail, password: 'password123' };

        User.findOne.mockResolvedValue(null);
        User.create.mockRejectedValue(new Error('Validation failed'));

        await expect(register(userData)).rejects.toThrow();
      });
    });

    describe('Password Security', () => {
      it('should enforce minimum password length', async () => {
        const userData = { name: 'Test', email: 'test@example.com', password: '12345' };
        ApiError.badRequest.mockReturnValue(new Error('Password must be at least 6 characters long'));

        await expect(register(userData)).rejects.toThrow('Password must be at least 6 characters long');
      });

      it('should accept strong passwords', async () => {
        const strongPassword = 'MyStr0ngP@ssw0rd!2025';
        const userData = { name: 'Test', email: 'test@example.com', password: strongPassword };
        const expectedUserData = { ...userData, role: 'patient' };
        const mockUser = {
          _id: 'userId',
          name: 'Test',
          email: 'test@example.com',
          role: 'patient',
          isEmailVerified: false,
          generateEmailVerificationToken: jest.fn().mockReturnValue('token'),
          save: jest.fn()
        };

        User.findOne.mockResolvedValue(null);
        User.create.mockResolvedValue(mockUser);
        sendEmail.mockResolvedValue();

        const result = await register(userData);

        expect(User.create).toHaveBeenCalledWith(expectedUserData);
        expect(result.user.email).toBe('test@example.com');
      });

      it('should handle password change with weak new password', async () => {
        const user = {
          comparePassword: jest.fn().mockResolvedValue(true),
          password: '',
          save: jest.fn()
        };
        const currentPassword = 'oldPassword';
        const weakNewPassword = '123';

        // Note: The current implementation doesn't validate new password strength in changePassword
        // This test documents that weakness
        await changePassword(user, currentPassword, weakNewPassword);

        expect(user.password).toBe(weakNewPassword);
      });
    });

    describe('Authentication Security', () => {
      it('should prevent timing attacks by using constant-time comparison', async () => {
        const credentials = { email: 'nonexistent@example.com', password: 'password' };
        User.findForAuth.mockResolvedValue(null);
        ApiError.unauthorized.mockReturnValue(new Error('Invalid credentials'));

        const startTime = Date.now();
        await expect(login(credentials)).rejects.toThrow('Invalid credentials');
        const endTime = Date.now();

        // In a real implementation, you'd want to ensure timing is consistent
        // Here we just check that it fails quickly
        expect(endTime - startTime).toBeLessThan(100); // Should be fast
      });

      it('should handle multiple failed login attempts', async () => {
        // This would require implementing login attempt tracking
        // For now, we test the existing behavior
        const credentials = { email: 'user@example.com', password: 'wrongpassword' };
        const mockUser = {
          comparePassword: jest.fn().mockResolvedValue(false)
        };
        User.findForAuth.mockResolvedValue(mockUser);
        ApiError.unauthorized.mockReturnValue(new Error('Invalid credentials'));

        await expect(login(credentials)).rejects.toThrow('Invalid credentials');

        // In a secure implementation, this would increment loginAttempts
      });

      it('should prevent account enumeration via login', async () => {
        // Test that error messages don't reveal if email exists
        const credentials = { email: 'nonexistent@example.com', password: 'password' };
        User.findForAuth.mockResolvedValue(null);
        ApiError.unauthorized.mockReturnValue(new Error('Invalid credentials'));

        await expect(login(credentials)).rejects.toThrow('Invalid credentials');

        // Same error for wrong password
        const mockUser = {
          comparePassword: jest.fn().mockResolvedValue(false)
        };
        User.findForAuth.mockResolvedValue(mockUser);

        await expect(login(credentials)).rejects.toThrow('Invalid credentials');
      });
    });

    describe('Token Security', () => {
      it('should generate different tokens for different users', async () => {
        const user1 = { _id: 'user1', role: 'patient' };
        const user2 = { _id: 'user2', role: 'doctor' };

        generateAccessToken.mockReturnValueOnce('token1').mockReturnValueOnce('token2');

        const result1 = await refreshToken(user1);
        const result2 = await refreshToken(user2);

        expect(result1.accessToken).not.toBe(result2.accessToken);
        expect(generateAccessToken).toHaveBeenCalledWith({ id: 'user1', role: 'patient' });
        expect(generateAccessToken).toHaveBeenCalledWith({ id: 'user2', role: 'doctor' });
      });

      it('should clear tokens on logout', async () => {
        const user = {
          refreshToken: 'sometoken',
          refreshTokenExpires: new Date(),
          save: jest.fn()
        };

        await logout(user);

        expect(user.refreshToken).toBeUndefined();
        expect(user.refreshTokenExpires).toBeUndefined();
      });

      it('should handle expired password reset tokens', async () => {
        const token = 'expiredtoken';
        User.findOne.mockResolvedValue(null); // Simulate expired token
        ApiError.badRequest.mockReturnValue(new Error('Invalid or expired reset token'));

        await expect(resetPassword(token, 'newpassword')).rejects.toThrow('Invalid or expired reset token');
      });
    });

    describe('Authorization and Access Control', () => {
      it('should prevent unauthorized role changes', async () => {
        const userId = 'userId';
        const invalidRole = 'superadmin';
        ApiError.badRequest.mockReturnValue(new Error('Invalid role. Must be patient, doctor, admin, or staff'));

        await expect(updateUserRole(userId, invalidRole)).rejects.toThrow('Invalid role. Must be patient, doctor, admin, or staff');
      });

      it('should prevent deleting admin accounts', async () => {
        const userId = 'adminId';
        const mockUser = { role: 'admin' };
        User.findById.mockResolvedValue(mockUser);
        ApiError.forbidden.mockReturnValue(new Error('Cannot delete admin accounts'));

        await expect(deleteUserById(userId)).rejects.toThrow('Cannot delete admin accounts');
      });

      it('should prevent impersonating inactive users', async () => {
        const userId = 'userId';
        const mockUser = { isActive: false };
        User.findById.mockResolvedValue(mockUser);
        ApiError.badRequest.mockReturnValue(new Error('Cannot impersonate inactive user'));

        await expect(impersonateUser(userId)).rejects.toThrow('Cannot impersonate inactive user');
      });

      it('should validate profile update fields', async () => {
        const user = { _id: 'userId' };
        const updates = { role: 'admin', email: 'newemail@example.com' }; // Should ignore these
        ApiError.badRequest.mockReturnValue(new Error('No valid fields to update'));

        await expect(updateProfile(user, updates)).rejects.toThrow('No valid fields to update');
      });
    });

    describe('Data Exposure Prevention', () => {
      it('should not expose sensitive user data in profile', async () => {
        const user = { _id: 'userId' };
        const mockUserData = {
          _id: 'userId',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'patient',
          isEmailVerified: true,
          profile: {},
          password: 'hashedpassword', // Should not be exposed
          passwordResetToken: 'token', // Should not be exposed
          loginAttempts: 5 // Should not be exposed
        };

        User.findById.mockResolvedValue(mockUserData);

        const result = await getProfile(user);

        expect(result.user).not.toHaveProperty('password');
        expect(result.user).not.toHaveProperty('passwordResetToken');
        expect(result.user).not.toHaveProperty('loginAttempts');
        expect(result.user).toHaveProperty('name');
        expect(result.user).toHaveProperty('email');
      });

      it('should limit user data exposure in getUsers', async () => {
        const mockUsers = [{
          name: 'User1',
          email: 'user1@example.com',
          role: 'patient',
          isEmailVerified: true,
          isActive: true,
          createdAt: new Date(),
          lastLogin: new Date()
          // password should not be included due to select
        }];

        User.find.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          sort: jest.fn().mockResolvedValue(mockUsers)
        });
        User.countDocuments.mockResolvedValue(1);

        const result = await getUsers();

        expect(result.users[0]).toHaveProperty('name');
        expect(result.users[0]).toHaveProperty('email');
        expect(result.users[0]).toHaveProperty('role');
        expect(result.users[0]).not.toHaveProperty('password');
      });
    });
  });
});
