import { createHash } from "node:crypto";
import { requireElleSession } from "./session-check.js";

/* =========================================================
   ELLE IMAGE GENERATION
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
    url:
      url.replace(/\/+$/, ""),

    token,
  };
}

async function redisCommand(
  command
) {
  const { url, token } =
    getRedisConfig();

  const response =
    await fetch(
      url,
      {
        method:
          "POST",

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

  if (
    !response.ok ||
    data?.error
  ) {
    throw new Error(
      data?.error ||
      `Redis request failed with status ${response.status}`
    );
  }

  return data.result;
}

/* =========================================================
   CLEAN INPUT
   ========================================================= */

function cleanString(
  value,
  maxLength = 1200
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      maxLength
    );
}

/* =========================================================
   RATE-LIMIT ID
   ========================================================= */

function getRateLimitIdentifier(
  session
) {
  const raw =
    String(
      session?.email ||
      session?.token ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!raw) {
    return "";
  }

  return createHash(
    "sha256"
  )
    .update(raw)
    .digest("hex")
    .slice(0, 32);
}

/* =========================================================
   IMAGE RATE LIMIT
   ========================================================= */

async function checkImageRateLimit(
  session
) {
  const identifier =
    getRateLimitIdentifier(
      session
    );

  if (!identifier) {
    return {
      allowed:
        false,

      retryAfter:
        3600,
    };
  }

  const hourKey =
    `elle:image:hour:${identifier}`;

  const dayKey =
    `elle:image:day:${identifier}`;

  /*
    HOURLY LIMIT
  */

  const hourCount =
    Number(
      await redisCommand([
        "INCR",
        hourKey,
      ])
    );

  if (
    hourCount === 1
  ) {
    await redisCommand([
      "EXPIRE",
      hourKey,
      3600,
    ]);
  }

  /*
    Current limit:
    4 images per hour.
  */

  if (
    hourCount > 4
  ) {
    return {
      allowed:
        false,

      retryAfter:
        3600,
    };
  }

  /*
    DAILY LIMIT
  */

  const dayCount =
    Number(
      await redisCommand([
        "INCR",
        dayKey,
      ])
    );

  if (
    dayCount === 1
  ) {
    await redisCommand([
      "EXPIRE",
      dayKey,
      86400,
    ]);
  }

  /*
    Current limit:
    20 images per day.
  */

  if (
    dayCount > 20
  ) {
    return {
      allowed:
        false,

      retryAfter:
        86400,
    };
  }

  return {
    allowed:
      true,

    retryAfter:
      0,
  };
}

/* =========================================================
   SERVER-TRUSTED AGE
   ========================================================= */

function getSafeAgeGroup(
  session,
  requestedAgeGroup
) {
  /*
    OWNER TEST MODE

    Only the verified owner
    may intentionally simulate
    either age experience.
  */

  const ownerTestMode =
    session?.owner === true &&
    session?.permissions
      ?.testMode === true;

  if (ownerTestMode) {
    return (
      requestedAgeGroup ===
      "13-17"
        ? "13-17"
        : "18+"
    );
  }

  /*
    NORMAL MEMBERS

    Never trust ageGroup from
    the browser.

    Elle Next is always teen.

    Checking tierKey here also
    protects older sessions that
    may have been created before
    ageGroup was stored directly
    in the session.
  */

  const tierKey =
    String(
      session?.tierKey || ""
    )
      .trim()
      .toLowerCase();

  if (
    tierKey ===
    "elle-next"
  ) {
    return "13-17";
  }

  if (
    session?.ageGroup ===
    "13-17"
  ) {
    return "13-17";
  }

  return "18+";
}

/* =========================================================
   IMAGE PROMPT
   ========================================================= */

function buildImagePrompt(
  prompt,
  ageGroup
) {
  const base =
    cleanString(
      prompt,
      1200
    );

  if (
    ageGroup ===
    "13-17"
  ) {
    return `
Create an age-appropriate,
non-sexual image suitable
for a teen audience ages
13 to 17.

Do not sexualize minors
or depict adult sexual
content.

User request:
${base}
`.trim();
  }

  return base;
}

/* =========================================================
   API HANDLER
   ========================================================= */

