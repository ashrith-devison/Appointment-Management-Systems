import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import authRoute from '@/routes/auth.route.js';
import doctorRoutes from '@/routes/doctor.routes.js';
import { errorHandler, notFound } from '@/middlewares/error.js';
import User from '@/models/users.model.js';
import DoctorSchedule from '@/models/DoctorSchedule.js';
import AvailabilitySlot from '@/models/AvailabilitySlot.js';

// Mock external services
jest.mock('@/utils/email.js');
jest.mock('@/utils/redis.js');
jest.mock('@/utils/swagger.docs.js');

import { sendEmail } from '@/utils/email.js';
import redisCache from '@/utils/redis.js';

let mongoServer;
let app;
let doctorToken;
let testDoctor;

describe('Doctor Onboarding Integration Tests', () => {
  beforeAll(async () => {
    // Start MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create Express app
    app = express();
    app.use(express.json());

    // Mount routes
    app.use('/auth', authRoute);
    app.use('/doctor', doctorRoutes);

    // Error handling
    app.use(notFound);
    app.use(errorHandler);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all collections
    await User.deleteMany({});
    await DoctorSchedule.deleteMany({});
    await AvailabilitySlot.deleteMany({});

    // Create test doctor
    testDoctor = await User.create({
      name: 'Dr. John Doe',
      email: 'doctor@example.com',
      password: 'password123',
      role: 'doctor',
      isEmailVerified: true,
      doctorProfile: {
        specialization: 'Cardiology',
        licenseNumber: 'DOC123456',
        experience: 5,
        qualifications: ['MBBS', 'MD Cardiology'],
        hospital: 'City Hospital'
      }
    });

    // Login to get token
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: 'doctor@example.com',
        password: 'password123'
      });

    doctorToken = loginResponse.body.data.tokens.accessToken;
  });

  describe('Doctor Profile Management', () => {
    it('should get doctor profile successfully', async () => {
      const response = await request(app)
        .get('/doctor/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.doctor.name).toBe('Dr. John Doe');
      expect(response.body.data.doctor.doctorProfile.specialization).toBe('Cardiology');
      expect(response.body.message).toBe('Doctor profile retrieved successfully');
    });

    it('should update doctor profile successfully', async () => {
      const updates = {
        name: 'Dr. John Smith',
        doctorProfile: {
          specialization: 'Neurology',
          experience: 8,
          hospital: 'Neuro Hospital'
        }
      };

      const response = await request(app)
        .put('/doctor/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.doctor.name).toBe('Dr. John Smith');
      expect(response.body.data.doctor.doctorProfile.specialization).toBe('Neurology');
      expect(response.body.data.doctor.doctorProfile.experience).toBe(8);
      expect(response.body.message).toBe('Doctor profile updated successfully');
    });

    it('should reject profile update with invalid fields', async () => {
      const updates = {
        invalidField: 'value',
        anotherInvalid: 123
      };

      const response = await request(app)
        .put('/doctor/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(updates)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('No valid fields to update');
    });

    it('should reject unauthorized access to doctor profile', async () => {
      const response = await request(app)
        .get('/doctor/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access token is required');
    });
  });

  describe('Doctor Schedule Management', () => {
    it('should create doctor schedule successfully', async () => {
      const scheduleData = {
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00',
        slotDuration: 30,
        breakTimes: [
          { startTime: '12:00', endTime: '13:00' }
        ]
      };

      const response = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(scheduleData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.schedule.dayOfWeek).toBe('monday');
      expect(response.body.data.schedule.startTime).toBe('09:00');
      expect(response.body.data.schedule.endTime).toBe('17:00');
      expect(response.body.data.schedule.slotDuration).toBe(30);
      expect(response.body.message).toBe('Doctor schedule created successfully');
    });

    it('should reject duplicate schedule for same day', async () => {
      const scheduleData = {
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '17:00'
      };

      // Create first schedule
      await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(scheduleData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(scheduleData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule already exists for this day');
    });

    it('should get doctor schedules successfully', async () => {
      // Create a schedule first
      const scheduleData = {
        dayOfWeek: 'tuesday',
        startTime: '10:00',
        endTime: '16:00'
      };

      await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(scheduleData)
        .expect(201);

      // Get schedules
      const response = await request(app)
        .get('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.schedules)).toBe(true);
      expect(response.body.data.schedules.length).toBeGreaterThan(0);
      expect(response.body.data.schedules[0].dayOfWeek).toBe('tuesday');
    });

    it('should update doctor schedule successfully', async () => {
      // Create a schedule first
      const createResponse = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          dayOfWeek: 'wednesday',
          startTime: '09:00',
          endTime: '17:00'
        })
        .expect(201);

      const scheduleId = createResponse.body.data.schedule._id;
      const updates = {
        startTime: '10:00',
        endTime: '18:00',
        slotDuration: 45
      };

      const response = await request(app)
        .put(`/doctor/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.schedule.startTime).toBe('10:00');
      expect(response.body.data.schedule.endTime).toBe('18:00');
      expect(response.body.data.schedule.slotDuration).toBe(45);
    });

    it('should delete doctor schedule successfully', async () => {
      // Create a schedule first
      const createResponse = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          dayOfWeek: 'thursday',
          startTime: '09:00',
          endTime: '17:00'
        })
        .expect(201);

      const scheduleId = createResponse.body.data.schedule._id;

      const response = await request(app)
        .delete(`/doctor/schedule/${scheduleId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Schedule deleted successfully');
    });
  });

  describe('Availability Slots Management', () => {
    let scheduleId;

    beforeEach(async () => {
      // Create a schedule for slot generation
      const scheduleResponse = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          dayOfWeek: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 60
        })
        .expect(201);

      scheduleId = scheduleResponse.body.data.schedule._id;
    });

    it('should generate availability slots successfully', async () => {
      const slotData = {
        scheduleId,
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      };

      const response = await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(slotData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('slots generated successfully');
      expect(typeof response.body.data.slotsCount).toBe('number');
    });

    it('should get doctor slots successfully', async () => {
      // Generate some slots first
      await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-01'
        })
        .expect(200);

      const response = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.slots)).toBe(true);
      expect(response.body.data.pagination).toBeDefined();
      expect(typeof response.body.data.pagination.total).toBe('number');
    });

    it('should filter slots by date', async () => {
      // Generate slots for multiple dates
      await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-07'
        })
        .expect(200);

      const response = await request(app)
        .get('/doctor/slots?date=2024-01-01')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.slots)).toBe(true);
    });

    it('should handle slot generation with invalid date range', async () => {
      const invalidSlotData = {
        scheduleId,
        startDate: '2024-01-01',
        endDate: '2023-01-01' // Start date after end date
      };

      const response = await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(invalidSlotData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Start date cannot be after end date');
    });

    it('should block a slot successfully', async () => {
      // Generate slots first
      await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-01'
        })
        .expect(200);

      // Get slots to find one to block
      const slotsResponse = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const slotId = slotsResponse.body.data.slots[0]._id;

      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'block',
          reason: 'Doctor unavailable'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.slot.status).toBe('blocked');
    });

    it('should unblock a slot successfully', async () => {
      // Generate and block a slot first
      await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-01'
        })
        .expect(200);

      const slotsResponse = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const slotId = slotsResponse.body.data.slots[0]._id;

      await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'block',
          reason: 'Doctor unavailable'
        })
        .expect(200);

      // Now unblock it
      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'unblock'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.slot.status).toBe('available');
    });
  });

  describe('Onboarding Workflow Integration', () => {
    it('should complete full doctor onboarding workflow', async () => {
      // 1. Update profile with complete information
      const profileUpdates = {
        doctorProfile: {
          specialization: 'Pediatrics',
          licenseNumber: 'PED123456',
          experience: 10,
          qualifications: ['MBBS', 'MD Pediatrics', 'Fellowship in Neonatology'],
          hospital: 'Children\'s Hospital',
          availability: {
            days: ['monday', 'wednesday', 'friday'],
            hours: {
              start: '08:00',
              end: '16:00'
            }
          }
        }
      };

      await request(app)
        .put('/doctor/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(profileUpdates)
        .expect(200);

      // 2. Create multiple schedules
      const schedules = [
        { dayOfWeek: 'monday', startTime: '08:00', endTime: '16:00', slotDuration: 30 },
        { dayOfWeek: 'wednesday', startTime: '08:00', endTime: '16:00', slotDuration: 30 },
        { dayOfWeek: 'friday', startTime: '08:00', endTime: '16:00', slotDuration: 30 }
      ];

      const scheduleIds = [];
      for (const schedule of schedules) {
        const response = await request(app)
          .post('/doctor/schedule')
          .set('Authorization', `Bearer ${doctorToken}`)
          .send(schedule)
          .expect(201);
        scheduleIds.push(response.body.data.schedule._id);
      }

      // 3. Generate availability slots for next 2 weeks
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = twoWeeksFromNow.toISOString().split('T')[0];

      for (const scheduleId of scheduleIds) {
        await request(app)
          .post('/doctor/slots/generate')
          .set('Authorization', `Bearer ${doctorToken}`)
          .send({
            scheduleId,
            startDate,
            endDate
          })
          .expect(200);
      }

      // 4. Verify onboarding completion
      const profileResponse = await request(app)
        .get('/doctor/profile')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const schedulesResponse = await request(app)
        .get('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const slotsResponse = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      // Assertions
      expect(profileResponse.body.data.doctor.doctorProfile.specialization).toBe('Pediatrics');
      expect(profileResponse.body.data.doctor.doctorProfile.licenseNumber).toBe('PED123456');
      expect(schedulesResponse.body.data.schedules.length).toBe(3);
      expect(slotsResponse.body.data.slots.length).toBeGreaterThan(0);
      expect(slotsResponse.body.data.pagination.total).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid schedule data', async () => {
      const invalidSchedule = {
        dayOfWeek: 'invalid_day',
        startTime: '25:00', // Invalid time
        endTime: '17:00'
      };

      const response = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(invalidSchedule)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle non-existent schedule ID in slot generation', async () => {
      const slotData = {
        scheduleId: '507f1f77bcf86cd799439011', // Non-existent ID
        startDate: '2024-01-01',
        endDate: '2024-01-01'
      };

      const response = await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(slotData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Schedule not found');
    });

    it('should handle unauthorized slot status changes', async () => {
      // Create another doctor
      const otherDoctor = await User.create({
        name: 'Dr. Jane Smith',
        email: 'jane@example.com',
        password: 'password123',
        role: 'doctor',
        isEmailVerified: true
      });

      // Login as other doctor
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: 'jane@example.com',
          password: 'password123'
        });

      const otherDoctorToken = loginResponse.body.data.tokens.accessToken;

      // Create schedule and slots for first doctor
      const scheduleResponse = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          dayOfWeek: 'monday',
          startTime: '09:00',
          endTime: '17:00'
        })
        .expect(201);

      const scheduleId = scheduleResponse.body.data.schedule._id;

      await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-01'
        })
        .expect(200);

      // Get slots
      const slotsResponse = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const slotId = slotsResponse.body.data.slots[0]._id;

      // Try to modify slot as different doctor
      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${otherDoctorToken}`)
        .send({
          action: 'block',
          reason: 'Test'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not authorized to modify this slot');
    });
  });
});