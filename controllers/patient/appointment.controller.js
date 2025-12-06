import User from '../../models/users.model.js';
import AvailabilitySlot from '../../models/AvailabilitySlot.js';
import Appointment from '../../models/Appointment.js';
import ApiError from '../../utils/ApiError.util.js';
import redisCache from '../../utils/redis.js';
import distributedLock from '../../utils/distributedLock.js';
import paymentService from '../../utils/paymentService.js';
import notificationService from '../../utils/notificationService.js';
import retryUtility from '../../utils/retryUtility.js';

/**
 * Get available doctors with enhanced search capabilities
 * @param {Object} query - Query parameters
 * @returns {Object} - Available doctors
 */
export const getAvailableDoctors = async (query) => {
  const {
    specialization,
    symptoms,
    location,
    date,
    name,
    experience,
    page = 1,
    limit = 10,
    sortBy = 'rating',
    sortOrder = 'desc'
  } = query;

  const skip = (page - 1) * limit;

  let filter = { role: 'doctor', isActive: true };

  // Text search on name
  if (name) {
    filter.name = { $regex: name, $options: 'i' };
  }

  // Specialization filter
  if (specialization) {
    filter['doctorProfile.specialization'] = { $regex: specialization, $options: 'i' };
  }

  // Location filter
  if (location) {
    filter.$or = [
      { 'profile.address.city': { $regex: location, $options: 'i' } },
      { 'profile.address.state': { $regex: location, $options: 'i' } },
      { 'doctorProfile.hospital': { $regex: location, $options: 'i' } }
    ];
  }

  // Experience filter
  if (experience) {
    const expYears = parseInt(experience);
    if (!isNaN(expYears)) {
      filter['doctorProfile.experience'] = { $gte: expYears };
    }
  }

  // Symptom-based search (map symptoms to specializations)
  if (symptoms) {
    const symptomArray = Array.isArray(symptoms) ? symptoms : symptoms.split(',');
    const symptomSpecializations = mapSymptomsToSpecializations(symptomArray);

    if (symptomSpecializations.length > 0) {
      filter['doctorProfile.specialization'] = {
        $in: symptomSpecializations.map(spec => new RegExp(spec, 'i'))
      };
    }
  }

  // Availability filter
  if (date) {
    const queryDate = new Date(date);
    const dayName = queryDate.toLocaleLowerCase('en-US', { weekday: 'long' });

    // Find doctors who have schedules for this day
    const doctorsWithSchedules = await User.distinct('_id', {
      ...filter,
      [`doctorProfile.availability.days`]: dayName
    });

    // Find doctors who have available slots on this date
    const doctorsWithSlots = await AvailabilitySlot.distinct('doctorId', {
      date: {
        $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
        $lt: new Date(queryDate.setHours(23, 59, 59, 999))
      },
      status: 'available'
    });

    // Combine both conditions
    const availableDoctorIds = [...new Set([...doctorsWithSchedules, ...doctorsWithSlots])];
    filter._id = { $in: availableDoctorIds };
  }

  // Build sort object
  const sortOptions = {};
  switch (sortBy) {
    case 'name':
      sortOptions.name = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'experience':
      sortOptions['doctorProfile.experience'] = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'rating':
    default:
      sortOptions['doctorProfile.rating'] = sortOrder === 'asc' ? 1 : -1;
      break;
  }

  const doctors = await User.find(filter)
    .select('name email doctorProfile profile')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .lean();

  // Add availability info and calculated fees
  const doctorsWithAvailability = await Promise.all(
    doctors.map(async (doctor) => {
      // Get next available slot
      const nextSlot = await AvailabilitySlot.findOne({
        doctorId: doctor._id,
        date: { $gte: new Date() },
        status: 'available'
      }).sort({ date: 1, startTime: 1 });

      // Calculate consultation fee
      const consultationFee = paymentService.calculateFee(doctor);

      return {
        ...doctor,
        nextAvailableSlot: nextSlot ? {
          date: nextSlot.date,
          startTime: nextSlot.startTime,
          endTime: nextSlot.endTime
        } : null,
        consultationFee,
        totalSlots: await AvailabilitySlot.countDocuments({
          doctorId: doctor._id,
          date: { $gte: new Date() },
          status: 'available'
        })
      };
    })
  );

  const total = await User.countDocuments(filter);

  return {
    doctors: doctorsWithAvailability,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    filters: {
      applied: {
        specialization,
        symptoms: symptoms ? (Array.isArray(symptoms) ? symptoms : symptoms.split(',')) : undefined,
        location,
        date,
        name,
        experience
      }
    }
  };
};