export default async function handler(
  req,
  res
) {
  if (
    req.method !==
    "POST"
  ) {
    return res
      .status(405)
      .json({
        error:
          "POST only",
      });
  }

  try {
    /* =====================================================
       VERIFIED MEMBERSHIP SESSION
       ===================================================== */

    const session =
      await requireElleSession(
        req
      );

    if (!session) {
      return res
        .status(401)
        .json({
          error:
            "Elle membership sign-in required.",

          membershipRequired:
            true,
        });
    }

    /*
      Image generation currently
      follows Elle Chat access.

      Spark
      Idea Circle
      Infinite
      Elle Next
      Owner

      may generate images when
      elleChat permission is active.
    */

    if (
      session.permissions
        ?.elleChat !== true
    ) {
      return res
        .status(403)
        .json({
          error:
            "Your membership does not include Elle image generation.",

          membershipRequired:
            true,
        });
    }

    /* =====================================================
       EMERGENCY IMAGE SWITCH
       ===================================================== */

    const imageEnabled =
      String(
        process.env
          .ELLE_IMAGE_ENABLED ||
        "true"
      )
        .trim()
        .toLowerCase();

    if (
      imageEnabled !==
      "true"
    ) {
      return res
        .status(503)
        .json({
          error:
            "Elle image generation is taking a quick break right now. Please try again shortly.",

          imageDisabled:
            true,
        });
    }

    /* =====================================================
       OPENAI CONFIGURATION
       ===================================================== */

    if (
      !process.env
        .OPENAI_API_KEY
    ) {
      console.error(
        "OPENAI_API_KEY is missing."
      );

      return res
        .status(500)
        .json({
          error:
            "Elle image generation is not configured yet.",
        });
    }

    /* =====================================================
       USER PROMPT
       ===================================================== */

    const prompt =
      cleanString(
        req.body?.prompt,
        1200
      );

    if (!prompt) {
      return res
        .status(400)
        .json({
          error:
            "Tell Elle what image you want to create.",
        });
    }

    /* =====================================================
       SERVER-TRUSTED AGE
       ===================================================== */

    const ageGroup =
      getSafeAgeGroup(
        session,
        req.body?.ageGroup
      );

    /* =====================================================
       RATE LIMIT
       ===================================================== */

    let rateLimit;

    try {
      rateLimit =
        await checkImageRateLimit(
          session
        );
    } catch (error) {
      console.error(
        "Elle image rate-limit check failed:",
        error
      );

      return res
        .status(503)
        .json({
          error:
            "Elle image generation is having a quick connection hiccup. Please try again shortly.",

          temporaryError:
            true,
        });
    }

    if (
      !rateLimit.allowed
    ) {
      res.setHeader(
        "Retry-After",
        String(
          rateLimit.retryAfter
        )
      );

      return res
        .status(429)
        .json({
          error:
            "You’ve made a few images already, love. Give it a little time and try again. 💛",

          rateLimited:
            true,

          retryAfter:
            rateLimit.retryAfter,
        });
    }

    /* =====================================================
       BUILD FINAL IMAGE PROMPT
       ===================================================== */

    const imagePrompt =
      buildImagePrompt(
        prompt,
        ageGroup
      );

    /* =====================================================
       OPENAI IMAGE GENERATION
       ===================================================== */

    let openaiResponse;

    try {
      openaiResponse =
        await fetch(
          "https://api.openai.com/v1/images/generations",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`,
            },

            body:
              JSON.stringify({
                model:
                  "gpt-image-2",

                prompt:
                  imagePrompt,

                size:
                  "1024x1024",
              }),
          }
        );
    } catch (error) {
      console.error(
        "OpenAI image network error:",
        error
      );

      return res
        .status(503)
        .json({
          error:
            "Elle could not create that image right now. Please try again shortly.",

          temporaryError:
            true,
        });
    }

    /* =====================================================
       READ OPENAI RESPONSE
       ===================================================== */

    let data;

    try {
      data =
        await openaiResponse
          .json();
    } catch (error) {
      console.error(
        "OpenAI image API returned invalid JSON:",
        error
      );

      return res
        .status(502)
        .json({
          error:
            "Elle could not create that image right now.",
        });
    }

    /* =====================================================
       OPENAI ERROR HANDLING
       ===================================================== */

    if (
      !openaiResponse.ok
    ) {
      console.error(
        "OpenAI image API error:",
        openaiResponse.status,
        data
      );

      const retryable =
        openaiResponse.status ===
          429 ||
        openaiResponse.status ===
          500 ||
        openaiResponse.status ===
          502 ||
        openaiResponse.status ===
          503 ||
        openaiResponse.status ===
          504;

      return res
        .status(
          retryable
            ? 503
            : 400
        )
        .json({
          error:
            retryable
              ? "Elle image generation is busy right now. Give it a moment and try again. 💛"
              : "Elle couldn’t create that image request. Try adjusting the description.",

          temporaryError:
            retryable,
        });
    }

    /* =====================================================
       IMAGE DATA
       ===================================================== */

    const imageBase64 =
      data?.data?.[0]
        ?.b64_json ||
      "";

    const imageUrl =
      data?.data?.[0]
        ?.url ||
      "";

    if (
      !imageBase64 &&
      !imageUrl
    ) {
      console.error(
        "OpenAI image response did not include image data.",
        data
      );

      return res
        .status(502)
        .json({
          error:
            "Elle created an image response but could not display it. Please try again.",
        });
    }

    /* =====================================================
       SUCCESS
       ===================================================== */

    return res
      .status(200)
      .json({
        type:
          "image",

        prompt,

        /*
          IMPORTANT:

          The frontend should use
          data.image directly.

          Do NOT add another
          data:image/png;base64,
          prefix in index.html.
        */

        image:
          imageBase64
            ? `data:image/png;base64,${imageBase64}`
            : imageUrl,

        ageGroup,
      });

  } catch (error) {
    console.error(
      "Elle image server error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          "Elle hit an image-generation hiccup.",
      });
  }
}
