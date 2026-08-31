import {
  requireElleSession,
  redisCommand,
} from "./session-check.js";

import {
  del,
} from "@vercel/blob";

import {
  createHash,
  randomBytes,
} from "node:crypto";


/* =========================================================
   SETTINGS
   ========================================================= */

const BIO_MAX_LENGTH = 300;
const DISPLAY_NAME_MAX_LENGTH = 40;
const REGION_MAX_LENGTH = 80;
const PERSONALITY_MAX_LENGTH = 80;
const LOOKING_FOR_MAX_LENGTH = 120;

const MAX_INTERESTS = 6;
const MAX_LANGUAGES = 4;
const LIST_ITEM_MAX_LENGTH = 32;

const PHOTO_MAX_BYTES =
  5 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MESSAGE_MAX_LENGTH = 1200;

const MAX_MESSAGES_PER_THREAD = 250;

const MAX_PROFILE_INDEX = 1000;

const SHOWCASE_PROFILES = {
  aaliyah: {
    profileId:"showcase-aaliyah",
    showcaseKey:"aaliyah",
    displayName:"Aaliyah",
    broadRegion:"Jamaica · Caribbean",
    bio:"Island girl with big dreams and a heart full of gratitude. I love books, deep conversations, creativity and golden sunsets.",
    interests:[
      "Books",
      "Creativity",
      "Journaling",
      "Spirituality",
    ],
    languages:[
      "English",
      "Patois",
    ],
    personality:"Empathetic",
    lookingFor:"Kindred minds",
    openToConnect:true,
    showcase:true,
  },

  jasmine: {
    profileId:"showcase-jasmine",
    showcaseKey:"jasmine",
    displayName:"Jasmine",
    broadRegion:"United States",
    bio:"Poetry lover. I see beauty in the little things and believe in healing through honest conversations and good music.",
    interests:[
      "Poetry",
      "Healing",
      "Travel",
      "Music",
    ],
    languages:[
      "English",
    ],
    personality:"Thoughtful",
    lookingFor:"Genuine friends",
    openToConnect:true,
    showcase:true,
  },

  nia: {
    profileId:"showcase-nia",
    showcaseKey:"nia",
    displayName:"Nia",
    broadRegion:"South Africa",
    bio:"Explorer at heart. I love good music, adventures, photography, wellness and people who make life feel lighter.",
    interests:[
      "Music",
      "Adventure",
      "Wellness",
      "Photography",
    ],
    languages:[
      "English",
      "Zulu",
    ],
    personality:"Adventurous",
    lookingFor:"Positive energy",
    openToConnect:true,
    showcase:true,
  },

  amara: {
    profileId:"showcase-amara",
    showcaseKey:"amara",
    displayName:"Amara",
    broadRegion:"United Kingdom · London",
    bio:"Style lover, foodie and ambitious soft-life enthusiast. I love laughter, beautiful places, honest conversations and women cheering each other on.",
    interests:[
      "Fashion",
      "Food",
      "Travel",
      "Lifestyle",
    ],
    languages:[
      "English",
    ],
    personality:"Warm + outgoing",
    lookingFor:"Good-energy friendships",
    openToConnect:true,
    showcase:true,
  },
};


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