/**
 * Map symptoms to medical specializations
 * @param {string[]} symptoms - Array of symptoms
 * @returns {string[]} - Array of specializations
 */
function mapSymptomsToSpecializations(symptoms) {
  const symptomMap = {
    // Cardiology
    'chest pain': ['cardiology', 'emergency medicine'],
    'heart palpitations': ['cardiology'],
    'shortness of breath': ['cardiology', 'pulmonology'],
    'high blood pressure': ['cardiology', 'internal medicine'],

    // Neurology
    'headache': ['neurology', 'internal medicine'],
    'dizziness': ['neurology', 'ent'],
    'seizures': ['neurology'],
    'memory loss': ['neurology', 'geriatrics'],

    // Dermatology
    'rash': ['dermatology'],
    'skin infection': ['dermatology', 'infectious disease'],
    'acne': ['dermatology'],

    // Orthopedics
    'joint pain': ['orthopedics', 'rheumatology'],
    'back pain': ['orthopedics', 'physical medicine'],
    'fracture': ['orthopedics', 'emergency medicine'],

    // General symptoms
    'fever': ['internal medicine', 'infectious disease'],
    'fatigue': ['internal medicine', 'endocrinology'],
    'nausea': ['gastroenterology', 'internal medicine'],
    'cough': ['pulmonology', 'internal medicine']
  };

  const specializations = new Set();

  symptoms.forEach(symptom => {
    const symptomLower = symptom.toLowerCase().trim();
    const mappedSpecs = symptomMap[symptomLower];
    if (mappedSpecs) {
      mappedSpecs.forEach(spec => specializations.add(spec));
    }
  });

  return Array.from(specializations);
}

/**
 * Get doctor details for patients
 * @param {string} doctorId - Doctor ID
 * @returns {Object} - Doctor details
 */
export const getDoctorDetails = async (doctorId) => {
  const doctor = await User.findOne({
    _id: doctorId,
    role: 'doctor',
    isActive: true
  })
    .select('name email doctorProfile')
    .lean();

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  // Get doctor's available slots for next 7 days
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  const availableSlots = await AvailabilitySlot.find({
    doctorId,
    date: { $gte: today, $lt: nextWeek },
    status: 'available'
  })
    .sort({ date: 1, startTime: 1 })
    .limit(50);

  return {
    doctor: {
      ...doctor,
      availableSlots
    }
  };
};

/**
 * Get doctor's available slots for a specific date
 * @param {string} doctorId - Doctor ID
 * @param {string} date - Date string
 * @returns {Object} - Available slots
 */
