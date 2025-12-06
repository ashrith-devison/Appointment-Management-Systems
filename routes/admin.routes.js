import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import {
  getAllDoctors,
  getDoctorById,
  updateDoctorByAdmin,
  getDoctorSchedule,
  createDoctorScheduleByAdmin,
  updateDoctorScheduleByAdmin,
  getDoctorSlotsByAdmin,
  generateDoctorSlotsByAdmin
} from '../controllers/admin/doctorManagement.controller.js';
import ApiResponse from '../utils/ApiResponse.util.js';

const router = express.Router();

// All routes require authentication and admin authorization
router.use(authenticate);
router.use(authorize('admin'));

// Doctor management routes
router.get('/doctors', async (req, res, next) => {
  try {
    const result = await getAllDoctors(req.query);
    ApiResponse.success(result, 'Doctors retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/doctors/:doctorId', async (req, res, next) => {
  try {
    const result = await getDoctorById(req.params.doctorId);
    ApiResponse.success(result, 'Doctor details retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/doctors/:doctorId', async (req, res, next) => {
  try {
    const result = await updateDoctorByAdmin(req.params.doctorId, req.body);
    ApiResponse.success(result, 'Doctor updated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Doctor schedule management routes
router.get('/doctors/:doctorId/schedule', async (req, res, next) => {
  try {
    const result = await getDoctorSchedule(req.params.doctorId);
    ApiResponse.success(result, 'Doctor schedule retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.post('/doctors/:doctorId/schedule', async (req, res, next) => {
  try {
    const result = await createDoctorScheduleByAdmin(req.params.doctorId, req.body);
    ApiResponse.created(result, 'Doctor schedule created successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/doctors/:doctorId/schedule/:scheduleId', async (req, res, next) => {
  try {
    const result = await updateDoctorScheduleByAdmin(req.params.doctorId, req.params.scheduleId, req.body);
    ApiResponse.success(result, 'Doctor schedule updated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Doctor slots management routes
router.get('/doctors/:doctorId/slots', async (req, res, next) => {
  try {
    const result = await getDoctorSlotsByAdmin(req.params.doctorId, req.query);
    ApiResponse.success(result, 'Doctor slots retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.post('/doctors/:doctorId/slots/generate', async (req, res, next) => {
  try {
    const result = await generateDoctorSlotsByAdmin(req.params.doctorId, req.body);
    ApiResponse.success(result, 'Doctor slots generated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

export default router;

// Swagger configuration for admin routes
const swaggerConfig = {
  security: [
    {
      Authorization: []
    }
  ],
  paths: {
    '/admin/doctors': {
      get: {
        summary: 'Get all doctors',
        description: 'Retrieve a list of all doctors (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'query',
            name: 'page',
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Page number'
          },
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            description: 'Items per page'
          },
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string' },
            description: 'Search by name or email'
          },
          {
            in: 'query',
            name: 'specialization',
            schema: { type: 'string' },
            description: 'Filter by specialization'
          }
        ],
        responses: {
          200: {
            description: 'Doctors retrieved successfully',
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
                        doctors: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/User' }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total: { type: 'integer' },
                            pages: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/admin/doctors/{doctorId}': {
      get: {
        summary: 'Get doctor by ID',
        description: 'Retrieve detailed information about a specific doctor (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          }
        ],
        responses: {
          200: {
            description: 'Doctor details retrieved successfully',
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
                        doctor: { $ref: '#/components/schemas/User' },
                        schedules: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/DoctorSchedule' }
                        },
                        slots: {
                          type: 'object',
                          properties: {
                            total: { type: 'number' },
                            available: { type: 'number' },
                            booked: { type: 'number' },
                            blocked: { type: 'number' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' },
          404: { description: 'Doctor not found' }
        }
      },
      put: {
        summary: 'Update doctor by admin',
        description: 'Update a doctor\'s information (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Dr. John Smith' },
                  email: { type: 'string', format: 'email', example: 'john@example.com' },
                  profile: {
                    type: 'object',
                    properties: {
                      phone: { type: 'string', example: '+1234567890' },
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
                      }
                    }
                  },
                  doctorProfile: {
                    type: 'object',
                    properties: {
                      specialization: { type: 'string', example: 'Cardiology' },
                      licenseNumber: { type: 'string', example: 'MD123456' },
                      experience: { type: 'number', example: 10 },
                      qualifications: { type: 'array', items: { type: 'string' } },
                      hospital: { type: 'string', example: 'General Hospital' }
                    }
                  },
                  isActive: { type: 'boolean', example: true }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Doctor updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: { $ref: '#/components/schemas/User' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' },
          404: { description: 'Doctor not found' }
        }
      }
    },
    '/admin/doctors/{doctorId}/schedule': {
      get: {
        summary: 'Get doctor schedule',
        description: 'Retrieve a doctor\'s schedule (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          }
        ],
        responses: {
          200: {
            description: 'Doctor schedule retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/DoctorSchedule' }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' }
        }
      },
      post: {
        summary: 'Create doctor schedule by admin',
        description: 'Create a schedule for a doctor (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['dayOfWeek', 'startTime', 'endTime'],
                properties: {
                  dayOfWeek: { type: 'string', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], example: 'monday' },
                  startTime: { type: 'string', format: 'time', example: '09:00' },
                  endTime: { type: 'string', format: 'time', example: '17:00' },
                  slotDuration: { type: 'number', minimum: 15, maximum: 120, example: 30 },
                  breakTimes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        startTime: { type: 'string', format: 'time', example: '12:00' },
                        endTime: { type: 'string', format: 'time', example: '13:00' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Doctor schedule created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: { $ref: '#/components/schemas/DoctorSchedule' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/admin/doctors/{doctorId}/schedule/{scheduleId}': {
      put: {
        summary: 'Update doctor schedule by admin',
        description: 'Update a specific doctor schedule (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          },
          {
            in: 'path',
            name: 'scheduleId',
            required: true,
            schema: { type: 'string' },
            description: 'Schedule ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  dayOfWeek: { type: 'string', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
                  startTime: { type: 'string', format: 'time' },
                  endTime: { type: 'string', format: 'time' },
                  slotDuration: { type: 'number', minimum: 15, maximum: 120 },
                  breakTimes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        startTime: { type: 'string', format: 'time' },
                        endTime: { type: 'string', format: 'time' }
                      }
                    }
                  },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Doctor schedule updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: { $ref: '#/components/schemas/DoctorSchedule' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' },
          404: { description: 'Schedule not found' }
        }
      }
    },
    '/admin/doctors/{doctorId}/slots': {
      get: {
        summary: 'Get doctor slots by admin',
        description: 'Retrieve availability slots for a specific doctor (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          },
          {
            in: 'query',
            name: 'date',
            schema: { type: 'string', format: 'date' },
            description: 'Filter by specific date'
          },
          {
            in: 'query',
            name: 'status',
            schema: { type: 'string', enum: ['available', 'booked', 'blocked', 'cancelled'] },
            description: 'Filter by slot status'
          },
          {
            in: 'query',
            name: 'page',
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Page number'
          },
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            description: 'Items per page'
          }
        ],
        responses: {
          200: {
            description: 'Doctor slots retrieved successfully',
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
                        slots: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/AvailabilitySlot' }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total: { type: 'integer' },
                            pages: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' }
        }
      }
    },
    '/admin/doctors/{doctorId}/slots/generate': {
      post: {
        summary: 'Generate doctor slots by admin',
        description: 'Generate availability slots for a specific doctor (admin only)',
        tags: ['Admin - Doctor Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'doctorId',
            required: true,
            schema: { type: 'string' },
            description: 'Doctor ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['startDate', 'endDate'],
                properties: {
                  startDate: { type: 'string', format: 'date', example: '2024-01-01' },
                  endDate: { type: 'string', format: 'date', example: '2024-01-07' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Doctor slots generated successfully',
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
                        generatedSlots: { type: 'number', example: 20 },
                        dateRange: {
                          type: 'object',
                          properties: {
                            startDate: { type: 'string', format: 'date' },
                            endDate: { type: 'string', format: 'date' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Admin access required' }
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
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '60d5ecb74b24c72b8c8b4567' },
          name: { type: 'string', example: 'Dr. John Smith' },
          email: { type: 'string', format: 'email', example: 'john@example.com' },
          role: { type: 'string', enum: ['patient', 'doctor', 'admin', 'staff'], example: 'doctor' },
          isEmailVerified: { type: 'boolean', example: true },
          profile: {
            type: 'object',
            properties: {
              avatar: { type: 'string' },
              phone: { type: 'string', example: '+1234567890' },
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
              }
            }
          },
          doctorProfile: {
            type: 'object',
            properties: {
              specialization: { type: 'string', example: 'Cardiology' },
              licenseNumber: { type: 'string', example: 'MD123456' },
              experience: { type: 'number', example: 10 },
              qualifications: { type: 'array', items: { type: 'string' }, example: ['MD', 'Board Certified'] },
              hospital: { type: 'string', example: 'General Hospital' }
            }
          },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      DoctorSchedule: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '60d5ecb74b24c72b8c8b4567' },
          doctorId: { type: 'string', example: '60d5ecb74b24c72b8c8b4568' },
          dayOfWeek: { type: 'string', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], example: 'monday' },
          startTime: { type: 'string', format: 'time', example: '09:00' },
          endTime: { type: 'string', format: 'time', example: '17:00' },
          slotDuration: { type: 'number', example: 30 },
          isActive: { type: 'boolean', example: true },
          breakTimes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                startTime: { type: 'string', format: 'time', example: '12:00' },
                endTime: { type: 'string', format: 'time', example: '13:00' }
              }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      AvailabilitySlot: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '60d5ecb74b24c72b8c8b4567' },
          doctorId: { type: 'string', example: '60d5ecb74b24c72b8c8b4568' },
          scheduleId: { type: 'string', example: '60d5ecb74b24c72b8c8b4569' },
          date: { type: 'string', format: 'date', example: '2024-01-01' },
          startTime: { type: 'string', format: 'time', example: '09:00' },
          endTime: { type: 'string', format: 'time', example: '09:30' },
          status: { type: 'string', enum: ['available', 'booked', 'blocked', 'cancelled'], example: 'available' },
          patientId: { type: 'string' },
          notes: { type: 'string' },
          blockedBy: { type: 'string' },
          blockedReason: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};

export { swaggerConfig };