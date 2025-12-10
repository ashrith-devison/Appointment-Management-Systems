import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import authRoute from '@/routes/auth.route.js';
import { errorHandler, notFound } from '@/middlewares/error.js';
import User from '@/models/users.model.js';

// Mock external services
jest.mock('@/utils/email.js');
jest.mock('@/utils/redis.js');
jest.mock('@/utils/swagger.docs.js');

import { sendEmail } from '@/utils/email.js';
import redisCache from '@/utils/redis.js';

let mongoServer;
let app;

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
});

describe('Auth Stress Tests', () => {
  describe('Concurrent User Registration', () => {
    it('should handle 100 concurrent user registrations', async () => {
      const registrationPromises = [];

      for (let i = 0; i < 100; i++) {
        const userData = {
          name: `User${i}`,
          email: `user${i}@example.com`,
          password: 'password123',
          role: 'patient'
        };

        registrationPromises.push(
          request(app)
            .post('/auth/register')
            .send(userData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(registrationPromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 201).length;
      const errorCount = responses.filter(res => res.status !== 201).length;

      console.log(`Concurrent registration stress test:`);
      console.log(`- Total requests: 100`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Failed: ${errorCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / 100}ms`);

      expect(successCount).toBe(100);
      expect(errorCount).toBe(0);

      // Verify all users were created
      const userCount = await User.countDocuments();
      expect(userCount).toBe(100);
    }, 120000);

    it('should handle duplicate email conflicts under concurrent load', async () => {
      // First create one user
      await User.create({
        name: 'Original User',
        email: 'conflict@example.com',
        password: 'password123',
        role: 'patient'
      });

      const registrationPromises = [];

      // Try to register 50 users with the same email concurrently
      for (let i = 0; i < 50; i++) {
        const userData = {
          name: `User${i}`,
          email: 'conflict@example.com',
          password: 'password123',
          role: 'patient'
        };

        registrationPromises.push(
          request(app)
            .post('/auth/register')
            .send(userData)
        );
      }

      const responses = await Promise.all(registrationPromises);

      const conflictErrors = responses.filter(res => res.status === 409).length;
      const otherErrors = responses.filter(res => res.status !== 409 && res.status !== 201).length;

      console.log(`Concurrent duplicate email test:`);
      console.log(`- Total requests: 50`);
      console.log(`- Conflict errors (409): ${conflictErrors}`);
      console.log(`- Other errors: ${otherErrors}`);

      // Should have at least one conflict error (race condition dependent)
      expect(conflictErrors + otherErrors).toBe(50);
    }, 60000);
  });

  describe('Brute Force Login Protection', () => {
    beforeEach(async () => {
      // Create a test user
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'correctpassword',
        role: 'patient',
        isEmailVerified: true
      });
    });

    it('should handle 100 rapid login attempts with wrong password', async () => {
      const loginPromises = [];

      for (let i = 0; i < 100; i++) {
        const loginData = {
          email: 'test@example.com',
          password: 'wrongpassword'
        };

        loginPromises.push(
          request(app)
            .post('/auth/login')
            .send(loginData)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(loginPromises);
      const endTime = Date.now();

      const unauthorizedCount = responses.filter(res => res.status === 401).length;
      const successCount = responses.filter(res => res.status === 200).length;

      console.log(`Brute force login stress test:`);
      console.log(`- Total attempts: 100`);
      console.log(`- Unauthorized responses: ${unauthorizedCount}`);
      console.log(`- Successful logins: ${successCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);

      expect(unauthorizedCount).toBe(100);
      expect(successCount).toBe(0);
    }, 120000);

    it('should handle mixed valid and invalid login attempts', async () => {
      const loginPromises = [];

      for (let i = 0; i < 50; i++) {
        // Alternate between valid and invalid attempts
        const loginData = i % 2 === 0 ? {
          email: 'test@example.com',
          password: 'correctpassword'
        } : {
          email: 'test@example.com',
          password: 'wrongpassword'
        };

        loginPromises.push(
          request(app)
            .post('/auth/login')
            .send(loginData)
        );
      }

      const responses = await Promise.all(loginPromises);

      const successCount = responses.filter(res => res.status === 200).length;
      const unauthorizedCount = responses.filter(res => res.status === 401).length;

      console.log(`Mixed login attempts test:`);
      console.log(`- Total attempts: 50`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Unauthorized: ${unauthorizedCount}`);

      // Should have some successful logins (the even attempts)
      expect(successCount).toBeGreaterThan(0);
      expect(unauthorizedCount).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Password Reset Stress', () => {
    beforeEach(async () => {
      // Create multiple test users in parallel for faster setup
      const userPromises = [];
      for (let i = 0; i < 20; i++) {
        userPromises.push(
          User.create({
            name: `User${i}`,
            email: `user${i}@example.com`,
            password: 'password123',
            role: 'patient'
          })
        );
      }
      await Promise.all(userPromises);
    }, 30000); // 30 second timeout for setup

    it('should handle 100 concurrent password reset requests', async () => {
      const resetPromises = [];

      for (let i = 0; i < 100; i++) {
        const email = `user${i % 20}@example.com`; // Cycle through existing users

        resetPromises.push(
          request(app)
            .post('/auth/forgot-password')
            .send({ email })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(resetPromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;

      console.log(`Concurrent password reset stress test:`);
      console.log(`- Total requests: 100`);
      console.log(`- Successful responses: ${successCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per request: ${(endTime - startTime) / 100}ms`);

      expect(successCount).toBe(100);
    }, 120000);

    it('should handle password reset for non-existent emails under load', async () => {
      const resetPromises = [];

      for (let i = 0; i < 50; i++) {
        resetPromises.push(
          request(app)
            .post('/auth/forgot-password')
            .send({ email: `nonexistent${i}@example.com` })
        );
      }

      const responses = await Promise.all(resetPromises);
      const successCount = responses.filter(res => res.status === 200).length;

      console.log(`Non-existent email reset test:`);
      console.log(`- Total requests: 50`);
      console.log(`- Successful responses: ${successCount}`);

      // Should not reveal if email exists
      expect(successCount).toBe(50);
      expect(sendEmail).not.toHaveBeenCalled();
    }, 60000);
  });

  describe('Admin Operations Under Load', () => {
    let adminToken;
    let userIds = [];

    beforeEach(async () => {
      // Create admin user
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin',
        isEmailVerified: true
      });

      // Create 50 regular users in parallel for faster setup
      const userPromises = [];
      for (let i = 0; i < 50; i++) {
        userPromises.push(
          User.create({
            name: `User${i}`,
            email: `user${i}@example.com`,
            password: 'password123',
            role: 'patient',
            isEmailVerified: true
          })
        );
      }
      const users = await Promise.all(userPromises);
      userIds = users.map(user => user._id);

      // Login as admin
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'admin123' });

      adminToken = loginResponse.body.data.tokens.accessToken;
    }, 60000); // 60 second timeout for setup

    it('should handle concurrent user role updates', async () => {
      const updatePromises = [];

      for (let i = 0; i < 30; i++) {
        const userId = userIds[i];
        const newRole = i % 2 === 0 ? 'doctor' : 'staff';

        updatePromises.push(
          request(app)
            .put(`/auth/users/${userId}/role`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ role: newRole })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(updatePromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;

      console.log(`Concurrent role update stress test:`);
      console.log(`- Total updates: 30`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);

      expect(successCount).toBe(30);

      // Verify some roles were updated
      const doctors = await User.countDocuments({ role: 'doctor' });
      const staff = await User.countDocuments({ role: 'staff' });

      expect(doctors + staff).toBeGreaterThan(0);
    }, 120000);

    it('should handle concurrent user listing requests', async () => {
      const listPromises = [];

      for (let i = 0; i < 20; i++) {
        listPromises.push(
          request(app)
            .get('/auth/users')
            .set('Authorization', `Bearer ${adminToken}`)
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(listPromises);
      const endTime = Date.now();

      const successCount = responses.filter(res => res.status === 200).length;

      console.log(`Concurrent user listing stress test:`);
      console.log(`- Total requests: 20`);
      console.log(`- Successful: ${successCount}`);
      console.log(`- Total time: ${endTime - startTime}ms`);

      expect(successCount).toBe(20);

      // Verify response structure
      const firstResponse = responses[0];
      expect(firstResponse.body.data.users).toBeDefined();
      expect(firstResponse.body.data.pagination).toBeDefined();
    }, 60000);
  });

  describe('Database Connection Stress', () => {
    it('should handle rapid database operations', async () => {
      const operations = [];

      for (let i = 0; i < 200; i++) {
        if (i % 2 === 0) {
          // Create user
          operations.push(
            User.create({
              name: `StressUser${i}`,
              email: `stress${i}@example.com`,
              password: 'password123',
              role: 'patient'
            })
          );
        } else {
          // Find user
          operations.push(
            User.findOne({ email: `stress${i-1}@example.com` })
          );
        }
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const endTime = Date.now();

      console.log(`Database operations stress test:`);
      console.log(`- Total operations: 200`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per operation: ${(endTime - startTime) / 200}ms`);

      // Verify some users were created
      const userCount = await User.countDocuments({ email: /^stress/ });
      expect(userCount).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Memory and Performance Stress', () => {
    it('should handle large payload registrations', async () => {
      const largeName = 'A'.repeat(1000); // 1000 character name
      const largeEmail = 'a'.repeat(200) + '@example.com'; // Long email

      const userData = {
        name: largeName,
        email: largeEmail,
        password: 'password123',
        role: 'patient'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData);

      // Should handle large payloads gracefully
      expect([200, 201, 400]).toContain(response.status);
    }, 30000);

    it('should handle rapid sequential operations', async () => {
      const operations = [];

      for (let i = 0; i < 50; i++) {
        operations.push(
          request(app)
            .post('/auth/register')
            .send({
              name: `SeqUser${i}`,
              email: `seq${i}@example.com`,
              password: 'password123',
              role: 'patient'
            })
        );
      }

      const startTime = Date.now();
      for (const op of operations) {
        await op;
      }
      const endTime = Date.now();

      console.log(`Sequential operations stress test:`);
      console.log(`- Total operations: 50`);
      console.log(`- Total time: ${endTime - startTime}ms`);
      console.log(`- Avg time per operation: ${(endTime - startTime) / 50}ms`);

      const userCount = await User.countDocuments({ email: /^seq/ });
      expect(userCount).toBe(50);
    }, 120000);
  });

  describe('Error Handling Under Stress', () => {
    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [];

      for (let i = 0; i < 20; i++) {
        malformedRequests.push(
          request(app)
            .post('/auth/register')
            .send({
              invalidField: 'value',
              anotherInvalid: 123
            })
        );
      }

      const responses = await Promise.all(malformedRequests);
      const errorCount = responses.filter(res => res.status >= 400).length;

      console.log(`Malformed requests stress test:`);
      console.log(`- Total malformed requests: 20`);
      console.log(`- Error responses: ${errorCount}`);

      expect(errorCount).toBe(20);
    }, 60000);

    it('should handle network-like failures', async () => {
      // Simulate rapid requests that might cause connection issues
      const rapidRequests = [];

      for (let i = 0; i < 100; i++) {
        rapidRequests.push(
          request(app)
            .get('/auth/me')
            .set('Authorization', 'Bearer invalidtoken')
        );
      }

      const responses = await Promise.all(rapidRequests);
      const authErrors = responses.filter(res => res.status === 401).length;

      console.log(`Invalid token stress test:`);
      console.log(`- Total requests: 100`);
      console.log(`- Auth errors: ${authErrors}`);

      expect(authErrors).toBe(100);
    }, 120000);
  });
});
