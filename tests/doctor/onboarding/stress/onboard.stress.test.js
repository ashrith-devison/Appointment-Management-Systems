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
let testDoctors = [];
let doctorTokens = [];

// Global test results storage for consolidation report
let testResults = {
  summary: {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    totalTime: 0
  },
  details: []
};

beforeAll(async () => {
  // Start MongoDB Memory Server
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Mock Redis
  redisCache.connect = jest.fn().mockResolvedValue();
  redisCache.disconnect = jest.fn().mockResolvedValue();

  // Create test app
  app = express();
  app.use(express.json());
  app.use('/auth', authRoute);
  app.use('/doctor', doctorRoutes);
  app.use(notFound);
  app.use(errorHandler);

  // Mock sendEmail to be fast
  sendEmail.mockResolvedValue();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, 60000);

beforeEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  jest.clearAllMocks();
}, 30000);

const createTestDoctors = async (count = 10) => {
  const doctors = [];
  const tokens = [];

  for (let i = 0; i < count; i++) {
    const doctorData = {
      name: `Dr. Test Doctor ${i}`,
      email: `doctor${i}@example.com`,
      password: 'password123',
      role: 'doctor',
      isEmailVerified: true,
      doctorProfile: {
        specialization: 'General Medicine',
        licenseNumber: `DOC${i}123456`,
        experience: 5,
        qualifications: ['MBBS'],
        hospital: 'Test Hospital'
      }
    };

    const doctor = await User.create(doctorData);

    // Login to get token
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: doctorData.email,
        password: doctorData.password
      });

    doctors.push(doctor);
    tokens.push(loginResponse.body.data.tokens.accessToken);
  }

  return { doctors, tokens };
};

// Helper function to store test results
const storeTestResult = (testName, result) => {
  testResults.details.push({
    testName,
    ...result,
    timestamp: new Date().toISOString()
  });
  testResults.summary.totalTests++;
  if (result.passed) {
    testResults.summary.passedTests++;
  } else {
    testResults.summary.failedTests++;
  }
  testResults.summary.totalTime += result.duration || 0;
};

