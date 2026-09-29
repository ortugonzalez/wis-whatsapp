const quotaStatuses = new Set(['NOT_ELIGIBLE','ELIGIBLE','ACTIVE_IN_CURRENT_CYCLE','EXHAUSTED']);
const mvStatuses = new Set(['NOT_ELIGIBLE','NOT_ACTIVE','ACTIVE','ACTIVE_UPGRADE_AVAILABLE']);

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function lowerEnum(value, allowed) {
  return allowed.has(value) ? value.toLowerCase() : null;
}

export function projectAccountLimits(raw = {}) {
  const quota = raw.quota ?? {};
  const timelock = raw.timelock ?? {};
  const quotaFresh = raw.stale !== true && quota.stale !== true;
  const timelockFresh = raw.stale !== true && timelock.stale !== true;
  const quotaVerified = quota.available === true && quota.response_verified === true && quotaFresh;
  const timelockVerified = timelock.available === true && timelock.response_verified === true && timelockFresh;
  const total = integer(quota.total_quota);
  const used = integer(quota.used_quota);
  const enforcementTypes = new Set([
    'DEFAULT','BIZ_QUALITY','BIZ_COMMERCE_VIOLATION_ADULT','BIZ_COMMERCE_VIOLATION_ALCOHOL',
    'BIZ_COMMERCE_VIOLATION_ANIMALS','BIZ_COMMERCE_VIOLATION_BODY_PARTS_FLUIDS',
    'BIZ_COMMERCE_VIOLATION_DATING','BIZ_COMMERCE_VIOLATION_DIGITAL_SERVICES_PRODUCTS',
    'BIZ_COMMERCE_VIOLATION_DRUGS','BIZ_COMMERCE_VIOLATION_DRUGS_ONLY_OTC',
    'BIZ_COMMERCE_VIOLATION_GAMBLING','BIZ_COMMERCE_VIOLATION_HEALTHCARE',
    'BIZ_COMMERCE_VIOLATION_REAL_FAKE_CURRENCY','BIZ_COMMERCE_VIOLATION_SUPPLEMENTS',
    'BIZ_COMMERCE_VIOLATION_TOBACCO','BIZ_COMMERCE_VIOLATION_VIOLENT_CONTENT',
    'BIZ_COMMERCE_VIOLATION_WEAPONS','WEB_COMPANION_ONLY','RESTRICT_ALL_COMPANIONS',
  ]);
  const enforcement = enforcementTypes.has(timelock.enforcement_type) ? timelock.enforcement_type.toLowerCase() : null;

  return {
    getnewchatlimit: {
      verified: quotaVerified,
      currentness: quotaVerified ? 'partial_cycle_validity_unverified' : 'unavailable_or_stale',
      fields: {
        cap_type: quotaVerified ? 'individual_new_chat_thread' : null,
        is_capped: null,
        cap_status: null,
        quota_limit: quotaVerified ? total : null,
        quota_used: quotaVerified ? used : null,
        quota_remaining: null,
        cycle_start_at: quotaVerified ? timestamp(quota.cycle_start_timestamp) : null,
        cycle_end_at: quotaVerified ? timestamp(quota.cycle_end_timestamp) : null,
        updated_at: null,
        ote_status: quotaVerified ? lowerEnum(quota.ote_status, quotaStatuses) : null,
        mv_status: quotaVerified ? lowerEnum(quota.mv_status, mvStatuses) : null,
      },
      field_sources: {
        cap_type: 'query_parameter:INDIVIDUAL_NEW_CHAT_MSG',
        is_capped: 'unmapped:cycle_validity_not_verified',
        cap_status: 'unmapped:cycle_validity_not_verified; provider value remains in raw snapshot',
        quota_limit: 'provider:total_quota',
        quota_used: 'provider:used_quota',
        quota_remaining: 'unmapped:cycle_validity_not_verified; quota values may refer to an expired cycle',
        cycle_start_at: 'provider:cycle_start_timestamp; numeric conversion only, unit not inferred',
        cycle_end_at: 'provider:cycle_end_timestamp; numeric conversion only, unit not inferred',
        updated_at: 'unmapped:no verified semantic equivalent for server_sent_timestamp',
        ote_status: 'provider:ote_status; enum normalized to lowercase',
        mv_status: 'provider:mv_status; enum normalized to lowercase',
      },
      unmapped_fields: ['is_capped','cap_status','quota_remaining','updated_at'],
    },
    getreachouttimelock: {
      verified: timelockVerified,
      fields: {
        is_restricted: timelockVerified && typeof timelock.is_active === 'boolean' ? timelock.is_active : null,
        restricted_until: timelockVerified ? timestamp(timelock.time_enforcement_ends) : null,
        restriction_type: timelockVerified ? enforcement : null,
      },
      field_sources: {
        is_restricted: 'provider:is_active',
        restricted_until: 'provider:time_enforcement_ends; numeric conversion only, unit not inferred',
        restriction_type: 'provider:enforcement_type; enum normalized to lowercase',
      },
      unmapped_fields: [],
    },
  };
}
