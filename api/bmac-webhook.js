import crypto from "crypto";
import { Redis } from "@upstash/redis";

export const config = {
  api: {
    bodyParser: false,
  },
};

const redis = Redis.fromEnv();

const TIER_ACCESS = {
  "The Spark": {
    key: "spark",
    rank: 1,
  },

  "The Idea Circle": {
    key: "idea-circle",
    rank: 2,
  },

  "The Infinite ∞": {
    key: "infinite",
    rank: 3,
  },

  "The Infinite": {
    key: "infinite",
    rank: 3,
  },
};

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getTier(levelName) {
  const cleanName = String(levelName || "").trim();

  if (TIER_ACCESS[cleanName]) {
    return {
      name: cleanName,
      ...TIER_ACCESS[cleanName],
    };
  }

  const lower = cleanName.toLowerCase();

  if (lower.includes("infinite")) {
    return {
      name: cleanName || "The Infinite ∞",
      key: "infinite",
      rank: 3,
    };
  }

  if (lower.includes("idea circle")) {
    return {
      name: cleanName || "The Idea Circle",
      key: "idea-circle",
      rank: 2,
    };
  }

  if (lower.includes("spark")) {
    return {
      name: cleanName || "The Spark",
      key: "spark",
      rank: 1,
    };
  }

  return {
    name: cleanName || "Unknown",
    key: "unknown",
    rank: 0,
  };
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data);
    });

    req.on("error", reject);
  });
}

function verifySignature(rawBody, signature) {
  const secret = process.env.BMAC_WEBHOOK_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(String(signature));

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    signatureBuffer
  );
}

function shouldHaveAccess(eventType, data) {
  if (eventType === "membership.started") {
    return true;
  }

  if (eventType === "membership.updated") {
    return (
      data.status === "active" &&
      data.paused !== "true"
    );
  }

  if (eventType === "membership.cancelled") {
    /*
      Buy Me a Coffee can tell us a cancellation
      will happen at the end of the paid period.

      If the person still has paid time remaining,
      keep access until current_period_end.
    */
    if (
      data.cancel_at_period_end === "true" &&
      Number(data.current_period_end) > Math.floor(Date.now() / 1000)
    ) {
      return true;
    }

    return false;
  }

  if (eventType === "membership.paused") {
    /*
      Paused members can retain their benefits
      through the end of the already-paid billing period.
    */
    return (
      Number(data.current_period_end) >
      Math.floor(Date.now() / 1000)
    );
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST only",
    });
  }

  try {
    const rawBody = await readRawBody(req);

    const signature =
      req.headers["x-signature-sha256"];

    if (!verifySignature(rawBody, signature)) {
      return res.status(401).json({
        success: false,
        error: "Invalid webhook signature",
      });
    }

    let event;

    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Invalid JSON",
      });
    }

    const allowedEvents = new Set([
      "membership.started",
      "membership.updated",
      "membership.cancelled",
      "membership.paused",
    ]);

    if (!allowedEvents.has(event.type)) {
      return res.status(200).json({
        success: true,
        ignored: true,
      });
    }

    const data = event.data || {};

    const email = normalizeEmail(
      data.supporter_email
    );

    if (!email) {
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "No member email",
      });
    }

    const tier = getTier(
      data.membership_level_name
    );

    const accessActive =
      shouldHaveAccess(event.type, data);

    const memberRecord = {
      email,

      name:
        String(
          data.supporter_name || ""
        ).trim(),

      supporterId:
        data.supporter_id || null,

      membershipId:
        data.id || null,

      membershipLevelId:
        data.membership_level_id || null,

      tierName:
        tier.name,

      tierKey:
        tier.key,

      tierRank:
        tier.rank,

      membershipStatus:
        data.status || "",

      accessActive,

      cancelAtPeriodEnd:
        data.cancel_at_period_end === "true",

      paused:
        data.paused === "true",

      currentPeriodStart:
        data.current_period_start || null,

      currentPeriodEnd:
        data.current_period_end || null,

      eventType:
        event.type,

      eventId:
        event.event_id || null,

      liveMode:
        event.live_mode === true,

      updatedAt:
        Date.now(),
    };

    /*
      Primary lookup:
      email -> membership record
    */
    await redis.set(
      `elle:member:${email}`,
      memberRecord
    );

    /*
      Optional lookup:
      Buy Me a Coffee supporter ID -> email
    */
    if (data.supporter_id) {
      await redis.set(
        `elle:member-id:${data.supporter_id}`,
        email
      );
    }

    return res.status(200).json({
      success: true,
      received: event.type,
      member: {
        email,
        tier: tier.key,
        accessActive,
      },
    });
  } catch (error) {
    console.error(
      "Buy Me a Coffee webhook error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Webhook processing failed",
    });
  }
}
