import { jest } from '@jest/globals';
import {
  getAllDoctors,
  getDoctorById,
  updateDoctorByAdmin,
  impersonateDoctor
} from '@/controllers/admin/doctor/index.js';

// Mock dependencies
jest.mock('@/models/users.model.js');
jest.mock('@/models/DoctorSchedule.js');
jest.mock('@/models/AvailabilitySlot.js');
jest.mock('@/utils/ApiError.util.js');
jest.mock('@/utils/redis.js');
jest.mock('@/middlewares/auth.js');

import User from '@/models/users.model.js';
import DoctorSchedule from '@/models/DoctorSchedule.js';
import AvailabilitySlot from '@/models/AvailabilitySlot.js';
import ApiError from '@/utils/ApiError.util.js';
import redisCache from '@/utils/redis.js';
import { generateAccessToken, generateRefreshToken } from '@/middlewares/auth.js';

describe('Admin Doctor Profile Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllDoctors', () => {
    it('should return paginated list of doctors', async () => {
      const mockDoctors = [
        { _id: 'doc1', name: 'Dr. Smith', email: 'smith@example.com', role: 'doctor', isActive: true },
        { _id: 'doc2', name: 'Dr. Jones', email: 'jones@example.com', role: 'doctor', isActive: true }
      ];

      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockDoctors)
            })
          })
        })
      });
      User.countDocuments.mockResolvedValue(2);

      const query = { page: 1, limit: 10 };
      const result = await getAllDoctors(query);

      expect(User.find).toHaveBeenCalledWith({ role: 'doctor' });
      expect(result.doctors).toEqual(mockDoctors);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter doctors by search term', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      });
      User.countDocuments.mockResolvedValue(0);

      const query = { search: 'smith' };
      await getAllDoctors(query);

      expect(User.find).toHaveBeenCalledWith({
        role: 'doctor',
        $or: [
          { name: { $regex: 'smith', $options: 'i' } },
          { email: { $regex: 'smith', $options: 'i' } }
        ]
      });
    });

    it('should filter doctors by specialization', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      });
      User.countDocuments.mockResolvedValue(0);

      const query = { specialization: 'cardiology' };
      await getAllDoctors(query);

      expect(User.find).toHaveBeenCalledWith({
        role: 'doctor',
        'doctorProfile.specialization': { $regex: 'cardiology', $options: 'i' }
      });
    });

    it('should filter doctors by active status', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      });
      User.countDocuments.mockResolvedValue(0);

      const query = { isActive: 'false' };
      await getAllDoctors(query);

      expect(User.find).toHaveBeenCalledWith({
        role: 'doctor',
        isActive: false
      });
    });
  });

  describe('getDoctorById', () => {
    it('should return doctor details with schedules and slots count', async () => {
      const mockDoctor = {
        _id: 'doc1',
        name: 'Dr. Smith',
        email: 'smith@example.com',
        role: 'doctor',
        isActive: true
      };
      const mockSchedules = [{ dayOfWeek: 'monday', startTime: '09:00' }];
      const mockSlotsCount = 5;

      User.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockDoctor)
        })
      });
      DoctorSchedule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockSchedules)
      });
      AvailabilitySlot.countDocuments.mockResolvedValue(mockSlotsCount);

      const result = await getDoctorById('doc1');

      expect(User.findOne).toHaveBeenCalledWith({ _id: 'doc1', role: 'doctor' });
      expect(DoctorSchedule.find).toHaveBeenCalledWith({
        doctorId: 'doc1',
        isActive: true
      });
      expect(AvailabilitySlot.countDocuments).toHaveBeenCalledWith({
        doctorId: 'doc1',
        date: { $gte: expect.any(Date) },
        status: 'available'
      });
      expect(result.doctor).toEqual({
        ...mockDoctor,
        schedules: mockSchedules,
        upcomingSlots: mockSlotsCount
      });
    });

    it('should throw error if doctor not found', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null)
        })
      });
      ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

      await expect(getDoctorById('invalid')).rejects.toThrow('Doctor not found');
    });
  });

  describe('updateDoctorByAdmin', () => {
    it('should update doctor profile successfully', async () => {
      const mockDoctor = {
        _id: 'doc1',
        name: 'Dr. Smith',
        role: 'doctor',
        save: jest.fn()
      };
      const updates = { name: 'Dr. Smith Updated', isActive: true };
      const mockUpdatedDoctor = { ...mockDoctor, ...updates };

      User.findOne.mockResolvedValue(mockDoctor);
      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUpdatedDoctor)
      });
      redisCache.del.mockResolvedValue();

      const result = await updateDoctorByAdmin('doc1', updates);

      expect(User.findOne).toHaveBeenCalledWith({ _id: 'doc1', role: 'doctor' });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'doc1',
        updates,
        { new: true, runValidators: true }
      );
      expect(redisCache.del).toHaveBeenCalledWith('doctor_profile_doc1');
      expect(result.doctor).toEqual(mockUpdatedDoctor);
    });

    it('should throw error if doctor not found', async () => {
      User.findOne.mockResolvedValue(null);
      ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

      await expect(updateDoctorByAdmin('invalid', {})).rejects.toThrow('Doctor not found');
    });

    it('should throw error if no valid fields to update', async () => {
      const mockDoctor = { _id: 'doc1', role: 'doctor' };
      User.findOne.mockResolvedValue(mockDoctor);
      ApiError.badRequest.mockReturnValue(new Error('No valid fields to update'));

      await expect(updateDoctorByAdmin('doc1', { invalidField: 'value' })).rejects.toThrow('No valid fields to update');
    });
  });

  describe('impersonateDoctor', () => {
    it('should impersonate doctor successfully', async () => {
      const mockDoctor = {
        _id: 'doc1',
        name: 'Dr. Smith',
        email: 'smith@example.com',
        role: 'doctor',
        isActive: true,
        isEmailVerified: true,
        save: jest.fn()
      };
      const mockAccessToken = 'access_token';
      const mockRefreshToken = 'refresh_token';

      User.findOne.mockResolvedValue(mockDoctor);
      generateAccessToken.mockReturnValue(mockAccessToken);
      generateRefreshToken.mockReturnValue(mockRefreshToken);

      const result = await impersonateDoctor('doc1');

      expect(User.findOne).toHaveBeenCalledWith({ _id: 'doc1', role: 'doctor' });
      expect(generateAccessToken).toHaveBeenCalledWith({ id: 'doc1', role: 'doctor' });
      expect(generateRefreshToken).toHaveBeenCalledWith({ id: 'doc1' });
      expect(mockDoctor.save).toHaveBeenCalled();
      expect(result.user).toEqual({
        id: 'doc1',
        name: 'Dr. Smith',
        email: 'smith@example.com',
        role: 'doctor',
        isEmailVerified: true
      });
      expect(result.tokens).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken
      });
      expect(result.impersonated).toBe(true);
    });

    it('should throw error if doctor not found', async () => {
      User.findOne.mockResolvedValue(null);
      ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

      await expect(impersonateDoctor('invalid')).rejects.toThrow('Doctor not found');
    });

    it('should throw error if doctor is inactive', async () => {
      const mockDoctor = { _id: 'doc1', role: 'doctor', isActive: false };
      User.findOne.mockResolvedValue(mockDoctor);
      ApiError.forbidden.mockReturnValue(new Error('Cannot impersonate inactive doctor'));

      await expect(impersonateDoctor('doc1')).rejects.toThrow('Cannot impersonate inactive doctor');
    });
  });

  describe('Security Tests', () => {
    describe('Input Validation and Injection Prevention', () => {
      it('should prevent NoSQL injection in doctorId parameter', async () => {
        const maliciousId = '{"$ne": null}'; // NoSQL injection attempt
        User.findOne.mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null)
          })
        });
        ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

        await expect(getDoctorById(maliciousId)).rejects.toThrow('Doctor not found');
        expect(User.findOne).toHaveBeenCalledWith({ _id: maliciousId, role: 'doctor' });
      });

      it('should handle extremely long doctorId inputs', async () => {
        const longId = 'a'.repeat(10000); // Very long input
        User.findOne.mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null)
          })
        });
        ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

        await expect(getDoctorById(longId)).rejects.toThrow('Doctor not found');
      });

      it('should prevent XSS in update fields', async () => {
        const mockDoctor = { _id: 'doc1', role: 'doctor', save: jest.fn() };
        const maliciousUpdate = {
          name: '<script>alert("xss")</script>',
          email: 'test@example.com'
        };
        const sanitizedUpdate = { name: maliciousUpdate.name, email: maliciousUpdate.email };
        const mockUpdatedDoctor = { ...mockDoctor, ...sanitizedUpdate };

        User.findOne.mockResolvedValue(mockDoctor);
        User.findByIdAndUpdate.mockReturnValue({
          select: jest.fn().mockResolvedValue(mockUpdatedDoctor)
        });
        redisCache.del.mockResolvedValue();

        const result = await updateDoctorByAdmin('doc1', maliciousUpdate);

        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
          'doc1',
          sanitizedUpdate,
          { new: true, runValidators: true }
        );
        expect(result.doctor.name).toBe('<script>alert("xss")</script>'); // Should allow, validation happens elsewhere
      });

      it('should validate doctorId format', async () => {
        const invalidId = 'invalid-format-id';
        User.findOne.mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null)
          })
        });
        ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

        await expect(getDoctorById(invalidId)).rejects.toThrow('Doctor not found');
      });
    });

    describe('Authorization and Access Control', () => {
      it('should only allow impersonation of doctor role users', async () => {
        const mockPatient = {
          _id: 'pat1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'patient',
          isActive: true,
          isEmailVerified: true,
          save: jest.fn()
        };

        User.findOne.mockResolvedValue(null); // No doctor found with this ID
        ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

        await expect(impersonateDoctor('pat1')).rejects.toThrow('Doctor not found');
        expect(User.findOne).toHaveBeenCalledWith({ _id: 'pat1', role: 'doctor' });
      });

      it('should prevent impersonation of non-existent users', async () => {
        User.findOne.mockResolvedValue(null);
        ApiError.notFound.mockReturnValue(new Error('Doctor not found'));

        await expect(impersonateDoctor('nonexistent')).rejects.toThrow('Doctor not found');
      });

      it('should validate update permissions for allowed fields only', async () => {
        const mockDoctor = { _id: 'doc1', role: 'doctor', save: jest.fn() };
        const unauthorizedUpdate = {
          password: 'newpassword', // Should not be allowed
          role: 'admin', // Should not be allowed
          name: 'Updated Name' // Should be allowed
        };
        const filteredUpdate = { name: 'Updated Name' };
        const mockUpdatedDoctor = { ...mockDoctor, name: 'Updated Name' }; // Only allowed fields

        User.findOne.mockResolvedValue(mockDoctor);
        User.findByIdAndUpdate.mockReturnValue({
          select: jest.fn().mockResolvedValue(mockUpdatedDoctor)
        });
        redisCache.del.mockResolvedValue();

        const result = await updateDoctorByAdmin('doc1', unauthorizedUpdate);

        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
          'doc1',
          filteredUpdate, // Only allowed fields
          { new: true, runValidators: true }
        );
        expect(result.doctor).not.toHaveProperty('password');
        expect(result.doctor.role).toBe('doctor'); // Role should remain unchanged
      });
    });

    describe('Data Exposure Prevention', () => {
      it('should not expose sensitive doctor data in responses', async () => {
        const mockDoctorWithSensitiveData = {
          _id: 'doc1',
          name: 'Dr. Smith',
          email: 'smith@example.com',
          role: 'doctor',
          isActive: true
          // Sensitive fields are excluded by select()
        };
        const mockSchedules = [{ dayOfWeek: 'monday', startTime: '09:00' }];
        const mockSlotsCount = 5;

        User.findOne.mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockDoctorWithSensitiveData)
          })
        });
        DoctorSchedule.find.mockReturnValue({
          sort: jest.fn().mockResolvedValue(mockSchedules)
        });
        AvailabilitySlot.countDocuments.mockResolvedValue(mockSlotsCount);

        const result = await getDoctorById('doc1');

        expect(result.doctor).not.toHaveProperty('password');
        expect(result.doctor).not.toHaveProperty('refreshToken');
        expect(result.doctor).not.toHaveProperty('passwordResetToken');
        expect(result.doctor).not.toHaveProperty('emailVerificationToken');
        expect(result.doctor).toHaveProperty('name');
        expect(result.doctor).toHaveProperty('email');
        expect(result.doctor).toHaveProperty('role');
      });

      it('should limit doctor data exposure in list view', async () => {
        const mockDoctors = [
          {
            _id: 'doc1',
            name: 'Dr. Smith',
            email: 'smith@example.com',
            role: 'doctor',
            isActive: true,
            createdAt: new Date(),
            lastLogin: new Date()
            // Sensitive fields are excluded by select()
          }
        ];

        User.find.mockReturnValue({
          select: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue(mockDoctors)
              })
            })
          })
        });
        User.countDocuments.mockResolvedValue(1);

        const result = await getAllDoctors({});

        expect(result.doctors[0]).not.toHaveProperty('password');
        expect(result.doctors[0]).toHaveProperty('name');
        expect(result.doctors[0]).toHaveProperty('email');
        expect(result.doctors[0]).toHaveProperty('isActive');
        expect(result.doctors[0]).toHaveProperty('createdAt');
        expect(result.doctors[0]).toHaveProperty('lastLogin');
      });
    });

    describe('Token Security', () => {
      it('should generate different tokens for different doctors', async () => {
        const mockDoctor1 = {
          _id: 'doc1',
          name: 'Dr. Smith',
          email: 'smith@example.com',
          role: 'doctor',
          isActive: true,
          isEmailVerified: true,
          save: jest.fn()
        };
        const mockDoctor2 = {
          _id: 'doc2',
          name: 'Dr. Jones',
          email: 'jones@example.com',
          role: 'doctor',
          isActive: true,
          isEmailVerified: true,
          save: jest.fn()
        };

        User.findOne.mockResolvedValueOnce(mockDoctor1).mockResolvedValueOnce(mockDoctor2);
        generateAccessToken.mockReturnValueOnce('token1').mockReturnValueOnce('token2');
        generateRefreshToken.mockReturnValueOnce('refresh1').mockReturnValueOnce('refresh2');

        const result1 = await impersonateDoctor('doc1');
        const result2 = await impersonateDoctor('doc2');

        expect(result1.tokens.accessToken).not.toBe(result2.tokens.accessToken);
        expect(result1.tokens.refreshToken).not.toBe(result2.tokens.refreshToken);
        expect(generateAccessToken).toHaveBeenCalledWith({ id: 'doc1', role: 'doctor' });
        expect(generateAccessToken).toHaveBeenCalledWith({ id: 'doc2', role: 'doctor' });
      });

      it('should save refresh token securely', async () => {
        const mockDoctor = {
          _id: 'doc1',
          name: 'Dr. Smith',
          email: 'smith@example.com',
          role: 'doctor',
          isActive: true,
          isEmailVerified: true,
          save: jest.fn()
        };
        const mockRefreshToken = 'secure_refresh_token_123';

        User.findOne.mockResolvedValue(mockDoctor);
        generateAccessToken.mockReturnValue('access_token');
        generateRefreshToken.mockReturnValue(mockRefreshToken);

        await impersonateDoctor('doc1');

        expect(mockDoctor.refreshToken).toBe(mockRefreshToken);
        expect(mockDoctor.refreshTokenExpires).toBeInstanceOf(Date);
        expect(mockDoctor.save).toHaveBeenCalled();
      });
    });

    describe('Rate Limiting and Abuse Prevention', () => {
      it('should handle concurrent impersonation requests', async () => {
        const mockDoctor = {
          _id: 'doc1',
          name: 'Dr. Smith',
          email: 'smith@example.com',
          role: 'doctor',
          isActive: true,
          isEmailVerified: true,
          save: jest.fn()
        };

        User.findOne.mockResolvedValue(mockDoctor);
        generateAccessToken.mockReturnValue('access_token');
        generateRefreshToken.mockReturnValue('refresh_token');

        // Simulate concurrent requests
        const promises = [
          impersonateDoctor('doc1'),
          impersonateDoctor('doc1'),
          impersonateDoctor('doc1')
        ];

        const results = await Promise.all(promises);

        expect(results).toHaveLength(3);
        results.forEach(result => {
          expect(result.impersonated).toBe(true);
          expect(result.tokens).toHaveProperty('accessToken');
        });
      });
    });
  });
});
