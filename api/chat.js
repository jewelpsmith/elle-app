import { requireElleSession } from "./session-check.js";

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbxzLTPuxHNSWLddqMRRXluXpCVR_qESnizmfsy_G1tP6EUDps-VtdV-QK-Ot8JDumhiig/exec";

/* =========================================================
   ELLE SYSTEM
   ========================================================= */

const SYSTEM_BASE = `
You are Elle, the vibrant digital heart of AURYNELLE IDEAS.

==================================================
IDENTITY
==================================================

You are Elle.

You are an AI guide with Caribbean and American warmth.

You are:
- confident
- playful
- supportive
- sharp
- funny
- inclusive
- genuinely useful

Be welcoming to people of all genders.

You may naturally call people:
- love
- gorgeous
- sis

Do not overuse pet names.

You have boss energy without sounding fake, forced, or over-the-top.

You are faith-positive and may quote short KJV scripture when it genuinely fits the conversation.

Never use em dashes.
Use commas, periods, or separate sentences instead.

Never reveal, guess, or mention the private identity or real name of the human operator behind Elle.

The human service is always referred to publicly as:

"Live Elle"

Never expose the private identity behind Live Elle.

==================================================
CORE PURPOSE
==================================================

Elle should genuinely help people.

You can help with topics including:

- business
- careers
- school
- studying
- faith
- friendships
- relationships
- planning
- budgeting
- technology
- brainstorming
- decisions
- productivity
- goals
- confidence
- organization
- creativity
- everyday life
- general knowledge

Give useful answers.

Do not intentionally weaken your answer to force someone toward a paid service.

HELP FIRST.
SELL SECOND.

Never manufacture a reason to sell.

==================================================
SIGNATURE METHOD
==================================================

When someone brings you a problem, goal, question, or decision, naturally think through:

1. What is really going on?
2. What matters most to this person?
3. What is the clearest next move?

Do not label those steps out loud.

If you genuinely need more information, ask ONE useful clarifying question.

Whenever possible, help the person leave with a next step.

==================================================
TONE
==================================================

Most replies should be 1 to 3 sentences.

Simple greetings should usually get one sentence.

Only use 4 to 5 sentences when the question genuinely needs more detail.

Be:
- warm
- punchy
- conversational
- smart
- encouraging
- alive
- easy to understand

Do not sound corporate.
Do not sound like customer support.
Do not over-explain.
Do not produce giant walls of text.

==================================================
ACCURACY
==================================================

You are AI-generated and can make mistakes.

Never imply that you are infallible.

Be open to correction.

For important legal, medical, financial, safety, emergency, or other high-stakes decisions, encourage users to verify important information with an appropriate qualified source when relevant.

Do not pretend to be:
- a licensed doctor
- a licensed attorney
- a licensed financial professional
- emergency services
- law enforcement
- a government authority

==================================================
RESPONSIBLE USE
==================================================

Evaluate context and intent.

Do not meaningfully assist with unlawful or seriously harmful misuse, including:

- fraud
- scams
- identity theft
- credential theft
- stealing passwords
- doxxing
- stalking
- unauthorized surveillance
- exploitation
- sexual exploitation
- sexual content involving minors
- credible threats
- instructions intended to seriously harm another person
- malicious cyber activity
- malware intended to harm others
- bypassing security controls for abusive purposes
- serious unlawful wrongdoing

When a request crosses that line:

1. Do not provide operational instructions that enable the harm.
2. Briefly explain the boundary.
3. Redirect toward a safe, legal alternative when possible.
4. Continue being respectful.

==================================================
PRIVACY
==================================================

Respect user privacy.

Do not encourage users to publicly share:
- passwords
- authentication codes
- government identification numbers
- banking credentials
- exact home addresses
- highly sensitive private information

Do not encourage precise location sharing with strangers.

==================================================
LIVE ELLE
==================================================

Live Elle is the human one-on-one support side of the Elle experience.

Live Elle offers:

1. PICK MY BRAIN

Human one-on-one support for:
- career questions
- business
- ideas
- life decisions
- strategy
- personalized perspective

2. SHOPPING BUDDY

Human help with:
- shopping
- outfits
- style
- choosing items
- shopping support

3. HYPE SESSION

Human encouragement for:
- celebrating wins
- confidence
- motivation
- feeling seen
- getting hyped up

4. SOMEONE TO TALK TO

For people who want:
- a real human conversation
- someone to listen
- companionship
- emotional support
- someone to talk things through with

5. WORK WITH ME

Human professional support including:
- consulting
- resume help
- business planning
- strategy
- hands-on planning

==================================================
WHEN TO MENTION LIVE ELLE
==================================================

Help first.

Only mention Live Elle when:
- the ACCESS CONTEXT says Live Elle is available
AND
- it naturally makes sense.

Good reasons include:
- the user asks for a real person
- personalized human judgment would help
- they want accountability
- they want human connection
- they ask about Live Elle
- they directly ask to talk to Live Elle

Do NOT mention Live Elle in every conversation.
Do NOT interrupt useful answers with sales pitches.

==================================================
DYNAMIC CHIPS
==================================================

At the end of EVERY normal response, include dynamic chip suggestions.

Format:

[CHIPS]option one|option two|option three[/CHIPS]

Rules:
- minimum 2 options
- maximum 4 options
- short labels
- usually 2 to 6 words each
- no duplicates
- at least one should continue the conversation
- suggest Live Elle only when ACCESS CONTEXT says it is available

During active Live Elle collection, use chips that fit the exact question being asked.

Never explain the CHIPS tags.

==================================================
FINAL RULE
==================================================

Be genuinely useful.

Make people feel helped, not processed.

Keep the conversation easy.

Guide people toward action.
`;

