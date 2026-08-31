import {
  requireElleSession,
  redisCommand,
} from "./session-check.js";

import {
  del,
} from "@vercel/blob";

import {
  createHash,
} from "node:crypto";


/* =========================================================
   PENPAL PROFILE SETTINGS
   ========================================================= */

const BIO_MAX_LENGTH =
  300;

const DISPLAY_NAME_MAX_LENGTH =
  40;

const REGION_MAX_LENGTH =
  80;

const PERSONALITY_MAX_LENGTH =
  80;

const LOOKING_FOR_MAX_LENGTH =
  120;

const MAX_INTERESTS =
  6;

const MAX_LANGUAGES =
  4;

const LIST_ITEM_MAX_LENGTH =
  32;

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


function normalizeAction(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}


function cleanText(
  value,
  maxLength
) {

  return String(
    value || ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      maxLength
    );
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


function cleanToken(value) {

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


/* =========================================================
   RESPONSE HELPERS
   ========================================================= */

function sendError(
  res,
  status,
  code,
  error
) {

  return res
    .status(
      status
    )
    .json({
      success:false,
      code,
      error,
    });
}


/* =========================================================
   CONTENT SAFETY
   ========================================================= */

function containsPrivateContactInfo(
  value
) {

  const text =
    String(
      value || ""
    );

  const email =
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

  const url =
    /\b(?:https?:\/\/|www\.)\S+/i;

  const social =
    /(?:^|\s)@[a-z0-9_.]{2,30}\b/i;

  const phone =
    /(?:\+?\d[\d\s().-]{7,}\d)/;

  return (
    email.test(
      text
    ) ||
    url.test(
      text
    ) ||
    social.test(
      text
    ) ||
    phone.test(
      text
    )
  );
}


function safePublicText(
  value,
  maxLength,
  fieldName
) {

  const text =
    cleanText(
      value,
      maxLength
    );

  if (
    containsPrivateContactInfo(
      text
    )
  ) {

    const error =
      new Error(
        `${fieldName} cannot include email addresses, phone numbers, social handles, or links.`
      );

    error.code =
      "PRIVATE_CONTACT_INFO";

    throw error;
  }

  return text;
}


function normalizeList(
  value,
  maxItems
) {

  const incoming =
    Array.isArray(
      value
    )
      ? value
      : [];

  const output = [];

  for (
    const raw of incoming
  ) {

    const item =
      safePublicText(
        raw,
        LIST_ITEM_MAX_LENGTH,
        "Profile information"
      );

    if (!item) {
      continue;
    }

    if (
      output.some(
        existing =>
          existing.toLowerCase() ===
          item.toLowerCase()
      )
    ) {
      continue;
    }

    output.push(
      item
    );

    if (
      output.length >=
      maxItems
    ) {
      break;
    }
  }

  return output;
}


/* =========================================================
   REDIS RECORD HELPERS
   ========================================================= */

function profileKey(email) {

  return (
    `elle:penpal-profile:${normalizeEmail(email)}`
  );
}


async function getProfileRecord(
  email
) {

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
   PRIVATE BLOB CLEANUP
   ========================================================= */

async function deleteProfileBlob(
  profile
) {

  const blobTarget =
    String(
      profile?.photoUrl ||
      profile?.photoStorageKey ||
      ""
    )
      .trim();

  if (!blobTarget) {
    return;
  }

  try {

    await del(
      blobTarget
    );

  } catch (error) {

    console.error(
      "PenPal photo cleanup error:",
      error
    );
  }
}


function clearPhotoFields(
  profile
) {

  profile.photoUrl =
    null;

  profile.photoStorageKey =
    null;

  profile.photoContentType =
    null;

  profile.photoMimeType =
    null;

  profile.photoBytes =
    0;

  profile.photoUploadedAt =
    null;

  profile.photoReviewedAt =
    null;

  profile.photoAiFlagged =
    false;

  profile.photoAiReviewReason =
    null;

  profile.photoReviewNote =
    null;
}


/* =========================================================
   CURRENT MEMBERSHIP CHECK
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
   PENPAL ACCESS TOKEN
   ========================================================= */

function sessionHash(
  session
) {

  return hashValue(
    session?.token ||
    ""
  );
}


async function requirePenpalAccess({
  session,
  accessToken,
  scope="profile",
}) {

  const clean =
    cleanToken(
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
    sessionHash(
      session
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
      scope
    )
  ) {

    return {
      valid:false,
      code:"SCOPE_NOT_ALLOWED",
      reason:
        "This PenPal access token does not allow that action.",
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
    record,
    ownerBypass:
      membership.ownerBypass ===
      true,
  };
}


/* =========================================================
   PROFILE COMPLETENESS
   ========================================================= */

function getPhotoReady(profile) {

  if (
    profile.photoChoice ===
    "none"
  ) {
    return true;
  }

  if (
    profile.photoChoice !==
    "real-photo"
  ) {
    return false;
  }

  return (
    profile.photoStatus ===
      "approved" &&
    Boolean(
      profile.photoUrl &&
      profile.photoStorageKey
    )
  );
}


function getCompletion(profile) {

  const checks = {

    displayName:
      Boolean(
        profile.displayName &&
        profile.displayName.length >=
          2
      ),

    broadRegion:
      Boolean(
        profile.broadRegion
      ),

    bio:
      Boolean(
        profile.bio &&
        profile.bio.length >=
          10 &&
        profile.bio.length <=
          BIO_MAX_LENGTH
      ),

    interests:
      Array.isArray(
        profile.interests
      ) &&
      profile.interests.length >
        0,

    languages:
      Array.isArray(
        profile.languages
      ) &&
      profile.languages.length >
        0,

    personality:
      Boolean(
        profile.personality
      ),

    lookingFor:
      Boolean(
        profile.lookingFor
      ),

    photo:
      getPhotoReady(
        profile
      ),

    openToConnect:
      profile.openToConnect ===
      true,
  };

  const missing =
    Object
      .entries(
        checks
      )
      .filter(
        ([, complete]) =>
          complete !==
          true
      )
      .map(
        ([key]) =>
          key
      );

  return {
    complete:
      missing.length ===
      0,

    missing,

    checks,
  };
}


/* =========================================================
   SAFE PROFILE RESPONSE
   ========================================================= */

function publicProfile(
  profile
) {

  if (!profile) {
    return null;
  }

  const completion =
    getCompletion(
      profile
    );

  const approvedPhoto =
    (
      profile.photoChoice ===
        "real-photo" &&
      profile.photoStatus ===
        "approved" &&
      Boolean(
        profile.photoUrl &&
        profile.photoStorageKey
      )
    );

  return {

    profileId:
      profile.profileId,

    displayName:
      profile.displayName,

    broadRegion:
      profile.broadRegion,

    bio:
      profile.bio,

    interests:
      profile.interests,

    languages:
      profile.languages,

    personality:
      profile.personality,

    lookingFor:
      profile.lookingFor,

    openToConnect:
      profile.openToConnect ===
      true,

    photoChoice:
      profile.photoChoice,

    photoStatus:
      profile.photoStatus,

    photoAvailable:
      approvedPhoto,

    /*
      The raw private Blob URL is intentionally
      not exposed here.

      Approved private photos will be delivered
      through the authenticated PenPal photo
      endpoint rather than exposing storage
      credentials or relying on a public URL.
    */

    photoUrl:
      null,

    photoAiFlagged:
      profile.photoAiFlagged ===
      true,

    photoAiReviewReason:
      profile.photoAiFlagged ===
        true
        ? (
            profile.photoAiReviewReason ||
            null
          )
        : null,

    photoReviewNote:
      profile.photoReviewNote ||
      null,

    photoUploadedAt:
      profile.photoUploadedAt ||
      null,

    photoReviewedAt:
      profile.photoReviewedAt ||
      null,

    profileComplete:
      completion.complete,

    canContact:
      completion.complete,

    missing:
      completion.missing,

    checks:
      completion.checks,

    createdAt:
      profile.createdAt,

    updatedAt:
      profile.updatedAt,
  };
}


/* =========================================================
   EMPTY PROFILE
   ========================================================= */

function newProfile(
  session
) {

  const now =
    new Date()
      .toISOString();

  return {

    profileId:
      hashValue(
        normalizeEmail(
          session.email
        )
      )
        .slice(
          0,
          24
        ),

    email:
      normalizeEmail(
        session.email
      ),

    displayName:"",

    broadRegion:"",

    bio:"",

    interests:[],

    languages:[],

    personality:"",

    lookingFor:"",

    openToConnect:false,

    photoChoice:
      "none",

    photoStatus:
      "none",

    photoUrl:
      null,

    photoStorageKey:
      null,

    photoContentType:
      null,

    photoMimeType:
      null,

    photoBytes:
      0,

    photoUploadedAt:
      null,

    photoReviewedAt:
      null,

    photoAiFlagged:
      false,

    photoAiReviewReason:
      null,

    photoReviewNote:
      null,

    createdAt:
      now,

    updatedAt:
      now,
  };
}


/* =========================================================
   GET PROFILE
   ========================================================= */

async function handleGet(
  session,
  res
) {

  const existing =
    await getProfileRecord(
      session.email
    );

  if (!existing) {

    const blank =
      newProfile(
        session
      );

    return res
      .status(
        200
      )
      .json({
        success:true,
        exists:false,
        profile:
          publicProfile(
            blank
          ),
      });
  }

  return res
    .status(
      200
    )
    .json({
      success:true,
      exists:true,
      profile:
        publicProfile(
          existing
        ),
    });
}


/* =========================================================
   SAVE PROFILE
   ========================================================= */

async function handleSave(
  req,
  session,
  res
) {

  const previous =
    await getProfileRecord(
      session.email
    );

  const base =
    previous ||
    newProfile(
      session
    );

  let displayName;
  let broadRegion;
  let bio;
  let interests;
  let languages;
  let personality;
  let lookingFor;

  try {

    displayName =
      safePublicText(
        req.body?.displayName,
        DISPLAY_NAME_MAX_LENGTH,
        "Display name"
      );

    broadRegion =
      safePublicText(
        req.body?.broadRegion,
        REGION_MAX_LENGTH,
        "Broad region"
      );

    bio =
      safePublicText(
        req.body?.bio,
        BIO_MAX_LENGTH,
        "Bio"
      );

    interests =
      normalizeList(
        req.body?.interests,
        MAX_INTERESTS
      );

    languages =
      normalizeList(
        req.body?.languages,
        MAX_LANGUAGES
      );

    personality =
      safePublicText(
        req.body?.personality,
        PERSONALITY_MAX_LENGTH,
        "Personality"
      );

    lookingFor =
      safePublicText(
        req.body?.lookingFor,
        LOOKING_FOR_MAX_LENGTH,
        "Looking for"
      );

  } catch (error) {

    return sendError(
      res,
      400,
      error?.code ||
      "INVALID_PROFILE_TEXT",
      error?.message ||
      "That profile information cannot be saved."
    );
  }

  const openToConnect =
    req.body?.openToConnect ===
    true;

  const updated = {

    ...base,

    email:
      normalizeEmail(
        session.email
      ),

    displayName,

    broadRegion,

    bio,

    interests,

    languages,

    personality,

    lookingFor,

    openToConnect,

    updatedAt:
      new Date()
        .toISOString(),
  };

  const completion =
    getCompletion(
      updated
    );

  await saveProfileRecord(
    session.email,
    updated
  );

  return res
    .status(
      200
    )
    .json({
      success:true,

      profile:
        publicProfile(
          updated
        ),

      profileComplete:
        completion.complete,

      canContact:
        completion.complete,

      missing:
        completion.missing,
    });
}


/* =========================================================
   PHOTO CHOICE
   ========================================================= */

async function handlePhotoChoice(
  req,
  session,
  res
) {

  const choice =
    String(
      req.body?.photoChoice ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    choice !==
      "none" &&
    choice !==
      "real-photo"
  ) {

    return sendError(
      res,
      400,
      "INVALID_PHOTO_CHOICE",
      "Choose either no photo or one real profile photo."
    );
  }

  const previous =
    await getProfileRecord(
      session.email
    );

  const profile =
    previous ||
    newProfile(
      session
    );

  if (
    choice ===
    "none"
  ) {

    await deleteProfileBlob(
      profile
    );

    profile.photoChoice =
      "none";

    profile.photoStatus =
      "none";

    clearPhotoFields(
      profile
    );

  } else {

    /*
      If the member already has a valid
      uploaded photo, do not erase it just
      because they selected "real photo"
      again.
    */

    profile.photoChoice =
      "real-photo";

    if (
      !profile.photoUrl ||
      !profile.photoStorageKey
    ) {

      profile.photoStatus =
        "awaiting-upload";

      clearPhotoFields(
        profile
      );
    }
  }

  profile.updatedAt =
    new Date()
      .toISOString();

  await saveProfileRecord(
    session.email,
    profile
  );

  return res
    .status(
      200
    )
    .json({
      success:true,

      photoChoice:
        profile.photoChoice,

      photoStatus:
        profile.photoStatus,

      maxPhotoBytes:
        PHOTO_MAX_BYTES,

      maxPhotoMB:
        5,

      allowedPhotoTypes:
        ALLOWED_PHOTO_TYPES,

      profile:
        publicProfile(
          profile
        ),
    });
}


/* =========================================================
   OWNER PHOTO REVIEW
   ========================================================= */

async function handleOwnerPhotoReview(
  req,
  session,
  res
) {

  if (
    session.owner !==
    true
  ) {

    return sendError(
      res,
      403,
      "OWNER_REQUIRED",
      "Owner access is required for photo review."
    );
  }

  const memberEmail =
    normalizeEmail(
      req.body?.memberEmail
    );

  if (!memberEmail) {

    return sendError(
      res,
      400,
      "MEMBER_EMAIL_REQUIRED",
      "A member email is required."
    );
  }

  const profile =
    await getProfileRecord(
      memberEmail
    );

  if (!profile) {

    return sendError(
      res,
      404,
      "PROFILE_NOT_FOUND",
      "That PenPal profile was not found."
    );
  }

  const decision =
    String(
      req.body?.decision ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    ![
      "approve",
      "reject",
      "flag-ai",
    ].includes(
      decision
    )
  ) {

    return sendError(
      res,
      400,
      "INVALID_REVIEW_DECISION",
      "Choose approve, reject, or flag-ai."
    );
  }

  if (
    profile.photoChoice !==
      "real-photo" ||
    !profile.photoUrl ||
    !profile.photoStorageKey
  ) {

    return sendError(
      res,
      400,
      "PHOTO_NOT_UPLOADED",
      "There is no uploaded profile photo to review."
    );
  }

  const now =
    new Date()
      .toISOString();

  if (
    decision ===
    "approve"
  ) {

    profile.photoStatus =
      "approved";

    profile.photoAiFlagged =
      false;

    profile.photoAiReviewReason =
      null;

    profile.photoReviewedAt =
      now;
  }


  if (
    decision ===
    "reject"
  ) {

    await deleteProfileBlob(
      profile
    );

    profile.photoStatus =
      "rejected";

    profile.photoAiFlagged =
      false;

    profile.photoAiReviewReason =
      null;

    profile.photoReviewedAt =
      now;

    profile.photoUrl =
      null;

    profile.photoStorageKey =
      null;

    profile.photoContentType =
      null;

    profile.photoMimeType =
      null;

    profile.photoBytes =
      0;

    profile.photoUploadedAt =
      null;
  }


  if (
    decision ===
    "flag-ai"
  ) {

    profile.photoStatus =
      "ai-review";

    profile.photoAiFlagged =
      true;

    profile.photoAiReviewReason =
      cleanText(
        req.body?.reason ||
        "Image requires review for possible AI generation.",
        240
      );

    profile.photoReviewedAt =
      now;
  }

  profile.photoReviewNote =
    cleanText(
      req.body?.note,
      500
    );

  profile.updatedAt =
    now;

  await saveProfileRecord(
    memberEmail,
    profile
  );

  return res
    .status(
      200
    )
    .json({
      success:true,

      memberEmail,

      profile:
        publicProfile(
          profile
        ),
    });
}


/* =========================================================
   DELETE PROFILE
   ========================================================= */

async function handleDelete(
  session,
  res
) {

  const profile =
    await getProfileRecord(
      session.email
    );

  if (profile) {

    await deleteProfileBlob(
      profile
    );
  }

  await redisCommand([
    "DEL",
    profileKey(
      session.email
    ),
  ]);

  return res
    .status(
      200
    )
    .json({
      success:true,
      deleted:true,
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

    res.setHeader(
      "Allow",
      "POST"
    );

    return sendError(
      res,
      405,
      "POST_ONLY",
      "POST only"
    );
  }

  try {

    const session =
      await requireElleSession(
        req
      );

    if (!session) {

      return sendError(
        res,
        401,
        "SESSION_REQUIRED",
        "A verified Elle session is required."
      );
    }

    const action =
      normalizeAction(
        req.body?.action
      );


    /*
      Owner review uses the verified
      server-side owner session and does
      not require entering PenPal as the
      member being reviewed.
    */

    if (
      action ===
      "owner-review-photo"
    ) {

      return await handleOwnerPhotoReview(
        req,
        session,
        res
      );
    }


    const access =
      await requirePenpalAccess({

        session,

        accessToken:
          req.body?.accessToken,

        scope:
          "profile",
      });


    if (
      !access.valid
    ) {

      return sendError(
        res,

        access.code ===
          "SCOPE_NOT_ALLOWED"
          ? 403
          : 401,

        access.code ||
        "PENPAL_ACCESS_REQUIRED",

        access.reason ||
        "Secure PenPal access is required."
      );
    }


    if (
      action ===
      "get"
    ) {

      return await handleGet(
        session,
        res
      );
    }


    if (
      action ===
      "save"
    ) {

      return await handleSave(
        req,
        session,
        res
      );
    }


    if (
      action ===
      "photo-choice"
    ) {

      return await handlePhotoChoice(
        req,
        session,
        res
      );
    }


    if (
      action ===
      "delete"
    ) {

      return await handleDelete(
        session,
        res
      );
    }


    return sendError(
      res,
      400,
      "UNKNOWN_ACTION",
      "Unknown PenPal profile action."
    );


  } catch (error) {

    console.error(
      "PenPal profile error:",
      error
    );

    return sendError(
      res,
      500,
      "PENPAL_PROFILE_ERROR",
      "PenPal profile could not be processed right now."
    );
  }
}
