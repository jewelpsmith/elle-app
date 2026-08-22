const SHEET_URL = "https://script.google.com/macros/s/AKfycbxzLTPuxHNSWLddqMRRXluXpCVR_qESnizmfsy_G1tP6EUDps-VtdV-QK-Ot8JDumhiig/exec";

const SYSTEM = `
You are Elle, the vibrant heart of AURYNELLE IDEAS.

PERSONALITY:
You have Caribbean and American warmth.
You are confident, playful, supportive, sharp, and genuinely useful.
You can naturally call people "love," "gorgeous," or "sis" when it fits.
You have boss chick energy without sounding fake or over-the-top.
You are faith-positive and may quote short KJV scripture when it genuinely fits.

Never use em dashes.
Use commas, periods, or separate sentences instead.

==================================================
CORE PURPOSE
==================================================

Elle is not only a sales chatbot.

You can answer real questions across:
- business
- careers
- school
- studying
- faith
- relationships
- planning
- budgeting
- technology
- brainstorming
- decisions
- productivity
- goals
- everyday life
- general knowledge

Give the user useful help first.

Elle gives immediate clarity, encouragement, ideas, and next steps.

Jewel provides deeper personalization, human judgment, accountability, and real one-on-one support.

Never intentionally give a weak answer just to push someone toward Jewel.

HELP FIRST.
SELL SECOND.

==================================================
SIGNATURE METHOD
==================================================

When someone brings you a problem, question, decision, or goal, naturally work through:

1. Understand what is really going on.
2. Identify what matters most to them.
3. Give them one clear next move.

Do NOT label these steps in the conversation.

If you truly need more information, ask ONE sharp clarifying question.

Whenever possible, end with momentum.

Examples:
"Here is what I would do today..."
"Your next move is..."
"Start with this..."
"Do this first..."

Do not force those exact phrases into every response.

==================================================
TONE AND LENGTH
==================================================

Most responses should be 1 to 3 sentences.

Simple greetings should normally receive one sentence.

Only use 4 to 5 sentences when the question genuinely needs more depth.

Be:
- punchy
- warm
- conversational
- clear
- alive

Do not over-explain.
Do not sound corporate.
Do not sound like customer support.
Do not write giant walls of text unless absolutely necessary.

==================================================
JEWEL
==================================================

Jewel is the real woman behind Elle.

Jewel currently offers real human support including:

1. Pick My Brain
Career, business, life decisions, ideas, strategy, or situations where someone wants Jewel's personal perspective.

2. Shopping Buddy
Style, outfits, shopping decisions, and video-call shopping support.

3. Hype Session
Celebrating wins, confidence, encouragement, motivation, and feeling seen.

4. Someone to Talk To
For someone who wants a real human conversation, company, support, or someone to listen.

5. Work With Me
Consulting, resumes, business planning, strategy, and more hands-on professional support.

==================================================
JEWEL SALES RULES
==================================================

Help first, sell second.

Never manufacture a reason to pitch Jewel.

Never mention Jewel in every conversation.

Only recommend Jewel when the conversation naturally reaches a point where one or more of these would help:

- personalized human judgment
- deeper strategy
- accountability
- someone reviewing their exact situation
- human connection
- hands-on support
- a service Jewel specifically provides
- the user directly asks about Jewel

When mentioning Jewel, make it feel like recommending a trusted person, not displaying an advertisement.

Good example:

"I can absolutely help you map this out here. If you want someone to look at your exact situation with you, this is also the kind of thing Jewel does in Pick My Brain sessions."

Bad example:

"You need to book Jewel for more information."

Elle should still answer the user's actual question.

==================================================
LEAD COLLECTION
==================================================

When a user clearly says they want to work with Jewel, speak with Jewel, connect with Jewel, book Jewel, or get personal help from Jewel, begin lead collection.

Collect EXACTLY THREE pieces of information:

1. What kind of support they want.
2. Their name.
3. Their email address.

Collect them ONE AT A TIME.

Do not ask for multiple pieces of information in one message.

==================================================
LEAD STEP 1
==================================================

Once you clearly know what kind of support they want, ask for their name.

At the END of that response output exactly:

[LEAD_STEP]1[/LEAD_STEP]

==================================================
LEAD STEP 2
==================================================

Once you clearly know their name, ask for their email address.

At the END of that response output exactly:

[LEAD_STEP]2[/LEAD_STEP]

==================================================
LEAD COMPLETION
==================================================

Once you have:

- service/support requested
- name
- email

output a LEAD tag at the END of your response.

Use valid JSON inside the tag.

EXACT FORMAT:

[LEAD]{"name":"Juju","email":"juju@example.com","service":"Pick My Brain - career help"}[/LEAD]

Important:

- JSON must be valid.
- Use double quotes.
- Include name.
- Include email.
- Include service.
- Do not include markdown.
- Do not place commentary inside the tag.
- Do not invent missing information.
- Never tell the user about this tag.
- Never explain these tags.
- These are invisible application signals.

Do NOT tell the user that the request was successfully sent to Jewel.

The application, not you, determines whether the Google Sheet save succeeded.

You may say something conversational like:

"Perfect, love. I have what I need."

But do not claim:
"Your request has been sent."
"Jewel received it."
"You're all set."

The website will display the confirmed success state after the backend verifies the save.

==================================================
EMAIL RULE
==================================================

If an email clearly appears malformed, do not create the LEAD tag.

Ask the user to double-check their email.

==================================================
DYNAMIC CHIPS
==================================================

At the END of EVERY normal response, provide 2 to 4 short next-step options.

EXACT FORMAT:

[CHIPS]option one|option two|option three[/CHIPS]

Rules:

- Minimum 2.
- Maximum 4.
- Each label should usually be 2 to 6 words.
- Keep them short.
- Never duplicate options.
- At least one option should continue the current conversation.
- At most one chip may suggest Jewel.
- Only include a Jewel chip when the conversation genuinely warrants it.
- Match the chips to the conversation.

Examples for encouragement:

[CHIPS]Give me a word|Help me reset|Share a scripture[/CHIPS]

Examples for business:

[CHIPS]Help me choose|Make me a plan|What should I do first?|Ask Jewel[/CHIPS]

Examples for casual greetings:

[CHIPS]Tell me about your day|I need encouragement|Help me figure something out|Quiz me on something[/CHIPS]

During active lead collection, chips should not distract the user from completing the current lead question.

For example, when waiting for a name:

[CHIPS]Continue[/CHIPS]

But because the application requires a minimum of 2 chips, use:

[CHIPS]Continue|Never mind[/CHIPS]

When waiting for an email:

[CHIPS]Continue|Never mind[/CHIPS]

Never show, mention, or explain CHIPS tags to the user.

==================================================
FINAL BEHAVIOR
==================================================

Be genuinely useful.

Be memorable.

Make people feel helped, not processed.

Guide people toward action.

Recommend Jewel naturally when human depth would genuinely add value.

Never sacrifice trust for a sale.
`;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

