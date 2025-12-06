import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import {
  getDoctorsForStaff,
  getDoctorSlotsForStaff,
  blockSlot,
  unblockSlot,
  bulkBlockSlots,
  bulkUnblockSlots,
  getSlotStatistics
} from '../controllers/staff/slotManagement.controller.js';
import ApiResponse from '../utils/ApiResponse.util.js';

const router = express.Router();

// All routes require authentication and staff authorization
router.use(authenticate);
router.use(authorize('staff'));

// Doctor browsing for staff
router.get('/doctors', async (req, res, next) => {
  try {
    const result = await getDoctorsForStaff(req.query);
    ApiResponse.success(result, 'Doctors retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Slot management routes
router.get('/doctors/:doctorId/slots', async (req, res, next) => {
  try {
    const result = await getDoctorSlotsForStaff(req.params.doctorId, req.query);
    ApiResponse.success(result, 'Doctor slots retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/slots/:slotId/block', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await blockSlot(req.user, req.params.slotId, reason);
    ApiResponse.success(result, 'Slot blocked successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/slots/:slotId/unblock', async (req, res, next) => {
  try {
    const result = await unblockSlot(req.user, req.params.slotId);
    ApiResponse.success(result, 'Slot unblocked successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/slots/bulk/block', async (req, res, next) => {
  try {
    const { slotIds, reason } = req.body;
    const result = await bulkBlockSlots(req.user, slotIds, reason);
    ApiResponse.success(result, 'Bulk block operation completed').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/slots/bulk/unblock', async (req, res, next) => {
  try {
    const { slotIds } = req.body;
    const result = await bulkUnblockSlots(req.user, slotIds);
    ApiResponse.success(result, 'Bulk unblock operation completed').send(res);
  } catch (error) {
    next(error);
  }
});

// Statistics route
router.get('/statistics/slots', async (req, res, next) => {
  try {
    const result = await getSlotStatistics(req.query);
    ApiResponse.success(result, 'Slot statistics retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

export default router;

// Swagger configuration for staff routes
const swaggerConfig = {
  security: [
    {
      Authorization: []
    }
  ],
  paths: {
    '/staff/doctors': {
      get: {
        summary: 'Get doctors for staff',
        description: 'Retrieve a list of doctors for staff to manage',
        tags: ['Staff - Doctor Management'],
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
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            description: 'Items per page'
          },
          {
            in: 'query',
            name: 'search',
            schema: { type: 'string' },
            description: 'Search by doctor name or email'
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
                          items: {
                            type: 'object',
                            properties: {
                              _id: { type: 'string' },
                              name: { type: 'string' },
                              email: { type: 'string' },
                              specialization: { type: 'string' },
                              hospital: { type: 'string' },
                              totalSlots: { type: 'number' },
                              availableSlots: { type: 'number' },
                              blockedSlots: { type: 'number' }
                            }
                          }
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
          403: { description: 'Forbidden - Staff access required' }
        }
      }
    },
    '/staff/doctors/{doctorId}/slots': {
      get: {
        summary: 'Get doctor slots for staff',
        description: 'Retrieve availability slots for a specific doctor (staff view)',
        tags: ['Staff - Slot Management'],
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
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
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
          403: { description: 'Forbidden - Staff access required' }
        }
      }
    },
    '/staff/slots/{slotId}/block': {
      put: {
        summary: 'Block a slot',
        description: 'Block an available slot for maintenance or other reasons',
        tags: ['Staff - Slot Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'slotId',
            required: true,
            schema: { type: 'string' },
            description: 'Slot ID to block'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string', example: 'Doctor unavailable due to emergency' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Slot blocked successfully',
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
          403: { description: 'Forbidden - Staff access required' },
          404: { description: 'Slot not found' },
          409: { description: 'Slot is already booked or blocked' }
        }
      }
    },
    '/staff/slots/{slotId}/unblock': {
      put: {
        summary: 'Unblock a slot',
        description: 'Unblock a previously blocked slot',
        tags: ['Staff - Slot Management'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'slotId',
            required: true,
            schema: { type: 'string' },
            description: 'Slot ID to unblock'
          }
        ],
        responses: {
          200: {
            description: 'Slot unblocked successfully',
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
          403: { description: 'Forbidden - Staff access required' },
          404: { description: 'Slot not found' },
          409: { description: 'Slot is not blocked' }
        }
      }
    },
    '/staff/slots/bulk/block': {
      put: {
        summary: 'Bulk block slots',
        description: 'Block multiple slots at once',
        tags: ['Staff - Slot Management'],
        security: [{ Authorization: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['slotIds'],
                properties: {
                  slotIds: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['60d5ecb74b24c72b8c8b4567', '60d5ecb74b24c72b8c8b4568']
                  },
                  reason: { type: 'string', example: 'Clinic closure for maintenance' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk block operation completed',
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
                        blockedSlots: { type: 'number', example: 5 },
                        failedBlocks: {
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
          403: { description: 'Forbidden - Staff access required' }
        }
      }
    },
    '/staff/slots/bulk/unblock': {
      put: {
        summary: 'Bulk unblock slots',
        description: 'Unblock multiple slots at once',
        tags: ['Staff - Slot Management'],
        security: [{ Authorization: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['slotIds'],
                properties: {
                  slotIds: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['60d5ecb74b24c72b8c8b4567', '60d5ecb74b24c72b8c8b4568']
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Bulk unblock operation completed',
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
                        unblockedSlots: { type: 'number', example: 3 },
                        failedUnblocks: {
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
          403: { description: 'Forbidden - Staff access required' }
        }
      }
    },
    '/staff/statistics/slots': {
      get: {
        summary: 'Get slot statistics',
        description: 'Retrieve statistics about slot availability and usage',
        tags: ['Staff - Statistics'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'query',
            name: 'startDate',
            schema: { type: 'string', format: 'date' },
            description: 'Start date for statistics (default: 30 days ago)'
          },
          {
            in: 'query',
            name: 'endDate',
            schema: { type: 'string', format: 'date' },
            description: 'End date for statistics (default: today)'
          },
          {
            in: 'query',
            name: 'doctorId',
            schema: { type: 'string' },
            description: 'Filter by specific doctor'
          }
        ],
        responses: {
          200: {
            description: 'Slot statistics retrieved successfully',
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
                        totalSlots: { type: 'number', example: 1000 },
                        availableSlots: { type: 'number', example: 750 },
                        bookedSlots: { type: 'number', example: 200 },
                        blockedSlots: { type: 'number', example: 50 },
                        utilizationRate: { type: 'number', example: 25.0 },
                        doctorBreakdown: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              doctorId: { type: 'string' },
                              doctorName: { type: 'string' },
                              totalSlots: { type: 'number' },
                              availableSlots: { type: 'number' },
                              bookedSlots: { type: 'number' },
                              blockedSlots: { type: 'number' },
                              utilizationRate: { type: 'number' }
                            }
                          }
                        },
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
          403: { description: 'Forbidden - Staff access required' }
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