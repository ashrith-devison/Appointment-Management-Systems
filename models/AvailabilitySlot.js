import mongoose from 'mongoose';

const availabilitySlotSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor ID is required']
  },
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DoctorSchedule',
    required: [true, 'Schedule ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    validate: {
      validator: function(time) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    validate: {
      validator: function(time) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      },
      message: 'End time must be in HH:MM format'
    }
  },
  status: {
    type: String,
    enum: ['available', 'booked', 'blocked', 'cancelled'],
    default: 'available'
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  blockedReason: {
    type: String,
    maxlength: [200, 'Block reason cannot exceed 200 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
availabilitySlotSchema.index({ doctorId: 1, date: 1, startTime: 1 });
availabilitySlotSchema.index({ doctorId: 1, status: 1 });
availabilitySlotSchema.index({ date: 1, status: 1 });

// Pre-save middleware to update the updatedAt field
availabilitySlotSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get available slots for a doctor on a specific date
availabilitySlotSchema.statics.getAvailableSlots = function(doctorId, date) {
  return this.find({
    doctorId,
    date: {
      $gte: new Date(date.setHours(0, 0, 0, 0)),
      $lt: new Date(date.setHours(23, 59, 59, 999))
    },
    status: 'available'
  }).sort({ startTime: 1 });
};

// Static method to check slot availability
availabilitySlotSchema.statics.isSlotAvailable = function(doctorId, date, startTime, endTime) {
  return this.findOne({
    doctorId,
    date,
    startTime,
    endTime,
    status: { $in: ['available', 'blocked'] }
  });
};

// Instance method to book a slot
availabilitySlotSchema.methods.bookSlot = function(patientId, appointmentId, notes) {
  this.status = 'booked';
  this.patientId = patientId;
  this.appointmentId = appointmentId;
  this.notes = notes;
  return this.save();
};

// Instance method to cancel a booking
availabilitySlotSchema.methods.cancelBooking = function() {
  this.status = 'available';
  this.patientId = undefined;
  this.appointmentId = undefined;
  this.notes = undefined;
  return this.save();
};

// Instance method to block a slot
availabilitySlotSchema.methods.blockSlot = function(blockedBy, reason) {
  this.status = 'blocked';
  this.blockedBy = blockedBy;
  this.blockedReason = reason;
  return this.save();
};

// Instance method to unblock a slot
availabilitySlotSchema.methods.unblockSlot = function() {
  this.status = 'available';
  this.blockedBy = undefined;
  this.blockedReason = undefined;
  return this.save();
};

const AvailabilitySlot = mongoose.model('AvailabilitySlot', availabilitySlotSchema);

export default AvailabilitySlot;