function randomId(
  prefix=""
) {

  return (
    `${prefix}${randomBytes(18).toString("hex")}`
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
    Number(value);

  if (
    Number.isFinite(numeric) &&
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
      String(value)
    );

  return (
    Number.isFinite(parsed)
      ? parsed
      : 0
  );
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


function sendError(
  res,
  status,
  code,
  error
) {

  return res
    .status(status)
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
    email.test(text) ||
    url.test(text) ||
    social.test(text) ||
    phone.test(text)
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
    Array.isArray(value)
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

    output.push(item);

    if (
      output.length >=
      maxItems
    ) {
      break;
    }
  }

  return output;
}


function safeMessage(value) {

  const text =
    cleanText(
      value,
      MESSAGE_MAX_LENGTH
    );

  if (!text) {

    const error =
      new Error(
        "Write a message first."
      );

    error.code =
      "MESSAGE_REQUIRED";

    throw error;
  }

  if (
    containsPrivateContactInfo(
      text
    )
  ) {

    const error =
      new Error(
        "For safety, PenPal messages cannot include phone numbers, email addresses, social handles, or links."
      );

    error.code =
      "PRIVATE_CONTACT_INFO";

    throw error;
  }

  return text;
}


/* =========================================================
   REDIS KEYS
   ========================================================= */

function profileKey(email) {

  return (
    `elle:penpal-profile:${normalizeEmail(email)}`
  );
}


function profileIdKey(profileId) {

  return (
    `elle:penpal-profile-id:${String(profileId || "").trim()}`
  );
}


function connectionKey(connectionId) {

  return (
    `elle:penpal-connection:${connectionId}`
  );
}


function memberConnectionsKey(email) {

  return (
    `elle:penpal-connections:${hashValue(normalizeEmail(email)).slice(0,24)}`
  );
}


function messagesKey(connectionId) {

  return (
    `elle:penpal-messages:${connectionId}`
  );
}


function blockKey(
  blockerEmail,
  targetIdentity
) {

  return (
    `elle:penpal-block:${hashValue(normalizeEmail(blockerEmail)).slice(0,24)}:${hashValue(targetIdentity).slice(0,24)}`
  );
}


function reportKey(reportId) {

  return (
    `elle:penpal-report:${reportId}`
  );
}


/* =========================================================
   JSON STORAGE HELPERS
   ========================================================= */

async function getJson(key) {

  const raw =
    await redisCommand([
      "GET",
      key,
    ]);

  return parseJson(raw);
}


async function setJson(
  key,
  value
) {

  await redisCommand([
    "SET",
    key,
    JSON.stringify(value),
  ]);
}


async function getJsonArray(key) {

  const value =
    await getJson(key);

  return (
    Array.isArray(value)
      ? value
      : []
  );
}


async function addUniqueToArray(
  key,
  value,
  max=1000
) {

  const current =
    await getJsonArray(key);

  const next = [
    value,
    ...current.filter(
      item =>
        item !== value
    ),
  ].slice(
    0,
    max
  );

  await setJson(
    key,
    next
  );

  return next;
}


async function removeFromArray(
  key,
  value
) {

  const current =
    await getJsonArray(key);

  const next =
    current.filter(
      item =>
        item !== value
    );

  await setJson(
    key,
    next
  );

  return next;
}


/* =========================================================
   PROFILE STORAGE
   ========================================================= */

async function getProfileRecord(
  email
) {

  const cleanEmail =
    normalizeEmail(email);

  if (!cleanEmail) {
    return null;
  }

  return await getJson(
    profileKey(
      cleanEmail
    )
  );
}


async function saveProfileRecord(
  email,
  record
) {

  const cleanEmail =
    normalizeEmail(email);

  if (!cleanEmail) {

    throw new Error(
      "Verified member email is required."
    );
  }

  await setJson(
    profileKey(cleanEmail),
    record
  );

  if (
    record?.profileId
  ) {

    await redisCommand([
      "SET",
      profileIdKey(
        record.profileId
      ),
      cleanEmail,
    ]);

    await addUniqueToArray(
      "elle:penpal-profile-index",
      record.profileId,
      MAX_PROFILE_INDEX
    );
  }
}


async function getProfileById(
  profileId
) {

  const cleanId =
    String(
      profileId || ""
    ).trim();

  if (!cleanId) {
    return null;
  }

  const email =
    await redisCommand([
      "GET",
      profileIdKey(
        cleanId
      ),
    ]);

  const cleanEmail =
    normalizeEmail(email);

  if (!cleanEmail) {
    return null;
  }

  const profile =
    await getProfileRecord(
      cleanEmail
    );

  if (!profile) {
    return null;
  }

  return {
    email:
      cleanEmail,

    profile,
  };
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
    ).trim();

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

  const record =
    await getJson(
      `elle:penpal-access:${tokenHash}`
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

    complete:
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


function publicShowcaseProfile(
  profile
) {

  return {
    ...profile,

    profileComplete:true,
    complete:true,
    canContact:true,
    photoAvailable:true,
    photoStatus:"approved",
    photoChoice:"real-photo",
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
      .status(200)
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
    .status(200)
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

    openToConnect:
      req.body?.openToConnect ===
      true,

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
    .status(200)
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

      checks:
        completion.checks,
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
    .status(200)
    .json({
      success:true,

      photoChoice:
        profile.photoChoice,

      photoStatus:
        profile.photoStatus,

      maxPhotoBytes:
        PHOTO_MAX_BYTES,

      maxPhotoMB:5,

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
    .status(200)
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
   BOARD DIRECTORY
   ========================================================= */

async function handleBoardList(
  session,
  res
) {

  const ownEmail =
    normalizeEmail(
      session.email
    );

  const ids =
    await getJsonArray(
      "elle:penpal-profile-index"
    );

  const profiles = [];

  for (
    const profileId of
    ids.slice(0,150)
  ) {

    const result =
      await getProfileById(
        profileId
      );

    if (
      !result ||
      result.email ===
        ownEmail
    ) {
      continue;
    }

    const completion =
      getCompletion(
        result.profile
      );

    if (
      !completion.complete ||
      result.profile.openToConnect !==
        true
    ) {
      continue;
    }

    profiles.push(
      publicProfile(
        result.profile
      )
    );

    if (
      profiles.length >=
      50
    ) {
      break;
    }
  }

  return res
    .status(200)
    .json({
      success:true,

      showcaseProfiles:
        Object.values(
          SHOWCASE_PROFILES
        ).map(
          publicShowcaseProfile
        ),

      profiles,
    });
}


/* =========================================================
   CONNECTION HELPERS
   ========================================================= */

async function requireCompleteOwnProfile(
  session
) {

  const profile =
    await getProfileRecord(
      session.email
    );

  if (!profile) {

    return {
      valid:false,
      code:"PROFILE_REQUIRED",
      reason:
        "Create your PenPal profile first.",
    };
  }

  const completion =
    getCompletion(
      profile
    );

  if (
    !completion.complete
  ) {

    return {
      valid:false,
      code:"PROFILE_INCOMPLETE",
      reason:
        "Complete your PenPal profile before connecting.",
      missing:
        completion.missing,
    };
  }

  return {
    valid:true,
    profile,
  };
}


function connectionIdentityForMember(
  profileId
) {

  return (
    `member:${profileId}`
  );
}


function connectionIdentityForShowcase(
  key
) {

  return (
    `showcase:${key}`
  );
}


async function isBlocked(
  blockerEmail,
  targetIdentity
) {

  const value =
    await redisCommand([
      "GET",
      blockKey(
        blockerEmail,
        targetIdentity
      ),
    ]);

  return (
    String(value || "") ===
    "1"
  );
}


async function saveConnection(
  record
) {

  await setJson(
    connectionKey(
      record.connectionId
    ),
    record
  );

  if (
    record.memberAEmail
  ) {

    await addUniqueToArray(
      memberConnectionsKey(
        record.memberAEmail
      ),
      record.connectionId,
      500
    );
  }

  if (
    record.memberBEmail
  ) {

    await addUniqueToArray(
      memberConnectionsKey(
        record.memberBEmail
      ),
      record.connectionId,
      500
    );
  }

  if (
    record.showcaseKey
  ) {

    await addUniqueToArray(
      `elle:penpal-showcase-connections:${record.showcaseKey}`,
      record.connectionId,
      500
    );
  }
}


function publicConnectionFor(
  record,
  sessionEmail,
  sessionOwner=false
) {

  const cleanEmail =
    normalizeEmail(
      sessionEmail
    );

  const isA =
    normalizeEmail(
      record.memberAEmail
    ) ===
      cleanEmail;

  const isB =
    normalizeEmail(
      record.memberBEmail
    ) ===
      cleanEmail;

  let other = null;

  if (
    record.showcaseKey
  ) {

    other =
      publicShowcaseProfile(
        SHOWCASE_PROFILES[
          record.showcaseKey
        ]
      );

  } else if (isA) {

    other =
      record.memberBPublic ||
      null;

  } else if (isB) {

    other =
      record.memberAPublic ||
      null;

  } else if (
    sessionOwner
  ) {

    other =
      record.memberAPublic ||
      record.memberBPublic ||
      null;
  }

  return {
    connectionId:
      record.connectionId,

    status:
      record.status,

    createdAt:
      record.createdAt,

    updatedAt:
      record.updatedAt,

    requestedByMe:
      normalizeEmail(
        record.requestedByEmail
      ) ===
        cleanEmail,

    showcaseKey:
      record.showcaseKey ||
      null,

    otherProfile:
      other,

    lastMessageAt:
      record.lastMessageAt ||
      null,

    ended:
      record.status ===
      "ended",

    blocked:
      record.status ===
      "blocked",
  };
}


async function requireConnectionParticipant(
  connectionId,
  session
) {

  const record =
    await getJson(
      connectionKey(
        connectionId
      )
    );

  if (!record) {

    return {
      valid:false,
      code:"CONNECTION_NOT_FOUND",
      reason:
        "That PenPal connection was not found.",
    };
  }

  const email =
    normalizeEmail(
      session.email
    );

  const participant =
    normalizeEmail(
      record.memberAEmail
    ) ===
      email ||
    normalizeEmail(
      record.memberBEmail
    ) ===
      email;

  if (
    !participant &&
    session.owner !==
      true
  ) {

    return {
      valid:false,
      code:"CONNECTION_FORBIDDEN",
      reason:
        "You do not have access to that connection.",
    };
  }

  return {
    valid:true,
    record,
  };
}


/* =========================================================
   CREATE CONNECTION REQUEST
   ========================================================= */

async function handleCreateConnection(
  req,
  session,
  res
) {

  const own =
    await requireCompleteOwnProfile(
      session
    );

  if (
    !own.valid
  ) {

    return sendError(
      res,
      400,
      own.code,
      own.reason
    );
  }

  const showcaseKey =
    String(
      req.body?.showcaseKey ||
      ""
    )
      .trim()
      .toLowerCase();

  const targetProfileId =
    String(
      req.body?.targetProfileId ||
      ""
    ).trim();

  const now =
    new Date()
      .toISOString();

  const connectionId =
    randomId(
      "pc_"
    );

  if (
    showcaseKey
  ) {

    const showcase =
      SHOWCASE_PROFILES[
        showcaseKey
      ];

    if (!showcase) {

      return sendError(
        res,
        404,
        "SHOWCASE_NOT_FOUND",
        "That PenPal profile was not found."
      );
    }

    const blocked =
      await isBlocked(
        session.email,
        connectionIdentityForShowcase(
          showcaseKey
        )
      );

    if (blocked) {

      return sendError(
        res,
        403,
        "PROFILE_BLOCKED",
        "You blocked this PenPal profile."
      );
    }

    const record = {
      connectionId,

      type:
        "showcase",

      showcaseKey,

      memberAEmail:
        normalizeEmail(
          session.email
        ),

      memberBEmail:
        null,

      memberAPublic:
        publicProfile(
          own.profile
        ),

      memberBPublic:
        null,

      requestedByEmail:
        normalizeEmail(
          session.email
        ),

      status:
        "accepted",

      createdAt:
        now,

      updatedAt:
        now,

      lastMessageAt:
        null,
    };

    await saveConnection(
      record
    );

    return res
      .status(200)
      .json({
        success:true,
        connected:true,

        connection:
          publicConnectionFor(
            record,
            session.email,
            session.owner === true
          ),
      });
  }

  if (!targetProfileId) {

    return sendError(
      res,
      400,
      "TARGET_REQUIRED",
      "Choose a PenPal profile to connect with."
    );
  }

  if (
    targetProfileId ===
    own.profile.profileId
  ) {

    return sendError(
      res,
      400,
      "SELF_CONNECTION",
      "You cannot connect with your own profile."
    );
  }

  const target =
    await getProfileById(
      targetProfileId
    );

  if (!target) {

    return sendError(
      res,
      404,
      "PROFILE_NOT_FOUND",
      "That PenPal profile was not found."
    );
  }

  const targetCompletion =
    getCompletion(
      target.profile
    );

  if (
    !targetCompletion.complete ||
    target.profile.openToConnect !==
      true
  ) {

    return sendError(
      res,
      400,
      "PROFILE_NOT_OPEN",
      "That member is not currently open to new connections."
    );
  }

  const blockedByMe =
    await isBlocked(
      session.email,
      connectionIdentityForMember(
        targetProfileId
      )
    );

  const blockedByThem =
    await isBlocked(
      target.email,
      connectionIdentityForMember(
        own.profile.profileId
      )
    );

  if (
    blockedByMe ||
    blockedByThem
  ) {

    return sendError(
      res,
      403,
      "CONNECTION_BLOCKED",
      "This connection is unavailable."
    );
  }

  const record = {
    connectionId,

    type:
      "member",

    showcaseKey:
      null,

    memberAEmail:
      normalizeEmail(
        session.email
      ),

    memberBEmail:
      normalizeEmail(
        target.email
      ),

    memberAPublic:
      publicProfile(
        own.profile
      ),

    memberBPublic:
      publicProfile(
        target.profile
      ),

    requestedByEmail:
      normalizeEmail(
        session.email
      ),

    status:
      "pending",

    createdAt:
      now,

    updatedAt:
      now,

    lastMessageAt:
      null,
  };

  await saveConnection(
    record
  );

  return res
    .status(200)
    .json({
      success:true,
      requested:true,

      connection:
        publicConnectionFor(
          record,
          session.email,
          session.owner === true
        ),
    });
}


/* =========================================================
   LIST CONNECTIONS
   ========================================================= */

async function handleListConnections(
  session,
  res
) {

  const ids =
    await getJsonArray(
      memberConnectionsKey(
        session.email
      )
    );

  const connections = [];

  for (
    const id of
    ids.slice(0,100)
  ) {

    const record =
      await getJson(
        connectionKey(id)
      );

    if (!record) {
      continue;
    }

    connections.push(
      publicConnectionFor(
        record,
        session.email,
        session.owner === true
      )
    );
  }

  connections.sort(
    (a,b) =>
      Date.parse(
        b.lastMessageAt ||
        b.updatedAt ||
        0
      ) -
      Date.parse(
        a.lastMessageAt ||
        a.updatedAt ||
        0
      )
  );

  return res
    .status(200)
    .json({
      success:true,
      connections,
    });
}


/* =========================================================
   RESPOND TO CONNECTION
   ========================================================= */

async function handleRespondConnection(
  req,
  session,
  res
) {

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const decision =
    String(
      req.body?.decision ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    ![
      "accept",
      "decline",
    ].includes(
      decision
    )
  ) {

    return sendError(
      res,
      400,
      "INVALID_DECISION",
      "Choose accept or decline."
    );
  }

  const access =
    await requireConnectionParticipant(
      connectionId,
      session
    );

  if (!access.valid) {

    return sendError(
      res,
      403,
      access.code,
      access.reason
    );
  }

  const record =
    access.record;

  if (
    record.status !==
    "pending"
  ) {

    return sendError(
      res,
      400,
      "NOT_PENDING",
      "That connection request is no longer pending."
    );
  }

  if (
    normalizeEmail(
      record.requestedByEmail
    ) ===
      normalizeEmail(
        session.email
      )
  ) {

    return sendError(
      res,
      403,
      "REQUESTER_CANNOT_RESPOND",
      "The receiving member must respond to this request."
    );
  }

  record.status =
    decision ===
    "accept"
      ? "accepted"
      : "declined";

  record.updatedAt =
    new Date()
      .toISOString();

  await saveConnection(
    record
  );

  return res
    .status(200)
    .json({
      success:true,

      connection:
        publicConnectionFor(
          record,
          session.email,
          session.owner === true
        ),
    });
}


/* =========================================================
   MESSAGE STORAGE
   ========================================================= */

async function getMessages(
  connectionId
) {

  return await getJsonArray(
    messagesKey(
      connectionId
    )
  );
}


async function appendMessage(
  connectionId,
  message
) {

  const current =
    await getMessages(
      connectionId
    );

  const next = [
    ...current,
    message,
  ].slice(
    -MAX_MESSAGES_PER_THREAD
  );

  await setJson(
    messagesKey(
      connectionId
    ),
    next
  );
}


/* =========================================================
   LIST MESSAGES
   ========================================================= */

async function handleListMessages(
  req,
  session,
  res
) {

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const access =
    await requireConnectionParticipant(
      connectionId,
      session
    );

  if (!access.valid) {

    return sendError(
      res,
      403,
      access.code,
      access.reason
    );
  }

  const messages =
    await getMessages(
      connectionId
    );

  return res
    .status(200)
    .json({
      success:true,
      connectionId,
      messages,
    });
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

async function handleSendMessage(
  req,
  session,
  res
) {

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const access =
    await requireConnectionParticipant(
      connectionId,
      session
    );

  if (!access.valid) {

    return sendError(
      res,
      403,
      access.code,
      access.reason
    );
  }

  const record =
    access.record;

  if (
    record.status !==
    "accepted"
  ) {

    return sendError(
      res,
      400,
      "CONNECTION_NOT_ACTIVE",
      "Messages are available only in active connections."
    );
  }

  const own =
    await requireCompleteOwnProfile(
      session
    );

  if (
    !own.valid &&
    session.owner !==
      true
  ) {

    return sendError(
      res,
      400,
      own.code,
      own.reason
    );
  }

  let text;

  try {

    text =
      safeMessage(
        req.body?.message
      );

  } catch (error) {

    return sendError(
      res,
      400,
      error?.code ||
      "INVALID_MESSAGE",
      error?.message ||
      "That message cannot be sent."
    );
  }

  const now =
    new Date()
      .toISOString();

  const message = {
    messageId:
      randomId(
        "pm_"
      ),

    connectionId,

    senderType:
      "member",

    senderProfileId:
      own?.profile?.profileId ||
      null,

    senderDisplayName:
      own?.profile?.displayName ||
      "Member",

    showcaseKey:
      null,

    message:
      text,

    createdAt:
      now,
  };

  await appendMessage(
    connectionId,
    message
  );

  record.lastMessageAt =
    now;

  record.updatedAt =
    now;

  await saveConnection(
    record
  );

  return res
    .status(200)
    .json({
      success:true,
      message,
    });
}


/* =========================================================
   OWNER SEND AS SHOWCASE PROFILE
   ========================================================= */

async function handleOwnerShowcaseMessage(
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
      "Owner access is required."
    );
  }

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const showcaseKey =
    String(
      req.body?.showcaseKey ||
      ""
    )
      .trim()
      .toLowerCase();

  const showcase =
    SHOWCASE_PROFILES[
      showcaseKey
    ];

  if (!showcase) {

    return sendError(
      res,
      404,
      "SHOWCASE_NOT_FOUND",
      "That showcase profile was not found."
    );
  }

  const record =
    await getJson(
      connectionKey(
        connectionId
      )
    );

  if (
    !record ||
    record.showcaseKey !==
      showcaseKey
  ) {

    return sendError(
      res,
      404,
      "CONNECTION_NOT_FOUND",
      "That showcase connection was not found."
    );
  }

  if (
    record.status !==
    "accepted"
  ) {

    return sendError(
      res,
      400,
      "CONNECTION_NOT_ACTIVE",
      "That connection is not active."
    );
  }

  let text;

  try {

    text =
      safeMessage(
        req.body?.message
      );

  } catch (error) {

    return sendError(
      res,
      400,
      error?.code ||
      "INVALID_MESSAGE",
      error?.message ||
      "That message cannot be sent."
    );
  }

  const now =
    new Date()
      .toISOString();

  const message = {
    messageId:
      randomId(
        "pm_"
      ),

    connectionId,

    senderType:
      "showcase",

    senderProfileId:
      showcase.profileId,

    senderDisplayName:
      showcase.displayName,

    showcaseKey,

    message:
      text,

    createdAt:
      now,
  };

  await appendMessage(
    connectionId,
    message
  );

  record.lastMessageAt =
    now;

  record.updatedAt =
    now;

  await saveConnection(
    record
  );

  return res
    .status(200)
    .json({
      success:true,
      message,
    });
}


/* =========================================================
   OWNER SHOWCASE INBOX
   ========================================================= */

async function handleOwnerShowcaseInbox(
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
      "Owner access is required."
    );
  }

  const showcaseKey =
    String(
      req.body?.showcaseKey ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    !SHOWCASE_PROFILES[
      showcaseKey
    ]
  ) {

    return sendError(
      res,
      404,
      "SHOWCASE_NOT_FOUND",
      "That showcase profile was not found."
    );
  }

  const ids =
    await getJsonArray(
      `elle:penpal-showcase-connections:${showcaseKey}`
    );

  const connections = [];

  for (
    const id of
    ids.slice(0,100)
  ) {

    const record =
      await getJson(
        connectionKey(
          id
        )
      );

    if (!record) {
      continue;
    }

    connections.push({
      connectionId:
        record.connectionId,

      status:
        record.status,

      memberProfile:
        record.memberAPublic ||
        record.memberBPublic ||
        null,

      showcaseKey,

      createdAt:
        record.createdAt,

      updatedAt:
        record.updatedAt,

      lastMessageAt:
        record.lastMessageAt ||
        null,
    });
  }

  return res
    .status(200)
    .json({
      success:true,
      showcaseKey,
      connections,
    });
}


/* =========================================================
   END CONNECTION
   ========================================================= */

async function handleEndConnection(
  req,
  session,
  res
) {

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const access =
    await requireConnectionParticipant(
      connectionId,
      session
    );

  if (!access.valid) {

    return sendError(
      res,
      403,
      access.code,
      access.reason
    );
  }

  const record =
    access.record;

  record.status =
    "ended";

  record.endedAt =
    new Date()
      .toISOString();

  record.endedByEmailHash =
    hashValue(
      normalizeEmail(
        session.email
      )
    ).slice(
      0,
      24
    );

  record.updatedAt =
    record.endedAt;

  await saveConnection(
    record
  );

  return res
    .status(200)
    .json({
      success:true,
      ended:true,
    });
}


/* =========================================================
   BLOCK
   ========================================================= */

async function handleBlock(
  req,
  session,
  res
) {

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const access =
    await requireConnectionParticipant(
      connectionId,
      session
    );

  if (!access.valid) {

    return sendError(
      res,
      403,
      access.code,
      access.reason
    );
  }

  const record =
    access.record;

  const me =
    normalizeEmail(
      session.email
    );

  let targetIdentity = "";

  if (
    record.showcaseKey
  ) {

    targetIdentity =
      connectionIdentityForShowcase(
        record.showcaseKey
      );

  } else {

    const otherProfile =
      normalizeEmail(
        record.memberAEmail
      ) ===
        me
        ? record.memberBPublic
        : record.memberAPublic;

    targetIdentity =
      connectionIdentityForMember(
        otherProfile?.profileId ||
        ""
      );
  }

  await redisCommand([
    "SET",
    blockKey(
      me,
      targetIdentity
    ),
    "1",
  ]);

  record.status =
    "blocked";

  record.blockedAt =
    new Date()
      .toISOString();

  record.updatedAt =
    record.blockedAt;

  await saveConnection(
    record
  );

  return res
    .status(200)
    .json({
      success:true,
      blocked:true,
    });
}


/* =========================================================
   REPORT
   ========================================================= */

async function handleReport(
  req,
  session,
  res
) {

  const connectionId =
    String(
      req.body?.connectionId ||
      ""
    ).trim();

  const category =
    cleanText(
      req.body?.category ||
      "penpal-safety",
      80
    );

  const details =
    cleanText(
      req.body?.details,
      2000
    );

  if (!details) {

    return sendError(
      res,
      400,
      "REPORT_DETAILS_REQUIRED",
      "Tell us what happened."
    );
  }

  let connection =
    null;

  if (
    connectionId
  ) {

    const access =
      await requireConnectionParticipant(
        connectionId,
        session
      );

    if (!access.valid) {

      return sendError(
        res,
        403,
        access.code,
        access.reason
      );
    }

    connection =
      access.record;
  }

  const reportId =
    randomId(
      "pr_"
    );

  const report = {
    reportId,

    connectionId:
      connectionId ||
      null,

    category,

    details,

    reporterEmailHash:
      hashValue(
        normalizeEmail(
          session.email
        )
      ),

    showcaseKey:
      connection?.showcaseKey ||
      null,

    status:
      "open",

    createdAt:
      new Date()
        .toISOString(),
  };

  await setJson(
    reportKey(
      reportId
    ),
    report
  );

  await addUniqueToArray(
    "elle:penpal-report-index",
    reportId,
    2000
  );

  return res
    .status(200)
    .json({
      success:true,
      reported:true,
      reportId,
    });
}


/* =========================================================
   OWNER REPORT LIST
   ========================================================= */

async function handleOwnerReports(
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
      "Owner access is required."
    );
  }

  const ids =
    await getJsonArray(
      "elle:penpal-report-index"
    );

  const reports = [];

  for (
    const id of
    ids.slice(0,200)
  ) {

    const report =
      await getJson(
        reportKey(
          id
        )
      );

    if (
      report
    ) {

      reports.push(
        report
      );
    }
  }

  return res
    .status(200)
    .json({
      success:true,
      reports,
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

    if (
      profile.profileId
    ) {

      await redisCommand([
        "DEL",
        profileIdKey(
          profile.profileId
        ),
      ]);

      await removeFromArray(
        "elle:penpal-profile-index",
        profile.profileId
      );
    }
  }

  await redisCommand([
    "DEL",
    profileKey(
      session.email
    ),
  ]);

  return res
    .status(200)
    .json({
      success:true,
      deleted:true,
    });
}


/* =========================================================
   ACTION → REQUIRED SCOPE
   ========================================================= */

function requiredScopeForAction(
  action
) {

  if (
    [
      "get",
      "save",
      "photo-choice",
      "delete",
    ].includes(action)
  ) {
    return "profile";
  }

  if (
    action ===
    "board-list"
  ) {
    return "board";
  }

  if (
    [
      "create-connection",
      "respond-connection",
      "end-connection",
      "block",
    ].includes(action)
  ) {
    return "connect";
  }

  if (
    [
      "list-connections",
      "list-messages",
      "send-message",
    ].includes(action)
  ) {
    return "messaging";
  }

  if (
    action ===
    "report"
  ) {
    return "report";
  }

  return "profile";
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


    /* OWNER-ONLY ACTIONS */

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

    if (
      action ===
      "owner-showcase-message"
    ) {

      return await handleOwnerShowcaseMessage(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "owner-showcase-inbox"
    ) {

      return await handleOwnerShowcaseInbox(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "owner-reports"
    ) {

      return await handleOwnerReports(
        session,
        res
      );
    }


    /* SECURE PENPAL TOKEN */

    const scope =
      requiredScopeForAction(
        action
      );

    const access =
      await requirePenpalAccess({
        session,

        accessToken:
          req.body?.accessToken,

        scope,
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


    /* PROFILE */

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


    /* BOARD */

    if (
      action ===
      "board-list"
    ) {

      return await handleBoardList(
        session,
        res
      );
    }


    /* CONNECTIONS */

    if (
      action ===
      "create-connection"
    ) {

      return await handleCreateConnection(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "list-connections"
    ) {

      return await handleListConnections(
        session,
        res
      );
    }

    if (
      action ===
      "respond-connection"
    ) {

      return await handleRespondConnection(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "end-connection"
    ) {

      return await handleEndConnection(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "block"
    ) {

      return await handleBlock(
        req,
        session,
        res
      );
    }


    /* MESSAGING */

    if (
      action ===
      "list-messages"
    ) {

      return await handleListMessages(
        req,
        session,
        res
      );
    }

    if (
      action ===
      "send-message"
    ) {

      return await handleSendMessage(
        req,
        session,
        res
      );
    }


    /* REPORT */

    if (
      action ===
      "report"
    ) {

      return await handleReport(
        req,
        session,
        res
      );
    }


    return sendError(
      res,
      400,
      "UNKNOWN_ACTION",
      "Unknown PenPal action."
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
      "PenPal could not be processed right now."
    );
  }
}
