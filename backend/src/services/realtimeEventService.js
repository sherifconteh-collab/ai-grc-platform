// @tier: enterprise
'use strict';

const { emitToUser, emitToOrganization, broadcast } = require('./websocketService');
const { log } = require('../utils/logger');

/**
 * Real-time event types
 */
const EVENT_TYPES = {
  // Notification events
  NOTIFICATION_NEW: 'notification.new',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_READ_ALL: 'notification.read_all',
  
  // Control events
  CONTROL_UPDATED: 'control.updated',
  CONTROL_STATUS_CHANGED: 'control.status_changed',
  CONTROL_DUE_SOON: 'control.due_soon',
  
  // Assessment events
  ASSESSMENT_CREATED: 'assessment.created',
  ASSESSMENT_UPDATED: 'assessment.updated',
  ASSESSMENT_COMPLETED: 'assessment.completed',
  ASSESSMENT_ASSIGNED: 'assessment.assigned',
  
  // Evidence events
  EVIDENCE_UPLOADED: 'evidence.uploaded',
  EVIDENCE_APPROVED: 'evidence.approved',
  EVIDENCE_REJECTED: 'evidence.rejected',
  
  // Vulnerability events
  VULNERABILITY_CREATED: 'vulnerability.created',
  VULNERABILITY_UPDATED: 'vulnerability.updated',
  VULNERABILITY_REMEDIATED: 'vulnerability.remediated',
  
  // POA&M events
  POAM_CREATED: 'poam.created',
  POAM_UPDATED: 'poam.updated',
  POAM_COMPLETED: 'poam.completed',
  
  // User presence events
  USER_ONLINE: 'user.online',
  USER_OFFLINE: 'user.offline',
  
  // System events
  SYSTEM_ALERT: 'system.alert',
  SYSTEM_MAINTENANCE: 'system.maintenance',
  
  // Audit events
  AUDIT_CREATED: 'audit.created',
  AUDIT_UPDATED: 'audit.updated',
  
  // Exception events
  EXCEPTION_CREATED: 'exception.created',
  EXCEPTION_EXPIRING: 'exception.expiring'
};

/**
 * Emit a new notification event
 * @param {string} userId - User UUID (null for organization-wide)
 * @param {string} organizationId - Organization UUID
 * @param {object} notification - Notification data
 */
function notificationNew(userId, organizationId, notification) {
  try {
    if (userId) {
      emitToUser(userId, EVENT_TYPES.NOTIFICATION_NEW, { notification });
    } else {
      emitToOrganization(organizationId, EVENT_TYPES.NOTIFICATION_NEW, { notification });
    }
    
    log('debug', 'realtime.notification.new', {
      userId,
      organizationId,
      notificationType: notification.type
    });
  } catch (error) {
    log('error', 'realtime.notification.new.failed', { error: error.message });
  }
}

/**
 * Emit notification read event
 * @param {string} userId - User UUID
 * @param {string} notificationId - Notification UUID
 */
function notificationRead(userId, notificationId) {
  try {
    emitToUser(userId, EVENT_TYPES.NOTIFICATION_READ, { notificationId });
    
    log('debug', 'realtime.notification.read', { userId, notificationId });
  } catch (error) {
    log('error', 'realtime.notification.read.failed', { error: error.message });
  }
}

/**
 * Emit notification read all event
 * @param {string} userId - User UUID
 */
function notificationReadAll(userId) {
  try {
    emitToUser(userId, EVENT_TYPES.NOTIFICATION_READ_ALL, {});
    
    log('debug', 'realtime.notification.read_all', { userId });
  } catch (error) {
    log('error', 'realtime.notification.read_all.failed', { error: error.message });
  }
}

/**
 * Emit control updated event
 * @param {string} organizationId - Organization UUID
 * @param {object} control - Control data
 */
function controlUpdated(organizationId, control) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.CONTROL_UPDATED, { control });
    
    log('debug', 'realtime.control.updated', {
      organizationId,
      controlId: control.id
    });
  } catch (error) {
    log('error', 'realtime.control.updated.failed', { error: error.message });
  }
}

