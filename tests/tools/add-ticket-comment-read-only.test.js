import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

const mockAddTicketComment = vi.fn();
vi.mock('../../src/request-context.js', () => ({
  getZendeskClient: () => ({ addTicketComment: (...args) => mockAddTicketComment(...args) })
}));

const { ticketsTools } = await import('../../src/tools/tickets.js');
const addComment = ticketsTools.find(t => t.name === 'add_ticket_comment');

/**
 * Under READ_ONLY a public reply is refused outright rather than quietly
 * downgraded to an internal note: a silent downgrade would leave the caller
 * believing it answered a customer who never received anything.
 */
describe('add_ticket_comment under READ_ONLY', () => {
  const originalReadOnly = process.env.READ_ONLY;

  beforeEach(() => {
    mockAddTicketComment.mockReset();
    mockAddTicketComment.mockResolvedValue({ ticket: { id: 1 } });
    process.env.READ_ONLY = 'true';
  });

  afterEach(() => {
    if (originalReadOnly === undefined) delete process.env.READ_ONLY;
    else process.env.READ_ONLY = originalReadOnly;
  });

  it('still posts an internal note', async () => {
    const result = await addComment.handler({ id: 1, body: 'note', type: 'internal' });

    expect(mockAddTicketComment).toHaveBeenCalledWith(1, expect.objectContaining({
      body: 'note',
      public: false
    }));
    expect(result.isError).toBeFalsy();
  });

  it('posts an internal note when type is omitted', async () => {
    await addComment.handler({ id: 1, body: 'note' });

    expect(mockAddTicketComment).toHaveBeenCalledWith(1, expect.objectContaining({ public: false }));
  });

  it('refuses a public reply', async () => {
    const result = await addComment.handler({ id: 1, body: 'hi', type: 'public' });

    expect(result.isError).toBe(true);
  });

  it('does not silently downgrade a public reply to an internal note', async () => {
    await addComment.handler({ id: 1, body: 'hi', type: 'public' });

    expect(mockAddTicketComment).not.toHaveBeenCalled();
  });

  it('explains why the public reply was refused', async () => {
    const result = await addComment.handler({ id: 1, body: 'hi', type: 'public' });

    expect(result.content[0].text).toMatch(/read.only/i);
  });

  it('allows a public reply once READ_ONLY is off', async () => {
    process.env.READ_ONLY = 'false';
    await addComment.handler({ id: 1, body: 'hi', type: 'public' });

    expect(mockAddTicketComment).toHaveBeenCalledWith(1, expect.objectContaining({ public: true }));
  });
});
