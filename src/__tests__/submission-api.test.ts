import { getAllSubmission, getSubmission } from '../api/submissions/getSubmission';
import { getClient } from '../lib/client';

jest.mock('../lib/client');

const rejectingClient = () =>
  (getClient as jest.Mock).mockReturnValue({
    request: jest.fn().mockRejectedValue(new Error('network down')),
  });

describe('submission api error handling', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves to null when the submission details query rejects', async () => {
    rejectingClient();
    await expect(getSubmission(1)).resolves.toBeNull();
  });

  it('resolves to null when the submission list query rejects', async () => {
    rejectingClient();
    await expect(getAllSubmission('two-sum')).resolves.toBeNull();
  });
});
