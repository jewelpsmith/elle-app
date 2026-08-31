import {
  handleUpload,
} from "@vercel/blob/client";

import {
  del,
} from "@vercel/blob";

import {
  getElleSession,
  redisCommand,
} from "./session-check.js";

import {
  createHash,
} from "node:crypto";


/* =========================================================
   PENPAL PHOTO SETTINGS
   ========================================================= */

const PHOTO_MAX_BYTES =
  5 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];


/* =========================================================
   BASIC HELPERS
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


function toMilliseconds(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const numeric =
    Number(
      value
    );

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
      String(
        value
      )
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


function profileKey(email) {

  return (
    `elle:penpal-profile:${normalizeEmail(email)}`
  );
}


async function getProfileRecord(email) {

  const cleanEmail =
    normalizeEmail(
      email
    );

  if (!cleanEmail) {
    return null;
  }

  const raw =
    await redisCommand([
      "GET",
      profileKey(
        cleanEmail
      ),
    ]);

  return parseJson(
    raw
  );
}


async function saveProfileRecord(
  email,
  record
) {

  const cleanEmail =
    normalizeEmail(
      email
    );

  if (!cleanEmail) {

    throw new Error(
      "Verified member email is required."
    );
  }

  await redisCommand([
    "SET",
    profileKey(
      cleanEmail
    ),
    JSON.stringify(
      record
    ),
  ]);
}


/* =========================================================
   MEMBERSHIP CHECK
   ========================================================= */

async function verifyCurrentMembership(
  session
) {

  if (
    !session ||
    !session.email
  ) {

    return {
      valid:false,
      code:"SESSION_REQUIRED",
      reason:
        "A verified Elle session is required.",
    };
  }

  if (
    session.owner ===
    true
  ) {

    return {
      valid:true,
      ownerBypass:true,
    };
  }

  if (
    session.ageGroup !==
    "18+"
  ) {

    return {
      valid:false,
      code:"ADULTS_ONLY",
      reason:
        "PenPal is available only to adults 18+.",
    };
  }

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
      valid:false,
      code:"INFINITE_REQUIRED",
      reason:
        "PenPal requires an active Infinite ∞ membership.",
    };
  }

  const memberRaw =
    await redisCommand([
      "GET",
      `elle:member:${normalizeEmail(session.email)}`,
    ]);

  const member =
    parseJson(
      memberRaw
    );

  if (!member) {

    return {
      valid:false,
      code:"MEMBERSHIP_NOT_FOUND",
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
      valid:false,
      code:"INFINITE_REQUIRED",
      reason:
        "PenPal requires an active Infinite ∞ membership.",
    };
  }

  if (
    member.accessActive !==
    true
  ) {

    return {
      valid:false,
      code:"MEMBERSHIP_INACTIVE",
      reason:
        "Your Infinite ∞ membership is not currently active.",
    };
  }

  const currentPeriodEnd =
    toMilliseconds(
      member.currentPeriodEnd
    );

  if (
    currentPeriodEnd > 0 &&
    currentPeriodEnd <=
    Date.now()
  ) {

    return {
      valid:false,
      code:"MEMBERSHIP_EXPIRED",
      reason:
        "Your paid Infinite ∞ membership period has ended.",
    };
  }

  return {
    valid:true,
    ownerBypass:false,
  };
}


/* =========================================================
   PENPAL ACCESS TOKEN CHECK
   ========================================================= */

