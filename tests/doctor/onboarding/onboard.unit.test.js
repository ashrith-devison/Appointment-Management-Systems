import { jest } from '@jest/globals';
import {
  getDoctorProfile,
  updateDoctorProfile,
  createDoctorSchedule,
  getDoctorSchedules,
  updateDoctorSchedule,
  deleteDoctorSchedule,
  generateAvailabilitySlots,
  getDoctorSlots,
  updateSlotStatus,
  bulkUpdateSlotStatus
} from '@/controllers/doctor/doctor.controller.js';

// Mock dependencies
jest.mock('@/models/users.model.js');
jest.mock('@/models/DoctorSchedule.js');
jest.mock('@/models/AvailabilitySlot.js');
jest.mock('@/utils/ApiError.util.js');
jest.mock('@/utils/redis.js');

import User from '@/models/users.model.js';
import DoctorSchedule from '@/models/DoctorSchedule.js';
import AvailabilitySlot from '@/models/AvailabilitySlot.js';
import ApiError from '@/utils/ApiError.util.js';
import redisCache from '@/utils/redis.js';

describe('Doctor Onboarding Unit Tests', () => {
  let mockDoctor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDoctor = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Dr. John Doe',
      email: 'john.doe@example.com',
      role: 'doctor'
    };

    // Mock redis methods
    redisCache.del = jest.fn().mockResolvedValue(true);
    redisCache.get = jest.fn().mockResolvedValue(null);
    redisCache.set = jest.fn().mockResolvedValue(true);
    redisCache.publish = jest.fn().mockResolvedValue(true);

    // Mock Mongoose query chaining
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn()
    };

    User.findById = jest.fn().mockReturnValue(mockQuery);
    User.findByIdAndUpdate = jest.fn().mockReturnValue(mockQuery);
    DoctorSchedule.find = jest.fn().mockReturnValue(mockQuery);
    DoctorSchedule.findOne = jest.fn().mockReturnValue(mockQuery);
    DoctorSchedule.findById = jest.fn().mockReturnValue(mockQuery);
    DoctorSchedule.findByIdAndDelete = jest.fn().mockReturnValue(mockQuery);
    AvailabilitySlot.find = jest.fn().mockReturnValue(mockQuery);
    AvailabilitySlot.findById = jest.fn().mockReturnValue(mockQuery);
    AvailabilitySlot.findByIdAndUpdate = jest.fn().mockReturnValue(mockQuery);
    AvailabilitySlot.countDocuments = jest.fn().mockReturnValue(mockQuery);
    AvailabilitySlot.insertMany = jest.fn().mockResolvedValue([]);
    AvailabilitySlot.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
  });

  describe('getDoctorProfile', () => {
    it('should return doctor profile successfully', async () => {
      const mockDoctorData = {
        _id: mockDoctor._id,
        name: mockDoctor.name,
        email: mockDoctor.email,
        role: mockDoctor.role,
        doctorProfile: { specialization: 'Cardiology' },
        isEmailVerified: true,
        createdAt: new Date(),
        lastLogin: new Date()
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockDoctorData)
        })
      });

      const result = await getDoctorProfile(mockDoctor);

      expect(User.findById).toHaveBeenCalledWith(mockDoctor._id);
      expect(result).toEqual({ doctor: mockDoctorData });
    });

    it('should throw not found error when doctor does not exist', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null)
        })
      });

      ApiError.notFound = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(getDoctorProfile(mockDoctor)).rejects.toThrow('Doctor not found');
    });
  });

  describe('updateDoctorProfile', () => {
    it('should update doctor profile successfully', async () => {
      const updates = {
        name: 'Dr. John Smith',
        doctorProfile: { specialization: 'Neurology', experience: 10 }
      };

      const mockUpdatedDoctor = {
        _id: mockDoctor._id,
        name: updates.name,
        email: mockDoctor.email,
        role: mockDoctor.role,
        doctorProfile: updates.doctorProfile,
        isEmailVerified: true
      };

      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUpdatedDoctor)
      });

      const result = await updateDoctorProfile(mockDoctor, updates);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockDoctor._id,
        {
          name: updates.name,
          doctorProfile: updates.doctorProfile
        },
        { new: true, runValidators: true }
      );
      expect(redisCache.del).toHaveBeenCalledWith(`doctor_profile_${mockDoctor._id}`);
      expect(result).toEqual({ doctor: mockUpdatedDoctor });
    });

    it('should throw bad request error when no valid fields to update', async () => {
      const updates = { invalidField: 'value' };

      ApiError.badRequest = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(updateDoctorProfile(mockDoctor, updates)).rejects.toThrow('No valid fields to update');
    });

    it('should filter out invalid fields', async () => {
      const updates = {
        name: 'Dr. John Smith',
        invalidField: 'value',
        doctorProfile: { specialization: 'Neurology' }
      };

      const mockUpdatedDoctor = {
        _id: mockDoctor._id,
        name: updates.name,
        doctorProfile: updates.doctorProfile
      };

      User.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUpdatedDoctor)
      });

      await updateDoctorProfile(mockDoctor, updates);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockDoctor._id,
        {
          name: updates.name,
          doctorProfile: updates.doctorProfile
        },
        { new: true, runValidators: true }
      );
    });
  });

  describe('createDoctorSchedule', () => {
    it('should create doctor schedule successfully', async () => {
      const scheduleData = {
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        breakTimes: [{ startTime: '12:00', endTime: '13:00' }]
      };

      const mockSchedule = {
        _id: '507f1f77bcf86cd799439012',
        doctorId: mockDoctor._id,
        ...scheduleData
      };

      DoctorSchedule.findOne.mockResolvedValue(null);
      const mockScheduleInstance = { ...mockSchedule, save: jest.fn().mockResolvedValue(mockSchedule) };
      DoctorSchedule.mockImplementation(() => mockScheduleInstance);

      const result = await createDoctorSchedule(mockDoctor, scheduleData);

      expect(DoctorSchedule.findOne).toHaveBeenCalledWith({
        doctorId: mockDoctor._id,
        dayOfWeek: scheduleData.dayOfWeek
      });
      expect(mockScheduleInstance.save).toHaveBeenCalled();
      expect(redisCache.del).toHaveBeenCalledWith(`doctor_schedule_${mockDoctor._id}`);
      expect(result.schedule).toMatchObject(mockSchedule);
    });

    it('should throw conflict error when schedule already exists for the day', async () => {
      const scheduleData = {
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00'
      };

      const existingSchedule = {
        _id: '507f1f77bcf86cd799439012',
        doctorId: mockDoctor._id,
        dayOfWeek: 'monday'
      };

      DoctorSchedule.findOne.mockResolvedValue(existingSchedule);

      ApiError.conflict = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(createDoctorSchedule(mockDoctor, scheduleData)).rejects.toThrow('Schedule already exists for this day');
    });

    it('should use default slot duration when not provided', async () => {
      const scheduleData = {
        dayOfWeek: 'tuesday',
        startTime: '09:00',
        endTime: '17:00'
      };

      DoctorSchedule.findOne.mockResolvedValue(null);
      DoctorSchedule.prototype.save = jest.fn().mockResolvedValue({});

      await createDoctorSchedule(mockDoctor, scheduleData);

      expect(DoctorSchedule).toHaveBeenCalledWith({
        doctorId: mockDoctor._id,
        dayOfWeek: scheduleData.dayOfWeek,
        startTime: scheduleData.startTime,
        endTime: scheduleData.endTime,
        slotDuration: 30,
        breakTimes: []
      });
    });
  });

  describe('getDoctorSchedules', () => {
    it('should return cached schedules when available', async () => {
      const cachedSchedules = [
        { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' }
      ];

      redisCache.get.mockResolvedValue(cachedSchedules);

      const result = await getDoctorSchedules(mockDoctor);

      expect(redisCache.get).toHaveBeenCalledWith(`doctor_schedules_${mockDoctor._id}`);
      expect(DoctorSchedule.find).not.toHaveBeenCalled();
      expect(result).toEqual({ schedules: cachedSchedules });
    });

    it('should fetch and cache schedules when not cached', async () => {
      const schedules = [
        { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 'tuesday', startTime: '10:00', endTime: '16:00' }
      ];

      redisCache.get.mockResolvedValue(null);
      DoctorSchedule.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(schedules)
      });

      const result = await getDoctorSchedules(mockDoctor);

      expect(DoctorSchedule.find).toHaveBeenCalledWith({
        doctorId: mockDoctor._id,
        isActive: true
      });
      expect(redisCache.set).toHaveBeenCalledWith(`doctor_schedules_${mockDoctor._id}`, schedules, 3600);
      expect(result).toEqual({ schedules });
    });
  });

  describe('updateDoctorSchedule', () => {
    it('should update doctor schedule successfully', async () => {
      const scheduleId = '507f1f77bcf86cd799439012';
      const updates = {
        startTime: '10:00',
        endTime: '18:00',
        slotDuration: 45
      };

      const mockSchedule = {
        _id: scheduleId,
        doctorId: mockDoctor._id,
        dayOfWeek: 'monday',
        save: jest.fn().mockResolvedValue()
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);

      const result = await updateDoctorSchedule(mockDoctor, scheduleId, updates);

      expect(DoctorSchedule.findOne).toHaveBeenCalledWith({
        _id: scheduleId,
        doctorId: mockDoctor._id
      });
      expect(mockSchedule.save).toHaveBeenCalled();
      expect(redisCache.del).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ schedule: mockSchedule });
    });

    it('should throw not found error when schedule does not exist', async () => {
      const scheduleId = '507f1f77bcf86cd799439012';

      DoctorSchedule.findOne.mockResolvedValue(null);

      ApiError.notFound = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(updateDoctorSchedule(mockDoctor, scheduleId, {})).rejects.toThrow('Schedule not found');
    });

    it('should filter out invalid fields', async () => {
      const scheduleId = '507f1f77bcf86cd799439012';
      const updates = {
        startTime: '10:00',
        invalidField: 'value',
        slotDuration: 45
      };

      const mockSchedule = {
        _id: scheduleId,
        doctorId: mockDoctor._id,
        save: jest.fn().mockResolvedValue()
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);

      await updateDoctorSchedule(mockDoctor, scheduleId, updates);

      expect(mockSchedule.startTime).toBe('10:00');
      expect(mockSchedule.slotDuration).toBe(45);
      expect(mockSchedule.invalidField).toBeUndefined();
    });
  });

  describe('deleteDoctorSchedule', () => {
    it('should delete doctor schedule successfully', async () => {
      const scheduleId = '507f1f77bcf86cd799439012';

      const mockSchedule = {
        _id: scheduleId,
        doctorId: mockDoctor._id
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);
      AvailabilitySlot.countDocuments.mockResolvedValue(0);
      DoctorSchedule.findByIdAndDelete.mockResolvedValue(mockSchedule);

      const result = await deleteDoctorSchedule(mockDoctor, scheduleId);

      expect(DoctorSchedule.findOne).toHaveBeenCalledWith({
        _id: scheduleId,
        doctorId: mockDoctor._id
      });
      expect(AvailabilitySlot.countDocuments).toHaveBeenCalled();
      expect(DoctorSchedule.findByIdAndDelete).toHaveBeenCalledWith(scheduleId);
      expect(redisCache.del).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Schedule deleted successfully' });
    });

    it('should throw not found error when schedule does not exist', async () => {
      const scheduleId = '507f1f77bcf86cd799439012';

      DoctorSchedule.findOne.mockResolvedValue(null);

      ApiError.notFound = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(deleteDoctorSchedule(mockDoctor, scheduleId)).rejects.toThrow('Schedule not found');
    });

    it('should throw bad request error when schedule has future appointments', async () => {
      const scheduleId = '507f1f77bcf86cd799439012';

      const mockSchedule = {
        _id: scheduleId,
        doctorId: mockDoctor._id
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);
      AvailabilitySlot.countDocuments.mockResolvedValue(5); // Future appointments exist

      ApiError.badRequest = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(deleteDoctorSchedule(mockDoctor, scheduleId)).rejects.toThrow('Cannot delete schedule with future appointments. Cancel all appointments first.');
    });
  });

  describe('generateAvailabilitySlots', () => {
    it('should generate availability slots successfully', async () => {
      const slotData = {
        scheduleId: '507f1f77bcf86cd799439012',
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      };

      const mockSchedule = {
        _id: slotData.scheduleId,
        doctorId: mockDoctor._id,
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        breakTimes: [],
        isActive: true
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);
      AvailabilitySlot.countDocuments.mockResolvedValue(0);
      AvailabilitySlot.insertMany.mockResolvedValue([]);

      const result = await generateAvailabilitySlots(mockDoctor, slotData);

      expect(DoctorSchedule.findOne).toHaveBeenCalledWith({
        _id: slotData.scheduleId,
        doctorId: mockDoctor._id,
        isActive: true
      });
      expect(AvailabilitySlot.insertMany).toHaveBeenCalled();
      expect(redisCache.del).toHaveBeenCalledWith(`doctor_slots_${mockDoctor._id}`);
      expect(result.message).toContain('slots generated successfully');
    });

    it('should throw not found error when schedule does not exist', async () => {
      const slotData = {
        scheduleId: '507f1f77bcf86cd799439012',
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      };

      DoctorSchedule.findOne.mockResolvedValue(null);

      ApiError.notFound = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(generateAvailabilitySlots(mockDoctor, slotData)).rejects.toThrow('Schedule not found');
    });

    it('should throw bad request error for invalid date range', async () => {
      const slotData = {
        scheduleId: '507f1f77bcf86cd799439012',
        startDate: '2024-01-02',
        endDate: '2024-01-01' // Start date after end date
      };

      const mockSchedule = {
        _id: slotData.scheduleId,
        doctorId: mockDoctor._id,
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        breakTimes: [],
        isActive: true
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);

      ApiError.badRequest = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(generateAvailabilitySlots(mockDoctor, slotData)).rejects.toThrow('Start date cannot be after end date');
    });

    it('should skip existing slots when overrideExisting is false', async () => {
      const slotData = {
        scheduleId: '507f1f77bcf86cd799439012',
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      };

      const mockSchedule = {
        _id: slotData.scheduleId,
        doctorId: mockDoctor._id,
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        breakTimes: [],
        isActive: true
      };

      DoctorSchedule.findOne.mockResolvedValue(mockSchedule);
      AvailabilitySlot.countDocuments.mockResolvedValue(5); // Existing slots

      const result = await generateAvailabilitySlots(mockDoctor, slotData);

      expect(AvailabilitySlot.insertMany).not.toHaveBeenCalled();
      expect(result.slotsCount).toBe(0);
    });
  });

  describe('getDoctorSlots', () => {
    it('should return doctor slots with pagination', async () => {
      const query = { page: 1, limit: 10 };
      const mockSlots = [
        { _id: '1', date: new Date(), startTime: '09:00', status: 'available' },
        { _id: '2', date: new Date(), startTime: '09:30', status: 'available' }
      ];

      AvailabilitySlot.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockSlots)
            })
          })
        })
      });

      AvailabilitySlot.countDocuments.mockResolvedValue(2);

      const result = await getDoctorSlots(mockDoctor, query);

      expect(AvailabilitySlot.find).toHaveBeenCalledWith({ doctorId: mockDoctor._id });
      expect(result.slots).toEqual(mockSlots);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.totalPages).toBe(1);
    });

    it('should filter slots by date when provided', async () => {
      const query = { date: '2024-01-01' };
      const mockSlots = [];

      AvailabilitySlot.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(mockSlots)
            })
          })
        })
      });

      AvailabilitySlot.countDocuments.mockResolvedValue(0);

      await getDoctorSlots(mockDoctor, query);

      expect(AvailabilitySlot.find).toHaveBeenCalledWith({
        doctorId: mockDoctor._id,
        date: expect.any(Object)
      });
    });
  });

  describe('updateSlotStatus', () => {
    it('should block slot successfully', async () => {
      const slotId = '507f1f77bcf86cd799439012';
      const mockSlot = {
        _id: slotId,
        doctorId: mockDoctor._id,
        status: 'available',
        blockSlot: jest.fn().mockResolvedValue()
      };

      AvailabilitySlot.findById.mockResolvedValue(mockSlot);

      const result = await updateSlotStatus(mockDoctor, slotId, 'block', 'Doctor unavailable');

      expect(mockSlot.blockSlot).toHaveBeenCalledWith(mockDoctor._id, 'Doctor unavailable');
      expect(redisCache.publish).toHaveBeenCalled();
      expect(result).toEqual({ slot: mockSlot });
    });

    it('should unblock slot successfully', async () => {
      const slotId = '507f1f77bcf86cd799439012';
      const mockSlot = {
        _id: slotId,
        doctorId: mockDoctor._id,
        status: 'blocked',
        unblockSlot: jest.fn().mockResolvedValue()
      };

      AvailabilitySlot.findById.mockResolvedValue(mockSlot);

      const result = await updateSlotStatus(mockDoctor, slotId, 'unblock');

      expect(mockSlot.unblockSlot).toHaveBeenCalled();
      expect(result).toEqual({ slot: mockSlot });
    });

    it('should throw not found error when slot does not exist', async () => {
      const slotId = '507f1f77bcf86cd799439012';

      AvailabilitySlot.findById.mockResolvedValue(null);

      ApiError.notFound = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(updateSlotStatus(mockDoctor, slotId, 'block')).rejects.toThrow('Slot not found');
    });

    it('should throw forbidden error when user is not authorized', async () => {
      const slotId = '507f1f77bcf86cd799439012';
      const unauthorizedUser = { role: 'patient', _id: 'different_id' };

      const mockSlot = {
        _id: slotId,
        doctorId: mockDoctor._id,
        status: 'available'
      };

      AvailabilitySlot.findById.mockResolvedValue(mockSlot);

      ApiError.forbidden = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(updateSlotStatus(unauthorizedUser, slotId, 'block')).rejects.toThrow('Not authorized to modify this slot');
    });

    it('should throw bad request error when trying to block booked slot', async () => {
      const slotId = '507f1f77bcf86cd799439012';
      const mockSlot = {
        _id: slotId,
        doctorId: mockDoctor._id,
        status: 'booked'
      };

      AvailabilitySlot.findById.mockResolvedValue(mockSlot);

      ApiError.badRequest = jest.fn().mockImplementation((message) => {
        throw new Error(message);
      });

      await expect(updateSlotStatus(mockDoctor, slotId, 'block')).rejects.toThrow('Cannot block a booked slot');
    });
  });

  describe('bulkUpdateSlotStatus', () => {
    it('should process bulk slot updates successfully', async () => {
      const slotUpdates = [
        { slotId: 'slot1', action: 'block', reason: 'Holiday' },
        { slotId: 'slot2', action: 'unblock' }
      ];

      const mockSlot1 = {
        _id: 'slot1',
        doctorId: mockDoctor._id,
        status: 'available',
        blockSlot: jest.fn().mockResolvedValue()
      };

      const mockSlot2 = {
        _id: 'slot2',
        doctorId: mockDoctor._id,
        status: 'blocked',
        unblockSlot: jest.fn().mockResolvedValue()
      };

      AvailabilitySlot.findById
        .mockResolvedValueOnce(mockSlot1)
        .mockResolvedValueOnce(mockSlot2);

      const result = await bulkUpdateSlotStatus(mockDoctor, slotUpdates);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed success and error results', async () => {
      const slotUpdates = [
        { slotId: 'slot1', action: 'block' },
        { slotId: 'slot2', action: 'invalid_action' }
      ];

      const mockSlot1 = {
        _id: 'slot1',
        doctorId: mockDoctor._id,
        status: 'available',
        blockSlot: jest.fn().mockResolvedValue()
      };

      AvailabilitySlot.findById
        .mockResolvedValueOnce(mockSlot1)
        .mockResolvedValueOnce(null); // Second slot not found

      const result = await bulkUpdateSlotStatus(mockDoctor, slotUpdates);

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].slotId).toBe('slot2');
    });
  });
});