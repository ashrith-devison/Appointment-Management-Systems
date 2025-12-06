import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  appointmentId: {
    type: String,
    required: [true, 'Appointment ID is required'],
    unique: true,
    index: true
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AvailabilitySlot',
    required: [true, 'Slot ID is required']
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient ID is required']
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Appointment date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required']
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'],
    default: 'pending'
  },
  bookingType: {
    type: String,
    enum: ['online', 'walk_in'],
    default: 'online'
  },
  reason: {
    type: String,
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  symptoms: [{
    type: String,
    maxlength: [100, 'Each symptom cannot exceed 100 characters']
  }],
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  payment: {
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'refunded', 'failed'],
      default: 'pending'
    },
    transactionId: String,
    paymentMethod: {
      type: String,
      enum: ['card', 'bank_transfer', 'cash', 'insurance']
    },
    paidAt: Date
  },
  cancellation: {
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      maxlength: [500, 'Cancellation reason cannot exceed 500 characters']
    },
    cancelledAt: Date,
    refundAmount: Number,
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'processed', 'failed'],
      default: 'none'
    }
  },
  notifications: {
    emailSent: { type: Boolean, default: false },
    smsSent: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false }
  },
  metadata: {
    source: { type: String, default: 'api' },
    userAgent: String,
    ipAddress: String,
    idempotencyKey: String
  },
  retryCount: {
    type: Number,
    default: 0,
    max: [5, 'Maximum retry attempts exceeded']
  },
  lastRetryAt: Date
}, {
  timestamps: true
});

// Compound indexes for efficient queries
appointmentSchema.index({ patientId: 1, date: -1 });
appointmentSchema.index({ doctorId: 1, date: -1 });
appointmentSchema.index({ status: 1, date: 1 });
appointmentSchema.index({ appointmentId: 1 }, { unique: true });
appointmentSchema.index({ 'payment.transactionId': 1 });

// Pre-save middleware
appointmentSchema.pre('save', function(next) {
  // Generate appointment ID if not provided
  if (!this.appointmentId) {
    this.appointmentId = `APT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  next();
});

// Instance methods
appointmentSchema.methods.markAsPaid = function(transactionId, paymentMethod = 'card') {
  this.payment.status = 'paid';
  this.payment.transactionId = transactionId;
  this.payment.paymentMethod = paymentMethod;
  this.payment.paidAt = new Date();
  this.status = 'confirmed';
  return this.save();
};

appointmentSchema.methods.cancel = function(cancelledBy, reason = '') {
  this.status = 'cancelled';
  this.cancellation.cancelledBy = cancelledBy;
  this.cancellation.reason = reason;
  this.cancellation.cancelledAt = new Date();

  // Handle refund if payment was made
  if (this.payment.status === 'paid') {
    this.cancellation.refundStatus = 'pending';
    // Calculate refund amount based on cancellation policy
    const now = new Date();
    const appointmentDateTime = new Date(`${this.date.toISOString().split('T')[0]}T${this.startTime}:00`);
    const hoursDiff = (appointmentDateTime - now) / (1000 * 60 * 60);

    if (hoursDiff >= 24) {
      this.cancellation.refundAmount = this.payment.amount; // 100% refund
    } else if (hoursDiff >= 2) {
      this.cancellation.refundAmount = this.payment.amount * 0.5; // 50% refund
    } else {
      this.cancellation.refundAmount = 0; // No refund
    }
  }

  return this.save();
};

appointmentSchema.methods.complete = function() {
  this.status = 'completed';
  return this.save();
};

// Static methods
appointmentSchema.statics.findByAppointmentId = function(appointmentId) {
  return this.findOne({ appointmentId });
};

appointmentSchema.statics.getPatientAppointments = function(patientId, filters = {}) {
  const query = { patientId };

  if (filters.status) query.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};
    if (filters.dateFrom) query.date.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.date.$lte = new Date(filters.dateTo);
  }

  return this.find(query)
    .populate('doctorId', 'name email doctorProfile')
    .populate('slotId')
    .sort({ date: -1, startTime: -1 });
};

appointmentSchema.statics.getDoctorAppointments = function(doctorId, filters = {}) {
  const query = { doctorId };

  if (filters.status) query.status = filters.status;
  if (filters.date) query.date = new Date(filters.date);
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};
    if (filters.dateFrom) query.date.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.date.$lte = new Date(filters.dateTo);
  }

  return this.find(query)
    .populate('patientId', 'name email profile')
    .populate('slotId')
    .sort({ date: -1, startTime: -1 });
};

const Appointment = mongoose.model('Appointment', appointmentSchema);

export default Appointment;