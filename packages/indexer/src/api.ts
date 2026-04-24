import express, { Request, Response } from "express";
import { pool } from "./db";
import { cached, getMetrics } from "./cache";

const TTL = {
  proposals: 30_000,       // 30 seconds
  proposalVotes: 15_000,   // 15 seconds
  delegates: 60_000,       // 60 seconds
  profile: 30_000,         // 30 seconds
};

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());

  // GET /health
  app.get("/health", (_req: Request, res: Response): void => {
    const metrics = getMetrics();
    res.json({ status: "ok", cache: metrics });
  });

  // GET /proposals?offset=0&limit=20
  app.get("/proposals", async (req: Request, res: Response): Promise<void> => {
    const offset = Number(req.query.offset ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const key = `proposals:${offset}:${limit}`;
    try {
      const data = await cached(key, TTL.proposals, async () => {
        const result = await pool.query(
          "SELECT * FROM proposals ORDER BY id DESC LIMIT $1 OFFSET $2",
          [limit, offset]
        );
        return { proposals: result.rows, total: result.rowCount ?? 0 };
      });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /proposals/:id/votes
  app.get("/proposals/:id/votes", async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const key = `proposal_votes:${id}`;
    try {
      const data = await cached(key, TTL.proposalVotes, async () => {
        const result = await pool.query(
          "SELECT * FROM votes WHERE proposal_id = $1 ORDER BY created_at DESC",
          [id]
        );
        return { votes: result.rows };
      });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /delegates?top=20
  app.get("/delegates", async (req: Request, res: Response): Promise<void> => {
    const top = Math.min(Number(req.query.top ?? 20), 100);
    const key = `delegates:${top}`;
    try {
      const data = await cached(key, TTL.delegates, async () => {
        const result = await pool.query(
          `SELECT new_delegatee as address, COUNT(*) as delegator_count
           FROM delegates d1
           WHERE ledger = (
             SELECT MAX(d2.ledger) FROM delegates d2 WHERE d2.delegator = d1.delegator
           )
           GROUP BY new_delegatee
           ORDER BY delegator_count DESC
           LIMIT $1`,
          [top]
        );
        return { delegates: result.rows };
      });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /profile/:address
  app.get("/profile/:address", async (req: Request, res: Response): Promise<void> => {
    const { address } = req.params;
    const key = `profile:${address}`;
    try {
      const data = await cached(key, TTL.profile, async () => {
        const [proposalsRes, votesRes, delegationsRes] = await Promise.all([
          pool.query("SELECT COUNT(*) FROM proposals WHERE proposer = $1", [address]),
          pool.query("SELECT COUNT(*), SUM(weight) FROM votes WHERE voter = $1", [address]),
          pool.query(
            "SELECT new_delegatee FROM delegates WHERE delegator = $1 ORDER BY ledger DESC LIMIT 1",
            [address]
          ),
        ]);
        return {
          address,
          proposalsCreated: Number(proposalsRes.rows[0].count),
          votescast: Number(votesRes.rows[0].count),
          totalVotingPowerUsed: String(votesRes.rows[0].sum ?? 0),
          currentDelegatee: delegationsRes.rows[0]?.new_delegatee ?? address,
        };
      });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return app;
}
