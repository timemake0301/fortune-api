import { createHandler } from '../lib/handler';

export default createHandler('GET', async (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});
