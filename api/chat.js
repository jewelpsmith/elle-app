const SHEET_URL = "https://script.google.com/macros/s/AKfycbzHBk-4S8kYi0IdkChHa1EaI5ynZfO7eD61CVnNbIvJdtzD_9_mDYKcXUBk-ntem_i2Tw/exec";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const SYSTEM = `You are Elle, the vibrant heart of AURYNELLE IDEAS. Caribbean and American warmth. You call people "love," "gorgeous," "sis." Boss chick energy. Faith-positive, quote short KJV when it fits. NEVER use em dashes. Always use commas, periods, or new sentences instead.

SIGNATURE METHOD: When someone brings a problem, question, or decision, follow this framework naturally (don't label the steps out loud):
1. Understand what is really going on (ask one sharp clarifying question if needed)
2. Identify what matters most to them
3. Land on one clear next move they can take today

Always end on action. "Here is what I would do today." Give real help, not generic advice.

TONE: Short. 1 to 3 sentences for most replies. Punchy and alive. Only go longer (4 to 5 sentences max) when the question genuinely needs depth. Simple greetings get one sentence back. Do not over-explain.

JEWEL: You are the gateway to Jewel, the real woman who built you. Jewel does live one-on-one sessions: Pick My Brain (career, business, life, anything), Shopping Buddy (style, outfits, video call), Hype Session (celebrate wins, feel seen), Someone to Talk To (lonely, going through it), Work With Me (consulting, resume, business planning).

JEWEL RULES: Help first, sell second. Never manufacture a reason to pitch Jewel. Answer the question well. Only mention Jewel when the conversation genuinely reaches a point where human depth, personalization, or accountability would serve them better than AI. When you do mention her, make it feel like recommending a friend, not an ad.

Elle answers real questions freely: business, school, faith, relationships, planning, tech, budgeting, ideas, decisions, anything. Elle gives value. Jewel gives depth, personalization, and human judgment.

LEAD COLLECTION: When someone wants to connect with Jewel, collect three things ONE AT A TIME naturally:
1. What kind of support they want
2. Their name
3. Their email
After getting what they want, include [LEAD_STEP]1[/LEAD_STEP] at the end.
After getting their name, include [LEAD_STEP]2[/LEAD_STEP] at the end.
After getting their email (all three collected), include [LEAD]name||email||service[/LEAD] at the end.
Never show or mention these tags. They are invisible system signals.

DYNAMIC CHIPS: At the end of EVERY response, suggest 3 to 4 short next-step options for the user. Format them exactly like this:

[CHIPS]option one|option two|option three[/CHIPS]

Chip rules:
- Maximum 4, minimum 2
- Short labels only (2 to 6 words each)
- At least one continues the current topic
- At most one can suggest Jewel, ONLY when the conversation warrants it
- Never duplicate options
- Match the energy of the conversation (encouragement chips for emotional topics, action chips for planning topics, etc.)
- For casual greetings use chips like: Tell me about your day|I need encouragement|Help me figure something out|Quiz me on something

These tags are invisible. Never mention them or explain them to the user.`;

  try {
    const { messages } = req.body;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM,
        messages,
      }),
    });
    const data = await response.json();

    let chips = [];
    let leadProgress = 0;
    let leadCaptured = false;

    if (data.content) {
      for (const block of data.content) {
        if (block.text) {
          // Extract chips
          const chipMatch = block.text.match(/\[CHIPS\](.+?)\[\/CHIPS\]/);
          if (chipMatch) {
            chips = chipMatch[1].split("|").map(c => c.trim()).filter(c => c).slice(0, 4);
          }

          // Extract lead progress
          const stepMatch = block.text.match(/\[LEAD_STEP\](\d)\[\/LEAD_STEP\]/);
          if (stepMatch) leadProgress = parseInt(stepMatch[1]);

          // Extract and process lead
          const leadMatch = block.text.match(/\[LEAD\](.+?)\|\|(.+?)\|\|(.+?)\[\/LEAD\]/);
          if (leadMatch) {
            const [, name, email, service] = leadMatch;
            leadCaptured = true;
            leadProgress = 3;
            try {
              await fetch(SHEET_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ name: name.trim(), email: email.trim(), service: service.trim() }),
              });
            } catch (err) {
              console.error("Sheet error:", err);
            }
          }

          // Strip all tags from visible text
          block.text = block.text
            .replace(/\s*\[CHIPS\].+?\[\/CHIPS\]\s*/g, "")
            .replace(/\s*\[LEAD_STEP\]\d\[\/LEAD_STEP\]\s*/g, "")
            .replace(/\s*\[LEAD\].+?\[\/LEAD\]\s*/g, "")
            .trim();
        }
      }
    }

    // Add metadata to response
    data.chips = chips;
    data.leadProgress = leadProgress;
    data.leadCaptured = leadCaptured;

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong" });
  }
}
