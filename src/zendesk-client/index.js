import { ZendeskClientBase } from './base.js';
import { TicketsMixin } from './tickets.js';
import { UsersMixin } from './users.js';
import { OrganizationsMixin } from './organizations.js';
import { GroupsMixin } from './groups.js';
import { BusinessRulesMixin } from './business-rules.js';
import { HelpCenterMixin } from './help-center.js';
import { ChannelsMixin } from './channels.js';
import { SearchMixin } from './search.js';

/**
 * Compose all mixins to create the full ZendeskClient
 *
 * The mixin pattern allows each domain module to be:
 * - Independently tested
 * - Easily extended
 * - Clearly organized by Zendesk product area
 */
const ZendeskClient = SearchMixin(
  ChannelsMixin(
    HelpCenterMixin(
      BusinessRulesMixin(
        GroupsMixin(
          OrganizationsMixin(
            UsersMixin(
              TicketsMixin(ZendeskClientBase)
            )
          )
        )
      )
    )
  )
);

export { ZendeskClient };
