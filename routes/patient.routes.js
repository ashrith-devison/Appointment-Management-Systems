import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import {
  getAvailableDoctors,
  getDoctorDetails,
  getDoctorAvailableSlots,
  bookAppointment,
  getPatientAppointments,
  cancelAppointment,
  confirmAppointmentPayment,
  getAppointmentDetails,
  rescheduleAppointment
} from '../controllers/patient/appointment.controller.js';
import ApiResponse from '../utils/ApiResponse.util.js';
import ApiError from '../utils/ApiError.util.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Public routes for browsing doctors (authenticated users)
router.get('/doctors', async (req, res, next) => {
  try {
    const result = await getAvailableDoctors(req.query);
    ApiResponse.success(result, 'Available doctors retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/doctors/:doctorId', async (req, res, next) => {
  try {
    const result = await getDoctorDetails(req.params.doctorId);
    ApiResponse.success(result, 'Doctor details retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/doctors/:doctorId/slots', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) {
      throw ApiError.badRequest('Date is required');
    }
    const result = await getDoctorAvailableSlots(req.params.doctorId, date);
    ApiResponse.success(result, 'Doctor available slots retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

// Appointment booking routes
router.post('/appointments/book/:slotId', authorize('patient'), async (req, res, next) => {
  try {
    const result = await bookAppointment(req.user, req.params.slotId, {
      ...req.body,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });
    ApiResponse.created(result, 'Appointment booked successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.post('/appointments/:appointmentId/payment/confirm', authorize('patient'), async (req, res, next) => {
  try {
    const result = await confirmAppointmentPayment(req.user, req.params.appointmentId, req.body);
    ApiResponse.success(result, 'Payment confirmed successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/appointments/:appointmentId', authorize('patient'), async (req, res, next) => {
  try {
    const result = await getAppointmentDetails(req.user, req.params.appointmentId);
    ApiResponse.success(result, 'Appointment details retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.put('/appointments/:appointmentId/reschedule/:newSlotId', authorize('patient'), async (req, res, next) => {
  try {
    const result = await rescheduleAppointment(req.user, req.params.appointmentId, req.params.newSlotId, req.body);
    ApiResponse.success(result, 'Appointment rescheduled successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.delete('/appointments/:appointmentId', authorize('patient'), async (req, res, next) => {
  try {
    const result = await cancelAppointment(req.user, req.params.appointmentId, req.body);
    ApiResponse.success(result, 'Appointment cancelled successfully').send(res);
  } catch (error) {
    next(error);
  }
});

router.get('/appointments', authorize('patient'), async (req, res, next) => {
  try {
    const result = await getPatientAppointments(req.user, req.query);
    ApiResponse.success(result, 'Patient appointments retrieved successfully').send(res);
  } catch (error) {
    next(error);
  }
});

export default router;

// Swagger configuration for patient routes
const swaggerConfig = {
  security: [
    {
      Authorization: []
    }
  ],
  paths: {
    '/patient/doctors': {
      get: {
        summary: 'Get available doctors',
        description: 'Retrieve a list of available doctors for patients to browse',
        tags: ['Patient - Doctor Browsing'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'query',
            name: 'specialization',
            schema: { type: 'string' },
            description: 'Filter by specialization'
          },
          {
            in: 'query',
            name: 'location',
            schema: { type: 'string' },
            description: 'Filter by location/city'
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
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            description: 'Items per page'
          }
        ],
        responses: {
          200: {
            description: 'Available doctors retrieved successfully',
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
                              specialization: { type: 'string' },
                              experience: { type: 'number' },
                              hospital: { type: 'string' },
                              rating: { type: 'number' },
                              nextAvailableSlot: { type: 'string', format: 'date-time' }
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
          401: { description: 'Unauthorized' }
        }
      }
    },
    '/patient/doctors/{doctorId}': {
      get: {
        summary: 'Get doctor details',
        description: 'Retrieve detailed information about a specific doctor',
        tags: ['Patient - Doctor Browsing'],
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
                        statistics: {
                          type: 'object',
                          properties: {
                            totalSlots: { type: 'number' },
                            availableSlots: { type: 'number' },
                            bookedSlots: { type: 'number' },
                            rating: { type: 'number' },
                            reviewCount: { type: 'number' }
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
          404: { description: 'Doctor not found' }
        }
      }
    },
    '/patient/doctors/{doctorId}/slots': {
      get: {
        summary: 'Get doctor available slots',
        description: 'Retrieve available time slots for a specific doctor on a given date',
        tags: ['Patient - Appointments'],
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
            required: true,
            schema: { type: 'string', format: 'date' },
            description: 'Date to check availability (YYYY-MM-DD)'
          }
        ],
        responses: {
          200: {
            description: 'Doctor available slots retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          _id: { type: 'string' },
                          date: { type: 'string', format: 'date' },
                          startTime: { type: 'string', format: 'time' },
                          endTime: { type: 'string', format: 'time' },
                          status: { type: 'string', enum: ['available', 'booked', 'blocked', 'cancelled'] }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: 'Date is required' },
          401: { description: 'Unauthorized' },
          404: { description: 'Doctor not found' }
        }
      }
    },
    '/patient/appointments/book/{slotId}': {
      post: {
        summary: 'Book appointment',
        description: 'Book an available time slot with a doctor',
        tags: ['Patient - Appointments'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'slotId',
            required: true,
            schema: { type: 'string' },
            description: 'Slot ID to book'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  notes: { type: 'string', example: 'Initial consultation for chest pain' },
                  reason: { type: 'string', example: 'Regular checkup' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Appointment booked successfully',
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
                        appointment: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            slotId: { type: 'string' },
                            doctorId: { type: 'string' },
                            patientId: { type: 'string' },
                            date: { type: 'string', format: 'date' },
                            startTime: { type: 'string', format: 'time' },
                            endTime: { type: 'string', format: 'time' },
                            status: { type: 'string', example: 'confirmed' },
                            notes: { type: 'string' },
                            createdAt: { type: 'string', format: 'date-time' }
                          }
                        },
                        doctor: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            specialization: { type: 'string' },
                            hospital: { type: 'string' }
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
          403: { description: 'Forbidden - Patient access required' },
          404: { description: 'Slot not found' },
          409: { description: 'Slot not available' }
        }
      }
    },
    '/patient/appointments': {
      get: {
        summary: 'Get patient appointments',
        description: 'Retrieve all appointments for the authenticated patient',
        tags: ['Patient - Appointments'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'query',
            name: 'status',
            schema: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'] },
            description: 'Filter by appointment status'
          },
          {
            in: 'query',
            name: 'date',
            schema: { type: 'string', format: 'date' },
            description: 'Filter by specific date'
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
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            description: 'Items per page'
          }
        ],
        responses: {
          200: {
            description: 'Patient appointments retrieved successfully',
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
                        appointments: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              _id: { type: 'string' },
                              slotId: { type: 'string' },
                              doctor: {
                                type: 'object',
                                properties: {
                                  _id: { type: 'string' },
                                  name: { type: 'string' },
                                  specialization: { type: 'string' },
                                  hospital: { type: 'string' }
                                }
                              },
                              date: { type: 'string', format: 'date' },
                              startTime: { type: 'string', format: 'time' },
                              endTime: { type: 'string', format: 'time' },
                              status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'] },
                              notes: { type: 'string' },
                              createdAt: { type: 'string', format: 'date-time' }
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
          403: { description: 'Forbidden - Patient access required' }
        }
      }
    },
    '/patient/appointments/{appointmentId}/payment/confirm': {
      post: {
        summary: 'Confirm appointment payment',
        description: 'Confirm payment for a booked appointment',
        tags: ['Patient - Appointments'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'appointmentId',
            required: true,
            schema: { type: 'string' },
            description: 'Appointment ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  paymentMethod: { type: 'string', enum: ['card', 'upi', 'wallet'], example: 'card' },
                  transactionId: { type: 'string', example: 'txn_123456789' },
                  amount: { type: 'number', example: 500 }
                },
                required: ['paymentMethod', 'transactionId', 'amount']
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Payment confirmed successfully',
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
                        appointment: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            status: { type: 'string', example: 'confirmed' },
                            paymentStatus: { type: 'string', example: 'paid' },
                            paymentDetails: {
                              type: 'object',
                              properties: {
                                transactionId: { type: 'string' },
                                amount: { type: 'number' },
                                paymentMethod: { type: 'string' },
                                paidAt: { type: 'string', format: 'date-time' }
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
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden - Patient access required' },
          404: { description: 'Appointment not found' },
          409: { description: 'Payment already processed or invalid payment details' }
        }
      }
    },
    '/patient/appointments/{appointmentId}': {
      get: {
        summary: 'Get appointment details',
        description: 'Retrieve detailed information about a specific appointment',
        tags: ['Patient - Appointments'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'appointmentId',
            required: true,
            schema: { type: 'string' },
            description: 'Appointment ID'
          }
        ],
        responses: {
          200: {
            description: 'Appointment details retrieved successfully',
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
                        appointment: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            slotId: { type: 'string' },
                            doctor: {
                              type: 'object',
                              properties: {
                                _id: { type: 'string' },
                                name: { type: 'string' },
                                specialization: { type: 'string' },
                                hospital: { type: 'string' },
                                experience: { type: 'number' }
                              }
                            },
                            date: { type: 'string', format: 'date' },
                            startTime: { type: 'string', format: 'time' },
                            endTime: { type: 'string', format: 'time' },
                            status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'] },
                            paymentStatus: { type: 'string', enum: ['pending', 'paid', 'refunded'] },
                            notes: { type: 'string' },
                            reason: { type: 'string' },
                            paymentDetails: {
                              type: 'object',
                              properties: {
                                amount: { type: 'number' },
                                transactionId: { type: 'string' },
                                paymentMethod: { type: 'string' },
                                paidAt: { type: 'string', format: 'date-time' }
                              }
                            },
                            createdAt: { type: 'string', format: 'date-time' },
                            updatedAt: { type: 'string', format: 'date-time' }
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
          403: { description: 'Forbidden - Not appointment owner' },
          404: { description: 'Appointment not found' }
        }
      },
      delete: {
        summary: 'Cancel appointment',
        description: 'Cancel a booked appointment with refund processing',
        tags: ['Patient - Appointments'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'appointmentId',
            required: true,
            schema: { type: 'string' },
            description: 'Appointment ID to cancel'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string', example: 'Emergency situation' },
                  notes: { type: 'string', example: 'Need to reschedule due to family emergency' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Appointment cancelled successfully',
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
                        appointment: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            status: { type: 'string', example: 'cancelled' },
                            cancelledAt: { type: 'string', format: 'date-time' },
                            refundStatus: { type: 'string', enum: ['pending', 'processed', 'failed'] }
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
          403: { description: 'Forbidden - Not appointment owner' },
          404: { description: 'Appointment not found' },
          409: { description: 'Cannot cancel appointment within 24 hours or already cancelled' }
        }
      }
    },
    '/patient/appointments/{appointmentId}/reschedule/{newSlotId}': {
      put: {
        summary: 'Reschedule appointment',
        description: 'Reschedule an existing appointment to a new time slot',
        tags: ['Patient - Appointments'],
        security: [{ Authorization: [] }],
        parameters: [
          {
            in: 'path',
            name: 'appointmentId',
            required: true,
            schema: { type: 'string' },
            description: 'Appointment ID to reschedule'
          },
          {
            in: 'path',
            name: 'newSlotId',
            required: true,
            schema: { type: 'string' },
            description: 'New slot ID for rescheduling'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string', example: 'Schedule conflict' },
                  notes: { type: 'string', example: 'Need to change to afternoon slot' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Appointment rescheduled successfully',
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
                        appointment: {
                          type: 'object',
                          properties: {
                            _id: { type: 'string' },
                            date: { type: 'string', format: 'date' },
                            startTime: { type: 'string', format: 'time' },
                            endTime: { type: 'string', format: 'time' },
                            status: { type: 'string', example: 'confirmed' },
                            rescheduledAt: { type: 'string', format: 'date-time' }
                          }
                        },
                        oldSlot: {
                          type: 'object',
                          properties: {
                            date: { type: 'string', format: 'date' },
                            startTime: { type: 'string', format: 'time' },
                            endTime: { type: 'string', format: 'time' }
                          }
                        },
                        newSlot: {
                          type: 'object',
                          properties: {
                            date: { type: 'string', format: 'date' },
                            startTime: { type: 'string', format: 'time' },
                            endTime: { type: 'string', format: 'time' }
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
          403: { description: 'Forbidden - Not appointment owner' },
          404: { description: 'Appointment or new slot not found' },
          409: { description: 'Cannot reschedule within 24 hours or slot not available' }
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
      Appointment: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '60d5ecb74b24c72b8c8b4567' },
          slotId: { type: 'string', example: '60d5ecb74b24c72b8c8b4568' },
          patientId: { type: 'string', example: '60d5ecb74b24c72b8c8b4569' },
          doctorId: { type: 'string', example: '60d5ecb74b24c72b8c8b4570' },
          date: { type: 'string', format: 'date', example: '2024-01-15' },
          startTime: { type: 'string', format: 'time', example: '10:00' },
          endTime: { type: 'string', format: 'time', example: '10:30' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled'], example: 'confirmed' },
          paymentStatus: { type: 'string', enum: ['pending', 'paid', 'refunded'], example: 'paid' },
          notes: { type: 'string', example: 'Initial consultation for chest pain' },
          reason: { type: 'string', example: 'Regular checkup' },
          paymentDetails: {
            type: 'object',
            properties: {
              amount: { type: 'number', example: 500 },
              transactionId: { type: 'string', example: 'txn_123456789' },
              paymentMethod: { type: 'string', enum: ['card', 'upi', 'wallet'], example: 'card' },
              paidAt: { type: 'string', format: 'date-time' },
              refundedAt: { type: 'string', format: 'date-time' },
              refundAmount: { type: 'number' }
            }
          },
          cancelledAt: { type: 'string', format: 'date-time' },
          rescheduledAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};

export { swaggerConfig };