/**
 * Zendesk API Types
 */

// Common types
export interface ZendeskPagination {
  next_page: string | null;
  previous_page: string | null;
  count: number;
}

export interface ZendeskResponse<T> {
  [key: string]: T | T[] | ZendeskPagination | any;
}

// User types
export interface ZendeskUser {
  id: number;
  url: string;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
  time_zone: string;
  phone: string | null;
  photo: ZendeskPhoto | null;
  locale_id: number;
  locale: string;
  organization_id: number | null;
  role: 'end-user' | 'agent' | 'admin';
  verified: boolean;
  external_id: string | null;
  tags: string[];
  alias: string | null;
  active: boolean;
  shared: boolean;
  shared_agent: boolean;
  last_login_at: string | null;
  two_factor_auth_enabled: boolean;
  signature: string | null;
  details: string | null;
  notes: string | null;
  role_type: number | null;
  custom_role_id: number | null;
  moderator: boolean;
  ticket_restriction: string | null;
  only_private_comments: boolean;
  restricted_agent: boolean;
  suspended: boolean;
  default_group_id: number | null;
  user_fields: Record<string, any>;
}

export interface ZendeskPhoto {
  id: number;
  content_url: string;
  content_type: string;
  size: number;
  thumbnails: Array<{
    id: number;
    content_url: string;
    content_type: string;
    size: number;
  }>;
}

// Organization types
export interface ZendeskOrganization {
  id: number;
  url: string;
  external_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  domain_names: string[];
  details: string | null;
  notes: string | null;
  group_id: number | null;
  shared_tickets: boolean;
  shared_comments: boolean;
  tags: string[];
  organization_fields: Record<string, any>;
}

// Ticket types
export interface ZendeskTicket {
  id: number;
  url: string;
  external_id: string | null;
  via: ZendeskVia;
  created_at: string;
  updated_at: string;
  type: 'problem' | 'incident' | 'question' | 'task' | null;
  subject: string;
  raw_subject: string;
  description: string;
  priority: 'urgent' | 'high' | 'normal' | 'low' | null;
  status: 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';
  recipient: string | null;
  requester_id: number;
  submitter_id: number;
  assignee_id: number | null;
  organization_id: number | null;
  group_id: number | null;
  collaborator_ids: number[];
  follower_ids: number[];
  email_cc_ids: number[];
  forum_topic_id: number | null;
  problem_id: number | null;
  has_incidents: boolean;
  is_public: boolean;
  due_at: string | null;
  tags: string[];
  custom_fields: ZendeskCustomField[];
  satisfaction_rating: ZendeskSatisfactionRating | null;
  sharing_agreement_ids: number[];
  fields: ZendeskTicketField[];
  followup_ids: number[];
  brand_id: number;
  allow_channelback: boolean;
  allow_attachments: boolean;
  from_messaging_channel: boolean;
}

export interface ZendeskVia {
  channel: string;
  source: {
    from: Record<string, any>;
    to: Record<string, any>;
    rel: string | null;
  };
}

export interface ZendeskCustomField {
  id: number;
  value: any;
}

export interface ZendeskTicketField {
  id: number;
  type: string;
  title: string;
  description: string;
  position: number;
  active: boolean;
  required: boolean;
  collapsed_for_agents: boolean;
  regexp_for_validation: string | null;
  title_in_portal: string;
  visible_in_portal: boolean;
  editable_in_portal: boolean;
  required_in_portal: boolean;
  tag: string | null;
  created_at: string;
  updated_at: string;
  removable: boolean;
  agent_description: string | null;
}

export interface ZendeskSatisfactionRating {
  id: number;
  score: 'offered' | 'unoffered' | 'good' | 'bad';
  created_at: string;
  updated_at: string;
  comment: string | null;
}

// Comment types
export interface ZendeskComment {
  id: number;
  type: 'Comment' | 'VoiceComment';
  author_id: number;
  body: string;
  html_body: string;
  plain_body: string;
  public: boolean;
  attachments: ZendeskAttachment[];
  audit_id: number;
  via: ZendeskVia;
  created_at: string;
  metadata: {
    system: Record<string, any>;
    custom: Record<string, any>;
  };
}