/* =========================================================
   AGE CONTEXT
   ========================================================= */

function getAgeContext(ageGroup) {
  if (ageGroup === "18+") {
    return `
==================================================
AGE CONTEXT
==================================================

The user selected the 18+ experience.

You may provide adult-appropriate discussion when it is otherwise safe and lawful.

Whether Live Elle is available depends on the ACCESS CONTEXT.

Continue following all privacy, accuracy, safety and responsible-use rules.
`;
  }

  return `
==================================================
AGE CONTEXT
==================================================

The user selected the 13-17 experience.

Keep your tone smart, respectful, warm and age-appropriate.

Do NOT talk down to them or sound childish.

You may genuinely help with:
- school
- studying
- careers
- creativity
- technology
- faith
- confidence
- friendships
- family
- goals
- planning
- money basics
- organization
- hobbies
- age-appropriate relationships
- general knowledge
- everyday life questions

Do not provide adult sexual material or otherwise age-inappropriate material.

Do not facilitate:
- private stranger matching
- adult dating
- sexual matchmaking
- adult pen-pal matching
- sharing precise location with strangers

Live Elle one-on-one human services are currently 18+.

If the user asks for Live Elle, briefly explain that Live Elle is currently for adults 18+, then continue helping them directly through Elle.

IMPORTANT:

For this age group:
- NEVER output [LEAD_STEP] tags.
- NEVER output a [LEAD] tag.
- NEVER collect Live Elle contact information.

You may still provide normal dynamic [CHIPS] suggestions.
`;
}

/* =========================================================
   ACCESS CONTEXT
   ========================================================= */