async function requirePenpalPhotoAccess({
  session,
  accessToken,
}) {

  const clean =
    cleanAccessToken(
      accessToken
    );

  if (!clean) {

    return {
      valid:false,
      code:"ACCESS_TOKEN_REQUIRED",
      reason:
        "Secure PenPal entry is required.",
    };
  }

  const tokenHash =
    hashValue(
      clean
    );

  const raw =
    await redisCommand([
      "GET",
      `elle:penpal-access:${tokenHash}`,
    ]);

  const record =
    parseJson(
      raw
    );

  if (!record) {

    return {
      valid:false,
      code:"ACCESS_TOKEN_EXPIRED",
      reason:
        "Your PenPal access expired. Enter PenPal again.",
    };
  }

  const expectedSessionHash =
    hashValue(
      session?.token ||
      ""
    );

  if (
    !expectedSessionHash ||
    record.sessionHash !==
      expectedSessionHash ||
    normalizeEmail(
      record.email
    ) !==
      normalizeEmail(
        session.email
      )
  ) {

    return {
      valid:false,
      code:"ACCESS_SESSION_MISMATCH",
      reason:
        "This PenPal access does not belong to the current Elle session.",
    };
  }

  const scopes =
    Array.isArray(
      record.scopes
    )
      ? record.scopes
      : [];

  if (
    !scopes.includes(
      "profile"
    )
  ) {

    return {
      valid:false,
      code:"SCOPE_NOT_ALLOWED",
      reason:
        "This PenPal access token does not allow profile photo changes.",
    };
  }

  const expiresAt =
    Number(
      record.expiresAt ||
      0
    );

  if (
    !expiresAt ||
    expiresAt <=
      Date.now()
  ) {

    return {
      valid:false,
      code:"ACCESS_TOKEN_EXPIRED",
      reason:
        "Your PenPal access expired. Enter PenPal again.",
    };
  }

  const membership =
    await verifyCurrentMembership(
      session
    );

  if (
    !membership.valid
  ) {

    return {
      valid:false,
      code:
        membership.code ||
        "PENPAL_ACCESS_DENIED",

      reason:
        membership.reason ||
        "PenPal access is unavailable.",
    };
  }

  return {
    valid:true,
    ownerBypass:
      membership.ownerBypass ===
      true,
  };
}


/* =========================================================
   CLIENT PAYLOAD
   ========================================================= */

