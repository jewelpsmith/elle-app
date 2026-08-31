import {
  requireElleSession,
  redisCommand,
} from "./session-check.js";

import {
  createHash,
  randomBytes,
} from "node:crypto";

/* =========================================================
   PENPAL SECURITY SETTINGS
   ========================================================= */

const REQUIRED_CONTINUOUS_DAYS =
  60;

const REQUIRED_REVIEW_SECONDS =
  30;

const REVIEW_TOKEN_SECONDS =
  10 * 60;

const ENTRY_TOKEN_SECONDS =
  2 * 60;

const ACCESS_TOKEN_SECONDS =
  10 * 60;

const RATE_WINDOW_SECONDS =
  10 * 60;

const RATE_MAX_REQUESTS =
  30;

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeAction(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function makeToken() {
  return randomBytes(32)
    .toString("hex");
}

function hashValue(value) {
  return createHash("sha256")
    .update(
      String(value || "")
    )
    .digest("hex");
}

function cleanToken(value) {
  const token =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(
      token
    )
  ) {
    return "";
  }

  return token;
}

function parseJson(value) {
  if (
    !value
  ) {
    return null;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return null;
  }
}

function toMilliseconds(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const numeric =
    Number(value);

  if (
    Number.isFinite(
      numeric
    ) &&
    numeric > 0
  ) {
    if (
      numeric <
      100000000000
    ) {
      return Math.floor(
        numeric * 1000
      );
    }

    return Math.floor(
      numeric
    );
  }

  const parsed =
    Date.parse(
      String(value)
    );

  if (
    Number.isFinite(
      parsed
    )
  ) {
    return parsed;
  }

  return 0;
}

function daysBetween(
  start,
  end
) {
  return (
    end - start
  ) /
  (
    24 *
    60 *
    60 *
    1000
  );
}

/* =========================================================
   RESPONSE HELPERS
   ========================================================= */

function noStore(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );
}

function unauthorized(
  res,
  message=
    "A verified Elle session is required."
) {
  return res
    .status(401)
    .json({
      success:false,
      eligible:false,
      error:message,
    });
}

function forbidden(
  res,
  eligibility
) {
  return res
    .status(403)
    .json({
      success:true,
      eligible:false,
      ...eligibility,
    });
}

/* =========================================================
   MEMBER LOOKUP
   ========================================================= */

async function getMemberRecord(
  email
) {
  const cleanEmail =
    normalizeEmail(
      email
    );

  if (
    !cleanEmail
  ) {
    return null;
  }

  const raw =
    await redisCommand([
      "GET",
      `elle:member:${cleanEmail}`,
    ]);

  return parseJson(
    raw
  );
}

/* =========================================================
   PENPAL ELIGIBILITY
   ========================================================= */

