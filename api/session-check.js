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

function cleanToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 128);
}

export async function getElleSession(sessionToken) {
  const token = cleanToken(sessionToken);

  if (!token) {
    return null;
  }

  const rawSession =
    await redisCommand([
      "GET",
      `elle:session:${token}`,
    ]);

  if (!rawSession) {
    return null;
  }

  let session;

  try {
    session =
      typeof rawSession === "string"
        ? JSON.parse(rawSession)
        : rawSession;
  } catch {
    return null;
  }

  if (
    !session ||
    !session.email ||
    !session.permissions?.elleChat
  ) {
    return null;
  }

  return {
    token,
    ...session,
  };
}

export async function requireElleSession(req) {
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

  if (!token) {
    token =
      req.body?.sessionToken || "";
  }

  return await getElleSession(token);
}
