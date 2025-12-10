import mongoose from 'mongoose';

const doctorScheduleSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Doctor ID is required']
  },
  dayOfWeek: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: [true, 'Day of week is required']
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
  slotDuration: {
    type: Number,
    default: 30,
    min: [15, 'Slot duration must be at least 15 minutes'],
    max: [120, 'Slot duration cannot exceed 120 minutes']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  breakTimes: [{
    startTime: {
      type: String,
      validate: {
        validator: function(time) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        },
        message: 'Break start time must be in HH:MM format'
      }
    },
    endTime: {
      type: String,
      validate: {
        validator: function(time) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        },
        message: 'Break end time must be in HH:MM format'
      }
    }
  }],
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

// Compound index to ensure one schedule per doctor per day
doctorScheduleSchema.index({ doctorId: 1, dayOfWeek: 1 }, { unique: true });

// Virtual for available slots count
doctorScheduleSchema.virtual('availableSlotsCount').get(function() {
  if (!this.startTime || !this.endTime) return 0;

  const start = new Date(`1970-01-01T${this.startTime}:00`);
  const end = new Date(`1970-01-01T${this.endTime}:00`);
  const duration = (end - start) / (1000 * 60); // in minutes

  // Subtract break times
  let breakDuration = 0;
  this.breakTimes.forEach(breakTime => {
    const breakStart = new Date(`1970-01-01T${breakTime.startTime}:00`);
    const breakEnd = new Date(`1970-01-01T${breakTime.endTime}:00`);
    breakDuration += (breakEnd - breakStart) / (1000 * 60);
  });

  const availableDuration = duration - breakDuration;
  return Math.floor(availableDuration / this.slotDuration);
});

const DoctorSchedule = mongoose.model('DoctorSchedule', doctorScheduleSchema);

export default DoctorSchedule;