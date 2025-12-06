import express from 'express';
import User from '../models/users.model.js';
import ApiError from '../utils/ApiError.util.js';
import ApiResponse from '../utils/ApiResponse.util.js';
import { authenticate, authorize, verifyRefreshToken } from '../middlewares/auth.js';
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
} from '../controllers/auth.controller.js';

const router = express.Router();

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res, next) => {
  try {
    const result = await register(req.body);
    ApiResponse.created(result, 'User registered successfully. Please check your email for verification.').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   POST /auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res, next) => {
  try {
    const result = await login(req.body);
    ApiResponse.success(result, 'Login successful').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   POST /auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', verifyRefreshToken, async (req, res, next) => {
  try {
    const result = await refreshToken(req.user);
    ApiResponse.success(result, 'Token refreshed successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   POST /auth/logout
// @desc    Logout user (revoke refresh token)
// @access  Private
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await logout(req.user);
    ApiResponse.success(null, 'Logged out successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   POST /auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw ApiError.badRequest('Email is required');
    }

    await forgotPassword(email);
    ApiResponse.success(null, 'If an account with that email exists, a password reset link has been sent.').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   POST /auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw ApiError.badRequest('Token and new password are required');
    }

    if (newPassword.length < 6) {
      throw ApiError.badRequest('Password must be at least 6 characters long');
    }

    await resetPassword(token, newPassword);
    ApiResponse.success(null, 'Password reset successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   PUT /auth/change-password
// @desc    Change password (authenticated user)
// @access  Private
router.put('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw ApiError.badRequest('Current password and new password are required');
    }

    if (newPassword.length < 6) {
      throw ApiError.badRequest('New password must be at least 6 characters long');
    }

    const user = await User.findById(req.user._id).select('+password');
    await changePassword(user, currentPassword, newPassword);
    ApiResponse.success(null, 'Password changed successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   GET /auth/verify-email
// @desc    Verify email with token
// @access  Public
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      throw ApiError.badRequest('Verification token is required');
    }

    await verifyEmail(token);
    ApiResponse.success(null, 'Email verified successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   GET /auth/users
// @desc    Get all users (admin only)
// @access  Private (admin only)
// @route   GET /auth/users
// @desc    Get all users (admin only)
// @access  Private (admin only)
router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const result = await getUsers(page, limit);
    ApiResponse.success(result, 'Users retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   PUT /auth/users/:id/role
// @desc    Update user role (admin only)
// @access  Private (admin only)
router.put('/users/:id/role', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    const result = await updateUserRole(req.params.id, role);
    ApiResponse.success(result, 'User role updated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   POST /auth/impersonate/:id
// @desc    Impersonate user (admin only)
// @access  Private (admin only)
router.post('/impersonate/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await impersonateUser(req.params.id);
    ApiResponse.success({ ...result, impersonated: true }, 'Successfully impersonating user').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   GET /auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await getProfile(req.user);
    ApiResponse.success(result, 'Profile retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   PUT /auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const result = await updateProfile(req.user, req.body);
    ApiResponse.success(result, 'Profile updated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /auth/delete
// @desc    Delete current user account
// @access  Private
router.delete('/delete', authenticate, async (req, res, next) => {
  try {
    await deleteAccount(req.user);
    ApiResponse.success(null, 'Your account has been deactivated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /auth/delete/:id
// @desc    Delete user account by ID (admin only)
// @access  Private (admin only)
router.delete('/delete/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await deleteUserById(req.params.id);
    ApiResponse.success(null, 'User account deactivated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Swagger configuration for auth routes
const swaggerConfig = {
  security: [
    {
      Authorization: []
    }
  ],
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register a new user',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'John Doe' },
                  email: { type: 'string', format: 'email', example: 'john@example.com' },
                  password: { type: 'string', minLength: 6, example: 'password123' },
                  role: { type: 'string', enum: ['patient', 'doctor', 'admin', 'staff'], example: 'patient' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            role: { type: 'string' },
                            isEmailVerified: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Validation error' },
          409: { description: 'User already exists' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Login user',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            role: { type: 'string' },
                            isEmailVerified: { type: 'boolean' }
                          }
                        },
                        tokens: {
                          type: 'object',
                          properties: {
                            accessToken: { type: 'string' },
                            refreshToken: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/auth/refresh': {
      post: {
        summary: 'Refresh access token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: {
                  refreshToken: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Token refreshed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Invalid refresh token' }
        }
      }
    },
    '/auth/logout': {
      post: {
        summary: 'Logout user',
        tags: ['Authentication'],
        security: [{ Authorization: [] }],
        responses: {
          200: {
            description: 'Logged out successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth/forgot-password': {
      post: {
        summary: 'Request password reset',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Reset email sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth/reset-password': {
      post: {
        summary: 'Reset password with token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'newPassword'],
                properties: {
                  token: { type: 'string' },
                  newPassword: { type: 'string', minLength: 6 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Password reset successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          400: { description: 'Invalid token' }
        }
      }
    },
    '/auth/change-password': {
      put: {
        summary: 'Change password',
        tags: ['Authentication'],
        security: [{ Authorization: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 6 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Password changed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          400: { description: 'Invalid current password' }
        }
      }
    },
    '/auth/verify-email': {
      get: {
        summary: 'Verify email with token',
        tags: ['Authentication'],
        parameters: [
          {
            in: 'query',
            name: 'token',
            required: true,
            schema: { type: 'string' },
            description: 'Email verification token'
          }
        ],
        responses: {
          200: {
            description: 'Email verified successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          400: { description: 'Invalid token' }
        }
      }
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile',
        tags: ['Authentication'],
        security: [{ Authorization: [] }],
        responses: {
          200: {
            description: 'Profile retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            role: { type: 'string' },
                            isEmailVerified: { type: 'boolean' },
                            profile: { type: 'object' },
                            doctorProfile: { type: 'object' },
                            patientProfile: { type: 'object' },
                            lastLogin: { type: 'string', format: 'date-time' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth/profile': {
      put: {
        summary: 'Update user profile',
        tags: ['Authentication'],
        security: [{ Authorization: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  profile: {
                    type: 'object',
                    properties: {
                      avatar: { type: 'string' },
                      phone: { type: 'string' },
                      dateOfBirth: { type: 'string', format: 'date' },
                      gender: { type: 'string', enum: ['male', 'female', 'other'] },
                      address: {
                        type: 'object',
                        properties: {
                          street: { type: 'string' },
                          city: { type: 'string' },
                          state: { type: 'string' },
                          zipCode: { type: 'string' },
                          country: { type: 'string' }
                        }
                      },
                      emergencyContact: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          phone: { type: 'string' },
                          relationship: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Profile updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            role: { type: 'string' },
                            profile: { type: 'object' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth/users': {
      get: {
        summary: 'Get all users (admin only)',
        tags: ['Admin'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'query',
            name: 'page',
            schema: { type: 'integer', default: 1 },
            description: 'Page number'
          },
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', default: 10 },
            description: 'Items per page'
          }
        ],
        responses: {
          200: {
            description: 'Users retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        users: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string' },
                              email: { type: 'string' },
                              role: { type: 'string' },
                              isEmailVerified: { type: 'boolean' },
                              isActive: { type: 'boolean' },
                              createdAt: { type: 'string', format: 'date-time' },
                              lastLogin: { type: 'string', format: 'date-time' }
                            }
                          }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total: { type: 'integer' },
                            totalPages: { type: 'integer' },
                            hasNext: { type: 'boolean' },
                            hasPrev: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          403: { description: 'Forbidden - admin access required' }
        }
      }
    },
    '/auth/users/{id}/role': {
      put: {
        summary: 'Update user role (admin only)',
        tags: ['Admin'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'User ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: {
                    type: 'string',
                    enum: ['patient', 'doctor', 'admin', 'staff']
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'User role updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            role: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Invalid role or cannot demote last admin' },
          403: { description: 'Forbidden - admin access required' },
          404: { description: 'User not found' }
        }
      }
    },
    '/auth/impersonate/{id}': {
      post: {
        summary: 'Impersonate user (admin only)',
        tags: ['Admin'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'User ID to impersonate'
          }
        ],
        responses: {
          200: {
            description: 'Successfully impersonating user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                            role: { type: 'string' },
                            isEmailVerified: { type: 'boolean' }
                          }
                        },
                        tokens: {
                          type: 'object',
                          properties: {
                            accessToken: { type: 'string' },
                            refreshToken: { type: 'string' }
                          }
                        },
                        impersonated: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Cannot impersonate inactive user' },
          403: { description: 'Forbidden - admin access required' },
          404: { description: 'User not found' }
        }
      }
    },
    '/auth/delete/{id}': {
      delete: {
        summary: 'Delete user account by ID (admin only)',
        tags: ['Authentication'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'User ID to delete'
          }
        ],
        responses: {
          200: {
            description: 'Account deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          403: { description: 'Forbidden - admin access required' },
          404: { description: 'User not found' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      Authorization: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

export default router;
export { swaggerConfig };