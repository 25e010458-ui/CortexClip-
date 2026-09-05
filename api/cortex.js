import Replicate from "replicate";


const DAILY_CREDITS = 50;


/* =========================================================
   BASIC DAILY CREDIT STORE
   ========================================================= */

function getStore() {

  if (
    !globalThis.__CORTEXCLIP_STORE
  ) {

    globalThis.__CORTEXCLIP_STORE =
      new Map();

  }

  return globalThis.__CORTEXCLIP_STORE;

}


function getDateKey() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}


function getUserId(request) {

  /*
    DEMO identity.

    IMPORTANT:
    Production CortexClip should replace this
    with a real authenticated user ID.
  */

  return (
    request.headers[
      "x-cortex-user"
    ] ||
    request.headers[
      "x-forwarded-for"
    ] ||
    "demo-user"
  );

}


function getUsedCredits(
  userId
) {

  const store =
    getStore();

  const key =
    `${userId}:${getDateKey()}`;

  return (
    store.get(key) ||
    0
  );

}


function useCredit(
  userId
) {

  const store =
    getStore();

  const key =
    `${userId}:${getDateKey()}`;

  const used =
    getUsedCredits(
      userId
    );

  if (
    used >= DAILY_CREDITS
  ) {

    return false;

  }

  store.set(
    key,
    used + 1
  );

  return true;

}


/* =========================================================
   MASTER PROMPT
   ========================================================= */

function buildPrompt({
  videoPrompt,
  voicePrompt,
  style,
  requestedDuration,
  clipIndex,
  totalClips,
  previousClipUrl,
  correction
}) {


  const styleInstruction =
    style === "animated"

      ? `
STYLE LOCK:
The user selected ANIMATED.

The result MUST remain animated.
Do not suddenly switch to photorealistic,
live-action or realistic cinematography.

Maintain the same animation aesthetic,
character design language, proportions,
color treatment and visual style.
`

      : `
STYLE LOCK:
The user selected REALISTIC.

The result MUST remain realistic,
photorealistic and cinematic.

Do not switch to cartoon, anime,
illustration or visibly artificial
animated rendering.
`;


  const continuityInstruction = `

CHARACTER AND WORLD CONTINUITY:

This is clip ${clipIndex + 1}
of ${totalClips}.

The main characters, clothing,
hair, face, body proportions,
colors, accessories, age,
location and important objects must
remain visually consistent across
the entire story.

Do NOT redesign a character between clips.

If a character appeared previously,
continue that exact character.

Maintain:

- face
- hairstyle
- clothing
- colors
- accessories
- body proportions
- age
- environment
- important props
- lighting logic
- visual style
- camera language

The next clip must feel like it was
recorded from the same continuous
production.
`;


  const correctionInstruction =
    correction

      ? `

USER REVISION:

${correction}

Treat this revision as a high-priority
instruction.

Correct the requested problem while
preserving all previously established
character and world continuity.
`

      : "";


  const previousInstruction =
    previousClipUrl

      ? `

CONTINUITY REFERENCE:

A previous clip exists.

The new clip must continue naturally
from the previous scene.

Do not create a new character design,
costume or world unless explicitly
requested by the user.
`

      : "";


  return `

You are CortexClip, an advanced AI
video director.

The user wants a video approximately
${requestedDuration} seconds long.

The video is being generated as
connected scenes.

${styleInstruction}

ORIGINAL VIDEO PROMPT:

${videoPrompt}

VOICE AND SCRIPT PROMPT:

${voicePrompt}

${continuityInstruction}

${previousInstruction}

${correctionInstruction}

AUDIO / VIDEO SYNCHRONIZATION:

The voice and audio MUST match
the visual events.

Narration must follow the visual
timeline.

Never describe an event before it
happens.

Never describe something that is
not visible or logically happening.

Dialogue must belong to the correct
visible speaker.

The requested voice personality,
emotion, pacing and delivery must
be maintained.

If characters speak on screen,
their dialogue should correspond
to their visible actions and
mouth movement.

Ambient audio and sound effects
should support the scene rather
than contradict it.

TIMELINE:

This is only one segment of a
larger story.

Do not rush through the entire
story in this clip.

Generate the appropriate portion
of the story for this segment.

CONTINUITY IS EXTREMELY IMPORTANT.

Follow the user's original prompt
as the primary source of truth.

Do not invent major plot changes.

Do not remove important requested
characters.

Do not change the selected visual
style.

Create a coherent cinematic clip.
`.trim();

}


/* =========================================================
   MAIN API
   ========================================================= */

