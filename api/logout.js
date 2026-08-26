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

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error ||
      "Redis request failed."
    );
  }

  return data.result;
}

function cleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 128);
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "POST only",
    });
  }

  try {
    const authHeader =
      String(
        req.headers?.authorization || ""
      ).trim();

    let token = "";

    if (
      authHeader
        .toLowerCase()
        .startsWith("bearer ")
    ) {
      token =
        authHeader.slice(7).trim();
    }

    token =
      cleanToken(token);

    if (token) {
      await redisCommand([
        "DEL",
        `elle:session:${token}`,
      ]);
    }

    return res.status(200).json({
      success: true,
    });

  } catch (error) {
    console.error(
      "Logout error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Could not end session",
    });
  }
}
