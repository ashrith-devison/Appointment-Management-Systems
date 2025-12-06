import { sendEmail } from './email.js';

/**
 * Notification service for sending emails and SMS
 */
class NotificationService {
  /**
   * Send appointment booking confirmation
   * @param {Object} appointment - Appointment object
   * @param {Object} patient - Patient user object
   * @param {Object} doctor - Doctor user object
   * @returns {Promise<Object>} - Notification result
   */
  async sendBookingConfirmation(appointment, patient, doctor) {
    const results = {
      email: { patient: false, doctor: false },
      sms: { patient: false, doctor: false }
    };

    try {
      // Send email to patient
      const patientEmailResult = await this.sendBookingEmail(patient, doctor, appointment, 'patient');
      results.email.patient = patientEmailResult.success;

      // Send email to doctor
      const doctorEmailResult = await this.sendBookingEmail(doctor, patient, appointment, 'doctor');
      results.email.doctor = doctorEmailResult.success;

      // Send SMS to patient (stub)
      results.sms.patient = await this.sendBookingSMS(patient, appointment, 'patient');

      // Send SMS to doctor (stub)
      results.sms.doctor = await this.sendBookingSMS(doctor, appointment, 'doctor');

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Notification error:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Send appointment cancellation notification
   * @param {Object} appointment - Appointment object
   * @param {Object} cancelledBy - User who cancelled
   * @param {Object} patient - Patient user object
   * @param {Object} doctor - Doctor user object
   * @returns {Promise<Object>} - Notification result
   */
  async sendCancellationNotification(appointment, cancelledBy, patient, doctor) {
    const results = {
      email: { patient: false, doctor: false },
      sms: { patient: false, doctor: false }
    };

    try {
      // Send email to patient
      const patientEmailResult = await this.sendCancellationEmail(patient, doctor, appointment, cancelledBy);
      results.email.patient = patientEmailResult.success;

      // Send email to doctor
      const doctorEmailResult = await this.sendCancellationEmail(doctor, patient, appointment, cancelledBy);
      results.email.doctor = doctorEmailResult.success;

      // Send SMS notifications
      results.sms.patient = await this.sendCancellationSMS(patient, appointment);
      results.sms.doctor = await this.sendCancellationSMS(doctor, appointment);

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Cancellation notification error:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Send appointment reminder
   * @param {Object} appointment - Appointment object
   * @param {Object} patient - Patient user object
   * @param {Object} doctor - Doctor user object
   * @returns {Promise<Object>} - Notification result
   */
  async sendAppointmentReminder(appointment, patient, doctor) {
    const results = {
      email: { patient: false },
      sms: { patient: false }
    };

    try {
      // Send reminder email to patient
      const emailResult = await this.sendReminderEmail(patient, doctor, appointment);
      results.email.patient = emailResult.success;

      // Send reminder SMS to patient
      results.sms.patient = await this.sendReminderSMS(patient, appointment);

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Reminder notification error:', error);
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Send booking confirmation email
   * @private
   */
  async sendBookingEmail(recipient, otherParty, appointment, recipientType) {
    const subject = `Appointment ${recipientType === 'patient' ? 'Booked' : 'Scheduled'}: ${appointment.appointmentId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Appointment ${recipientType === 'patient' ? 'Booked' : 'Scheduled'}</h2>
        <p>Dear ${recipient.name},</p>

        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3>Appointment Details</h3>
          <p><strong>Appointment ID:</strong> ${appointment.appointmentId}</p>
          <p><strong>${recipientType === 'patient' ? 'Doctor' : 'Patient'}:</strong> ${otherParty.name}</p>
          <p><strong>Date:</strong> ${appointment.date.toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${appointment.startTime} - ${appointment.endTime}</p>
          <p><strong>Status:</strong> ${appointment.status}</p>
          ${appointment.reason ? `<p><strong>Reason:</strong> ${appointment.reason}</p>` : ''}
          ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
        </div>

        <p>Please arrive 15 minutes before your scheduled appointment time.</p>
        <p>If you need to reschedule or cancel, please contact us at least 2 hours in advance.</p>

        <p>Best regards,<br>Medical Appointment System</p>
      </div>
    `;

    try {
      const result = await sendEmail(recipient.email, subject, html);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send cancellation email
   * @private
   */
  async sendCancellationEmail(recipient, otherParty, appointment, cancelledBy) {
    const subject = `Appointment Cancelled: ${appointment.appointmentId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Appointment Cancelled</h2>
        <p>Dear ${recipient.name},</p>

        <div style="background-color: #ffebee; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3>Cancelled Appointment Details</h3>
          <p><strong>Appointment ID:</strong> ${appointment.appointmentId}</p>
          <p><strong>${recipient === cancelledBy ? 'You cancelled' : 'Cancelled by'}:</strong> ${cancelledBy.name}</p>
          <p><strong>Original Date:</strong> ${appointment.date.toLocaleDateString()}</p>
          <p><strong>Original Time:</strong> ${appointment.startTime} - ${appointment.endTime}</p>
          ${appointment.cancellation?.reason ? `<p><strong>Cancellation Reason:</strong> ${appointment.cancellation.reason}</p>` : ''}
        </div>

        ${appointment.cancellation?.refundAmount > 0 ?
          `<p><strong>Refund Amount:</strong> $${appointment.cancellation.refundAmount} (${appointment.payment.currency})</p>
           <p>Your refund will be processed within 5-7 business days.</p>` :
          '<p>No refund is applicable for this cancellation.</p>'
        }

        <p>If you have any questions, please contact our support team.</p>

        <p>Best regards,<br>Medical Appointment System</p>
      </div>
    `;

    try {
      const result = await sendEmail(recipient.email, subject, html);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send reminder email
   * @private
   */
  async sendReminderEmail(patient, doctor, appointment) {
    const subject = `Appointment Reminder: ${appointment.appointmentId}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Appointment Reminder</h2>
        <p>Dear ${patient.name},</p>

        <div style="background-color: #e3f2fd; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3>Your appointment is tomorrow!</h3>
          <p><strong>Appointment ID:</strong> ${appointment.appointmentId}</p>
          <p><strong>Doctor:</strong> ${doctor.name}</p>
          <p><strong>Date:</strong> ${appointment.date.toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${appointment.startTime} - ${appointment.endTime}</p>
        </div>

        <p>Please remember to:</p>
        <ul>
          <li>Arrive 15 minutes before your scheduled time</li>
          <li>Bring any relevant medical records</li>
          <li>Bring your insurance information if applicable</li>
        </ul>

        <p>If you need to reschedule, please contact us as soon as possible.</p>

        <p>Best regards,<br>Medical Appointment System</p>
      </div>
    `;

    try {
      const result = await sendEmail(patient.email, subject, html);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send booking SMS (stub)
   * @private
   */
  async sendBookingSMS(recipient, appointment, recipientType) {
    try {
      // This is a stub - in a real implementation, this would integrate with an SMS service
      // like Twilio, AWS SNS, etc.

      const message = recipientType === 'patient'
        ? `Your appointment ${appointment.appointmentId} is confirmed for ${appointment.date.toLocaleDateString()} at ${appointment.startTime}.`
        : `New appointment ${appointment.appointmentId} scheduled for ${appointment.date.toLocaleDateString()} at ${appointment.startTime}.`;

      console.log(`SMS Stub: Sending to ${recipient.profile?.phone || 'N/A'}: ${message}`);

      // Simulate SMS sending delay
      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error) {
      console.error('SMS sending error:', error);
      return false;
    }
  }

  /**
   * Send cancellation SMS (stub)
   * @private
   */
  async sendCancellationSMS(recipient, appointment) {
    try {
      const message = `Your appointment ${appointment.appointmentId} has been cancelled.`;

      console.log(`SMS Stub: Sending to ${recipient.profile?.phone || 'N/A'}: ${message}`);

      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error) {
      console.error('SMS sending error:', error);
      return false;
    }
  }

  /**
   * Send reminder SMS (stub)
   * @private
   */
  async sendReminderSMS(patient, appointment) {
    try {
      const message = `Reminder: Your appointment ${appointment.appointmentId} is tomorrow at ${appointment.startTime}.`;

      console.log(`SMS Stub: Sending to ${patient.profile?.phone || 'N/A'}: ${message}`);

      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error) {
      console.error('SMS sending error:', error);
      return false;
    }
  }
}

const notificationService = new NotificationService();

export default notificationService;