// Attachment types
export interface ZendeskAttachment {
  id: number;
  file_name: string;
  content_url: string;
  content_type: string;
  size: number;
  thumbnails: ZendeskAttachment[];
  inline: boolean;
  deleted: boolean;
  malware_access_override: boolean;
  malware_scan_result: string;
}

export interface ZendeskUploadResponse {
  upload: {
    token: string;
    expires_at: string;
    attachments: ZendeskAttachment[];
  };
}

// Group types
export interface ZendeskGroup {
  id: number;
  url: string;
  name: string;
  deleted: boolean;
  created_at: string;
  updated_at: string;
  description: string | null;
  default: boolean;
}

// View types
export interface ZendeskView {
  id: number;
  url: string;
  title: string;
  active: boolean;
  updated_at: string;
  created_at: string;
  position: number;
  description: string | null;
  execution: ZendeskViewExecution;
  conditions: ZendeskViewConditions;
  restriction: ZendeskViewRestriction | null;
  raw_title: string;
  personal: boolean;
}

export interface ZendeskViewExecution {
  group_by: string | null;
  group_order: string;
  sort_by: string;
  sort_order: string;
  group: {
    id: string;
    title: string;
    type: string;
    order: string;
  } | null;
  sort: {
    id: string;
    title: string;
    type: string;
    order: string;
  };
  columns: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
  }>;
}

export interface ZendeskViewConditions {
  all: ZendeskCondition[];
  any: ZendeskCondition[];
}

export interface ZendeskCondition {
  field: string;
  operator: string;
  value: any;
}

export interface ZendeskViewRestriction {
  type: string;
  id: number;
}

// Macro types
export interface ZendeskMacro {
  id: number;
  url: string;
  title: string;
  active: boolean;
  updated_at: string;
  created_at: string;
  position: number;
  description: string | null;
  actions: ZendeskAction[];
  restriction: ZendeskMacroRestriction | null;
  raw_title: string;
}

export interface ZendeskAction {
  field: string;
  value: any;
}

export interface ZendeskMacroRestriction {
  type: string;
  id: number;
}

// Automation types
export interface ZendeskAutomation {
  id: number;
  url: string;
  title: string;
  active: boolean;
  updated_at: string;
  created_at: string;
  position: number;
  conditions: ZendeskAutomationConditions;
  actions: ZendeskAction[];
  raw_title: string;
}

export interface ZendeskAutomationConditions {
  all: ZendeskCondition[];
  any: ZendeskCondition[];
}

// Trigger types
export interface ZendeskTrigger {
  id: number;
  url: string;
  title: string;
  active: boolean;
  updated_at: string;
  created_at: string;
  position: number;
  conditions: ZendeskTriggerConditions;
  actions: ZendeskAction[];
  description: string | null;
  raw_title: string;
}

export interface ZendeskTriggerConditions {
  all: ZendeskCondition[];
  any: ZendeskCondition[];
}

// Help Center types
export interface ZendeskArticle {
  id: number;
  url: string;
  html_url: string;
  author_id: number;
  comments_disabled: boolean;
  draft: boolean;
  promoted: boolean;
  position: number;
  vote_sum: number;
  vote_count: number;
  section_id: number;
  created_at: string;
  updated_at: string;
  name: string;
  title: string;
  source_locale: string;
  locale: string;
  outdated: boolean;
  outdated_locales: string[];
  edited_at: string;
  user_segment_id: number | null;
  permission_group_id: number;
  content_tag_ids: number[];
  label_names: string[];
  body: string;
}

export interface ZendeskSection {
  id: number;
  url: string;
  html_url: string;
  category_id: number;
  position: number;
  sorting: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  locale: string;
  source_locale: string;
  outdated: boolean;
  outdated_locales: string[];
  parent_section_id: number | null;
  theme_template: string;
}