export default async function handler(
  request,
  response
) {

  const action =
    request.query?.action;


  /* =======================================================
     CREDITS
     ======================================================= */

  if (
    action === "credits"
  ) {

    const userId =
      getUserId(
        request
      );

    const used =
      getUsedCredits(
        userId
      );

    return response
      .status(200)
      .json({

        total:
          DAILY_CREDITS,

        used,

        remaining:
          Math.max(
            0,
            DAILY_CREDITS -
              used
          )

      });

  }


  /* =======================================================
     STATUS
     ======================================================= */

  if (
    action === "status"
  ) {

    const id =
      request.query?.id;


    if (!id) {

      return response
        .status(400)
        .json({

          error:
            "Prediction ID is required."

        });

    }


    if (
      !process.env
        .REPLICATE_API_TOKEN
    ) {

      return response
        .status(500)
        .json({

          error:
            "REPLICATE_API_TOKEN is missing."

        });

    }


    try {

      const replicate =
        new Replicate({

          auth:
            process.env
              .REPLICATE_API_TOKEN

        });


      const prediction =
        await replicate
          .predictions
          .get(id);


      let videoUrl =
        null;


      if (
        prediction.status ===
        "succeeded"
      ) {

        if (
          typeof prediction
            .output ===
          "string"
        ) {

          videoUrl =
            prediction.output;

        }

        else if (
          prediction.output &&
          typeof prediction
            .output
            .url ===
          "function"
        ) {

          videoUrl =
            prediction
              .output
              .url();

        }

      }


      return response
        .status(200)
        .json({

          id:
            prediction.id,

          status:
            prediction.status,

          videoUrl,

          error:
            prediction.error ||
            null

        });


    } catch (error) {

      console.error(
        error
      );

      return response
        .status(500)
        .json({

          error:
            "Unable to check prediction."

        });

    }

  }


  /* =======================================================
     GENERATE
     ======================================================= */

  if (
    action === "generate"
  ) {


    if (
      request.method !==
      "POST"
    ) {

      return response
        .status(405)
        .json({

          error:
            "Method not allowed."

        });

    }


    if (
      !process.env
        .REPLICATE_API_TOKEN
    ) {

      return response
        .status(500)
        .json({

          error:
            "REPLICATE_API_TOKEN is missing."

        });

    }


    const {

      videoPrompt,

      voicePrompt,

      style,

      requestedDuration,

      clipIndex,

      totalClips,

      previousClipUrl,

      correction

    } =
      request.body ||
      {};


    /* -----------------------------------------------------
       VALIDATION
       ----------------------------------------------------- */

    if (
      !videoPrompt ||
      !voicePrompt
    ) {

      return response
        .status(400)
        .json({

          error:
            "Both video and voice prompts are required."

        });

    }


    if (
      ![
        "animated",
        "realistic"
      ].includes(
        style
      )
    ) {

      return response
        .status(400)
        .json({

          error:
            "A valid visual style is required."

        });

    }


    const allowedDurations =
      [
        10,
        30,
        60,
        90,
        120
      ];


    if (
      !allowedDurations
        .includes(
          Number(
            requestedDuration
          )
        )
    ) {

      return response
        .status(400)
        .json({

          error:
            "Invalid video duration."

        });

    }


    /* -----------------------------------------------------
       CREDITS
       ----------------------------------------------------- */

    const userId =
      getUserId(
        request
      );


    const used =
      getUsedCredits(
        userId
      );


    if (
      used >=
      DAILY_CREDITS
    ) {

      return response
        .status(429)
        .json({

          code:
            "CREDITS_EXHAUSTED",

          error:
            "Oops! Your credits are over for today! Come back tomorrow for more credits.",

          remaining:
            0

        });

    }


    const reserved =
      useCredit(
        userId
      );


    if (!reserved) {

      return response
        .status(429)
        .json({

          code:
            "CREDITS_EXHAUSTED",

          error:
            "Oops! Your credits are over for today! Come back tomorrow for more credits.",

          remaining:
            0

        });

    }


    /* -----------------------------------------------------
       BUILD PROMPT
       ----------------------------------------------------- */

    const prompt =
      buildPrompt({

        videoPrompt:
          videoPrompt.trim(),

        voicePrompt:
          voicePrompt.trim(),

        style,

        requestedDuration:
          Number(
            requestedDuration
          ),

        clipIndex:
          Number(
            clipIndex
          ),

        totalClips:
          Number(
            totalClips
          ),

        previousClipUrl:
          previousClipUrl ||
          null,

        correction:
          correction ||
          null

      });


    /* -----------------------------------------------------
       CALL VEO
       ----------------------------------------------------- */

    try {

      const replicate =
        new Replicate({

          auth:
            process.env
              .REPLICATE_API_TOKEN

        });


      const prediction =
        await replicate
          .predictions
          .create({

            model:
              "google/veo-3.1-fast",

            input: {

              prompt,

              duration: 8,

              resolution:
                "720p",

              aspect_ratio:
                style ===
                "animated"
                  ? "16:9"
                  : "16:9",

              generate_audio:
                true

            }

          });


      return response
        .status(200)
        .json({

          id:
            prediction.id,

          status:
            prediction.status,

          remaining:
            Math.max(
              0,
              DAILY_CREDITS -
                getUsedCredits(
                  userId
                )
            )

        });


    } catch (error) {

      console.error(
        error
      );

      return response
        .status(500)
        .json({

          error:
            "CortexClip could not start this AI generation."

        });

    }

  }


  /* =======================================================
     UNKNOWN ACTION
     ======================================================= */

  return response
    .status(400)
    .json({

      error:
        "Unknown CortexClip action."

    });

}
