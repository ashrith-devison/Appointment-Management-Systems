import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import 'dotenv/config'; // Load environment variables
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

  // Mock sendEmail
  sendEmail.mockResolvedValue();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear all collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  jest.clearAllMocks();
});

describe('Auth Integration Tests', () => {
  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'patient'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User registered successfully. Please check your email for verification.');
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.name).toBe('John Doe');
      expect(response.body.data.user.email).toBe('john@example.com');
      expect(response.body.data.user.role).toBe('patient');
      expect(response.body.data.user.isEmailVerified).toBe(false);

      // Verify user was created in database
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user).toBeTruthy();
      expect(user.name).toBe('John Doe');
      expect(user.role).toBe('patient');
      expect(user.isEmailVerified).toBe(false);
      expect(user.emailVerificationToken).toBeTruthy();

      // Verify email was sent
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith({
        to: 'john@example.com',
        subject: 'Email Verification',
        html: expect.stringContaining('Verify Email')
      });
    });

    it('should return error for duplicate email', async () => {
      // First create a user
      await User.create({
        name: 'Existing User',
        email: 'existing@example.com',
        password: 'password123',
        role: 'patient'
      });

      const userData = {
        name: 'New User',
        email: 'existing@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User with this email already exists');
    });

    it('should return error for invalid role', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'invalidrole'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid role. Must be patient, doctor, admin, or staff');
    });

    it('should return error for missing required fields', async () => {
      const userData = {
        email: 'john@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Name, email, and password are required');
    });

    it('should return error for password too short', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: '12345'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Password must be at least 6 characters long');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'patient',
        isEmailVerified: true
      });
      await user.save();
    });

    it('should login user successfully', async () => {
      const loginData = {
        email: 'john@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.email).toBe('john@example.com');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');

      // Verify user login info was updated
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user.loginAttempts).toBe(0);
      expect(user.lastLogin).toBeTruthy();
      expect(user.refreshToken).toBeTruthy();
    });

    it('should return error for invalid credentials', async () => {
      const loginData = {
        email: 'john@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return error for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  describe('GET /auth/verify-email', () => {
    let verificationToken;

    beforeEach(async () => {
      // Create a user with verification token
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'patient'
      });
      verificationToken = user.generateEmailVerificationToken();
      await user.save();
    });

    it('should verify email successfully', async () => {
      const response = await request(app)
        .get('/auth/verify-email')
        .query({ token: verificationToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email verified successfully');

      // Verify user email was verified
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user.isEmailVerified).toBe(true);
      expect(user.emailVerificationToken).toBeUndefined();
      expect(user.emailVerificationExpires).toBeUndefined();
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .get('/auth/verify-email')
        .query({ token: 'invalidtoken' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid or expired verification token');
    });

    it('should return error for missing token', async () => {
      const response = await request(app)
        .get('/auth/verify-email')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Verification token is required');
    });
  });

  describe('POST /auth/forgot-password', () => {
    beforeEach(async () => {
      // Create a test user
      await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'patient'
      });
    });

    it('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'john@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('If an account with that email exists, a password reset link has been sent.');
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith({
        to: 'john@example.com',
        subject: 'Password Reset',
        html: expect.stringContaining('Reset Password')
      });

      // Verify reset token was generated
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user.passwordResetToken).toBeTruthy();
      expect(user.passwordResetExpires).toBeTruthy();
    });

    it('should not reveal if email does not exist', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('If an account with that email exists, a password reset link has been sent.');
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('should return error for missing email', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Email is required');
    });
  });

  describe('POST /auth/reset-password', () => {
    let resetToken;

    beforeEach(async () => {
      // Create a user with reset token
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'patient'
      });
      resetToken = user.generatePasswordResetToken();
      await user.save();
    });

    it('should reset password successfully', async () => {
      const newPassword = 'newpassword123';

      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password reset successfully');

      // Verify password was changed
      const user = await User.findOne({ email: 'john@example.com' }).select('+password');
      expect(await user.comparePassword(newPassword)).toBe(true);
      expect(user.passwordResetToken).toBeUndefined();
      expect(user.passwordResetExpires).toBeUndefined();
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'invalidtoken', newPassword: 'newpassword123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid or expired reset token');
    });

    it('should return error for missing fields', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: resetToken })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Token and new password are required');
    });

    it('should return error for password too short', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: '12345' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Password must be at least 6 characters long');
    });
  });

  describe('Authenticated routes', () => {
    let accessToken;
    let userId;

    beforeEach(async () => {
      // Create and login a user to get token
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'patient',
        isEmailVerified: true
      });
      userId = user._id;

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'john@example.com', password: 'password123' });

      accessToken = loginResponse.body.data.tokens.accessToken;
    });

    describe('GET /auth/me', () => {
      it('should get current user profile', async () => {
        const response = await request(app)
          .get('/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.name).toBe('John Doe');
        expect(response.body.data.user.email).toBe('john@example.com');
        expect(response.body.data.user.role).toBe('patient');
      });

      it('should return error without authentication', async () => {
        const response = await request(app)
          .get('/auth/me')
          .expect(401);

        expect(response.body.success).toBe(false);
      });
    });

    describe('PUT /auth/profile', () => {
      it('should update user profile', async () => {
        const updateData = { name: 'Jane Doe' };

        const response = await request(app)
          .put('/auth/profile')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.name).toBe('Jane Doe');

        // Verify in database
        const user = await User.findById(userId);
        expect(user.name).toBe('Jane Doe');
      });

      it('should return error for invalid fields', async () => {
        const updateData = { role: 'admin', invalidField: 'value' };

        const response = await request(app)
          .put('/auth/profile')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(updateData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('No valid fields to update');
      });
    });

    describe('PUT /auth/change-password', () => {
      it('should change password', async () => {
        const changeData = {
          currentPassword: 'password123',
          newPassword: 'newpassword123'
        };

        const response = await request(app)
          .put('/auth/change-password')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(changeData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Password changed successfully');

        // Verify new password works
        const loginResponse = await request(app)
          .post('/auth/login')
          .send({ email: 'john@example.com', password: 'newpassword123' })
          .expect(200);

        expect(loginResponse.body.success).toBe(true);
      });

      it('should return error for incorrect current password', async () => {
        const changeData = {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        };

        const response = await request(app)
          .put('/auth/change-password')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(changeData)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Current password is incorrect');
      });
    });

    describe('POST /auth/logout', () => {
      it('should logout user', async () => {
        const response = await request(app)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Logged out successfully');

        // Verify refresh token was cleared
        const user = await User.findById(userId);
        expect(user.refreshToken).toBeUndefined();
        expect(user.refreshTokenExpires).toBeUndefined();
      });
    });

    describe('DELETE /auth/delete', () => {
      it('should delete user account', async () => {
        const response = await request(app)
          .delete('/auth/delete')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Your account has been deactivated successfully');

        // Verify user was deactivated
        const user = await User.findById(userId);
        expect(user.isActive).toBe(false);
      });
    });
  });

  describe('Admin routes', () => {
    let adminToken;
    let userId;

    beforeEach(async () => {
      // Create admin user
      const admin = await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin',
        isEmailVerified: true
      });

      // Create regular user
      const user = await User.create({
        name: 'Regular User',
        email: 'user@example.com',
        password: 'user123',
        role: 'patient',
        isEmailVerified: true
      });
      userId = user._id;

      // Login as admin
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'admin@example.com', password: 'admin123' });

      adminToken = loginResponse.body.data.tokens.accessToken;
    });

    describe('GET /auth/users', () => {
      it('should get all users as admin', async () => {
        const response = await request(app)
          .get('/auth/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data.users)).toBe(true);
        expect(response.body.data.users.length).toBeGreaterThan(0);
        expect(response.body.data.pagination).toHaveProperty('total');
      });

      it('should return error for non-admin user', async () => {
        // Create and login as regular user
        const userLogin = await request(app)
          .post('/auth/login')
          .send({ email: 'user@example.com', password: 'user123' });

        const userToken = userLogin.body.data.tokens.accessToken;

        const response = await request(app)
          .get('/auth/users')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
      });
    });

    describe('PUT /auth/users/:id/role', () => {
      it('should update user role as admin', async () => {
        const response = await request(app)
          .put(`/auth/users/${userId}/role`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'doctor' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.role).toBe('doctor');

        // Verify in database
        const user = await User.findById(userId);
        expect(user.role).toBe('doctor');
      });

      it('should return error for invalid role', async () => {
        const response = await request(app)
          .put(`/auth/users/${userId}/role`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'invalid' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Invalid role. Must be patient, doctor, admin, or staff');
      });
    });

    describe('DELETE /auth/delete/:id', () => {
      it('should delete user by id as admin', async () => {
        const response = await request(app)
          .delete(`/auth/delete/${userId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('User account deactivated successfully');

        // Verify user was deactivated
        const user = await User.findById(userId);
        expect(user.isActive).toBe(false);
      });

      it('should return error when trying to delete admin', async () => {
        const adminUser = await User.findOne({ role: 'admin' });

        const response = await request(app)
          .delete(`/auth/delete/${adminUser._id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Cannot delete admin accounts');
      });
    });
  });
});