/**
 * Emit control status changed event
 * @param {string} organizationId - Organization UUID
 * @param {object} control - Control data
 */
function controlStatusChanged(organizationId, control) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.CONTROL_STATUS_CHANGED, { control });
    
    log('debug', 'realtime.control.status_changed', {
      organizationId,
      controlId: control.id,
      status: control.status
    });
  } catch (error) {
    log('error', 'realtime.control.status_changed.failed', { error: error.message });
  }
}

/**
 * Emit assessment created event
 * @param {string} organizationId - Organization UUID
 * @param {object} assessment - Assessment data
 */
function assessmentCreated(organizationId, assessment) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.ASSESSMENT_CREATED, { assessment });
    
    log('debug', 'realtime.assessment.created', {
      organizationId,
      assessmentId: assessment.id
    });
  } catch (error) {
    log('error', 'realtime.assessment.created.failed', { error: error.message });
  }
}

/**
 * Emit assessment completed event
 * @param {string} organizationId - Organization UUID
 * @param {object} assessment - Assessment data
 */
function assessmentCompleted(organizationId, assessment) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.ASSESSMENT_COMPLETED, { assessment });
    
    log('debug', 'realtime.assessment.completed', {
      organizationId,
      assessmentId: assessment.id
    });
  } catch (error) {
    log('error', 'realtime.assessment.completed.failed', { error: error.message });
  }
}

/**
 * Emit evidence uploaded event
 * @param {string} organizationId - Organization UUID
 * @param {object} evidence - Evidence data
 */
function evidenceUploaded(organizationId, evidence) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.EVIDENCE_UPLOADED, { evidence });
    
    log('debug', 'realtime.evidence.uploaded', {
      organizationId,
      evidenceId: evidence.id
    });
  } catch (error) {
    log('error', 'realtime.evidence.uploaded.failed', { error: error.message });
  }
}

/**
 * Emit vulnerability created event
 * @param {string} organizationId - Organization UUID
 * @param {object} vulnerability - Vulnerability data
 */
function vulnerabilityCreated(organizationId, vulnerability) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.VULNERABILITY_CREATED, { vulnerability });
    
    log('debug', 'realtime.vulnerability.created', {
      organizationId,
      vulnerabilityId: vulnerability.id,
      severity: vulnerability.severity
    });
  } catch (error) {
    log('error', 'realtime.vulnerability.created.failed', { error: error.message });
  }
}

/**
 * Emit POA&M updated event
 * @param {string} organizationId - Organization UUID
 * @param {object} poam - POA&M data
 */
function poamUpdated(organizationId, poam) {
  try {
    emitToOrganization(organizationId, EVENT_TYPES.POAM_UPDATED, { poam });
    
    log('debug', 'realtime.poam.updated', {
      organizationId,
      poamId: poam.id
    });
  } catch (error) {
    log('error', 'realtime.poam.updated.failed', { error: error.message });
  }
}

/**
 * Emit system alert event
 * @param {string} organizationId - Organization UUID (null for all)
 * @param {object} alert - Alert data
 */
function systemAlert(organizationId, alert) {
  try {
    if (organizationId) {
      emitToOrganization(organizationId, EVENT_TYPES.SYSTEM_ALERT, { alert });
    } else {
      broadcast(EVENT_TYPES.SYSTEM_ALERT, { alert });
    }
    
    log('info', 'realtime.system.alert', {
      organizationId,
      severity: alert.severity,
      message: alert.message
    });
  } catch (error) {
    log('error', 'realtime.system.alert.failed', { error: error.message });
  }
}

module.exports = {
  EVENT_TYPES,
  
  // Notification events
  notificationNew,
  notificationRead,
  notificationReadAll,
  
  // Control events
  controlUpdated,
  controlStatusChanged,
  
  // Assessment events
  assessmentCreated,
  assessmentCompleted,
  
  // Evidence events
  evidenceUploaded,
  
  // Vulnerability events
  vulnerabilityCreated,
  
  // POA&M events
  poamUpdated,
  
  // System events
  systemAlert
};
