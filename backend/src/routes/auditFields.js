// @tier: community
'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, requireFields } = require('../middleware/validate');
const dynamicFieldsService = require('../services/dynamicAuditFieldsService');
const auditService = require('../services/auditService');

router.use(authenticate);

// ──────────────────────────────────────────────────────────────────────────────
// Field Definitions Management
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/v1/audit/fields - List all custom field definitions
router.get('/fields', requirePermission('audit.read'), async (req, res) => {
  try {
    const { active_only } = req.query;
    const fields = await dynamicFieldsService.getFieldDefinitions(
      req.user.organization_id,
      active_only !== 'false'
    );
    
    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('Error fetching field definitions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch field definitions' });
  }
});

// POST /api/v1/audit/fields - Create a new custom field definition
router.post('/fields',
  requirePermission('settings.manage'),
  validateBody(body => requireFields(body, ['field_name', 'field_type', 'display_name'])),
  async (req, res) => {
    try {
      const {
        field_name,
        field_type,
        display_name,
        description,
        source_integration
      } = req.body;

      const field = await dynamicFieldsService.createFieldDefinition({
        organizationId: req.user.organization_id,
        fieldName: field_name,
        fieldType: field_type,
        displayName: display_name,
        description,
        sourceIntegration: source_integration,
        suggestedByUserId: req.user.id
      });

      // Log the field creation
      await auditService.logFromRequest(req, {
        eventType: 'audit.field.created',
        resourceType: 'audit_field_definition',
        resourceId: field.id,
        details: { field_name, display_name, field_type },
        success: true
      });

      res.status(201).json({ success: true, data: field });
    } catch (error) {
      console.error('Error creating field definition:', error);
      
      // Check for PostgreSQL unique violation error code
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: 'Field already exists' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to create field definition' });
      }
    }
  }
);

