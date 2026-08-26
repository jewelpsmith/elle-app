import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

const TIER_ACCESS = {
Elle Next": {
    key: "elle-next",
    rank: 1,
  },
  
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

function getRedisConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.STORAGE_KV_REST_API_URL;

  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.STORAGE_KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Redis environment variables are missing."
    );
  }

  return {
    url: url.replace(/\/+$/, ""),
    token,
  };
}

async function redisCommand(command) {
  const { url, token } = getRedisConfig();

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify(command),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Redis request failed with status ${response.status}`
    );
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data.result;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getTier(levelName) {
  const cleanName =
    String(levelName || "").trim();

  if (TIER_ACCESS[cleanName]) {
    return {
      name: cleanName,
      ...TIER_ACCESS[cleanName],
    };
  }

  const lower =
    cleanName.toLowerCase();
if (
  lower.includes(
    "elle next"
  )
) {
  return {
    name:
      cleanName ||
      "Elle Next",

    key: "elle-next",
    rank: 1,
  };
}
  if (lower.includes("infinite")) {
    return {
      name:
        cleanName ||
        "The Infinite ∞",

      key: "infinite",
      rank: 3,
    };
  }

  if (
    lower.includes(
      "idea circle"
    )
  ) {
    return {
      name:
        cleanName ||
        "The Idea Circle",

      key: "idea-circle",
      rank: 2,
    };
  }

  if (lower.includes("spark")) {
    return {
      name:
        cleanName ||
        "The Spark",

      key: "spark",
      rank: 1,
    };
  }

  return {
    name:
      cleanName ||
      "Unknown",

    key: "unknown",
    rank: 0,
  };
}

function readRawBody(req) {
  return new Promise(
    (resolve, reject) => {
      let data = "";

      req.setEncoding("utf8");

      req.on(
        "data",
        (chunk) => {
          data += chunk;
        }
      );

      req.on(
        "end",
        () => {
          resolve(data);
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

function verifySignature(
  rawBody,
  signature
) {
  const secret =
    process.env.BMAC_WEBHOOK_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(rawBody)
      .digest("hex");

  const received =
    String(signature)
      .trim()
      .replace(
        /^sha256=/i,
        ""
      );

  const expectedBuffer =
    Buffer.from(
      expected,
      "utf8"
    );

  const receivedBuffer =
    Buffer.from(
      received,
      "utf8"
    );

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    expectedBuffer,
    receivedBuffer
  );
}

function toBoolean(value) {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function toUnixSeconds(value) {
  const number =
    Number(value);

  if (
    Number.isFinite(number)
  ) {
    return number;
  }

  return 0;
}

function shouldHaveAccess(
  eventType,
  data
) {
  const now =
    Math.floor(
      Date.now() / 1000
    );

  const periodEnd =
    toUnixSeconds(
      data.current_period_end
    );

  if (
    eventType ===
    "membership.started"
  ) {
    return true;
  }

  if (
    eventType ===
    "membership.updated"
  ) {
    const status =
      String(
        data.status || ""
      ).toLowerCase();

    return (
      status === "active" &&
      !toBoolean(
        data.paused
      )
    );
  }

  if (
    eventType ===
    "membership.cancelled"
  ) {
    if (
      toBoolean(
        data.cancel_at_period_end
      ) &&
      periodEnd > now
    ) {
      return true;
    }

    return false;
  }

  if (
    eventType ===
    "membership.paused"
  ) {
    return (
      periodEnd > now
    );
  }

  return false;
}

function getEventType(event) {
  return String(
    event?.type ||
      event?.event ||
      event?.event_type ||
      ""
  )
    .trim()
    .toLowerCase();
}

function getEventData(event) {
  return (
    event?.data ||
    event?.object ||
    event ||
    {}
  );
}

function getMemberEmail(data) {
  return normalizeEmail(
    data.supporter_email ||
      data.email ||
      data.payer_email ||
      data.member_email
  );
}

function getMemberName(data) {
  return String(
    data.supporter_name ||
      data.name ||
      data.member_name ||
      ""
  ).trim();
}

function getMembershipLevelName(
  data
) {
  return String(
    data.membership_level_name ||
      data.membership_name ||
      data.level_name ||
      data.tier_name ||
      ""
  ).trim();
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        success: false,
        error: "POST only",
      });
  }

  try {
    const rawBody =
      await readRawBody(req);

    const signature =
      req.headers[
        "x-signature-sha256"
      ];

    if (
      !verifySignature(
        rawBody,
        signature
      )
    ) {
      console.error(
        "Buy Me a Coffee webhook signature rejected."
      );

      return res
        .status(401)
        .json({
          success: false,
          error:
            "Invalid webhook signature",
        });
    }

    let event;

    try {
      event =
        JSON.parse(rawBody);
    } catch {
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid JSON",
        });
    }

    const eventType =
      getEventType(event);

    console.log(
      "Buy Me a Coffee event:",
      eventType
    );

    const allowedEvents =
      new Set([
        "membership.started",
        "membership.updated",
        "membership.cancelled",
        "membership.paused",
      ]);

    if (
      !allowedEvents.has(
        eventType
      )
    ) {
      return res
        .status(200)
        .json({
          success: true,
          ignored: true,
          eventType,
        });
    }

    const data =
      getEventData(event);

    const email =
      getMemberEmail(data);

    if (!email) {
      console.log(
        "Membership event had no email."
      );

      return res
        .status(200)
        .json({
          success: true,
          ignored: true,
          reason:
            "No member email",
        });
    }

    const tier =
      getTier(
        getMembershipLevelName(
          data
        )
      );

    const accessActive =
      shouldHaveAccess(
        eventType,
        data
      );

    const memberRecord = {
      email,

      name:
        getMemberName(data),

      supporterId:
        data.supporter_id ||
        data.supporter?.id ||
        null,

      membershipId:
        data.id ||
        data.membership_id ||
        null,

      membershipLevelId:
        data.membership_level_id ||
        data.level_id ||
        null,

      tierName:
        tier.name,

      tierKey:
        tier.key,

      tierRank:
        tier.rank,

      membershipStatus:
        String(
          data.status || ""
        ),

      accessActive,

      cancelAtPeriodEnd:
        toBoolean(
          data.cancel_at_period_end
        ),

      paused:
        toBoolean(
          data.paused
        ),

      currentPeriodStart:
        data.current_period_start ||
        null,

      currentPeriodEnd:
        data.current_period_end ||
        null,

      eventType,

      eventId:
        event.event_id ||
        event.id ||
        null,

      liveMode:
        event.live_mode === true,

      updatedAt:
        Date.now(),
    };

    /*
      Save the membership record
      by customer email.
    */

    await redisCommand([
      "SET",
      `elle:member:${email}`,
      JSON.stringify(
        memberRecord
      ),
    ]);

    /*
      Optional supporter ID lookup.
    */

    if (
      memberRecord.supporterId
    ) {
      await redisCommand([
        "SET",
        `elle:member-id:${memberRecord.supporterId}`,
        email,
      ]);
    }

    console.log(
      "Elle membership saved:",
      {
        email,
        tier:
          tier.key,
        accessActive,
        eventType,
      }
    );

    return res
      .status(200)
      .json({
        success: true,

        received:
          eventType,

        member: {
          email,
          tier:
            tier.key,
          accessActive,
        },
      });
  } catch (error) {
    console.error(
      "Buy Me a Coffee webhook error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,
        error:
          "Webhook processing failed",
      });
  }
}