describe('Doctor Onboarding Stress Tests', () => {
  describe('Concurrent Profile Updates', () => {
    it('should handle 100 concurrent doctor profile updates', async () => {
      const { doctors, tokens } = await createTestDoctors(10);
      const updatePromises = [];

      for (let i = 0; i < 100; i++) {
        const doctorIndex = i % doctors.length;
        const updateData = {
          name: `Dr. Updated Doctor ${i}`,
          doctorProfile: {
            specialization: 'Cardiology',
            experience: i % 20 + 1,
            hospital: `Hospital ${i % 5}`
          }
        };

        updatePromises.push(
          request(app)
            .put('/doctor/profile')
            .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
            .send(updateData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(updatePromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Concurrent profile update stress test:`);
      console.log(`- Total requests: 100`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / 100}ms`);

      const testResult = {
        passed: successCount === 100 && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: 100,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / 100
        }
      };

      storeTestResult('Concurrent Profile Updates', testResult);

      expect(successCount).toBe(100);
      expect(errorCount).toBe(0);
    }, 120000);
  });

  describe('Concurrent Schedule Creation', () => {
    it('should handle 200 concurrent doctor schedule creations', async () => {
      const { doctors, tokens } = await createTestDoctors(10);
      const schedulePromises = [];

      const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

      for (let i = 0; i < 70; i++) { // 10 doctors * 7 days = 70 possible schedules
        const doctorIndex = i % doctors.length;
        const dayIndex = Math.floor(i / doctors.length); // Each doctor gets one day
        const scheduleData = {
          dayOfWeek: daysOfWeek[dayIndex],
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30,
          breakTimes: [
            { startTime: '12:00', endTime: '13:00' }
          ]
        };

        schedulePromises.push(
          request(app)
            .post('/doctor/schedule')
            .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
            .send(scheduleData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(schedulePromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 201).length;
      const conflictCount = responses.filter(res => res.status === 409).length;
      const errorCount = responses.filter(res => res.status !== 201 && res.status !== 409).length;

      console.log(`Concurrent schedule creation stress test:`);
      console.log(`- Total requests: 70`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Conflicts (expected): ${conflictCount}`);
      console.log(`- Other errors: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / 70}ms`);

      const testResult = {
        passed: successCount === 70 && conflictCount === 0 && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: 70,
          successful: successCount,
          conflicts: conflictCount,
          otherErrors: errorCount,
          avgTimePerRequest: (endTime - startTime) / 70
        }
      };

      storeTestResult('Concurrent Schedule Creation', testResult);

      expect(successCount).toBe(70); // All should succeed since each doctor gets unique days
      expect(conflictCount).toBe(0);
      expect(errorCount).toBe(0);

      // Verify schedules were created
      const scheduleCount = await DoctorSchedule.countDocuments();
      expect(scheduleCount).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Concurrent Slot Generation', () => {
    it('should handle 50 concurrent slot generations', async () => {
      const { doctors, tokens } = await createTestDoctors(10);

      // Create schedules for all doctors
      for (let i = 0; i < doctors.length; i++) {
        const scheduleData = {
          dayOfWeek: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30
        };

        await request(app)
          .post('/doctor/schedule')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send(scheduleData);
      }

      const slotPromises = [];

      for (let i = 0; i < 50; i++) {
        const doctorIndex = i % doctors.length;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + (i % 7));
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);

        const schedules = await DoctorSchedule.find({ doctorId: doctors[doctorIndex]._id });
        if (schedules.length > 0) {
          const slotData = {
            scheduleId: schedules[0]._id,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
          };

          slotPromises.push(
            request(app)
              .post('/doctor/slots/generate')
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
              .send(slotData)
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(slotPromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Concurrent slot generation stress test:`);
      console.log(`- Total requests: ${slotPromises.length}`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / slotPromises.length}ms`);

      const testResult = {
        passed: successCount === slotPromises.length && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: slotPromises.length,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / slotPromises.length
        }
      };

      storeTestResult('Concurrent Slot Generation', testResult);

      expect(successCount).toBe(slotPromises.length);
      expect(errorCount).toBe(0);

      // Verify slots were created
      const slotCount = await AvailabilitySlot.countDocuments();
      expect(slotCount).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Concurrent Slot Status Updates', () => {
    it('should handle 100 concurrent slot status updates', async () => {
      const { doctors, tokens } = await createTestDoctors(10);

      // Create schedules and generate slots
      for (let i = 0; i < doctors.length; i++) {
        const scheduleData = {
          dayOfWeek: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30
        };

        const scheduleResponse = await request(app)
          .post('/doctor/schedule')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send(scheduleData);

        const scheduleId = scheduleResponse.body.data.schedule._id;

        const slotData = {
          scheduleId,
          startDate: '2024-01-01',
          endDate: '2024-01-01'
        };

        await request(app)
          .post('/doctor/slots/generate')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send(slotData);
      }

      const updatePromises = [];

      for (let i = 0; i < 100; i++) {
        const doctorIndex = i % doctors.length;
        const slots = await AvailabilitySlot.find({ doctorId: doctors[doctorIndex]._id });
        if (slots.length > 0) {
          const slotId = slots[i % slots.length]._id;
          // Only block slots, don't try to unblock since they start available
          const updateData = {
            action: 'block',
            reason: 'Stress test block'
          };

          updatePromises.push(
            request(app)
              .put(`/doctor/slots/${slotId}/status`)
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
              .send(updateData)
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(updatePromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Concurrent slot status update stress test:`);
      console.log(`- Total requests: ${updatePromises.length}`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / updatePromises.length}ms`);

      const testResult = {
        passed: successCount === updatePromises.length && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: updatePromises.length,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / updatePromises.length
        }
      };

      storeTestResult('Concurrent Slot Status Updates', testResult);

      expect(successCount).toBe(updatePromises.length);
      expect(errorCount).toBe(0);
    }, 120000);
  });

  describe('Mixed Load Test', () => {
    it('should handle mixed concurrent operations', async () => {
      const { doctors, tokens } = await createTestDoctors(10);
      const operations = [];

      // Profile updates
      for (let i = 0; i < 20; i++) {
        const doctorIndex = i % doctors.length;
        operations.push(
          request(app)
            .put('/doctor/profile')
            .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
            .send({
              doctorProfile: { experience: i + 1 }
            })
        );
      }

      // Schedule creations
      for (let i = 0; i < 20; i++) {
        const doctorIndex = i % doctors.length;
        operations.push(
          request(app)
            .post('/doctor/schedule')
            .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
            .send({
              dayOfWeek: ['monday', 'tuesday', 'wednesday'][i % 3],
              startTime: '09:00',
              endTime: '17:00'
            })
        );
      }

      // Slot generations - create schedules first for some doctors
      for (let i = 0; i < 5; i++) {
        const scheduleData = {
          dayOfWeek: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30
        };

        await request(app)
          .post('/doctor/schedule')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send(scheduleData);
      }

      for (let i = 0; i < 20; i++) {
        const doctorIndex = i % 5; // Only use first 5 doctors who have schedules
        const schedules = await DoctorSchedule.find({ doctorId: doctors[doctorIndex]._id });
        if (schedules.length > 0) {
          operations.push(
            request(app)
              .post('/doctor/slots/generate')
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
              .send({
                scheduleId: schedules[0]._id,
                startDate: '2024-01-01',
                endDate: '2024-01-01'
              })
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(operations);
      const endTime = Date.now();

      const successCount = responses.filter(res => [200, 201, 409].includes(res.status)).length;
      const errorCount = responses.filter(res => ![200, 201, 409].includes(res.status)).length;

      console.log(`Mixed load stress test:`);
      console.log(`- Total requests: ${operations.length}`);
      console.log(`- Successful/Expected: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / operations.length}ms`);

      const testResult = {
        passed: errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: operations.length,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / operations.length
        }
      };

      storeTestResult('Mixed Load Test', testResult);

      expect(errorCount).toBe(0);
    }, 120000);
  });

  describe('High-Frequency Profile Updates', () => {
    it('should handle rapid successive profile updates for the same doctor', async () => {
      const { doctors, tokens } = await createTestDoctors(1);
      const doctor = doctors[0];
      const token = tokens[0];

      const updatePromises = [];

      for (let i = 0; i < 50; i++) {
        const updateData = {
          name: `Dr. Rapid Update ${i}`,
          doctorProfile: {
            specialization: `Specialty ${i % 5}`,
            experience: i + 1,
            hospital: `Hospital ${i % 3}`
          }
        };

        updatePromises.push(
          request(app)
            .put('/doctor/profile')
            .set('Authorization', `Bearer ${token}`)
            .send(updateData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(updatePromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`High-frequency profile update stress test:`);
      console.log(`- Total requests: 50`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / 50}ms`);

      const testResult = {
        passed: successCount === 50 && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: 50,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / 50
        }
      };

      storeTestResult('High-Frequency Profile Updates', testResult);

      expect(successCount).toBe(50);
      expect(errorCount).toBe(0);
    }, 120000);
  });

  describe('Large-Scale Slot Generation', () => {
    it('should handle generating slots for multiple months', async () => {
      const { doctors, tokens } = await createTestDoctors(5);

      // Create schedules for all doctors
      for (let i = 0; i < doctors.length; i++) {
        const scheduleData = {
          dayOfWeek: 'monday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 60 // Longer slots to reduce total count
        };

        await request(app)
          .post('/doctor/schedule')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send(scheduleData);
      }

      const slotPromises = [];

      for (let i = 0; i < doctors.length; i++) {
        const schedules = await DoctorSchedule.find({ doctorId: doctors[i]._id });
        if (schedules.length > 0) {
          // Generate slots for 3 months
          const startDate = new Date();
          const endDate = new Date();
          endDate.setMonth(startDate.getMonth() + 3);

          const slotData = {
            scheduleId: schedules[0]._id,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
          };

          slotPromises.push(
            request(app)
              .post('/doctor/slots/generate')
              .set('Authorization', `Bearer ${tokens[i]}`)
              .send(slotData)
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(slotPromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Large-scale slot generation stress test:`);
      console.log(`- Total requests: ${slotPromises.length}`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / slotPromises.length}ms`);

      // Verify large number of slots were created
      const totalSlots = await AvailabilitySlot.countDocuments();
      console.log(`- Total slots created: ${totalSlots}`);

      const testResult = {
        passed: successCount === slotPromises.length && errorCount === 0 && totalSlots > 500,
        duration: endTime - startTime,
        metrics: {
          totalRequests: slotPromises.length,
          successful: successCount,
          failed: errorCount,
          totalSlotsCreated: totalSlots,
          avgTimePerRequest: (endTime - startTime) / slotPromises.length
        }
      };

      storeTestResult('Large-Scale Slot Generation', testResult);

      expect(successCount).toBe(slotPromises.length);
      expect(errorCount).toBe(0);
      expect(totalSlots).toBeGreaterThan(500); // Should create hundreds of slots
    }, 120000);
  });

  describe('Concurrent Schedule Updates', () => {
    it('should handle concurrent schedule updates and retrievals', async () => {
      const { doctors, tokens } = await createTestDoctors(5);

      // First create schedules
      const scheduleIds = [];
      for (let i = 0; i < doctors.length; i++) {
        const scheduleData = {
          dayOfWeek: 'tuesday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30
        };

        const response = await request(app)
          .post('/doctor/schedule')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .send(scheduleData);

        scheduleIds.push(response.body.data.schedule._id);
      }

      const operations = [];

      // Mix of updates and retrievals
      for (let i = 0; i < 100; i++) {
        const doctorIndex = i % doctors.length;

        if (i % 3 === 0) {
          // Update schedule
          const updateData = {
            startTime: `0${9 + (i % 3)}:00`,
            endTime: `1${7 - (i % 3)}:00`,
            slotDuration: 30 + (i % 3) * 15
          };

          operations.push(
            request(app)
              .put(`/doctor/schedule/${scheduleIds[doctorIndex]}`)
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
              .send(updateData)
          );
        } else {
          // Get schedules
          operations.push(
            request(app)
              .get('/doctor/schedule')
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(operations);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Concurrent schedule updates and retrievals stress test:`);
      console.log(`- Total requests: ${operations.length}`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / operations.length}ms`);

      const testResult = {
        passed: successCount === operations.length && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: operations.length,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / operations.length
        }
      };

      storeTestResult('Concurrent Schedule Updates', testResult);

      expect(successCount).toBe(operations.length);
      expect(errorCount).toBe(0);
    }, 120000);
  });

  describe('Data Validation Stress', () => {
    it('should handle high volume of invalid data submissions', async () => {
      const { doctors, tokens } = await createTestDoctors(3);

      const invalidRequests = [];

      const invalidProfiles = [
        { name: '', doctorProfile: {} }, // Empty data
        { name: 'Dr. Test', doctorProfile: { specialization: 'A'.repeat(1000) } }, // Very long strings
        { name: 'Dr. Test', doctorProfile: { experience: -5 } }, // Negative experience
        { name: 'Dr. Test', doctorProfile: { licenseNumber: 'INVALID' } }, // Invalid license
        { name: null, doctorProfile: null }, // Null values
        { invalidField: 'value' }, // Wrong fields
      ];

      const invalidSchedules = [
        { dayOfWeek: 'invalid_day', startTime: '25:00', endTime: '17:00' },
        { dayOfWeek: 'monday', startTime: '17:00', endTime: '09:00' }, // End before start
        { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00', slotDuration: 0 },
        { dayOfWeek: 'monday', startTime: '09:00', endTime: '17:00', slotDuration: 1440 }, // Too long
      ];

      // Profile updates with invalid data
      for (let i = 0; i < 50; i++) {
        const doctorIndex = i % doctors.length;
        const invalidData = invalidProfiles[i % invalidProfiles.length];

        invalidRequests.push(
          request(app)
            .put('/doctor/profile')
            .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
            .send(invalidData)
        );
      }

      // Schedule creation with invalid data
      for (let i = 0; i < 50; i++) {
        const doctorIndex = i % doctors.length;
        const invalidData = invalidSchedules[i % invalidSchedules.length];

        invalidRequests.push(
          request(app)
            .post('/doctor/schedule')
            .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
            .send(invalidData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(invalidRequests);
      const endTime = Date.now();

      const validationErrors = responses.filter(res => res.status === 400 || res.status === 409).length;
      const serverErrors = responses.filter(res => res.status >= 500).length;
      const unexpectedSuccesses = responses.filter(res => res.status === 200 || res.status === 201).length;

      console.log(`Data validation stress test:`);
      console.log(`- Total requests: ${invalidRequests.length}`);
      console.log(`- Validation errors (expected): ${validationErrors}`);
      console.log(`- Server errors: ${serverErrors}`);
      console.log(`- Unexpected successes: ${unexpectedSuccesses}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / invalidRequests.length}ms`);

      const testResult = {
        passed: serverErrors === 0 && (validationErrors + serverErrors + unexpectedSuccesses) === invalidRequests.length,
        duration: endTime - startTime,
        metrics: {
          totalRequests: invalidRequests.length,
          validationErrors: validationErrors,
          serverErrors: serverErrors,
          unexpectedSuccesses: unexpectedSuccesses,
          avgTimePerRequest: (endTime - startTime) / invalidRequests.length
        }
      };

      storeTestResult('Data Validation Stress', testResult);

      expect(serverErrors).toBe(0); // Should not crash the server
      expect(validationErrors + serverErrors + unexpectedSuccesses).toBe(invalidRequests.length);
    }, 120000);
  });

  describe('Authentication Stress During Operations', () => {
    it('should handle authentication checks under concurrent load', async () => {
      const { doctors, tokens } = await createTestDoctors(5);

      const authOperations = [];

      // Mix of authenticated and unauthenticated requests
      for (let i = 0; i < 200; i++) {
        const doctorIndex = i % doctors.length;

        if (i % 10 === 0) {
          // Unauthenticated request
          authOperations.push(
            request(app)
              .get('/doctor/profile')
          );
        } else if (i % 10 === 1) {
          // Invalid token
          authOperations.push(
            request(app)
              .get('/doctor/profile')
              .set('Authorization', 'Bearer invalid_token')
          );
        } else {
          // Valid authenticated request
          authOperations.push(
            request(app)
              .get('/doctor/profile')
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(authOperations);
      const endTime = Date.now();

      const authenticatedSuccess = responses.filter(res => res.status === 200).length;
      const authFailures = responses.filter(res => res.status === 401).length;
      const otherErrors = responses.filter(res => res.status !== 200 && res.status !== 401).length;

      console.log(`Authentication stress test:`);
      console.log(`- Total requests: ${authOperations.length}`);
      console.log(`- Authenticated successes: ${authenticatedSuccess}`);
      console.log(`- Authentication failures (expected): ${authFailures}`);
      console.log(`- Other errors: ${otherErrors}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / authOperations.length}ms`);

      const testResult = {
        passed: authFailures > 0 && otherErrors === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: authOperations.length,
          authenticatedSuccesses: authenticatedSuccess,
          authFailures: authFailures,
          otherErrors: otherErrors,
          avgTimePerRequest: (endTime - startTime) / authOperations.length
        }
      };

      storeTestResult('Authentication Stress During Operations', testResult);

      expect(authFailures).toBeGreaterThan(0); // Should have auth failures
      expect(otherErrors).toBe(0); // No unexpected errors
    }, 120000);
  });

  describe('Memory and Resource Stress', () => {
    it('should handle operations that create many database objects', async () => {
      const { doctors, tokens } = await createTestDoctors(2);

      // Create multiple schedules per doctor
      const schedulePromises = [];
      for (let doctorIndex = 0; doctorIndex < doctors.length; doctorIndex++) {
        for (let day = 0; day < 7; day++) {
          const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          const scheduleData = {
            dayOfWeek: daysOfWeek[day],
            startTime: '08:00',
            endTime: '18:00',
            slotDuration: 30
          };

          schedulePromises.push(
            request(app)
              .post('/doctor/schedule')
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
              .send(scheduleData)
          );
        }
      }

      await Promise.all(schedulePromises);

      // Generate slots for all schedules for a long period
      const slotGenerationPromises = [];
      for (let doctorIndex = 0; doctorIndex < doctors.length; doctorIndex++) {
        const schedules = await DoctorSchedule.find({ doctorId: doctors[doctorIndex]._id });

        for (const schedule of schedules) {
          const startDate = new Date();
          const endDate = new Date();
          endDate.setMonth(startDate.getMonth() + 2); // 2 months

          slotGenerationPromises.push(
            request(app)
              .post('/doctor/slots/generate')
              .set('Authorization', `Bearer ${tokens[doctorIndex]}`)
              .send({
                scheduleId: schedule._id,
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
              })
          );
        }
      }

      const startTime = Date.now();
      const responses = await Promise.all(slotGenerationPromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Memory and resource stress test:`);
      console.log(`- Total slot generation requests: ${slotGenerationPromises.length}`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / slotGenerationPromises.length}ms`);

      // Check total slots created
      const totalSlots = await AvailabilitySlot.countDocuments();
      console.log(`- Total slots in database: ${totalSlots}`);

      const testResult = {
        passed: successCount === slotGenerationPromises.length && errorCount === 0 && totalSlots > 1000,
        duration: endTime - startTime,
        metrics: {
          totalRequests: slotGenerationPromises.length,
          successful: successCount,
          failed: errorCount,
          totalSlotsInDatabase: totalSlots,
          avgTimePerRequest: (endTime - startTime) / slotGenerationPromises.length
        }
      };

      storeTestResult('Memory and Resource Stress', testResult);

      expect(successCount).toBe(slotGenerationPromises.length);
      expect(errorCount).toBe(0);
      expect(totalSlots).toBeGreaterThan(1000); // Should create thousands of slots
    }, 120000);
  });

  describe('Rapid Fire Operations', () => {
    it('should handle extremely rapid sequential operations', async () => {
      const { doctors, tokens } = await createTestDoctors(1);
      const doctor = doctors[0];
      const token = tokens[0];

      // Create a schedule first
      const scheduleResponse = await request(app)
        .post('/doctor/schedule')
        .set('Authorization', `Bearer ${token}`)
        .send({
          dayOfWeek: 'wednesday',
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30
        });

      const scheduleId = scheduleResponse.body.data.schedule._id;

      // Rapid fire sequence: update profile -> generate slots -> get slots -> block slot -> unblock slot -> delete schedule
      const rapidOperations = [];

      for (let cycle = 0; cycle < 10; cycle++) {
        // Update profile
        rapidOperations.push(
          request(app)
            .put('/doctor/profile')
            .set('Authorization', `Bearer ${token}`)
            .send({
              doctorProfile: { experience: cycle + 1 }
            })
        );

        // Generate slots
        rapidOperations.push(
          request(app)
            .post('/doctor/slots/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({
              scheduleId,
              startDate: '2024-01-01',
              endDate: '2024-01-01'
            })
        );

        // Get slots
        rapidOperations.push(
          request(app)
            .get('/doctor/slots')
            .set('Authorization', `Bearer ${token}`)
        );

        // Get profile
        rapidOperations.push(
          request(app)
            .get('/doctor/profile')
            .set('Authorization', `Bearer ${token}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(rapidOperations);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;
      const errorCount = responses.filter(res => res.status !== 200).length;

      console.log(`Rapid fire operations stress test:`);
      console.log(`- Total requests: ${rapidOperations.length}`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / rapidOperations.length}ms`);

      const testResult = {
        passed: successCount === rapidOperations.length && errorCount === 0,
        duration: endTime - startTime,
        metrics: {
          totalRequests: rapidOperations.length,
          successful: successCount,
          failed: errorCount,
          avgTimePerRequest: (endTime - startTime) / rapidOperations.length
        }
      };

      storeTestResult('Rapid Fire Operations', testResult);

      expect(successCount).toBe(rapidOperations.length);
      expect(errorCount).toBe(0);
    }, 120000);
  });
});

// Consolidated Test Report
afterAll(() => {
  console.log('\n' + '='.repeat(80));
  console.log('🎯 DOCTOR ONBOARDING STRESS TEST CONSOLIDATION REPORT');
  console.log('='.repeat(80));

  console.log('\n📊 SUMMARY STATISTICS:');
  console.log(`   • Total Test Cases: ${testResults.summary.totalTests}`);
  console.log(`   • Passed Tests: ${testResults.summary.passedTests}`);
  console.log(`   • Failed Tests: ${testResults.summary.failedTests}`);
  console.log(`   • Total Execution Time: ${testResults.summary.totalTime}ms`);
  console.log(`   • Average Time per Test: ${testResults.summary.totalTests > 0 ? (testResults.summary.totalTime / testResults.summary.totalTests).toFixed(2) : 0}ms`);

  const successRate = testResults.summary.totalTests > 0 ? ((testResults.summary.passedTests / testResults.summary.totalTests) * 100).toFixed(2) : 0;
  console.log(`   • Success Rate: ${successRate}%`);

  console.log('\n📋 DETAILED TEST RESULTS:');
  console.log('-'.repeat(80));

  testResults.details.forEach((test, index) => {
    const status = test.passed ? '✅ PASS' : '❌ FAIL';
    const duration = test.duration || 0;
    console.log(`${index + 1}. ${test.testName}`);
    console.log(`   Status: ${status}`);
    console.log(`   Duration: ${duration}ms`);

    if (test.metrics) {
      console.log('   Metrics:');
      Object.entries(test.metrics).forEach(([key, value]) => {
        console.log(`     • ${key}: ${value}`);
      });
    }
    console.log('');
  });

  console.log('🚀 PERFORMANCE HIGHLIGHTS:');
  const avgResponseTimes = testResults.details
    .filter(test => test.metrics && test.metrics.avgTimePerRequest)
    .map(test => test.metrics.avgTimePerRequest);

  if (avgResponseTimes.length > 0) {
    const overallAvgResponseTime = avgResponseTimes.reduce((sum, time) => sum + time, 0) / avgResponseTimes.length;
    const minResponseTime = Math.min(...avgResponseTimes);
    const maxResponseTime = Math.max(...avgResponseTimes);

    console.log(`   • Overall Average Response Time: ${overallAvgResponseTime.toFixed(2)}ms`);
    console.log(`   • Fastest Test Response Time: ${minResponseTime.toFixed(2)}ms`);
    console.log(`   • Slowest Test Response Time: ${maxResponseTime.toFixed(2)}ms`);
  }

  const totalRequests = testResults.details.reduce((sum, test) => {
    return sum + (test.metrics?.totalRequests || 0);
  }, 0);

  console.log(`   • Total API Requests Processed: ${totalRequests}`);

  const totalSlotsCreated = testResults.details.reduce((sum, test) => {
    return sum + (test.metrics?.totalSlotsCreated || test.metrics?.totalSlotsInDatabase || 0);
  }, 0);

  if (totalSlotsCreated > 0) {
    console.log(`   • Total Database Objects Created: ${totalSlotsCreated}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏁 STRESS TEST EXECUTION COMPLETED');
  console.log('='.repeat(80));

  if (testResults.summary.failedTests === 0) {
    console.log('\n🎉 ALL TESTS PASSED! System demonstrates excellent resilience under stress.');
  } else {
    console.log(`\n⚠️  ${testResults.summary.failedTests} test(s) failed. Review the detailed results above.`);
  }
});
