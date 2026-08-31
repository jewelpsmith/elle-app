import {
  get,
} from "@vercel/blob";

import {
  Readable,
} from "node:stream";

import {
  requireElleSession,
  redisCommand,
} from "./session-check.js";

import {
  createHash,
} from "node:crypto";


/* =========================================================
   HELPERS
   ========================================================= */

function normalizeEmail(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


function parseJson(value) {

  if (!value) {
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


function hashValue(value) {

  return createHash(
    "sha256"
  )
    .update(
      String(
        value || ""
      )
    )
    .digest(
      "hex"
    );
}


function cleanAccessToken(value) {

  const token =
    String(
      value || ""
    )
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


function noStore(res) {

  res.setHeader(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate"
  );

  res.setHeader(
    "Pragma",
    "no-cache"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );
}


function profileKey(email) {

  return (
    `elle:penpal-profile:${normalizeEmail(email)}`
  );
}


async function getProfileRecord(email) {

  const raw =
    await redisCommand([
      "GET",
      profileKey(
        email
      ),
    ]);

  return parseJson(
    raw
  );
}


/* =========================================================
   CURRENT MEMBERSHIP
   ========================================================= */

async function verifyMembership(
  session
) {

  if (
    !session ||
    !session.email
  ) {
    return false;
  }

  if (
    session.owner ===
    true
  ) {
    return true;
  }

  if (
    session.ageGroup !==
    "18+"
  ) {
    return false;
  }

  if (
    String(
      session.tierKey || ""
    )
      .trim()
      .toLowerCase() !==
    "infinite"
  ) {
    return false;
  }

  const raw =
    await redisCommand([
      "GET",
      `elle:member:${normalizeEmail(session.email)}`,
    ]);

  const member =
    parseJson(
      raw
    );

  if (!member) {
    return false;
  }

  if (
    member.accessActive !==
    true
  ) {
    return false;
  }

  return (
    String(
      member.tierKey || ""
    )
      .trim()
      .toLowerCase() ===
    "infinite"
  );
}


/* =========================================================
   PENPAL ACCESS
   ========================================================= */

async function verifyPenpalAccess(
  session,
  rawAccessToken
) {

  const accessToken =
    cleanAccessToken(
      rawAccessToken
    );

  if (!accessToken) {
    return false;
  }

  const accessHash =
    hashValue(
      accessToken
    );

  const raw =
    await redisCommand([
      "GET",
      `elle:penpal-access:${accessHash}`,
    ]);

  const access =
    parseJson(
      raw
    );

  if (!access) {
    return false;
  }

  if (
    normalizeEmail(
      access.email
    ) !==
    normalizeEmail(
      session.email
    )
  ) {
    return false;
  }

  if (
    access.sessionHash !==
    hashValue(
      session.token || ""
    )
  ) {
    return false;
  }

  const expiresAt =
    Number(
      access.expiresAt || 0
    );

  if (
    !expiresAt ||
    expiresAt <= Date.now()
  ) {
    return false;
  }

  const scopes =
    Array.isArray(
      access.scopes
    )
      ? access.scopes
      : [];

  if (
    !scopes.includes(
      "profile"
    )
  ) {
    return false;
  }

  return await verifyMembership(
    session
  );
}


/* =========================================================
   MAIN
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

    res.setHeader(
      "Allow",
      "POST"
    );

    return res
      .status(
        405
      )
      .json({
        success:false,
        error:
          "POST only.",
      });
  }


  try {

    const session =
      await requireElleSession(
        req
      );

    if (!session) {

      return res
        .status(
          401
        )
        .json({
          success:false,
          error:
            "A verified Elle session is required.",
        });
    }


    const allowed =
      await verifyPenpalAccess(
        session,
        req.body?.accessToken
      );

    if (!allowed) {

      return res
        .status(
          403
        )
        .json({
          success:false,
          error:
            "Secure PenPal access is required.",
        });
    }


    const profile =
      await getProfileRecord(
        session.email
      );

    if (
      !profile ||
      profile.photoChoice !==
        "real-photo" ||
      profile.photoStatus !==
        "approved" ||
      !profile.photoStorageKey
    ) {

      return res
        .status(
          404
        )
        .json({
          success:false,
          error:
            "No approved profile photo is available.",
        });
    }


    const result =
      await get(
        profile.photoStorageKey,
        {
          access:
            "private",

          useCache:
            false,
        }
      );


    if (
      !result ||
      result.statusCode !==
        200
    ) {

      return res
        .status(
          404
        )
        .json({
          success:false,
          error:
            "Profile photo could not be found.",
        });
    }


    res.setHeader(
      "Content-Type",
      result.blob?.contentType ||
      profile.photoContentType ||
      "image/jpeg"
    );

    res.setHeader(
      "Content-Disposition",
      "inline"
    );


    Readable
      .fromWeb(
        result.stream
      )
      .pipe(
        res
      );


  } catch (error) {

    console.error(
      "PenPal photo view error:",
      error
    );

    if (
      !res.headersSent
    ) {

      return res
        .status(
          500
        )
        .json({
          success:false,
          error:
            "Profile photo could not be loaded right now.",
        });
    }
  }
}
