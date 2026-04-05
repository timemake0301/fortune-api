import { createHandler } from '../../lib/handler';
import { generateSbpsHashcode } from '../../lib/sbps';

// GET /api/debug/hash-check — 診断用（本番前に削除）
export default createHandler('GET', async (_req, res) => {
  const hashKey = process.env.SBPS_HASH_KEY || '';
  const testHash = await generateSbpsHashcode('test', hashKey);

  res.status(200).json({
    success: true,
    data: {
      hash_key_length: hashKey.length,
      hash_key_prefix: hashKey.substring(0, 6),
      hash_key_suffix: hashKey.substring(hashKey.length - 6),
      test_hash: testHash,
    },
  });
});