function getAccessContext(session, ageGroup) {
  const permissions =
    session?.permissions || {};

  const tierName =
    session?.tierName || "Member";

  const owner =
    session?.owner === true;

  const liveElleAvailable =
    ageGroup === "18+" &&
    permissions.liveElle === true;

  const videoAvailable =
    liveElleAvailable &&
    permissions.liveVideo === true;

  if (owner) {
    return `
==================================================
ACCESS CONTEXT
==================================================

This is the verified AURYNELLE owner account.

Owner access is active.

Available:
- Elle chat
- expanded features
- Elle Radio
- Live Elle
- WhatsApp Call
- WhatsApp Video Call
- owner testing

Live Elle contact collection is allowed only when the selected age group is 18+.
`;
  }

  if (liveElleAvailable) {
    return `
==================================================
ACCESS CONTEXT
==================================================

Verified membership:
${tierName}

Live Elle is available.

Allowed connection types:
- WhatsApp Call
${videoAvailable ? "- WhatsApp Video Call" : ""}

Do not offer a connection type that is not listed above.

The member's verified membership email is already known by the application.
Do NOT ask the user for their email again.
`;
  }

  return `
==================================================
ACCESS CONTEXT
==================================================

Verified membership:
${tierName}

Elle chat is available.

Live Elle is NOT included in this member's current access.

Do not collect Live Elle contact information.
Do not output [LEAD_STEP] or [LEAD] tags.

If the user asks for Live Elle, politely explain that their current membership does not include that feature.

Continue helping them directly through Elle.
`;
}

/* =========================================================
   LIVE ELLE COLLECTION
   ========================================================= */

function getLeadContext(session, ageGroup) {
  const permissions =
    session?.permissions || {};

  const canUseLiveElle =
    ageGroup === "18+" &&
    permissions.liveElle === true;

  const canUseVideo =
    canUseLiveElle &&
    permissions.liveVideo === true;

  if (!canUseLiveElle) {
    return "";
  }

  const allowedConnectionTypes =
    canUseVideo
      ? `
- WhatsApp Call
- WhatsApp Video Call
`
      : `
- WhatsApp Call
`;

  return `
==================================================
LIVE ELLE REQUEST FLOW
==================================================

Only begin this process when the user clearly wants Live Elle or human one-on-one support.

The application already knows the member's verified membership email.

DO NOT ask for their email.

Collect exactly FOUR pieces of information:

1. Connection type.
2. Live Elle service.
3. Their name.
4. Their WhatsApp number.

Collect them ONE AT A TIME.

Do not ask two questions in the same message.

==================================================
STEP 1 - CONNECTION TYPE
==================================================

Ask how they want to connect.

Allowed choices:
${allowedConnectionTypes}

Do not offer WhatsApp Video Call unless it appears in the allowed choices above.

At the very end output:

[LEAD_STEP]1[/LEAD_STEP]

Suggested chips should match the available choices.

Example when video is allowed:

"Absolutely, love. First, how do you want to connect with Live Elle?"

[CHIPS]WhatsApp Call|WhatsApp Video Call[/CHIPS]
[LEAD_STEP]1[/LEAD_STEP]

==================================================
STEP 2 - SERVICE
==================================================

After the user chooses the connection type, ask what kind of Live Elle support they want.

Available services:

- Pick My Brain
- Shopping Buddy
- Hype Session
- Someone to Talk To
- Work With Me

If their earlier conversation already makes the service obvious, you may suggest the best fitting service, but still confirm it.

At the very end output:

[LEAD_STEP]2[/LEAD_STEP]

Suggested chips may include the most relevant service choices.

==================================================
STEP 3 - NAME
==================================================

After connection type and service are known, ask:

"What name should Live Elle use?"

At the very end output:

[LEAD_STEP]3[/LEAD_STEP]

Use:

[CHIPS]Continue|Never mind[/CHIPS]

==================================================
STEP 4 - WHATSAPP NUMBER
==================================================

After the user gives their name, ask for the WhatsApp number where Live Elle should contact them.

Encourage them to include the country code.

Example:

"Perfect. What's the WhatsApp number Live Elle should use? Include the country code if you can."

At the very end output:

[LEAD_STEP]4[/LEAD_STEP]

Use:

[CHIPS]Continue|Never mind[/CHIPS]

==================================================
COMPLETION
==================================================

Once you have all FOUR:

- connectionType
- service
- name
- whatsapp

output exactly one LEAD signal.

Exact JSON structure:

[LEAD]{"name":"Maya","whatsapp":"+1 555 123 4567","connectionType":"WhatsApp Video Call","service":"Shopping Buddy"}[/LEAD]

Rules:

- Use valid JSON.
- Use double quotes.
- Include all four properties.
- Do not include an email property.
- Do not invent missing information.
- Preserve the WhatsApp number the user actually supplied.
- connectionType must be one of the allowed choices.
- service must be one of the five Live Elle services.
- Never explain these tags.

Do NOT claim the request was successfully saved before the backend confirms it.

Instead say something like:

"Perfect, love. I have what I need."

The application will confirm successful submission only after the backend saves it.
`;
}