async function getEligibility(
  session
) {
  const now =
    Date.now();

  if (
    !session ||
    !session.email
  ) {
    return {
      eligible:false,

      reason:
        "A verified Elle session is required.",

      code:
        "SESSION_REQUIRED",
    };
  }

  /*
    OWNER MASTER ACCESS

    Owner bypasses:
    - Infinite tier requirement
    - 60-day waiting period

    Owner does NOT bypass:
    - rules review
    - 30-second review
    - adult confirmation
    - short-lived PenPal tokens
  */

  if (
    session.owner ===
    true
  ) {
    return {
      eligible:true,

      ownerBypass:true,

      ageGroup:"18+",

      tierKey:"owner",

      continuousInfiniteSince:
        null,

      continuousDays:
        null,

      daysRemaining:
        0,

      reason:
        "Owner PenPal access verified.",
    };
  }

  /*
    SERVER AGE CHECK

    Never trust browser age here.
  */

  if (
    session.ageGroup !==
    "18+"
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      ageGroup:
        session.ageGroup ||
        "unknown",

      code:
        "ADULTS_ONLY",

      reason:
        "PenPal is available only to adults 18+.",
    };
  }

  /*
    SESSION TIER CHECK
  */

  const sessionTier =
    String(
      session.tierKey ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    sessionTier !==
    "infinite"
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      ageGroup:"18+",

      tierKey:
        sessionTier ||
        "unknown",

      code:
        "INFINITE_REQUIRED",

      reason:
        "PenPal requires an active Infinite ∞ membership.",
    };
  }

  /*
    FRESH MEMBER RECORD CHECK

    We do not rely only on the
    30-day Elle login session.

    Membership is checked again
    from Redis every time.
  */

  const member =
    await getMemberRecord(
      session.email
    );

  if (
    !member
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "MEMBERSHIP_NOT_FOUND",

      reason:
        "The active membership record could not be found.",
    };
  }

  const memberTier =
    String(
      member.tierKey ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    memberTier !==
    "infinite"
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "INFINITE_REQUIRED",

      tierKey:
        memberTier ||
        "unknown",

      reason:
        "PenPal requires an active Infinite ∞ membership.",
    };
  }

  if (
    member.accessActive !==
    true
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "MEMBERSHIP_INACTIVE",

      reason:
        "Your Infinite ∞ membership is not currently active.",
    };
  }

  /*
    If Buy Me a Coffee supplied an
    expiration date and that date
    has already passed, do not trust
    an old accessActive flag.
  */

  const currentPeriodEnd =
    toMilliseconds(
      member.currentPeriodEnd
    );

  if (
    currentPeriodEnd > 0 &&
    currentPeriodEnd <=
      now
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "MEMBERSHIP_EXPIRED",

      currentPeriodEnd,

      reason:
        "Your paid Infinite ∞ membership period has ended.",
    };
  }

  /*
    CONTINUOUS INFINITE HISTORY

    The current billing period by
    itself is not treated as proof
    of two continuous months.

    continuousInfiniteSince is
    maintained by the signed BMAC
    webhook.
  */

  const continuousSince =
    toMilliseconds(
      member
        .continuousInfiniteSince
    );

  if (
    !continuousSince
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "HISTORY_NOT_READY",

      continuousInfiniteSince:
        null,

      reason:
        "Your continuous Infinite ∞ membership history is still being established.",
    };
  }

  if (
    continuousSince >
    now
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "INVALID_HISTORY",

      reason:
        "The Infinite ∞ membership history could not be validated.",
    };
  }

  const continuousDays =
    daysBetween(
      continuousSince,
      now
    );

  const daysRemaining =
    Math.max(
      0,
      Math.ceil(
        REQUIRED_CONTINUOUS_DAYS -
        continuousDays
      )
    );

  if (
    continuousDays <
    REQUIRED_CONTINUOUS_DAYS
  ) {
    return {
      eligible:false,

      ownerBypass:false,

      code:
        "WAITING_PERIOD",

      continuousInfiniteSince:
        continuousSince,

      continuousDays:
        Math.floor(
          continuousDays
        ),

      daysRemaining,

      requiredDays:
        REQUIRED_CONTINUOUS_DAYS,

      reason:
        `PenPal opens after ${REQUIRED_CONTINUOUS_DAYS} continuous days of active Infinite ∞ membership.`,
    };
  }

  return {
    eligible:true,

    ownerBypass:false,

    ageGroup:"18+",

    tierKey:"infinite",

    continuousInfiniteSince:
      continuousSince,

    continuousDays:
      Math.floor(
        continuousDays
      ),

    daysRemaining:
      0,

    requiredDays:
      REQUIRED_CONTINUOUS_DAYS,

    currentPeriodEnd:
      currentPeriodEnd ||
      null,

    cancelAtPeriodEnd:
      member
        .cancelAtPeriodEnd ===
      true,

    reason:
      "PenPal eligibility verified.",
  };
}

/* =========================================================
   SESSION BINDING
   ========================================================= */

function getSessionHash(
  session
) {
  return hashValue(
    session?.token ||
    ""
  );
}

function tokenBelongsToSession(
  record,
  session
) {
  if (
    !record ||
    !session
  ) {
    return false;
  }

  const expected =
    getSessionHash(
      session
    );

  return (
    Boolean(expected) &&
    record.sessionHash ===
      expected &&
    normalizeEmail(
      record.email
    ) ===
      normalizeEmail(
        session.email
      )
  );
}

/* =========================================================
   REDIS TOKEN HELPERS
   ========================================================= */

async function saveToken({
  prefix,
  token,
  record,
  expiresIn,
}) {
  const tokenHash =
    hashValue(
      token
    );

  await redisCommand([
    "SET",

    `${prefix}:${tokenHash}`,

    JSON.stringify(
      record
    ),

    "EX",

    expiresIn,
  ]);
}

async function getToken({
  prefix,
  token,
}) {
  const clean =
    cleanToken(
      token
    );

  if (
    !clean
  ) {
    return null;
  }

  const tokenHash =
    hashValue(
      clean
    );

  const raw =
    await redisCommand([
      "GET",
      `${prefix}:${tokenHash}`,
    ]);

  return parseJson(
    raw
  );
}

