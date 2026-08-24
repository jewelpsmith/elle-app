const GOOGLE_MAILER_URL =
    "https://script.google.com/macros/s/AKfycbyupD2eVltAQHX1uTmYrVhvReGVGqqOAvYb9CpahYntxfBPez1p5_1fGX8zpPnOan991Q/exec";

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST only",
    });
  }

  try {
    const email =
      normalizeEmail(
        req.body?.email
      );

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: "Valid email required",
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
        tierName: "Owner Access",
        tierKey: "owner",
        accessActive: true,
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
        return res.status(200).json({
          success: true,
          codeSent: false,
          accessActive: false,
          reason:
            "No active membership found",
        });
      }

      try {
        member =
          typeof rawMember === "string"
            ? JSON.parse(rawMember)
            : rawMember;
      } catch {
        throw new Error(
          "Membership record could not be read."
        );
      }

      if (
        member?.accessActive !== true
      ) {
        return res.status(200).json({
          success: true,
          codeSent: false,
          accessActive: false,
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
        createdAt: Date.now(),
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
      process.env.ELLE_MAILER_SECRET;

    if (!mailerSecret) {
      throw new Error(
        "ELLE_MAILER_SECRET is missing."
      );
    }

    const mailResponse =
      await fetch(
        GOOGLE_MAILER_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "text/plain;charset=utf-8",
          },

          body: JSON.stringify({
            action:
              "send_access_code",

            secret:
              mailerSecret,

            email,

            code,
          }),

          redirect: "follow",
        }
      );

    const mailText =
      await mailResponse.text();

    let mailResult;

    try {
      mailResult =
        JSON.parse(mailText);
    } catch {
      throw new Error(
        "Google mailer returned invalid JSON."
      );
    }

    if (
      !mailResponse.ok ||
      mailResult.success !== true
    ) {
      throw new Error(
        mailResult.error ||
          "Access code email failed."
      );
    }

    return res.status(200).json({
      success: true,
      codeSent: true,
      accessActive: true,
      owner,

      member: {
        name:
          member?.name || "",

        tierName:
          member?.tierName || "",

        tierKey:
          member?.tierKey || "unknown",
      },

      expiresInSeconds,
    });

  } catch (error) {
    console.error(
      "Request access code error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Could not send access code",
    });
  }
}
