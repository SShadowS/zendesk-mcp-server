/**
 * Named custom field definitions.
 *
 * Maps an LLM-friendly name to a Zendesk ticket custom field. Tools use this
 * map to (a) generate typed input schemas for `named_custom_fields`,
 * (b) translate named values into Zendesk's `custom_fields: [{id, value}]`
 * payload, and (c) flatten ticket responses with a `named_custom_fields`
 * object alongside the raw `custom_fields` array.
 *
 * Add a new entry by giving it a snake_case key plus an `id`, `zendeskType`,
 * `title`, and short `description`. Supported `zendeskType` values:
 * text, textarea, regexp, partialcreditcard, checkbox, integer, decimal,
 * date, multiselect, tagger.
 */
export const CUSTOM_FIELD_DEFINITIONS = {
  ado_work_item_id: {
    id: 31741804324114,
    zendeskType: 'text',
    title: 'DevOps Item No.',
    description: 'Azure DevOps work item ID linked to this ticket'
  }
};