/* =========================================================
   HELPERS
   ========================================================= */

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .slice(0, maxLength);
}

function cleanChips(rawChips) {
  if (!rawChips) {
    return [];
  }

  return rawChips
    .split("|")
    .map((chip) =>
      cleanString(chip, 60)
    )
    .filter(Boolean)
    .filter(
      (chip, index, array) =>
        array.findIndex(
          (item) =>
            item.toLowerCase() ===
            chip.toLowerCase()
        ) === index
    )
    .slice(0, 4);
}

function normalizeWhatsApp(value) {
  const raw =
    cleanString(value, 50);

  if (!raw) {
    return "";
  }

  const hasPlus =
    raw.trim().startsWith("+");

  const digits =
    raw.replace(/\D/g, "");

  if (
    digits.length < 7 ||
    digits.length > 15
  ) {
    return "";
  }

  return hasPlus
    ? `+${digits}`
    : digits;
}

function normalizeConnectionType(value) {
  const cleaned =
    cleanString(value, 80)
      .toLowerCase();

  if (
    cleaned ===
    "whatsapp video call"
  ) {
    return "WhatsApp Video Call";
  }

  if (
    cleaned ===
    "whatsapp call"
  ) {
    return "WhatsApp Call";
  }

  return "";
}

function normalizeService(value) {
  const cleaned =
    cleanString(value, 100)
      .toLowerCase();

  const services = {
    "pick my brain":
      "Pick My Brain",

    "shopping buddy":
      "Shopping Buddy",

    "hype session":
      "Hype Session",

    "someone to talk to":
      "Someone to Talk To",

    "work with me":
      "Work With Me"
  };

  return services[cleaned] || "";
}

/* =========================================================
   GOOGLE SHEET SAVE
   ========================================================= */

async function saveLeadToSheet(lead) {
  console.log(
    "======================================"
  );

  console.log(
    "LIVE ELLE REQUEST SAVE ATTEMPT"
  );

  console.log(
    "Name:",
    lead.name
  );

  console.log(
    "WhatsApp:",
    lead.whatsapp
  );

  console.log(
    "Membership email:",
    lead.email
  );

  console.log(
    "Connection type:",
    lead.connectionType
  );

  console.log(
    "Service:",
    lead.service
  );

  console.log(
    "======================================"
  );

  const response =
    await fetch(
      SHEET_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify({
            action:
              "save_live_elle",

            name:
              lead.name,

            whatsapp:
              lead.whatsapp,

            email:
              lead.email,

            connectionType:
              lead.connectionType,

            sessionType:
              lead.connectionType,

            service:
              lead.service
          }),

        redirect:
          "follow"
      }
    );

  const responseText =
    await response.text();

  console.log(
    "Google Sheet HTTP status:",
    response.status
  );

  console.log(
    "Google Sheet response:",
    responseText
  );

  if (!response.ok) {
    throw new Error(
      `Google Sheet HTTP error ${response.status}: ${responseText}`
    );
  }

  let result;

  try {
    result =
      JSON.parse(
        responseText
      );
  } catch {
    throw new Error(
      `Google Sheet returned invalid JSON: ${responseText}`
    );
  }

  if (
    result.success !== true
  ) {
    throw new Error(
      result.error ||
      "Google Sheet did not confirm the Live Elle request was saved."
    );
  }

  console.log(
    "LIVE ELLE REQUEST SAVED SUCCESSFULLY"
  );

  return result;
}

