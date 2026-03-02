import { NextResponse } from "next/server";
import {
  buildCitizenResult,
  buildLocalResearch,
  initCitizenMeta,
  upsertCitizenDetail
} from "@/lib/citizenEngine";
import {
  extractCitizenCoreWithAi,
  generateCitizenPlanWithAi,
  hasUsableApiKey,
  researchCitizenPolicyWithAi
} from "@/lib/ai";
import { newId, nowIso, readDb, writeDb } from "@/lib/storage";
import { Message, Citation } from "@/lib/types";
import { cityOfficialCitations, extractCityFromText, knownCityDomains } from "@/lib/cityDirectory";
import { sanitizeCitations } from "@/lib/paValidation";
import { filterCitationsByGoal } from "@/lib/citationScope";

interface RequestBody {
  sessionId: string;
  message: string;
  apiKey?: string;
  provider?: string;
  model?: string;
}

function parseYesNoChoice(input: string): "yes" | "no" | null {
  const normalized = input.trim().toLowerCase();
  if (/^(yes|y|sure|ok|okay|please do|consent|agree)\b/.test(normalized)) {
    return "yes";
  }
  if (/^(no|n|nope|do not|don't|not now|skip)\b/.test(normalized)) {
    return "no";
  }
  return null;
}

function isLikelyGoalText(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  if (!normalized || normalized.length < 6) {
    return false;
  }
  if (/^(hi|hello|hey|thanks|thank you|good morning|good afternoon)$/.test(normalized)) {
    return false;
  }
  return true;
}

function mergeCitations(citations: Citation[], extraDomains: string[], goal: string): Citation[] {
  const sanitized = sanitizeCitations(citations, extraDomains);
  return filterCitationsByGoal(sanitized, goal);
}

const GENERIC_CITIZEN_QUESTIONS = [
  "Are you doing this for yourself, your household, or a business?",
  "When do you want to complete this process?",
  "Do you already have a case number, application number, or denial letter?",
  "Which documents do you already have ready (for example ID, proof of address, income or business records)?",
  "Do you want to apply online, in person, or by phone?"
];

const RESTAURANT_CITIZEN_QUESTIONS = [
  "Are you opening this as an individual owner or a registered company?",
  "What is your target opening month and year?",
  "Will you serve alcohol? (yes/no)",
  "Do you already have a business registration or EIN? (yes/no)",
  "Which documents do you already have (for example ID, lease, floor plan, food safety records)?"
];

const BENEFITS_CITIZEN_QUESTIONS = [
  "Is this request for you or for a family member?",
  "When do you want benefits to start?",
  "Do you already have a case/application number or prior decision letter? (yes/no)",
  "Which documents are already ready (for example ID, address proof, income/work records, bank details)?",
  "Do you want to submit online, by phone, or in person?"
];

const MIN_GUIDED_TURNS = 4;
const MAX_GUIDED_TURNS = 5;

function normalizeSentence(input: string): string {
  const compact = input.trim().replace(/\s+/g, " ");
  if (!compact) {
    return "";
  }
  return compact.endsWith("?") ? compact : `${compact}?`;
}

function questionBankForGoal(goal: string): string[] {
  const normalized = goal.toLowerCase();
  if (/(restaurant|food|cafe|diner|bar|kitchen|eatery)/.test(normalized)) {
    return RESTAURANT_CITIZEN_QUESTIONS;
  }
  if (/(benefit|pension|retire|snap|medicaid|unemployment|assistance|welfare)/.test(normalized)) {
    return BENEFITS_CITIZEN_QUESTIONS;
  }
  return GENERIC_CITIZEN_QUESTIONS;
}

function getGuidedQuestion(goal: string, followUpIndex: number): string {
  const bank = questionBankForGoal(goal);
  const idx = Math.min(Math.max(followUpIndex, 0), bank.length - 1);
  return normalizeSentence(bank[idx] || GENERIC_CITIZEN_QUESTIONS[0]);
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as RequestBody;
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();

  if (!sessionId || !message) {
    return NextResponse.json({ error: "sessionId and message are required" }, { status: 400 });
  }

  const db = await readDb();
  const session = db.sessions.find((item) => item.id === sessionId && item.mode === "citizen");

  if (!session) {
    return NextResponse.json({ error: "citizen session not found" }, { status: 404 });
  }

  const userMsg: Message = {
    role: "user",
    content: message,
    timestamp: nowIso()
  };

  session.transcript.push(userMsg);
  session.updatedAt = nowIso();

  if (!session.citizenMeta) {
    session.citizenMeta = initCitizenMeta(message);
  }

  let meta = session.citizenMeta;
  const transcriptText = session.transcript.map((item) => item.content).join("\n");

  if (meta.pendingField === "goal" && !meta.details.goal) {
    meta = upsertCitizenDetail(meta, "goal", message);
    meta.pendingField = undefined;
  } else if (meta.pendingField === "city" && !meta.details.city) {
    meta = upsertCitizenDetail(meta, "city", message);
    meta.pendingField = undefined;
  } else if (meta.pendingField === "ai_followup") {
    const questionBank =
      meta.followUpQuestions.length > 0
        ? meta.followUpQuestions
        : questionBankForGoal(meta.details.goal ?? "Pennsylvania service request");
    const currentIndex = Math.min(meta.followUpIndex, Math.max(questionBank.length - 1, 0));
    const lastQuestion = questionBank[currentIndex] || "Additional practical detail";
    meta.followUpAnswers = {
      ...meta.followUpAnswers,
      [lastQuestion]: message
    };
    meta.followUpIndex = currentIndex + 1;
    meta.followUpQuestions = questionBank;
    meta.pendingField = undefined;
  }

  let assistantMessage = "";
  let stage = "refine";

  const runLiveSearch = async (): Promise<{
    ok: true;
    mode: "web_search" | "api_completion" | "local_fallback";
    citations: Citation[];
    readyForFinalCheck: boolean;
    nextQuestion: string;
    policySummary: string;
    intentTitle: string;
    missingInfoChecklist: string[];
    questionBank: string[];
    warningMessage?: string;
  }> => {
    const cityDomains = knownCityDomains(meta.details.city);
    const localResearch = buildLocalResearch(meta, transcriptText);
    const goalForScope = meta.details.goal ?? "Pennsylvania service request";
    const localCitations = mergeCitations(
      [...localResearch.citations, ...cityOfficialCitations(meta.details.city ?? "")],
      cityDomains,
      goalForScope
    );

    const fallbackState = (warningMessage: string) => ({
      ok: true as const,
      mode: "local_fallback" as const,
      citations: localCitations,
      readyForFinalCheck: meta.followUpIndex >= localResearch.followUpQuestions.length,
      nextQuestion:
        localResearch.followUpQuestions[meta.followUpIndex] ||
        localResearch.followUpQuestions[localResearch.followUpQuestions.length - 1] ||
        "What additional detail should be considered before finalizing your request?",
      policySummary: localResearch.policySummary,
      intentTitle: localResearch.intentTitle,
      missingInfoChecklist: localResearch.followUpQuestions.slice(meta.followUpIndex),
      questionBank: localResearch.followUpQuestions,
      warningMessage
    });

    if (!hasUsableApiKey(body.apiKey)) {
      return fallbackState(
        "No valid API key was detected for this turn. I used the local Pennsylvania official index so you can continue."
      );
    }

    const liveResearch = await researchCitizenPolicyWithAi(
      body.apiKey,
      meta.details.goal ?? "Pennsylvania service request",
      meta.details.city ?? "Pennsylvania",
      cityDomains,
      transcriptText,
      meta.followUpAnswers,
      {
        provider: body.provider,
        model: body.model
      }
    );

    if (!liveResearch) {
      return fallbackState(
        "Live policy search failed for this turn. I switched to the local Pennsylvania official index so your conversation can continue."
      );
    }

    const mergedCitations = mergeCitations(
      [
        ...liveResearch.citations,
        ...cityOfficialCitations(meta.details.city ?? ""),
        ...localResearch.citations
      ],
      cityDomains,
      goalForScope
    );

    if (mergedCitations.length === 0) {
      return fallbackState(
        "Live search returned no valid Pennsylvania official links for this turn. I switched to the local Pennsylvania official index."
      );
    }

    return {
      ok: true,
      mode: liveResearch.liveSearchUsed ? "web_search" : "api_completion",
      citations: mergedCitations,
      readyForFinalCheck: Boolean(liveResearch.readyForFinalCheck),
      nextQuestion:
        liveResearch.nextQuestion ||
        liveResearch.followUpQuestions[0] ||
        "What additional detail should be considered before finalizing your request?",
      policySummary: liveResearch.policySummary || localResearch.policySummary,
      intentTitle: liveResearch.intentTitle || localResearch.intentTitle,
      missingInfoChecklist: liveResearch.missingInfoChecklist || [],
      questionBank: [liveResearch.nextQuestion || liveResearch.followUpQuestions[0] || ""].filter(
        Boolean
      ),
      warningMessage: liveResearch.liveSearchUsed
        ? undefined
        : liveResearch.liveSearchError
          ? `Live web search returned an error (${liveResearch.liveSearchError}). I used direct AI reasoning with your key for this turn.`
          : "Live web search tool was unavailable. I used direct AI reasoning with your key for this turn."
    };
  };

  const finalizePackage = async (): Promise<{ ok: boolean; errorMessage?: string }> => {
    const searchState = await runLiveSearch();
    meta.liveSearchUsed = searchState.mode === "web_search" ? true : meta.liveSearchUsed;
    meta.intentTitle = searchState.intentTitle || meta.intentTitle;
    meta.policySummary = searchState.policySummary || meta.policySummary;
    meta.policyCitations = searchState.citations;

    const packageOutput = await generateCitizenPlanWithAi(
      body.apiKey,
      meta.details.goal ?? "Pennsylvania service request",
      meta.details.city ?? "Pennsylvania",
      meta.intentTitle,
      meta.policySummary,
      meta.followUpAnswers,
      meta.finalSupplement,
      meta.policyCitations,
      transcriptText,
      {
        provider: body.provider,
        model: body.model
      }
    );

    const result = packageOutput
      ? buildCitizenResult(
          meta,
          packageOutput.summary,
          packageOutput.actionPlan,
          meta.policyCitations
        )
      : buildCitizenResult(meta, undefined, undefined, meta.policyCitations);

    meta.result = result;
    meta.stage = "complete";
    meta.pendingField = undefined;
    stage = "result";
    return { ok: true };
  };

  if (meta.stage === "final_check") {
    meta.finalSupplement = message;
    meta.stage = "identity_check";
    meta.pendingField = undefined;
    assistantMessage =
      "Before I finalize your package, do you want to add your name or nickname for government staff to see? (yes/no)";
    stage = "identity_check";
  } else if (meta.stage === "identity_check") {
    const choice = parseYesNoChoice(message);
    if (!choice) {
      assistantMessage =
        "Please answer yes or no: do you want to share your name or nickname with government staff?";
      stage = "identity_check";
    } else if (choice === "yes") {
      meta.stage = "identity_input";
      meta.pendingField = "citizen_display_name";
      assistantMessage = "Please enter the name or nickname you want staff to see.";
      stage = "identity_input";
    } else {
      const finalized = await finalizePackage();
      if (!finalized.ok) {
        meta.stage = "research";
        assistantMessage = finalized.errorMessage ?? "Finalization failed. Please retry.";
        stage = "research";
      } else {
        assistantMessage = [
          "Done. Your full package is ready below (ordered steps, required materials, Pennsylvania state + city official links, and flowchart).",
          meta.liveSearchUsed
            ? "If you want government follow-up, choose 'Share with staff'."
            : "Live web search was not available on the final turn, so this package used AI-key/local indexed fallback."
        ].join(" ");
      }
    }
  } else if (meta.stage === "identity_input") {
    meta.citizenDisplayName = message.slice(0, 80);
    const finalized = await finalizePackage();
    if (!finalized.ok) {
      meta.stage = "research";
      assistantMessage =
        finalized.errorMessage ??
        "Finalization failed after name capture. Please retry after updating API access.";
      stage = "research";
    } else {
      assistantMessage =
        `Done. Your package is ready below and your preferred name "${meta.citizenDisplayName || "Citizen"}" will be shown to staff if you share this case.`;
    }
  } else {
    const extracted = await extractCitizenCoreWithAi(body.apiKey, message, transcriptText, {
      provider: body.provider,
      model: body.model
    });

    if (!meta.details.goal && extracted?.goal) {
      meta = upsertCitizenDetail(meta, "goal", extracted.goal);
    }
    if (!meta.details.goal && isLikelyGoalText(message)) {
      meta = upsertCitizenDetail(meta, "goal", message);
    }

    if (!meta.details.city && extracted?.city) {
      meta = upsertCitizenDetail(meta, "city", extracted.city);
    }
    if (!meta.details.city) {
      const inferredCity = extractCityFromText(message) || extractCityFromText(transcriptText);
      if (inferredCity) {
        meta = upsertCitizenDetail(meta, "city", inferredCity);
      }
    }

    if (!meta.details.goal) {
      meta.stage = "intake";
      meta.pendingField = "goal";
      assistantMessage =
        "To start, what do you need to do with Pennsylvania government services (for example, claim retirement benefits, apply for aid, or open a business)?";
      stage = "intake";
    } else if (!meta.details.city) {
      meta.stage = "intake";
      meta.pendingField = "city";
      assistantMessage =
        "Please provide the Pennsylvania city, township, borough, or county for this request.";
      stage = "intake";
    } else {
      const searchState = await runLiveSearch();
      meta.liveSearchUsed = searchState.mode === "web_search" ? true : meta.liveSearchUsed;
      meta.intentTitle = searchState.intentTitle || meta.intentTitle;
      meta.policySummary = searchState.policySummary || meta.policySummary;
      meta.policyCitations = searchState.citations;

      const guidedTurns = meta.followUpIndex;
      const shouldFinalize =
        guidedTurns >= MAX_GUIDED_TURNS ||
        (Boolean(searchState.readyForFinalCheck) && guidedTurns >= MIN_GUIDED_TURNS);
      const guidedQuestionBank = questionBankForGoal(meta.details.goal ?? "Pennsylvania service request");
      const nextQuestion = getGuidedQuestion(
        meta.details.goal ?? "Pennsylvania service request",
        meta.followUpIndex
      );
      const modePrefix =
        searchState.mode === "web_search"
          ? "I re-ran live policy search using your latest input."
          : searchState.mode === "api_completion"
            ? searchState.warningMessage ||
              "Live web search was unavailable this turn. I used direct AI reasoning with your key."
          : searchState.warningMessage ||
            "Live search could not complete this turn. I used the local Pennsylvania official index so we can continue.";

      if (shouldFinalize) {
        meta.stage = "final_check";
        meta.pendingField = undefined;
        assistantMessage = [
          modePrefix,
          "I now have enough details to prepare your final package.",
          "Before I finalize, is there anything else you want to add?"
        ].join(" ");
        stage = "final_check";
      } else {
        meta.stage = "refine";
        meta.pendingField = "ai_followup";
        meta.followUpQuestions = guidedQuestionBank;
        if (meta.followUpIndex > meta.followUpQuestions.length) {
          meta.followUpIndex = meta.followUpQuestions.length;
        }
        assistantMessage = [
          modePrefix,
          "I need one more practical detail from you to make the final steps accurate.",
          `Next question: ${nextQuestion}`
        ]
          .filter(Boolean)
          .join(" ");
        stage = "refine";
      }
    }
  }

  const assistantMsg: Message = {
    role: "assistant",
    content: assistantMessage,
    timestamp: nowIso()
  };

  session.transcript.push(assistantMsg);
  session.citizenMeta = meta;

  db.auditEvents.push({
    id: newId("audit"),
    eventType: stage === "result" ? "citizen_result" : "citizen_message",
    actorId: session.actorId,
    caseId: null,
    sessionId: session.id,
    timestamp: nowIso(),
    metadata: {
      stage: meta.stage,
      intentCategory: meta.intentCategory,
      city: meta.details.city ?? null,
      liveSearchUsed: meta.liveSearchUsed,
      provider: body.provider ?? "openai",
      model: body.model ?? null
    }
  });

  await writeDb(db);

  return NextResponse.json({
    assistantMessage,
    stage,
    result: meta.result ?? null,
    intentTitle: meta.intentTitle
  });
}
