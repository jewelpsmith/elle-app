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

function getPermissions(member) {
  const tier =
    String(
      member?.tierKey || ""
    ).toLowerCase();

  if (tier === "infinite") {
    return {
      elleChat: true,
      expandedPerks: true,
      elleRadio: true,
      liveElle: true,
      liveVideo: true,
    };
  }

  if (tier === "idea-circle") {
    return {
      elleChat: true,
      expandedPerks: true,
      elleRadio: false,
      liveElle: false,
      liveVideo: false,
    };
  }

  if (tier === "spark") {
    return {
      elleChat: true,
      expandedPerks: false,
      elleRadio: false,
      liveElle: false,
      liveVideo: false,
    };
  }

  return {
    elleChat: false,
    expandedPerks: false,
    elleRadio: false,
    liveElle: false,
    liveVideo: false,
  };
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
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

    if (!email) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Email required",
        });
    }

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
          accessActive: false,
          reason:
            "No active membership found",
          permissions:
            getPermissions(null),
        });
    }

    let member;

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

    const accessActive =
      member?.accessActive === true;

    const permissions =
      accessActive
        ? getPermissions(member)
        : getPermissions(null);

    return res
      .status(200)
      .json({
        success: true,

        accessActive,

        member: {
          name:
            member?.name || "",

          email:
            member?.email || email,

          tierName:
            member?.tierName || "",

          tierKey:
            member?.tierKey || "unknown",

          membershipStatus:
            member?.membershipStatus || "",
        },

        permissions,
      });
  } catch (error) {
    console.error(
      "Member access error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,
        error:
          "Membership check failed",
      });
  }
}