async function consumeToken({
  prefix,
  token,
}) {
  const clean =
    cleanToken(
      token
    );

  if (
    !clean
  ) {
    return null;
  }

  const tokenHash =
    hashValue(
      clean
    );

  const key =
    `${prefix}:${tokenHash}`;

  /*
    GETDEL makes the entry token
    single-use.

    Fallback is included in case
    the Redis provider does not
    support GETDEL.
  */

  try {
    const raw =
      await redisCommand([
        "GETDEL",
        key,
      ]);

    return parseJson(
      raw
    );

  } catch {
    const raw =
      await redisCommand([
        "GET",
        key,
      ]);

    if (
      !raw
    ) {
      return null;
    }

    await redisCommand([
      "DEL",
      key,
    ]);

    return parseJson(
      raw
    );
  }
}

/* =========================================================
   RATE LIMIT
   ========================================================= */

async function checkRateLimit(
  session
) {
  const sessionHash =
    getSessionHash(
      session
    );

  if (
    !sessionHash
  ) {
    return false;
  }

  const bucket =
    Math.floor(
      Date.now() /
      (
        RATE_WINDOW_SECONDS *
        1000
      )
    );

  const key =
    `elle:penpal-rate:${sessionHash}:${bucket}`;

  const count =
    Number(
      await redisCommand([
        "INCR",
        key,
      ])
    );

  if (
    count ===
    1
  ) {
    await redisCommand([
      "EXPIRE",
      key,
      RATE_WINDOW_SECONDS,
    ]);
  }

  return (
    count <=
    RATE_MAX_REQUESTS
  );
}

/* =========================================================
   START SERVER-SIDE RULE REVIEW
   ========================================================= */

async function startReview(
  session,
  res
) {
  const eligibility =
    await getEligibility(
      session
    );

  if (
    !eligibility.eligible
  ) {
    return forbidden(
      res,
      eligibility
    );
  }

  const reviewToken =
    makeToken();

  const now =
    Date.now();

  await saveToken({
    prefix:
      "elle:penpal-review",

    token:
      reviewToken,

    expiresIn:
      REVIEW_TOKEN_SECONDS,

    record:{
      scope:
        "penpal-review",

      email:
        normalizeEmail(
          session.email
        ),

      sessionHash:
        getSessionHash(
          session
        ),

      owner:
        session.owner ===
        true,

      startedAt:
        now,

      notBefore:
        now +
        (
          REQUIRED_REVIEW_SECONDS *
          1000
        ),

      expiresAt:
        now +
        (
          REVIEW_TOKEN_SECONDS *
          1000
        ),
    },
  });

  return res
    .status(200)
    .json({
      success:true,

      eligible:true,

      reviewRequired:true,

      reviewToken,

      reviewSeconds:
        REQUIRED_REVIEW_SECONDS,

      expiresInSeconds:
        REVIEW_TOKEN_SECONDS,

      ownerBypass:
        eligibility.ownerBypass ===
        true,
    });
}

/* =========================================================
   COMPLETE REVIEW + ISSUE ONE-TIME ENTRY TOKEN
   ========================================================= */