function parseClientPayload(value) {

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


/* =========================================================
   SAFE FILE PATH
   ========================================================= */

function getSafeExtension(
  pathname
) {

  const clean =
    String(
      pathname || ""
    )
      .toLowerCase();

  if (
    clean.endsWith(
      ".jpg"
    ) ||
    clean.endsWith(
      ".jpeg"
    )
  ) {
    return "jpg";
  }

  if (
    clean.endsWith(
      ".png"
    )
  ) {
    return "png";
  }

  if (
    clean.endsWith(
      ".webp"
    )
  ) {
    return "webp";
  }

  return "";
}


function validProfilePath(
  pathname,
  profileId
) {

  const cleanPath =
    String(
      pathname || ""
    );

  const cleanProfileId =
    String(
      profileId || ""
    )
      .trim();

  if (
    !cleanProfileId ||
    cleanProfileId.length > 100
  ) {
    return false;
  }

  if (
    !/^[a-zA-Z0-9_-]+$/.test(
      cleanProfileId
    )
  ) {
    return false;
  }

  const expectedPrefix =
    `penpal-profiles/${cleanProfileId}/`;

  if (
    !cleanPath.startsWith(
      expectedPrefix
    )
  ) {
    return false;
  }

  const extension =
    getSafeExtension(
      cleanPath
    );

  return Boolean(
    extension
  );
}


/* =========================================================
   MAIN API
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
        code:"METHOD_NOT_ALLOWED",
        error:
          "Method not allowed.",
      });
  }

  if (
    !process.env
      .BLOB_READ_WRITE_TOKEN
  ) {

    return res
      .status(
        503
      )
      .json({
        success:false,
        code:"BLOB_NOT_CONFIGURED",
        error:
          "PenPal photo storage is not configured.",
      });
  }

  try {

    const response =
      await handleUpload({

        body:
          req.body,

        request:
          req,

        onBeforeGenerateToken:
          async (
            pathname,
            clientPayload
          ) => {

            const payload =
              parseClientPayload(
                clientPayload
              );

            if (!payload) {

              throw new Error(
                "Photo upload information is missing."
              );
            }

            const sessionToken =
              String(
                payload.sessionToken ||
                ""
              )
                .trim();

            const accessToken =
              String(
                payload.accessToken ||
                ""
              )
                .trim();

            const session =
              await getElleSession(
                sessionToken
              );

            if (!session) {

              throw new Error(
                "Your Elle session expired. Sign in again."
              );
            }

            const penpalAccess =
              await requirePenpalPhotoAccess({
                session,
                accessToken,
              });

            if (
              !penpalAccess.valid
            ) {

              throw new Error(
                penpalAccess.reason ||
                "Secure PenPal access is required."
              );
            }

            const profile =
              await getProfileRecord(
                session.email
              );

            if (
              !profile ||
              !profile.profileId
            ) {

              throw new Error(
                "Create your PenPal profile before adding a photo."
              );
            }

            if (
              !validProfilePath(
                pathname,
                profile.profileId
              )
            ) {

              throw new Error(
                "Invalid PenPal photo path."
              );
            }

            return {

              allowedContentTypes:
                ALLOWED_PHOTO_TYPES,

              maximumSizeInBytes:
                PHOTO_MAX_BYTES,

              addRandomSuffix:
                true,

              tokenPayload:
                JSON.stringify({

                  email:
                    normalizeEmail(
                      session.email
                    ),

                  profileId:
                    profile.profileId,

                  sessionHash:
                    hashValue(
                      session.token
                    ),

                  issuedAt:
                    Date.now(),
                }),
            };
          },


        onUploadCompleted:
          async ({
            blob,
            tokenPayload,
          }) => {

            const payload =
              parseClientPayload(
                tokenPayload
              );

            if (
              !payload ||
              !payload.email ||
              !payload.profileId
            ) {

              throw new Error(
                "Photo upload verification failed."
              );
            }

            const email =
              normalizeEmail(
                payload.email
              );

            const profile =
              await getProfileRecord(
                email
              );

            if (
              !profile ||
              profile.profileId !==
                payload.profileId
            ) {

              try {

                if (
                  blob?.url
                ) {

                  await del(
                    blob.url
                  );
                }

              } catch {
                // Best-effort cleanup.
              }

              throw new Error(
                "The PenPal profile no longer matches this photo upload."
              );
            }

            const oldPhotoUrl =
              String(
                profile.photoUrl ||
                ""
              )
                .trim();

            const nextProfile = {

              ...profile,

              photoChoice:
                "real-photo",

              photoStatus:
                "pending",

              photoUrl:
                blob.url,

              photoStorageKey:
                blob.pathname,

              photoContentType:
                blob.contentType ||
                "",

              photoUploadedAt:
                new Date()
                  .toISOString(),

              photoReviewedAt:
                null,

              photoReviewNote:
                "",

              updatedAt:
                new Date()
                  .toISOString(),
            };

            await saveProfileRecord(
              email,
              nextProfile
            );

            if (
              oldPhotoUrl &&
              oldPhotoUrl !==
                blob.url
            ) {

              try {

                await del(
                  oldPhotoUrl
                );

              } catch {
                // The new photo remains valid even if
                // cleanup of an old private blob fails.
              }
            }
          },
      });


    return res
      .status(
        200
      )
      .json(
        response
      );


  } catch (error) {

    console.error(
      "PenPal photo error:",
      error
    );

    const message =
      String(
        error?.message ||
        ""
      );

    if (
      message
        .toLowerCase()
        .includes(
          "too large"
        )
    ) {

      return res
        .status(
          413
        )
        .json({
          success:false,
          code:"PHOTO_TOO_LARGE",
          error:
            "Your profile photo must be 5 MB or smaller.",
        });
    }

    return res
      .status(
        400
      )
      .json({
        success:false,
        code:"PHOTO_UPLOAD_FAILED",
        error:
          message ||
          "The PenPal photo could not be uploaded.",
      });
  }
}
