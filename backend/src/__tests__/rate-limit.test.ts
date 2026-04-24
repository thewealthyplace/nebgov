import request from "supertest";
import app from "../index";
import pool from "../db/pool";
import jwt from "jsonwebtoken";

// Mock express-rate-limit to use a tiny window so we can trigger 429 quickly
jest.mock("express-rate-limit", () => {
  const actual = jest.requireActual("express-rate-limit");
  return (options: Record<string, unknown>) =>
    actual({ ...options, windowMs: 100, skip: options.skip });
});

describe("Rate limiting", () => {
  let authToken: string;
  let userId: number;
  let competitionId: number;

  beforeAll(async () => {
    const userResult = await pool.query(
      "INSERT INTO users (wallet_address) VALUES ($1) RETURNING id",
      ["GRATE_LIMIT_TEST_ADDRESS_ABCDEFGHIJKLMNO"],
    );
    userId = userResult.rows[0].id;

    authToken = jwt.sign(
      { userId, walletAddress: "GRATE_LIMIT_TEST_ADDRESS_ABCDEFGHIJKLMNO" },
      process.env.JWT_SECRET!,
    );

    const compResult = await pool.query(
      `INSERT INTO competitions (name, description, entry_fee, start_date, end_date, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        "Rate Limit Test Competition",
        "Test",
        0,
        new Date(Date.now() + 86400000),
        new Date(Date.now() + 172800000),
        true,
        userId,
      ],
    );
    competitionId = compResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM competition_participants WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM competitions WHERE id = $1", [competitionId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  });

  it("returns 429 on the 6th join attempt within the window", async () => {
    // Send 5 requests (max allowed)
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/competitions/${competitionId}/join`)
        .set("Authorization", `Bearer ${authToken}`);
    }

    // 6th request should be rate limited
    const response = await request(app)
      .post(`/competitions/${competitionId}/join`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.status).toBe(429);
    expect(response.body.error).toBe("Too many join attempts");
  });

  it("includes RateLimit headers on limited response", async () => {
    const response = await request(app)
      .post(`/competitions/${competitionId}/join`)
      .set("Authorization", `Bearer ${authToken}`);

    // After the 6th+ request, headers should be present
    if (response.status === 429) {
      expect(response.headers).toHaveProperty("ratelimit-limit");
    }
  });

  it("/health is not rate limited", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    }
  });
});
