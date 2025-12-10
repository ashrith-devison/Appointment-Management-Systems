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

// Mock Redis methods
redisCache.del = jest.fn().mockResolvedValue(true);
redisCache.publish = jest.fn().mockResolvedValue(true);

let mongoServer;
let app;
let doctorToken;
let testDoctor;

describe('Doctor Slot Booking Integration Tests', () => {
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

    // Clear mocks
    jest.clearAllMocks();

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

      // Verify Redis cache was cleared
      expect(redisCache.del).toHaveBeenCalledWith(`doctor_slots_${testDoctor._id}`);
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

      // Verify Redis operations
      expect(redisCache.publish).toHaveBeenCalledWith(
        'slot_updates',
        expect.any(Object)
      );
      const publishCall = redisCache.publish.mock.calls.find(call =>
        call[0] === 'slot_updates' && call[1].action === 'block'
      );
      expect(publishCall[1]).toMatchObject({
        slotId: expect.any(Object), // MongoDB ObjectId
        doctorId: expect.any(Object), // MongoDB ObjectId
        action: 'block',
        status: 'blocked'
      });
      expect(redisCache.del).toHaveBeenCalledWith(`doctor_slots_${testDoctor._id}`);
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

      // Verify Redis operations for unblock
      expect(redisCache.publish).toHaveBeenCalledTimes(2); // block + unblock
      const publishCalls = redisCache.publish.mock.calls;
      const unblockCall = publishCalls.find(call =>
        call[0] === 'slot_updates' && call[1].action === 'unblock'
      );
      expect(unblockCall[1]).toMatchObject({
        slotId: expect.any(Object), // MongoDB ObjectId
        doctorId: expect.any(Object), // MongoDB ObjectId
        action: 'unblock',
        status: 'available'
      });
      expect(redisCache.del).toHaveBeenCalledWith(`doctor_slots_${testDoctor._id}`);
    });

    it('should reject slot status change for non-existent slot', async () => {
      const response = await request(app)
        .put('/doctor/slots/507f1f77bcf86cd799439011/status')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'block',
          reason: 'Test'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Slot not found');
    });

    it('should reject blocking already booked slots', async () => {
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

      // Get slots
      const slotsResponse = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const slotId = slotsResponse.body.data.slots[0]._id;

      // Manually set slot to booked status (simulating a booking)
      await AvailabilitySlot.findByIdAndUpdate(slotId, { status: 'booked' });

      // Try to block the booked slot
      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'block',
          reason: 'Doctor unavailable'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Cannot block a booked slot');
    });
  });

  describe('Slot Booking Security', () => {
    let scheduleId;
    let slotId;

    beforeEach(async () => {
      // Create a schedule and generate slots
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

      await request(app)
        .post('/doctor/slots/generate')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-01'
        })
        .expect(200);

      // Get a slot ID for testing
      const slotsResponse = await request(app)
        .get('/doctor/slots')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      slotId = slotsResponse.body.data.slots[0]._id;
    });

    it('should reject unauthorized slot status changes', async () => {
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

    it('should reject slot operations without authentication', async () => {
      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .send({
          action: 'block',
          reason: 'Test'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Access token is required');
    });

    it('should validate slot status action parameter', async () => {
      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'invalid_action',
          reason: 'Test'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid action');
    });

    it('should require reason for blocking slots', async () => {
      const response = await request(app)
        .put(`/doctor/slots/${slotId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          action: 'block'
          // Missing reason
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Reason is required');
    });
  });
});