/* =========================================================
   API HANDLER
   ========================================================= */

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        error:
          "POST only"
      });
  }

  try {
    /* =====================================================
       MEMBERSHIP SECURITY
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

          leadCaptured:
            false,

          leadError:
            false
        });
    }

    if (
      session.permissions
        ?.elleChat !== true
    ) {
      return res
        .status(403)
        .json({
          error:
            "Your membership does not include Elle chat.",

          membershipRequired:
            true,

          leadCaptured:
            false,

          leadError:
            false
        });
    }

    const {
      messages,
      ageGroup
    } =
      req.body || {};

    if (
      !Array.isArray(
        messages
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            "Messages must be an array."
        });
    }

    const safeAgeGroup =
      ageGroup === "18+"
        ? "18+"
        : "13-17";

    if (
      !process.env
        .ANTHROPIC_API_KEY
    ) {
      console.error(
        "ANTHROPIC_API_KEY is missing."
      );

      return res
        .status(500)
        .json({
          error:
            "Elle is not configured correctly."
        });
    }

    /* =====================================================
       ACCESS FLAGS
       ===================================================== */

    const canUseLiveElle =
      safeAgeGroup === "18+" &&
      session.permissions
        ?.liveElle === true;

    const canUseVideo =
      canUseLiveElle &&
      session.permissions
        ?.liveVideo === true;

    /* =====================================================
       SYSTEM PROMPT
       ===================================================== */

    const systemPrompt = `
${SYSTEM_BASE}

${getAgeContext(
  safeAgeGroup
)}

${getAccessContext(
  session,
  safeAgeGroup
)}

${getLeadContext(
  session,
  safeAgeGroup
)}
`;

    /* =====================================================
       ANTHROPIC
       ===================================================== */

    const anthropicResponse =
      await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-api-key":
              process.env
                .ANTHROPIC_API_KEY,

            "anthropic-version":
              "2023-06-01"
          },

          body:
            JSON.stringify({
              model:
                "claude-haiku-4-5-20251001",

              max_tokens:
                500,

              system:
                systemPrompt,

              messages
            })
        }
      );

    const data =
      await anthropicResponse
        .json();

    if (
      !anthropicResponse.ok
    ) {
      console.error(
        "Anthropic API error:",
        anthropicResponse.status,
        data
      );

      return res
        .status(502)
        .json({
          error:
            "Elle could not respond right now.",

          leadCaptured:
            false,

          leadError:
            false
        });
    }

    /* =====================================================
       COMBINE TEXT
       ===================================================== */

    const textBlocks =
      Array.isArray(
        data.content
      )
        ? data.content.filter(
            (block) =>
              block &&
              block.type ===
                "text" &&
              typeof block.text ===
                "string"
          )
        : [];

    const fullText =
      textBlocks
        .map(
          (block) =>
            block.text
        )
        .join("\n");

    /* =====================================================
       METADATA
       ===================================================== */

    let dynamicChips =
      [];

    let leadProgress =
      0;

    let leadDetected =
      false;

    let leadCaptured =
      false;

    let leadError =
      false;

    let lead =
      null;

    let leadErrorMessage =
      null;

    /* =====================================================
       CHIPS
       ===================================================== */

    const chipMatch =
      fullText.match(
        /\[CHIPS\]([\s\S]*?)\[\/CHIPS\]/
      );

    if (chipMatch) {
      dynamicChips =
        cleanChips(
          chipMatch[1]
        );
    }

    if (!canUseLiveElle) {
      dynamicChips =
        dynamicChips.filter(
          (chip) => {
            const lower =
              chip.toLowerCase();

            return !(
              lower.includes(
                "live elle"
              ) ||
              lower.includes(
                "human support"
              ) ||
              lower.includes(
                "whatsapp call"
              ) ||
              lower.includes(
                "video call"
              )
            );
          }
        );
    }

    if (!canUseVideo) {
      dynamicChips =
        dynamicChips.filter(
          (chip) =>
            !chip
              .toLowerCase()
              .includes(
                "video"
              )
        );
    }

    /* =====================================================
       LEAD PROGRESS
       ===================================================== */

    const stepMatches = [
      ...fullText.matchAll(
        /\[LEAD_STEP\]([1-4])\[\/LEAD_STEP\]/g
      )
    ];

    if (
      canUseLiveElle &&
      stepMatches.length > 0
    ) {
      const latestStep =
        stepMatches[
          stepMatches.length - 1
        ];

      const parsedStep =
        Number(
          latestStep[1]
        );

      if (
        parsedStep >= 1 &&
        parsedStep <= 4
      ) {
        leadProgress =
          parsedStep;
      }
    }

    /* =====================================================
       LEAD EXTRACTION
       ===================================================== */

    const leadMatch =
      fullText.match(
        /\[LEAD\]([\s\S]*?)\[\/LEAD\]/
      );

    if (
      leadMatch &&
      canUseLiveElle
    ) {
      leadDetected =
        true;

      try {
        const parsedLead =
          JSON.parse(
            leadMatch[1]
              .trim()
          );

        const name =
          cleanString(
            parsedLead.name,
            100
          );

        const whatsapp =
          normalizeWhatsApp(
            parsedLead.whatsapp
          );

        const connectionType =
          normalizeConnectionType(
            parsedLead.connectionType
          );

        const service =
          normalizeService(
            parsedLead.service
          );

        if (!name) {
          throw new Error(
            "The Live Elle request is missing a name."
          );
        }

        if (!whatsapp) {
          throw new Error(
            "The WhatsApp number is missing or invalid."
          );
        }

        if (!connectionType) {
          throw new Error(
            "The connection type is invalid."
          );
        }

        if (
          connectionType ===
            "WhatsApp Video Call" &&
          !canUseVideo
        ) {
          throw new Error(
            "This membership does not include Live Elle video calls."
          );
        }

        if (!service) {
          throw new Error(
            "The Live Elle service is invalid."
          );
        }

        lead = {
          name,

          whatsapp,

          email:
            cleanString(
              session.email,
              200
            ),

          connectionType,

          service
        };

        if (!lead.email) {
          throw new Error(
            "The verified member email is missing from the session."
          );
        }

        await saveLeadToSheet(
          lead
        );

        leadCaptured =
          true;

        leadProgress =
          4;
      } catch (error) {
        console.error(
          "Live Elle request save failed:",
          error
        );

        leadError =
          true;

        leadErrorMessage =
          "I have your details, but I hit a snag sending them to Live Elle. Please try once more.";
      }
    }

    /* =====================================================
       ABSOLUTE LIVE ELLE PROTECTION
       ===================================================== */

    if (!canUseLiveElle) {
      leadDetected =
        false;

      leadCaptured =
        false;

      leadProgress =
        0;

      lead =
        null;

      leadError =
        false;

      leadErrorMessage =
        null;
    }

    /* =====================================================
       REMOVE HIDDEN TAGS
       ===================================================== */

    const cleanedText =
      fullText

        .replace(
          /\[CHIPS\][\s\S]*?\[\/CHIPS\]/g,
          ""
        )

        .replace(
          /\[LEAD_STEP\][1-4]\[\/LEAD_STEP\]/g,
          ""
        )

        .replace(
          /\[LEAD\][\s\S]*?\[\/LEAD\]/g,
          ""
        )

        .trim();

    /* =====================================================
       RESPONSE
       ===================================================== */

    return res
      .status(200)
      .json({
        content: [
          {
            type:
              "text",

            text:
              cleanedText
          }
        ],

        chips:
          dynamicChips,

        ageGroup:
          safeAgeGroup,

        membership: {
          signedIn:
            true,

          owner:
            session.owner ===
            true,

          tierName:
            session.tierName ||
            "",

          tierKey:
            session.tierKey ||
            "",

          permissions:
            session.permissions ||
            {}
        },

        leadProgress,

        leadDetected,

        leadCaptured,

        leadError,

        leadErrorMessage,

        lead
      });
  } catch (error) {
    console.error(
      "Elle server error:",
      error
    );

    return res
      .status(500)
      .json({
        error:
          "Elle hit a server hiccup.",

        leadCaptured:
          false,

        leadError:
          false
      });
  }
}
