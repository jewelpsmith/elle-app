const PRESENCE_TTL_SECONDS = 120;
const PRESENCE_WINDOW_MS = PRESENCE_TTL_SECONDS * 1000;

function getRedisConfig() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.STORAGE_KV_REST_API_URL;

  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.STORAGE_KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Elle World Redis environment variables are missing."
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

function cleanSessionId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function cleanCountryCode(value) {
  if (typeof value !== "string") {
    return "";
  }

  const code = value
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return "";
  }

  return code;
}

function getCountryCode(req) {
  const candidates = [
    req.headers["x-vercel-ip-country"],
    req.headers["x-vercel-sc-country"],
  ];

  for (const value of candidates) {
    const code = cleanCountryCode(
      Array.isArray(value)
        ? value[0]
        : value
    );

    if (code) {
      return code;
    }
  }

  return "XX";
}

function getCountryName(code) {
  if (code === "XX") {
    return "Somewhere in the world";
  }

  try {
    const names =
      new Intl.DisplayNames(
        ["en"],
        {
          type: "region",
        }
      );

    return (
      names.of(code) ||
      "Somewhere in the world"
    );
  } catch {
    return code;
  }
}

function safeTimestamp(value) {
  const numberValue =
    Number(value);

  if (
    !Number.isFinite(numberValue)
  ) {
    return 0;
  }

  return numberValue;
}

async function registerPresence(
  sessionId,
  countryCode
) {
  const now = Date.now();

  const presenceKey =
    `elle-world:presence:${sessionId}`;

  const countrySetKey =
    `elle-world:country:${countryCode}`;

  const countriesKey =
    "elle-world:countries";

  /*
    Store only:
    - anonymous session id
    - country code
    - timestamp

    No name.
    No email.
    No exact location.
    No IP stored in Elle World.
  */

  await redisCommand([
    "SET",
    presenceKey,
    JSON.stringify({
      countryCode,
      lastSeen: now,
    }),
    "EX",
    PRESENCE_TTL_SECONDS,
  ]);

  await redisCommand([
    "ZADD",
    countrySetKey,
    now,
    sessionId,
  ]);

  await redisCommand([
    "EXPIRE",
    countrySetKey,
    PRESENCE_TTL_SECONDS + 60,
  ]);

  await redisCommand([
    "SADD",
    countriesKey,
    countryCode,
  ]);

  await redisCommand([
    "EXPIRE",
    countriesKey,
    86400,
  ]);

  return now;
}

async function collectLiveCountries() {
  const now = Date.now();

  const cutoff =
    now -
    PRESENCE_WINDOW_MS;

  const countryCodes =
    await redisCommand([
      "SMEMBERS",
      "elle-world:countries",
    ]);

  if (
    !Array.isArray(countryCodes) ||
    !countryCodes.length
  ) {
    return {
      totalActive: 0,
      countryCount: 0,
      countries: [],
    };
  }

  const countries = [];

  let totalActive = 0;

  for (const rawCode of countryCodes) {
    const countryCode =
      cleanCountryCode(rawCode);

    if (!countryCode) {
      continue;
    }

    const countrySetKey =
      `elle-world:country:${countryCode}`;

    /*
      Remove stale sessions from
      this country's sorted set.
    */

    await redisCommand([
      "ZREMRANGEBYSCORE",
      countrySetKey,
      "-inf",
      cutoff,
    ]);

    const activeSessions =
      await redisCommand([
        "ZRANGEBYSCORE",
        countrySetKey,
        cutoff,
        "+inf",
        "WITHSCORES",
      ]);

    if (
      !Array.isArray(activeSessions) ||
      activeSessions.length === 0
    ) {
      continue;
    }

    /*
      WITHSCORES returns:
      [session, score, session, score...]
    */

    let newestTimestamp = 0;

    let activeCount = 0;

    for (
      let i = 0;
      i < activeSessions.length;
      i += 2
    ) {
      activeCount++;

      const timestamp =
        safeTimestamp(
          activeSessions[i + 1]
        );

      if (
        timestamp >
        newestTimestamp
      ) {
        newestTimestamp =
          timestamp;
      }
    }

    if (
      activeCount <= 0
    ) {
      continue;
    }

    totalActive += activeCount;

    countries.push({
      code:
        countryCode,

      name:
        getCountryName(
          countryCode
        ),

      active:
        activeCount,

      lastSeen:
        newestTimestamp,
    });
  }

  countries.sort(
    (a, b) => {

      if (
        b.lastSeen !==
        a.lastSeen
      ) {
        return (
          b.lastSeen -
          a.lastSeen
        );
      }

      return (
        b.active -
        a.active
      );
    }
  );

  return {
    totalActive,

    countryCount:
      countries.length,

    countries,
  };
}

export default async function handler(
  req,
  res
) {
  /*
    Elle World is intentionally
    a simple heartbeat endpoint.

    POST:
    registers this anonymous
    browser session as active.

    GET:
    returns aggregate live
    country presence.
  */

  try {
    if (
      req.method === "POST"
    ) {
      const sessionId =
        cleanSessionId(
          req.body?.sessionId
        );

      if (!sessionId) {
        return res
          .status(400)
          .json({
            error:
              "Missing anonymous session id.",
          });
      }

      const countryCode =
        getCountryCode(req);

      await registerPresence(
        sessionId,
        countryCode
      );

      const live =
        await collectLiveCountries();

      return res
        .status(200)
        .json({
          success: true,

          privacy: {
            countryLevelOnly: true,
            exactLocationStored: false,
            publicIpStored: false,
          },

          viewer: {
            countryCode,
            countryName:
              getCountryName(
                countryCode
              ),
          },

          live,
        });
    }

    if (
      req.method === "GET"
    ) {
      const live =
        await collectLiveCountries();

      return res
        .status(200)
        .json({
          success: true,

          privacy: {
            countryLevelOnly: true,
            exactLocationStored: false,
            publicIpStored: false,
          },

          live,
        });
    }

    return res
      .status(405)
      .json({
        error:
          "GET or POST only.",
      });
  } catch (error) {
    console.error(
      "Elle World error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,

        error:
          "Elle World is resting for a moment.",
      });
  }
}
