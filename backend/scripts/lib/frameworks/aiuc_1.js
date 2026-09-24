const { AIUC1_FRAMEWORK, AIUC1_CONTROLS: AIUC1_SHARED_CONTROLS } = require('../aiuc1-data');

module.exports = {
    code: AIUC1_FRAMEWORK.code, name: AIUC1_FRAMEWORK.name, version: AIUC1_FRAMEWORK.version,
    category: AIUC1_FRAMEWORK.category, tier_required: AIUC1_FRAMEWORK.tier_required,
    framework_group: AIUC1_FRAMEWORK.framework_group,
    description: AIUC1_FRAMEWORK.description,
    controls: AIUC1_SHARED_CONTROLS
  };