async function completeReview(
  req,
  session,
  res
) {
  /*
    Both confirmations are explicit.
  */

  if (
    req.body?.rulesConfirmed !==
    true
  ) {
    return res
      .status(400)
      .json({
        success:false,

        eligible:false,

        code:
          "RULES_CONFIRMATION_REQUIRED",

        error:
          "You must agree to the PenPal community rules.",
      });
  }

  if (
    req.body?.adultConfirmed !==
    true
  ) {
    return res
      .status(400)
      .json({
        success:false,

        eligible:false,

        code:
          "ADULT_CONFIRMATION_REQUIRED",

        error:
          "You must confirm that you are 18 or older.",
      });
  }

  const reviewToken =
    cleanToken(
      req.body?.reviewToken
    );

  if (
    !reviewToken
  ) {
    return res
      .status(400)
      .json({
        success:false,

        eligible:false,

        code:
          "REVIEW_TOKEN_REQUIRED",

        error:
          "A valid PenPal review token is required.",
      });
  }

  /*
    Do not consume the review token
    until the 30 seconds have passed.
  */

  const reviewRecord =
    await getToken({
      prefix:
        "elle:penpal-review",

      token:
        reviewToken,
    });

  if (
    !reviewRecord
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "REVIEW_EXPIRED",

        error:
          "The PenPal review expired. Start the review again.",
      });
  }

  if (
    !tokenBelongsToSession(
      reviewRecord,
      session
    )
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "REVIEW_SESSION_MISMATCH",

        error:
          "This PenPal review does not belong to the current Elle session.",
      });
  }

  const now =
    Date.now();

  const notBefore =
    Number(
      reviewRecord.notBefore ||
      0
    );

  if (
    !notBefore ||
    now <
      notBefore
  ) {
    const secondsRemaining =
      Math.max(
        1,
        Math.ceil(
          (
            notBefore -
            now
          ) /
          1000
        )
      );

    return res
      .status(425)
      .json({
        success:false,

        eligible:true,

        code:
          "REVIEW_STILL_RUNNING",

        secondsRemaining,

        error:
          `Please finish the community-rules review. ${secondsRemaining} seconds remain.`,
      });
  }

  /*
    Consume the completed review.
    It cannot be reused.
  */

  const consumedReview =
    await consumeToken({
      prefix:
        "elle:penpal-review",

      token:
        reviewToken,
    });

  if (
    !consumedReview ||
    !tokenBelongsToSession(
      consumedReview,
      session
    )
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "REVIEW_ALREADY_USED",

        error:
          "That PenPal review has already been used or expired.",
      });
  }

  /*
    Re-check membership immediately
    before issuing entry access.
  */

  const eligibility =
    await getEligibility(
      session
    );

  if (
    !eligibility.eligible
  ) {
    return forbidden(
      res,
      eligibility
    );
  }

  const entryToken =
    makeToken();

  const issuedAt =
    Date.now();

  await saveToken({
    prefix:
      "elle:penpal-entry",

    token:
      entryToken,

    expiresIn:
      ENTRY_TOKEN_SECONDS,

    record:{
      scope:
        "penpal-entry",

      email:
        normalizeEmail(
          session.email
        ),

      sessionHash:
        getSessionHash(
          session
        ),

      owner:
        session.owner ===
        true,

      rulesConfirmed:
        true,

      adultConfirmed:
        true,

      issuedAt,

      expiresAt:
        issuedAt +
        (
          ENTRY_TOKEN_SECONDS *
          1000
        ),
    },
  });

  return res
    .status(200)
    .json({
      success:true,

      eligible:true,

      entryToken,

      oneTime:true,

      expiresInSeconds:
        ENTRY_TOKEN_SECONDS,

      ownerBypass:
        eligibility.ownerBypass ===
        true,
    });
}

/* =========================================================
   REDEEM ONE-TIME ENTRY TOKEN
   ========================================================= */

async function redeemEntry(
  req,
  session,
  res
) {
  const entryToken =
    cleanToken(
      req.body?.entryToken
    );

  if (
    !entryToken
  ) {
    return res
      .status(400)
      .json({
        success:false,

        eligible:false,

        code:
          "ENTRY_TOKEN_REQUIRED",

        error:
          "A valid PenPal entry token is required.",
      });
  }

  /*
    GETDEL makes the entry token
    genuinely one-time.
  */

  const entryRecord =
    await consumeToken({
      prefix:
        "elle:penpal-entry",

      token:
        entryToken,
    });

  if (
    !entryRecord
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "ENTRY_TOKEN_INVALID",

        error:
          "The PenPal entry token has expired or was already used.",
      });
  }

  if (
    !tokenBelongsToSession(
      entryRecord,
      session
    )
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "ENTRY_SESSION_MISMATCH",

        error:
          "This PenPal entry token does not belong to the current Elle session.",
      });
  }

  const eligibility =
    await getEligibility(
      session
    );

  if (
    !eligibility.eligible
  ) {
    return forbidden(
      res,
      eligibility
    );
  }

  const accessToken =
    makeToken();

  const issuedAt =
    Date.now();

  const scopes = [
    "board",
    "profile",
    "connect",
    "messaging",
    "report",
  ];

  await saveToken({
    prefix:
      "elle:penpal-access",

    token:
      accessToken,

    expiresIn:
      ACCESS_TOKEN_SECONDS,

    record:{
      scope:
        "penpal-access",

      scopes,

      email:
        normalizeEmail(
          session.email
        ),

      sessionHash:
        getSessionHash(
          session
        ),

      owner:
        session.owner ===
        true,

      issuedAt,

      expiresAt:
        issuedAt +
        (
          ACCESS_TOKEN_SECONDS *
          1000
        ),
    },
  });

  return res
    .status(200)
    .json({
      success:true,

      eligible:true,

      accessToken,

      scopes,

      expiresInSeconds:
        ACCESS_TOKEN_SECONDS,

      ownerBypass:
        eligibility.ownerBypass ===
        true,
    });
}

