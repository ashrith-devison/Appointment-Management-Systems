import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
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
} from '../controllers/doctor/doctor.controller.js';
import ApiResponse from '../utils/ApiResponse.util.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Doctor profile routes
router.get('/profile', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await getDoctorProfile(req.user);
    ApiResponse.success(result, 'Doctor profile retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/profile', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await updateDoctorProfile(req.user, req.body);
    ApiResponse.success(result, 'Doctor profile updated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Doctor schedule routes
router.post('/schedule', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await createDoctorSchedule(req.user, req.body);
    ApiResponse.created(result, 'Doctor schedule created successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/schedule', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await getDoctorSchedules(req.user);
    ApiResponse.success(result, 'Doctor schedules retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/schedule/:scheduleId', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await updateDoctorSchedule(req.user, req.params.scheduleId, req.body);
    ApiResponse.success(result, 'Doctor schedule updated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.delete('/schedule/:scheduleId', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await deleteDoctorSchedule(req.user, req.params.scheduleId);
    ApiResponse.success(result, 'Doctor schedule deleted successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Availability slots routes
router.post('/slots/generate', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await generateAvailabilitySlots(req.user, req.body);
    ApiResponse.success(result, 'Availability slots generated successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/slots', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await getDoctorSlots(req.user, req.query);
    ApiResponse.success(result, 'Doctor slots retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/slots/:slotId/status', authorize('doctor'), async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const result = await updateSlotStatus(req.user, req.params.slotId, action, reason);
    ApiResponse.success(result, `Slot ${action}ed successfully`).send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/slots/bulk/status', authorize('doctor'), async (req, res, next) => {
  try {
    const result = await bulkUpdateSlotStatus(req.user, req.body.slotUpdates);
    ApiResponse.success(result, 'Bulk slot update completed').send(res);
  } catch (error) {
    next(error);
  }
});

export default router;

// Swagger configuration for doctor routes
const swaggerConfig = {
  security: [
    {
      Authorization: []
    }
  ],
  paths: {
    '/doctor/profile': {
      get: {
        summary: 'Get doctor profile',
        description: 'Retrieve the authenticated doctor\'s profile information',
        tags: ['Doctor Profile'],
        security: [{ Authorization: [] }],
        responses: {
          200: {
            description: 'Doctor profile retrieved successfully',
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
                        user: { $ref: '#/components/schemas/User' },
                        doctorProfile: { $ref: '#/components/schemas/DoctorProfile' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Not a doctor' }
        }
      },
      put: {
        summary: 'Update doctor profile',
        description: 'Update the authenticated doctor\'s profile information',
        tags: ['Doctor Profile'],
        security: [{ Authorization: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Dr. John Smith' },
                  profile: {
                    type: 'object',
                    properties: {
                      phone: { type: 'string', example: '+1234567890' },
                      dateOfBirth: { type: 'string', format: 'date', example: '1980-01-01' },
                      gender: { type: 'string', enum: ['male', 'female', 'other'], example: 'male' },
                      address: {
                        type: 'object',
                        properties: {
                          street: { type: 'string', example: '123 Main St' },
                          city: { type: 'string', example: 'New York' },
                          state: { type: 'string', example: 'NY' },
                          zipCode: { type: 'string', example: '10001' },
                          country: { type: 'string', example: 'USA' }
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
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Doctor profile updated successfully',
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
                        user: { $ref: '#/components/schemas/User' },
                        doctorProfile: { $ref: '#/components/schemas/DoctorProfile' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Not a doctor' }
        }
      }
    },
    '/doctor/schedule': {
      post: {
        summary: 'Create doctor schedule',
        description: 'Create a new schedule for the authenticated doctor',
        tags: ['Doctor Schedule'],
        security: [{ Authorization: [] }],
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
          403: { description: 'Forbidden - Not a doctor' }
        }
      },
      get: {
        summary: 'Get doctor schedules',
        description: 'Retrieve all schedules for the authenticated doctor',
        tags: ['Doctor Schedule'],
        security: [{ Authorization: [] }],
        responses: {
          200: {
            description: 'Doctor schedules retrieved successfully',
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
          403: { description: 'Forbidden - Not a doctor' }
        }
      }
    },
    '/doctor/schedule/{scheduleId}': {
      put: {
        summary: 'Update doctor schedule',
        description: 'Update a specific schedule for the authenticated doctor',
        tags: ['Doctor Schedule'],
        security: [{ Authorization: [] }],
        parameters: [
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
          403: { description: 'Forbidden - Not a doctor' },
          404: { description: 'Schedule not found' }
        }
      },
      delete: {
        summary: 'Delete doctor schedule',
        description: 'Delete a specific schedule for the authenticated doctor',
        tags: ['Doctor Schedule'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'scheduleId',
            required: true,
            schema: { type: 'string' },
            description: 'Schedule ID'
          }
        ],
        responses: {
          200: {
            description: 'Doctor schedule deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Not a doctor' },
          404: { description: 'Schedule not found' }
        }
      }
    },
    '/doctor/slots/generate': {
      post: {
        summary: 'Generate availability slots',
        description: 'Generate availability slots for the authenticated doctor based on their schedules',
        tags: ['Doctor Slots'],
        security: [{ Authorization: [] }],
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
            description: 'Availability slots generated successfully',
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
          403: { description: 'Forbidden - Not a doctor' }
        }
      }
    },
    '/doctor/slots': {
      get: {
        summary: 'Get doctor slots',
        description: 'Retrieve availability slots for the authenticated doctor',
        tags: ['Doctor Slots'],
        security: [{ Authorization: [] }],
        parameters: [
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
          403: { description: 'Forbidden - Not a doctor' }
        }
      }
    },
    '/doctor/slots/{slotId}/status': {
      put: {
        summary: 'Update slot status',
        description: 'Update the status of a specific slot (available/blocked)',
        tags: ['Doctor Slots'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'slotId',
            required: true,
            schema: { type: 'string' },
            description: 'Slot ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string', enum: ['block', 'unblock'], example: 'block' },
                  reason: { type: 'string', example: 'Emergency leave' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Slot status updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: { $ref: '#/components/schemas/AvailabilitySlot' }
                  }
                }
              }
            }
          },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Not a doctor' },
          404: { description: 'Slot not found' }
        }
      }
    },
    '/doctor/slots/bulk/status': {
      put: {
        summary: 'Bulk update slot status',
        description: 'Update the status of multiple slots at once',
        tags: ['Doctor Slots'],
        security: [{ Authorization: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['slotUpdates'],
                properties: {
                  slotUpdates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['slotId', 'action'],
                      properties: {
                        slotId: { type: 'string', example: '60d5ecb74b24c72b8c8b4567' },
                        action: { type: 'string', enum: ['block', 'unblock'], example: 'block' },
                        reason: { type: 'string', example: 'Holiday' }
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
            description: 'Bulk slot update completed',
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
                        updatedSlots: { type: 'number', example: 5 },
                        failedUpdates: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              slotId: { type: 'string' },
                              error: { type: 'string' }
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
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Not a doctor' }
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
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      DoctorProfile: {
        type: 'object',
        properties: {
          specialization: { type: 'string', example: 'Cardiology' },
          licenseNumber: { type: 'string', example: 'MD123456' },
          experience: { type: 'number', example: 10 },
          qualifications: { type: 'array', items: { type: 'string' }, example: ['MD', 'Board Certified'] },
          hospital: { type: 'string', example: 'General Hospital' }
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