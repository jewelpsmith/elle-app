import { createHash } from "node:crypto";

const GOOGLE_MAILER_URL =
  "https://script.google.com/macros/s/AKfycbyupD2eVltAQHX1uTmYrVhvReGVGqqOAvYb9CpahYntxfBPez1p5_1fGX8zpPnOan991Q/exec";

/* =========================================================
   REDIS
   ========================================================= */

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
  const { url, token } =
    getRedisConfig();

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            command
          ),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Redis request failed with status ${response.status}`
    );
  }

  if (data?.error) {
    throw new Error(
      data.error
    );
  }

  return data.result;
}

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function createSixDigitCode() {
  return String(
    Math.floor(
      100000 +
      Math.random() * 900000
    )
  );
}

function isOwner(email) {
  const ownerEmail =
    normalizeEmail(
      process.env.ELLE_OWNER_EMAIL
    );

  return Boolean(
    ownerEmail &&
    email === ownerEmail
  );
}

function hashValue(value) {
  const cleaned =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!cleaned) {
    return "";
  }

  return createHash("sha256")
    .update(cleaned)
    .digest("hex")
    .slice(0, 32);
}

function getClientIp(req) {
  const forwarded =
    String(
      req.headers?.[
        "x-forwarded-for"
      ] || ""
    )
      .split(",")[0]
      .trim();

  if (forwarded) {
    return forwarded;
  }

  const realIp =
    String(
      req.headers?.[
        "x-real-ip"
      ] || ""
    )
      .trim();

  return realIp ||
    "unknown";
}

/* =========================================================
   RATE LIMIT
   ========================================================= */

async function checkAccessCodeRateLimit(
  req,
  email
) {
  const emailHash =
    hashValue(email);

  const ipHash =
    hashValue(
      getClientIp(req)
    );

  if (!emailHash) {
    return {
      allowed: false,
      retryAfter: 60,
      reason: "email",
    };
  }

  /*
  =========================================
  EMAIL LIMIT
  5 requests every 30 minutes
  =========================================
  */

  const emailKey =
    `elle:access-rate:email:${emailHash}`;

  const emailCount =
    Number(
      await redisCommand([
        "INCR",
        emailKey,
      ])
    );

  if (emailCount === 1) {
    await redisCommand([
      "EXPIRE",
      emailKey,
      1800,
    ]);
  }

  if (emailCount > 5) {
    return {
      allowed: false,
      retryAfter: 1800,
      reason: "email",
    };
  }

  /*
  =========================================
  IP LIMIT
  20 requests every hour
  =========================================
  */

  if (
    ipHash &&
    getClientIp(req) !==
      "unknown"
  ) {
    const ipKey =
      `elle:access-rate:ip:${ipHash}`;

    const ipCount =
      Number(
        await redisCommand([
          "INCR",
          ipKey,
        ])
      );

    if (ipCount === 1) {
      await redisCommand([
        "EXPIRE",
        ipKey,
        3600,
      ]);
    }

    if (ipCount > 20) {
      return {
        allowed: false,
        retryAfter: 3600,
        reason: "ip",
      };
    }
  }

  return {
    allowed: true,
    retryAfter: 0,
    reason: null,
  };
}

/* =========================================================
   API HANDLER
   ========================================================= */

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
    const email =
      normalizeEmail(
        req.body?.email
      );

    if (
      !email ||
      !isValidEmail(email)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Valid email required",
        });
    }

    /* =====================================================
       ACCESS CODE RATE LIMIT
       ===================================================== */

    const rateLimit =
      await checkAccessCodeRateLimit(
        req,
        email
      );

    if (!rateLimit.allowed) {
      res.setHeader(
        "Retry-After",
        String(
          rateLimit.retryAfter
        )
      );

      return res
        .status(429)
        .json({
          success: false,

          codeSent: false,

          rateLimited: true,

          retryAfter:
            rateLimit.retryAfter,

          error:
            "Too many access-code requests. Please wait a little while before requesting another code.",
        });
    }

    const owner =
      isOwner(email);

    let member = null;

    /*
    =========================================
    OWNER ACCESS
    =========================================
    */

    if (owner) {
      member = {
        name: "Owner",
        email,
        tierName:
          "Owner Access",
        tierKey:
          "owner",
        accessActive:
          true,
      };
    }

    /*
    =========================================
    NORMAL MEMBER ACCESS
    =========================================
    */

    if (!owner) {
      const rawMember =
        await redisCommand([
          "GET",
          `elle:member:${email}`,
        ]);

      if (!rawMember) {
        return res
          .status(200)
          .json({
            success: true,

            codeSent:
              false,

            accessActive:
              false,

            reason:
              "No active membership found",
          });
      }

      try {
        member =
          typeof rawMember ===
          "string"
            ? JSON.parse(
                rawMember
              )
            : rawMember;
      } catch {
        throw new Error(
          "Membership record could not be read."
        );
      }

      if (
        member?.accessActive !==
        true
      ) {
        return res
          .status(200)
          .json({
            success: true,

            codeSent:
              false,

            accessActive:
              false,

            reason:
              "Membership is not active",
          });
      }
    }

    /*
    =========================================
    CREATE TEMPORARY CODE
    =========================================
    */

    const code =
      createSixDigitCode();

    const expiresInSeconds =
      10 * 60;

    await redisCommand([
      "SET",
      `elle:access-code:${email}`,
      JSON.stringify({
        code,
        attempts: 0,
        createdAt:
          Date.now(),
        owner,
      }),
      "EX",
      expiresInSeconds,
    ]);

    /*
    =========================================
    EMAIL THE CODE
    =========================================
    */

    const mailerSecret =
      process.env
        .ELLE_MAILER_SECRET;

    if (!mailerSecret) {
      throw new Error(
        "ELLE_MAILER_SECRET is missing."
      );
    }

    const mailResponse =
      await fetch(
        GOOGLE_MAILER_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8",
          },

          body:
            JSON.stringify({
              action:
                "send_access_code",

              secret:
                mailerSecret,

              email,

              code,
            }),

          redirect:
            "follow",
        }
      );

    const mailText =
      await mailResponse
        .text();

    let mailResult;

    try {
      mailResult =
        JSON.parse(
          mailText
        );
    } catch {
      throw new Error(
        "Google mailer returned invalid JSON."
      );
    }

    if (
      !mailResponse.ok ||
      mailResult.success !==
        true
    ) {
      throw new Error(
        mailResult.error ||
        "Access code email failed."
      );
    }

    /*
    =========================================
    SUCCESS
    =========================================
    */

    return res
      .status(200)
      .json({
        success: true,

        codeSent: true,

        accessActive:
          true,

        owner,

        member: {
          name:
            member?.name ||
            "",

          tierName:
            member?.tierName ||
            "",

          tierKey:
            member?.tierKey ||
            "unknown",
        },

        expiresInSeconds,
      });

  } catch (error) {
    console.error(
      "Request access code error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        error:
          "Could not send access code",
      });
  }
}