export const getDoctorAvailableSlots = async (doctorId, date) => {
  const doctor = await User.findOne({
    _id: doctorId,
    role: 'doctor',
    isActive: true
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const queryDate = new Date(date);
  const slots = await AvailabilitySlot.find({
    doctorId,
    date: {
      $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
      $lt: new Date(queryDate.setHours(23, 59, 59, 999))
    },
    status: 'available'
  }).sort({ startTime: 1 });

  return {
    doctorId,
    date,
    availableSlots: slots
  };
};

/**
 * Book an appointment with enhanced features
 * @param {Object} patient - Patient user object
 * @param {string} slotId - Slot ID to book
 * @param {Object} bookingData - Additional booking data
 * @returns {Object} - Booking confirmation
 */
export const bookAppointment = async (patient, slotId, bookingData = {}) => {
  const {
    reason,
    symptoms,
    notes,
    paymentMethod = 'card',
    idempotencyKey
  } = bookingData;

  // Check for idempotency if key provided
  if (idempotencyKey) {
    const existingAppointment = await Appointment.findOne({
      'metadata.idempotencyKey': idempotencyKey,
      patientId: patient._id
    });

    if (existingAppointment) {
      return {
        appointment: existingAppointment,
        message: 'Appointment already exists'
      };
    }
  }

  return await retryUtility.withRetry(async () => {
    return await distributedLock.withLock(`slot_booking_${slotId}`, async () => {
      // Fetch slot with populated doctor info
      const slot = await AvailabilitySlot.findById(slotId)
        .populate('doctorId', 'name email doctorProfile profile')
        .populate('scheduleId');

      if (!slot) {
        throw ApiError.notFound('Slot not found');
      }

      if (slot.status !== 'available') {
        throw ApiError.badRequest('Slot is not available');
      }

      // Check if slot is in the future
      const now = new Date();
      const slotDateTime = new Date(`${slot.date.toISOString().split('T')[0]}T${slot.startTime}:00`);

      if (slotDateTime <= now) {
        throw ApiError.badRequest('Cannot book past or current time slots');
      }

      // Check if patient already has a booking at this time
      const conflictingAppointment = await Appointment.findOne({
        patientId: patient._id,
        date: slot.date,
        startTime: slot.startTime,
        status: { $in: ['pending', 'confirmed'] }
      });

      if (conflictingAppointment) {
        throw ApiError.badRequest('You already have a booking at this time');
      }

      // Calculate payment amount
      const paymentAmount = paymentService.calculateFee(slot.doctorId);

      // Create appointment record
      const appointmentData = {
        slotId: slot._id,
        patientId: patient._id,
        doctorId: slot.doctorId._id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        reason: reason || '',
        symptoms: Array.isArray(symptoms) ? symptoms : symptoms ? symptoms.split(',').map(s => s.trim()) : [],
        notes: notes || '',
        payment: {
          amount: paymentAmount,
          currency: 'USD',
          paymentMethod
        },
        metadata: {
          source: 'api',
          userAgent: bookingData.userAgent,
          ipAddress: bookingData.ipAddress,
          idempotencyKey
        }
      };

      const appointment = new Appointment(appointmentData);

      // Save appointment with retry
      await retryUtility.withDbRetry(async () => {
        await appointment.save();
      });

      // Update slot status
      await slot.bookSlot(patient._id, appointment._id, notes);

      // Initiate payment
      let paymentResult = null;
      try {
        paymentResult = await retryUtility.withPaymentRetry(async () => {
          return await paymentService.initiatePayment(appointment, { paymentMethod });
        });

        if (paymentResult.success) {
          appointment.payment.status = 'pending';
          appointment.payment.transactionId = paymentResult.payment.transactionId;
          await appointment.save();
        }
      } catch (paymentError) {
        console.error('Payment initiation failed:', paymentError);
        // Continue with booking even if payment fails initially
      }

      // Send notifications
      try {
        await retryUtility.withNotificationRetry(async () => {
          await notificationService.sendBookingConfirmation(appointment, patient, slot.doctorId);
        });

        appointment.notifications.emailSent = true;
        await appointment.save();
      } catch (notificationError) {
        console.error('Notification sending failed:', notificationError);
        // Don't fail the booking if notifications fail
      }

      // Publish real-time update
      await redisCache.publish('slot_updates', {
        slotId: slot._id,
        doctorId: slot.doctorId._id,
        patientId: patient._id,
        appointmentId: appointment._id,
        action: 'booked',
        status: 'booked',
        timestamp: new Date()
      });

      // Clear cache
      await redisCache.del(`doctor_slots_${slot.doctorId._id}`);

      return {
        appointment: {
          appointmentId: appointment.appointmentId,
          slotId: slot._id,
          doctor: {
            id: slot.doctorId._id,
            name: slot.doctorId.name,
            email: slot.doctorId.email,
            specialization: slot.doctorId.doctorProfile?.specialization,
            hospital: slot.doctorId.doctorProfile?.hospital
          },
          patient: {
            id: patient._id,
            name: patient.name,
            email: patient.email
          },
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: appointment.status,
          reason: appointment.reason,
          symptoms: appointment.symptoms,
          notes: appointment.notes,
          payment: {
            amount: appointment.payment.amount,
            currency: appointment.payment.currency,
            status: appointment.payment.status,
            paymentUrl: paymentResult?.payment?.paymentUrl
          },
          createdAt: appointment.createdAt
        },
        paymentRequired: !paymentResult?.success,
        message: 'Appointment booked successfully'
      };
    }, 30); // 30 second lock
  }, {
    maxRetries: 3,
    shouldRetry: (error) => {
      // Retry on lock conflicts and some database errors
      return error.message.includes('lock') ||
             error.name === 'MongoNetworkError' ||
             error.code === 11000; // Duplicate key
    }
  });
};

/**
 * Get patient's appointments
 * @param {Object} patient - Patient user object
 * @param {Object} query - Query parameters
 * @returns {Object} - Patient appointments
 */
export const getPatientAppointments = async (patient, query) => {
  const { status, date, page = 1, limit = 10, sortBy = 'date', sortOrder = 'desc' } = query;
  const skip = (page - 1) * limit;

  let filter = { patientId: patient._id };

  if (status) {
    filter.status = status;
  }

  if (date) {
    const queryDate = new Date(date);
    filter.date = {
      $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
      $lt: new Date(queryDate.setHours(23, 59, 59, 999))
    };
  }

  // Build sort object
  const sortOptions = {};
  switch (sortBy) {
    case 'date':
      sortOptions.date = sortOrder === 'asc' ? 1 : -1;
      sortOptions.startTime = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'status':
      sortOptions.status = sortOrder === 'asc' ? 1 : -1;
      break;
    case 'createdAt':
      sortOptions.createdAt = sortOrder === 'asc' ? 1 : -1;
      break;
  }

  const appointments = await Appointment.find(filter)
    .populate('doctorId', 'name email doctorProfile')
    .populate('slotId')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  const total = await Appointment.countDocuments(filter);

  return {
    appointments: appointments.map(apt => ({
      appointmentId: apt.appointmentId,
      slotId: apt.slotId?._id,
      doctor: apt.doctorId ? {
        id: apt.doctorId._id,
        name: apt.doctorId.name,
        email: apt.doctorId.email,
        specialization: apt.doctorId.doctorProfile?.specialization,
        hospital: apt.doctorId.doctorProfile?.hospital
      } : null,
      date: apt.date,
      startTime: apt.startTime,
      endTime: apt.endTime,
      status: apt.status,
      reason: apt.reason,
      symptoms: apt.symptoms,
      notes: apt.notes,
      payment: apt.payment,
      cancellation: apt.cancellation,
      createdAt: apt.createdAt,
      updatedAt: apt.updatedAt
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

/**
 * Cancel appointment with refund handling
 * @param {Object} patient - Patient user object
 * @param {string} appointmentId - Appointment ID to cancel
 * @param {Object} cancellationData - Cancellation data
 * @returns {Object} - Cancellation confirmation
 */
export const cancelAppointment = async (patient, appointmentId, cancellationData = {}) => {
  const { reason = 'Patient cancelled' } = cancellationData;

  return await retryUtility.withRetry(async () => {
    // Find appointment
    const appointment = await Appointment.findOne({
      appointmentId,
      patientId: patient._id,
      status: { $in: ['pending', 'confirmed'] }
    })
    .populate('slotId')
    .populate('doctorId', 'name email doctorProfile');

    if (!appointment) {
      throw ApiError.notFound('Appointment not found or cannot be cancelled');
    }

    // Check if appointment is in the future (allow cancellation up to 2 hours before)
    const now = new Date();
    const appointmentDateTime = new Date(`${appointment.date.toISOString().split('T')[0]}T${appointment.startTime}:00`);
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (appointmentDateTime <= twoHoursFromNow) {
      throw ApiError.badRequest('Cannot cancel appointment less than 2 hours before the scheduled time');
    }

    // Cancel appointment
    await appointment.cancel(patient._id, reason);

    // Update slot status back to available
    if (appointment.slotId) {
      await appointment.slotId.cancelBooking();
    }

    // Process refund if payment was made
    let refundResult = null;
    if (appointment.payment.status === 'paid' && appointment.cancellation.refundAmount > 0) {
      try {
        refundResult = await retryUtility.withPaymentRetry(async () => {
          return await paymentService.processRefund(appointment, appointment.cancellation.refundAmount);
        });

        if (refundResult.success) {
          appointment.cancellation.refundStatus = 'processed';
          await appointment.save();
        } else {
          appointment.cancellation.refundStatus = 'failed';
          await appointment.save();
        }
      } catch (refundError) {
        console.error('Refund processing failed:', refundError);
        appointment.cancellation.refundStatus = 'failed';
        await appointment.save();
      }
    }

    // Send cancellation notifications
    try {
      await retryUtility.withNotificationRetry(async () => {
        await notificationService.sendCancellationNotification(
          appointment,
          patient, // cancelledBy
          patient, // patient
          appointment.doctorId // doctor
        );
      });
    } catch (notificationError) {
      console.error('Cancellation notification failed:', notificationError);
      // Don't fail cancellation if notifications fail
    }

    // Publish real-time update
    await redisCache.publish('slot_updates', {
      slotId: appointment.slotId?._id,
      doctorId: appointment.doctorId._id,
      patientId: patient._id,
      appointmentId: appointment._id,
      action: 'cancelled',
      status: 'available',
      timestamp: new Date()
    });

    // Clear cache
    await redisCache.del(`doctor_slots_${appointment.doctorId._id}`);

    return {
      appointment: {
        appointmentId: appointment.appointmentId,
        status: appointment.status,
        cancellation: {
          cancelledBy: patient.name,
          reason: appointment.cancellation.reason,
          cancelledAt: appointment.cancellation.cancelledAt,
          refundAmount: appointment.cancellation.refundAmount,
          refundStatus: appointment.cancellation.refundStatus
        }
      },
      refundProcessed: refundResult?.success || false,
      message: 'Appointment cancelled successfully'
    };
  }, {
    maxRetries: 3,
    shouldRetry: (error) => {
      return error.name === 'MongoNetworkError' || error.code === 11000;
    }
  });
};

/**
 * Confirm payment for an appointment
 * @param {Object} patient - Patient user object
 * @param {string} appointmentId - Appointment ID
 * @param {Object} paymentData - Payment confirmation data
 * @returns {Object} - Payment confirmation result
 */
export const confirmAppointmentPayment = async (patient, appointmentId, paymentData) => {
  const { transactionId, paymentMethod } = paymentData;

  const appointment = await Appointment.findOne({
    appointmentId,
    patientId: patient._id,
    status: { $in: ['pending', 'confirmed'] }
  });

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  if (appointment.payment.status === 'paid') {
    return {
      message: 'Payment already confirmed',
      appointment: {
        appointmentId: appointment.appointmentId,
        payment: appointment.payment
      }
    };
  }

  // Confirm payment
  const paymentResult = await retryUtility.withPaymentRetry(async () => {
    return await paymentService.confirmPayment(transactionId, {
      amount: appointment.payment.amount,
      currency: appointment.payment.currency
    });
  });

  if (!paymentResult.success) {
    throw ApiError.badRequest('Payment confirmation failed');
  }

  // Update appointment
  await appointment.markAsPaid(transactionId, paymentMethod);

  return {
    message: 'Payment confirmed successfully',
    appointment: {
      appointmentId: appointment.appointmentId,
      status: appointment.status,
      payment: appointment.payment
    }
  };
};

/**
 * Get appointment details by ID
 * @param {Object} patient - Patient user object
 * @param {string} appointmentId - Appointment ID
 * @returns {Object} - Appointment details
 */
export const getAppointmentDetails = async (patient, appointmentId) => {
  const appointment = await Appointment.findOne({
    appointmentId,
    patientId: patient._id
  })
  .populate('doctorId', 'name email doctorProfile')
  .populate('slotId');

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  return {
    appointment: {
      appointmentId: appointment.appointmentId,
      slotId: appointment.slotId?._id,
      doctor: appointment.doctorId ? {
        id: appointment.doctorId._id,
        name: appointment.doctorId.name,
        email: appointment.doctorId.email,
        specialization: appointment.doctorId.doctorProfile?.specialization,
        hospital: appointment.doctorId.doctorProfile?.hospital
      } : null,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      reason: appointment.reason,
      symptoms: appointment.symptoms,
      notes: appointment.notes,
      payment: appointment.payment,
      cancellation: appointment.cancellation,
      notifications: appointment.notifications,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt
    }
  };
};

/**
 * Reschedule appointment (cancel current and create new)
 * @param {Object} patient - Patient user object
 * @param {string} appointmentId - Current appointment ID
 * @param {string} newSlotId - New slot ID
 * @param {Object} rescheduleData - Reschedule data
 * @returns {Object} - Reschedule result
 */
export const rescheduleAppointment = async (patient, appointmentId, newSlotId, rescheduleData = {}) => {
  // First cancel the current appointment
  const cancellationResult = await cancelAppointment(patient, appointmentId, {
    reason: 'Rescheduled to different time'
  });

  // Then book the new appointment
  const bookingResult = await bookAppointment(patient, newSlotId, {
    ...rescheduleData,
    reason: rescheduleData.reason || 'Rescheduled appointment'
  });

  return {
    cancelledAppointment: cancellationResult.appointment,
    newAppointment: bookingResult.appointment,
    message: 'Appointment rescheduled successfully'
  };
};