/* =========================================================
   VALIDATE PENPAL ACCESS TOKEN
   ========================================================= */

async function validateAccess(
  req,
  session,
  res
) {
  const accessToken =
    cleanToken(
      req.body?.accessToken
    );

  if (
    !accessToken
  ) {
    return res
      .status(400)
      .json({
        success:false,

        eligible:false,

        code:
          "ACCESS_TOKEN_REQUIRED",

        error:
          "A PenPal access token is required.",
      });
  }

  const record =
    await getToken({
      prefix:
        "elle:penpal-access",

      token:
        accessToken,
    });

  if (
    !record
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "ACCESS_TOKEN_EXPIRED",

        error:
          "Your PenPal access has expired. Enter PenPal again.",
      });
  }

  if (
    !tokenBelongsToSession(
      record,
      session
    )
  ) {
    return res
      .status(401)
      .json({
        success:false,

        eligible:false,

        code:
          "ACCESS_SESSION_MISMATCH",

        error:
          "This PenPal access token does not belong to the current Elle session.",
      });
  }

  const requestedScope =
    String(
      req.body?.scope ||
      "board"
    )
      .trim()
      .toLowerCase();

  const scopes =
    Array.isArray(
      record.scopes
    )
      ? record.scopes
      : [];

  if (
    !scopes.includes(
      requestedScope
    )
  ) {
    return res
      .status(403)
      .json({
        success:false,

        eligible:false,

        code:
          "SCOPE_NOT_ALLOWED",

        error:
          "This PenPal token does not allow that action.",
      });
  }

  /*
    Re-check membership every time
    the board, profiles, connections
    or messaging validate access.
  */

  const eligibility =
    await getEligibility(
      session
    );

  if (
    !eligibility.eligible
  ) {
    return forbidden(
      res,
      eligibility
    );
  }

  return res
    .status(200)
    .json({
      success:true,

      eligible:true,

      valid:true,

      scope:
        requestedScope,

      expiresAt:
        record.expiresAt,

      ownerBypass:
        eligibility.ownerBypass ===
        true,

      eligibility,
    });
}

/* =========================================================
   ELIGIBILITY STATUS
   ========================================================= */

async function eligibilityStatus(
  session,
  res
) {
  const eligibility =
    await getEligibility(
      session
    );

  return res
    .status(200)
    .json({
      success:true,

      ...eligibility,
    });
}

/* =========================================================
   MAIN HANDLER
   ========================================================= */

export default async function handler(
  req,
  res
) {
  noStore(
    res
  );

  if (
    req.method !==
    "POST"
  ) {
    return res
      .status(405)
      .json({
        success:false,

        error:
          "POST only",
      });
  }

  try {
    /*
      This is the existing secure
      server-side Elle session.

      Browser owner flags, age flags
      and tier flags are ignored.
    */

    const session =
      await requireElleSession(
        req
      );

    if (
      !session
    ) {
      return unauthorized(
        res
      );
    }

    const allowed =
      await checkRateLimit(
        session
      );

    if (
      !allowed
    ) {
      return res
        .status(429)
        .json({
          success:false,

          eligible:false,

          code:
            "RATE_LIMIT",

          error:
            "Too many PenPal access requests. Please try again shortly.",
        });
    }

    const action =
      normalizeAction(
        req.body?.action
      );

    if (
      action ===
      "status"
    ) {
      return await eligibilityStatus(
        session,
        res
      );
    }

    if (
      action ===
      "start-review"
    ) {
      return await startReview(
        session,
        res
      );
    }

    if (
      action ===
      "complete-review"
    ) {
      return await completeReview(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "redeem"
    ) {
      return await redeemEntry(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "validate"
    ) {
      return await validateAccess(
        req,
        session,
        res
      );
    }

    return res
      .status(400)
      .json({
        success:false,

        eligible:false,

        error:
          "Unknown PenPal access action.",
      });

  } catch (error) {
    console.error(
      "PenPal access error:",
      error
    );

    return res
      .status(500)
      .json({
        success:false,

        eligible:false,

        error:
          "PenPal access could not be verified.",
      });
  }
}