export interface ZendeskCategory {
  id: number;
  url: string;
  html_url: string;
  position: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  locale: string;
  source_locale: string;
  outdated: boolean;
  outdated_locales: string[];
}

// Talk types
export interface ZendeskCall {
  id: string;
  created_at: string;
  updated_at: string;
  agent_id: number | null;
  call_charge: number | null;
  consultation_time: number | null;
  completion_status: string;
  customer_id: number | null;
  customer_requested_voicemail: boolean;
  direction: 'inbound' | 'outbound';
  duration: number;
  exceeded_queue_wait_time: boolean;
  hold_time: number;
  minutes_billed: number;
  outside_business_hours: boolean;
  phone_number_id: number | null;
  quality_issues: string[];
  ticket_id: number | null;
  time_to_answer: number | null;
  voicemail: boolean;
  wait_time: number | null;
  wrap_up_time: number | null;
  ivr_time_spent: number | null;
  ivr_hops: number | null;
  ivr_destination_group_name: string | null;
  talk_time: number | null;
  not_recording_time: number | null;
  recording_time: number | null;
  keypress: string | null;
  call_group_id: number | null;
  call_channel: string | null;
  default_group_id: number | null;
  callback: boolean;
  callback_source: string | null;
  overflowed: boolean;
  overflowed_to: string | null;
}

export interface ZendeskPhoneNumber {
  id: number;
  created_at: string;
  updated_at: string;
  number: string;
  display_number: string;
  toll_free: boolean;
  recorded: boolean;
  location: string;
  country_code: string;
  capabilities: {
    sms: boolean;
    mms: boolean;
    voice: boolean;
  };
  external_id: string | null;
  brand_id: number;
  nickname: string | null;
  transcription: boolean;
  ivr_id: number | null;
  greeting_ids: number[];
  group_ids: number[];
  schedule_id: number | null;
  default_greeting_ids: {
    voicemail_off_inside_business_hours: number | null;
    voicemail_off_outside_business_hours: number | null;
    voicemail_on_inside_business_hours: number | null;
    voicemail_on_outside_business_hours: number | null;
  };
}

// Chat types
export interface ZendeskChat {
  id: string;
  visitor: {
    id: string;
    name: string;
    email: string | null;
  };
  started_by: 'visitor' | 'agent';
  session: {
    browser: string;
    city: string;
    country_code: string;
    country_name: string;
    end_date: string;
    id: string;
    ip: string;
    platform: string;
    region: string;
    start_date: string;
    user_agent: string;
  };
  timestamp: string;
  count: {
    total: number;
    visitor: number;
    agent: number;
  };
  duration: number;
  department_id: number | null;
  department_name: string | null;
  zendesk_ticket_id: number | null;
  agent_names: string[];
  agent_ids: string[];
  triggered: boolean;
  triggered_response: boolean;
  unread: boolean;
  missed: boolean;
  tags: string[];
  type: string;
  history: Array<{
    department_id: number | null;
    department_name: string | null;
    created_at: string;
    name: string;
    channel: string;
    type: string;
    msg: string;
    options: string;
    msg_id: string;
    sender_type: string;
  }>;
  webpath: Array<{
    from: string;
    to: string;
    timestamp: string;
    title: string;
    search: string;
  }>;
  conversions: any[];
  response_time: {
    first: number | null;
    avg: number | null;
    max: number | null;
  };
  rating: string | null;
  comment: string | null;
}

// Apps types
export interface ZendeskApp {
  id: number;
  name: string;
  author: {
    name: string;
    email: string;
    url: string;
  };
  default_locale: string;
  current_version: string;
  state: string;
  app_id: number;
  installation_id: number;
  settings: Record<string, any>;
  enabled: boolean;
  updated_at: string;
  created_at: string;
}

export interface ZendeskAppInstallation {
  id: number;
  app_id: number;
  product: string;
  settings: Record<string, any>;
  enabled: boolean;
  updated_at: string;
  created_at: string;
}

// Error response types
export interface ZendeskErrorResponse {
  error: string;
  description?: string;
  details?: Record<string, any>;
}