// PUT /api/v1/audit/fields/:id - Update a field definition
router.put('/fields/:id',
  requirePermission('settings.manage'),
  async (req, res) => {
    try {
      const { display_name, description, is_active, field_type } = req.body;

      const updated = await dynamicFieldsService.updateFieldDefinition(
        req.params.id,
        req.user.organization_id,
        {
          displayName: display_name,
          description,
          isActive: is_active,
          fieldType: field_type
        }
      );

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Field not found' });
      }

      // Log the update
      await auditService.logFromRequest(req, {
        eventType: 'audit.field.updated',
        resourceType: 'audit_field_definition',
        resourceId: req.params.id,
        details: { display_name, is_active },
        success: true
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error('Error updating field definition:', error);
      res.status(500).json({ success: false, error: 'Failed to update field definition' });
    }
  }
);

// DELETE /api/v1/audit/fields/:id - Delete (deactivate) a field definition
router.delete('/fields/:id',
  requirePermission('settings.manage'),
  async (req, res) => {
    try {
      const deleted = await dynamicFieldsService.deleteFieldDefinition(
        req.params.id,
        req.user.organization_id
      );

      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Field not found' });
      }

      // Log the deletion
      await auditService.logFromRequest(req, {
        eventType: 'audit.field.deleted',
        resourceType: 'audit_field_definition',
        resourceId: req.params.id,
        details: {},
        success: true
      });

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      console.error('Error deleting field definition:', error);
      res.status(500).json({ success: false, error: 'Failed to delete field definition' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────────
// Column Preferences Management
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/v1/audit/preferences - Get column preferences
router.get('/preferences', requirePermission('audit.read'), async (req, res) => {
  try {
    const preferences = await dynamicFieldsService.getColumnPreferences(
      req.user.organization_id,
      req.user.id
    );
    
    res.json({ success: true, data: preferences });
  } catch (error) {
    console.error('Error fetching column preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch column preferences' });
  }
});

// PUT /api/v1/audit/preferences - Save column preferences
router.put('/preferences',
  requirePermission('audit.read'),
  validateBody(body => requireFields(body, ['visible_columns'])),
  async (req, res) => {
    try {
      const { visible_columns, column_order, is_org_default } = req.body;

      // Only admins can set org defaults
      if (is_org_default && !req.user.permissions.includes('settings.manage')) {
        return res.status(403).json({ 
          success: false, 
          error: 'Only administrators can set organization defaults' 
        });
      }

      const preferences = await dynamicFieldsService.saveColumnPreferences({
        organizationId: req.user.organization_id,
        userId: is_org_default ? null : req.user.id,
        isOrgDefault: is_org_default || false,
        visibleColumns: visible_columns,
        columnOrder: column_order
      });

      // Log the preference change
      await auditService.logFromRequest(req, {
        eventType: is_org_default ? 'audit.preferences.org_default_set' : 'audit.preferences.updated',
        resourceType: 'audit_column_preferences',
        details: { visible_columns, is_org_default },
        success: true
      });

      res.json({ success: true, data: preferences });
    } catch (error) {
      console.error('Error saving column preferences:', error);
      res.status(500).json({ success: false, error: 'Failed to save column preferences' });
    }
  }
);

// ──────────────────────────────────────────────────────────────────────────────
// AI Field Suggestions
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/v1/audit/suggestions - Get pending AI field suggestions
router.get('/suggestions', requirePermission('settings.manage'), async (req, res) => {
  try {
    const suggestions = await dynamicFieldsService.getPendingFieldSuggestions(
      req.user.organization_id
    );
    
    res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Error fetching field suggestions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch field suggestions' });
  }
});

// POST /api/v1/audit/suggestions/:id/accept - Accept an AI suggestion
router.post('/suggestions/:id/accept',
  requirePermission('settings.manage'),
  async (req, res) => {
    try {
      await dynamicFieldsService.acceptFieldSuggestion(
        req.params.id,
        req.user.organization_id,
        req.user.id
      );

      // Log the acceptance
      await auditService.logFromRequest(req, {
        eventType: 'audit.field_suggestion.accepted',
        resourceType: 'audit_field_suggestion',
        resourceId: req.params.id,
        details: {},
        success: true
      });

      res.json({ success: true, data: { accepted: true } });
    } catch (error) {
      console.error('Error accepting field suggestion:', error);
      res.status(500).json({ success: false, error: 'Failed to accept field suggestion' });
    }
  }
);

// POST /api/v1/audit/suggestions/:id/reject - Reject an AI suggestion
router.post('/suggestions/:id/reject',
  requirePermission('settings.manage'),
  async (req, res) => {
    try {
      await dynamicFieldsService.rejectFieldSuggestion(
        req.params.id,
        req.user.organization_id,
        req.user.id
      );

      // Log the rejection
      await auditService.logFromRequest(req, {
        eventType: 'audit.field_suggestion.rejected',
        resourceType: 'audit_field_suggestion',
        resourceId: req.params.id,
        details: {},
        success: true
      });

      res.json({ success: true, data: { rejected: true } });
    } catch (error) {
      console.error('Error rejecting field suggestion:', error);
      res.status(500).json({ success: false, error: 'Failed to reject field suggestion' });
    }
  }
);

// POST /api/v1/audit/analyze - Manually trigger AI analysis of integration data
router.post('/analyze',
  requirePermission('settings.manage'),
  validateBody(body => requireFields(body, ['integration_data', 'source_integration'])),
  async (req, res) => {
    try {
      const { integration_data, source_integration } = req.body;

      const suggestions = await dynamicFieldsService.analyzeAndSuggestFields(
        req.user.organization_id,
        integration_data,
        source_integration
      );

      // Log the analysis request
      await auditService.logFromRequest(req, {
        eventType: 'audit.integration_analysis.triggered',
        resourceType: 'integration',
        details: { source_integration, suggestions_count: suggestions.length },
        success: true
      });

      res.json({ 
        success: true, 
        data: { 
          suggestions,
          message: `Found ${suggestions.length} new field suggestions`
        } 
      });
    } catch (error) {
      console.error('Error analyzing integration data:', error);
      res.status(500).json({ success: false, error: 'Failed to analyze integration data' });
    }
  }
);

module.exports = router;
