import crypto from "crypto";

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
    await fetch(url, {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${token}`,

        "Content-Type":
          "application/json",
      },

      body:
        JSON.stringify(command),
    });

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

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCode(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

function createSessionToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
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

function getPermissions(
  member,
  owner
) {
  if (owner) {
    return {
      elleChat: true,
      expandedPerks: true,
      elleRadio: true,
      liveElle: true,
      liveVideo: true,
      ownerMode: true,
      testMode: true,
    };
  }

  const tier =
    String(
      member?.tierKey || ""
    ).toLowerCase();

  if (tier === "elle-next") {
    return {
      elleChat: true,
      expandedPerks: true,
      elleRadio: false,
      liveElle: false,
      liveVideo: false,
      ownerMode: false,
      testMode: false,
    };
  }

  if (tier === "infinite") {
    return {
      elleChat: true,
      expandedPerks: true,
      elleRadio: true,
      liveElle: true,
      liveVideo: true,
      ownerMode: false,
      testMode: false,
    };
  }

  if (
    tier === "idea-circle"
  ) {
    return {
      elleChat: true,
      expandedPerks: true,
      elleRadio: false,
      liveElle: false,
      liveVideo: false,
      ownerMode: false,
      testMode: false,
    };
  }

  if (tier === "spark") {
    return {
      elleChat: true,
      expandedPerks: false,
      elleRadio: false,
      liveElle: false,
      liveVideo: false,
      ownerMode: false,
      testMode: false,
    };
  }

  return {
    elleChat: false,
    expandedPerks: false,
    elleRadio: false,
    liveElle: false,
    liveVideo: false,
    ownerMode: false,
    testMode: false,
  };
}

function getServerAgeGroup(
  member,
  owner
) {
  /*
    Age is determined by the
    verified membership tier.

    Never trust an ageGroup value
    sent from the browser for
    normal member access.
  */

  if (owner) {
    return "18+";
  }

  const tier =
    String(
      member?.tierKey || ""
    ).toLowerCase();

  if (tier === "elle-next") {
    return "13-17";
  }

  return "18+";
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
    const email =
      normalizeEmail(
        req.body?.email
      );

    const code =
      normalizeCode(
        req.body?.code
      );

    if (!email) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Email required",
        });
    }

    if (
      !/^[0-9]{6}$/.test(
        code
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Enter the six-digit code",
        });
    }

    const owner =
      isOwner(email);

    /*
    =========================================
    CHECK TEMPORARY CODE
    =========================================
    */

    const rawCode =
      await redisCommand([
        "GET",
        `elle:access-code:${email}`,
      ]);

    if (!rawCode) {
      return res
        .status(200)
        .json({
          success: true,
          verified: false,
          reason:
            "Code expired or not found",
        });
    }

    let codeRecord;

    try {
      codeRecord =
        typeof rawCode ===
        "string"
          ? JSON.parse(
              rawCode
            )
          : rawCode;
    } catch {
      throw new Error(
        "Access code record could not be read."
      );
    }

    const attempts =
      Number(
        codeRecord?.attempts ||
        0
      );

    if (attempts >= 5) {
      await redisCommand([
        "DEL",
        `elle:access-code:${email}`,
      ]);

      return res
        .status(200)
        .json({
          success: true,
          verified: false,
          reason:
            "Too many attempts. Request a new code.",
        });
    }

    if (
      String(
        codeRecord?.code
      ) !== code
    ) {
      await redisCommand([
        "SET",
        `elle:access-code:${email}`,

        JSON.stringify({
          ...codeRecord,

          attempts:
            attempts + 1,
        }),

        "KEEPTTL",
      ]);

      return res
        .status(200)
        .json({
          success: true,
          verified: false,

          reason:
            "That code is not correct",

          attemptsRemaining:
            Math.max(
              0,
              4 - attempts
            ),
        });
    }

    /*
    =========================================
    OWNER OR MEMBER RECORD
    =========================================
    */

    let member;

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
    } else {
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
            verified: false,

            reason:
              "Membership not found",
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
            verified: false,

            reason:
              "Membership is not active",
          });
      }
    }

    /*
    =========================================
    CREATE ELLE SESSION
    =========================================
    */

    const sessionToken =
      createSessionToken();

    const sessionSeconds =
      30 * 24 * 60 * 60;

    const permissions =
      getPermissions(
        member,
        owner
      );

    /*
      IMPORTANT:
      Age is now bound to the
      verified membership session.

      Elle Next = 13-17
      Adult tiers = 18+
    */

    const ageGroup =
      getServerAgeGroup(
        member,
        owner
      );

    const sessionRecord = {
      email,

      memberName:
        member?.name || "",

      tierName:
        member?.tierName || "",

      tierKey:
        member?.tierKey ||
        "unknown",

      ageGroup,

      owner,

      permissions,

      createdAt:
        Date.now(),
    };

    await redisCommand([
      "SET",

      `elle:session:${sessionToken}`,

      JSON.stringify(
        sessionRecord
      ),

      "EX",

      sessionSeconds,
    ]);

    /*
      Access codes are one-time.
    */

    await redisCommand([
      "DEL",
      `elle:access-code:${email}`,
    ]);

    return res
      .status(200)
      .json({
        success: true,
        verified: true,

        owner,

        ageGroup,

        sessionToken,

        sessionExpiresInSeconds:
          sessionSeconds,

        member: {
          name:
            member?.name || "",

          email,

          tierName:
            member?.tierName || "",

          tierKey:
            member?.tierKey ||
            "unknown",

          ageGroup,
        },

        permissions,
      });

  } catch (error) {
    console.error(
      "Verify access code error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        error:
          "Could not verify access code",
      });
  }
}