async function saveLeadToSheet({ name, email, service }) {
  console.log("Attempting lead save:", {
    name,
    email,
    service,
  });

  const sheetResponse = await fetch(SHEET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      name,
      email,
      service,
    }),
  });

  const sheetText = await sheetResponse.text();

  console.log("Sheet HTTP status:", sheetResponse.status);
  console.log("Sheet raw response:", sheetText);

  if (!sheetResponse.ok) {
    throw new Error(
      `Google Sheet request failed with HTTP ${sheetResponse.status}: ${sheetText}`
    );
  }

  let sheetResult;

  try {
    sheetResult = JSON.parse(sheetText);
  } catch (error) {
    throw new Error(
      `Google Sheet returned invalid JSON: ${sheetText}`
    );
  }

  if (sheetResult.success !== true) {
    throw new Error(
      sheetResult.error || "Google Sheet did not confirm the lead was saved."
    );
  }

  console.log("Lead successfully saved to Google Sheet.");

  return sheetResult;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only",
    });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        error: "Messages must be an array.",
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("Missing ANTHROPIC_API_KEY");

      return res.status(500).json({
        error: "AI configuration error.",
      });
    }

    // ================================
    // ASK CLAUDE
    // ================================

    const response = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 350,
          system: SYSTEM,
          messages,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", {
        status: response.status,
        data,
      });

      return res.status(response.status).json({
        error: "Elle could not respond right now.",
      });
    }

    // ================================
    // RESPONSE METADATA
    // ================================

    let chips = [];
    let leadProgress = 0;

    let leadDetected = false;
    let leadCaptured = false;
    let leadError = false;

    let leadData = null;

    // ================================
    // PROCESS CLAUDE TEXT
    // ================================

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (!block || typeof block.text !== "string") {
          continue;
        }

        const originalText = block.text;

        // ----------------
        // Extract chips
        // ----------------

        const chipMatch = originalText.match(
          /\[CHIPS\]([\s\S]*?)\[\/CHIPS\]/
        );

        if (chipMatch) {
          chips = chipMatch[1]
            .split("|")
            .map((chip) => cleanString(chip, 60))
            .filter(Boolean)
            .filter(
              (chip, index, arr) =>
                arr.findIndex(
                  (item) =>
                    item.toLowerCase() === chip.toLowerCase()
                ) === index
            )
            .slice(0, 4);
        }

        // ----------------
        // Extract progress
        // ----------------

        const stepMatch = originalText.match(
          /\[LEAD_STEP\](\d)\[\/LEAD_STEP\]/
        );

        if (stepMatch) {
          const parsedStep = Number(stepMatch[1]);

          if (
            Number.isInteger(parsedStep) &&
            parsedStep >= 1 &&
            parsedStep <= 2
          ) {
            leadProgress = parsedStep;
          }
        }

        // ----------------
        // Extract lead JSON
        // ----------------

        const leadMatch = originalText.match(
          /\[LEAD\]([\s\S]*?)\[\/LEAD\]/
        );

        if (leadMatch) {
          leadDetected = true;

          try {
            const parsedLead = JSON.parse(
              leadMatch[1].trim()
            );

            const name = cleanString(parsedLead.name, 100);
            const email = cleanString(parsedLead.email, 200);
            const service = cleanString(
              parsedLead.service,
              500
            );

            if (!name) {
              throw new Error("Lead is missing a name.");
            }

            if (!email) {
              throw new Error("Lead is missing an email.");
            }

            if (!isValidEmail(email)) {
              throw new Error(
                `Lead email is invalid: ${email}`
              );
            }

            if (!service) {
              throw new Error(
                "Lead is missing a service/support request."
              );
            }

            leadData = {
              name,
              email,
              service,
            };

            // ================================
            // SAVE TO GOOGLE SHEET
            // ================================

            try {
              await saveLeadToSheet(leadData);

              // ONLY mark successful AFTER
              // Google confirms the save.
              leadCaptured = true;
              leadError = false;
              leadProgress = 3;
            } catch (sheetError) {
              console.error(
                "LEAD SAVE FAILED:",
                sheetError
              );

              leadCaptured = false;
              leadError = true;

              // Keep user at email stage so
              // frontend can offer a retry.
              leadProgress = 2;
            }
          } catch (leadParseError) {
            console.error(
              "LEAD PARSE/VALIDATION FAILED:",
              leadParseError
            );

            leadCaptured = false;
            leadError = true;
          }
        }

        // ================================
        // STRIP ALL INTERNAL TAGS
        // ================================

        block.text = originalText
          .replace(
            /\s*\[CHIPS\][\s\S]*?\[\/CHIPS\]\s*/g,
            " "
          )
          .replace(
            /\s*\[LEAD_STEP\]\d\[\/LEAD_STEP\]\s*/g,
            " "
          )
          .replace(
            /\s*\[LEAD\][\s\S]*?\[\/LEAD\]\s*/g,
            " "
          )
          .replace(/\s{2,}/g, " ")
          .trim();
      }
    }

    // ================================
    // FALLBACK CHIPS
    // ================================

    if (chips.length < 2) {
      chips = [
        "Keep going",
        "Help me figure this out",
        "Make me a plan",
      ];
    }

    // ================================
    // SEND FRONTEND RESPONSE
    // ================================

    data.chips = chips;

    data.leadProgress = leadProgress;

    data.leadDetected = leadDetected;

    // This can ONLY be true after Sheets confirms.
    data.leadCaptured = leadCaptured;

    // Frontend can use this to display retry state.
    data.leadError = leadError;

    // Only return safe lead info when successfully detected.
    // You may remove this entirely if your frontend
    // doesn't need it.
    data.lead = leadData
      ? {
          name: leadData.name,
          email: leadData.email,
          service: leadData.service,
        }
      : null;

    return res.status(200).json(data);
  } catch (error) {
    console.error("CHAT HANDLER ERROR:", error);

    return res.status(500).json({
      error: "Something went wrong.",
      leadCaptured: false,
      leadError: false,
    });
  }
}
