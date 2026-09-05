import React, {
  useEffect,
  useRef,
  useState
} from "react";

import {
  createRoot
} from "react-dom/client";


/* =========================================================
   CORTEXCLIP
   ========================================================= */

const DAILY_CREDITS = 50;

const DURATIONS = [
  {
    label: "10 secs",
    seconds: 10
  },
  {
    label: "30 secs",
    seconds: 30
  },
  {
    label: "1 min",
    seconds: 60
  },
  {
    label: "1 min 30 secs",
    seconds: 90
  },
  {
    label: "2 mins",
    seconds: 120
  }
];

const CLIP_LENGTH = 8;


/* =========================================================
   APP
   ========================================================= */

function App() {

  const [screen, setScreen] =
    useState("welcome");

  const [profile, setProfile] =
    useState({
      name: "",
      dob: "",
      purpose: ""
    });

  const [style, setStyle] =
    useState(null);

  const [duration, setDuration] =
    useState(null);

  const [videoPrompt, setVideoPrompt] =
    useState("");

  const [voicePrompt, setVoicePrompt] =
    useState("");

  const [credits, setCredits] =
    useState(DAILY_CREDITS);

  const [clips, setClips] =
    useState([]);

  const [currentClip, setCurrentClip] =
    useState(0);

  const [generationMessage, setGenerationMessage] =
    useState("");

  const [generationProgress, setGenerationProgress] =
    useState(0);

  const [correctionPrompt, setCorrectionPrompt] =
    useState("");

  const [showNote, setShowNote] =
    useState(false);

  const [showApproval, setShowApproval] =
    useState(false);

  const [finalVideo, setFinalVideo] =
    useState("");

  const [error, setError] =
    useState("");

  const [generating, setGenerating] =
    useState(false);


  /* -------------------------------------------------------
     LOAD SAVED PROFILE
     ------------------------------------------------------- */

  useEffect(() => {

    const saved =
      localStorage.getItem(
        "cortexclip_profile"
      );

    if (saved) {

      try {

        setProfile(
          JSON.parse(saved)
        );

        setScreen("dashboard");

      } catch {

        localStorage.removeItem(
          "cortexclip_profile"
        );

      }

    }

    loadCredits();

  }, []);


  /* -------------------------------------------------------
     CREDITS
     ------------------------------------------------------- */

  async function loadCredits() {

    try {

      const response =
        await fetch(
          "/api/cortex?action=credits"
        );

      const data =
        await response.json();

      if (
        typeof data.remaining ===
        "number"
      ) {

        setCredits(
          data.remaining
        );

      }

    } catch {

      // UI remains usable if backend
      // is temporarily unavailable.

    }

  }


  /* -------------------------------------------------------
     SAVE PROFILE
     ------------------------------------------------------- */

  function finishOnboarding() {

    localStorage.setItem(
      "cortexclip_profile",
      JSON.stringify(profile)
    );

    setScreen("dashboard");

  }


  /* -------------------------------------------------------
     START VIDEO FLOW
     ------------------------------------------------------- */

  function startCreate() {

    if (credits <= 0) {

      setError(
        "Oops! Your credits are over for today! Come back tomorrow for more credits."
      );

      return;

    }

    setScreen("style");

  }


  /* -------------------------------------------------------
     SELECT STYLE
     ------------------------------------------------------- */

  function chooseStyle(value) {

    setStyle(value);

    setScreen("duration");

  }


  /* -------------------------------------------------------
     SELECT DURATION
     ------------------------------------------------------- */

  function chooseDuration(seconds) {

    setDuration(seconds);

    setScreen("prompts");

  }


  /* -------------------------------------------------------
     NUMBER OF CLIPS
     ------------------------------------------------------- */

  function calculateClipCount(
    requestedSeconds
  ) {

    return Math.ceil(
      requestedSeconds /
      CLIP_LENGTH
    );

  }


  /* -------------------------------------------------------
     START GENERATION
     ------------------------------------------------------- */

  function beginGeneration() {

    if (!videoPrompt.trim()) {

      setError(
        "Please describe the video."
      );

      return;

    }

    if (!voicePrompt.trim()) {

      setError(
        "Please describe the voice and script."
      );

      return;

    }

    if (credits <= 0) {

      setError(
        "Oops! Your credits are over for today! Come back tomorrow for more credits."
      );

      return;

    }

    setError("");

    setShowNote(true);

  }


  /* -------------------------------------------------------
     ACTUALLY GENERATE
     ------------------------------------------------------- */

  async function generateAllClips() {

    setShowNote(false);

    setGenerating(true);

    setClips([]);

    setCurrentClip(0);

    setGenerationProgress(0);

    const numberOfClips =
      calculateClipCount(
        duration
      );

    const newClips = [];


    /*
      The clips are deliberately generated
      ONE AT A TIME.

      This is important for continuity and
      avoids sending many simultaneous jobs.
    */

    for (
      let i = 0;
      i < numberOfClips;
      i++
    ) {

      setCurrentClip(i);

      setGenerationMessage(
        `Creating clip ${i + 1} of ${numberOfClips}...`
      );

      try {

        const previousClip =
          newClips[i - 1];

        const prediction =
          await createClip({
            index: i,
            total: numberOfClips,
            previousClip,
            correction: correctionPrompt
          });

        const video =
          await waitForPrediction(
            prediction.id
          );

        newClips.push({
          index: i,
          url: video,
          status: "ready"
        });

        setClips([
          ...newClips
        ]);

        setGenerationProgress(
          Math.round(
            ((i + 1) /
              numberOfClips) *
              100
          )
        );

      } catch (err) {

        setGenerating(false);

        setError(
          err.message ||
          "A clip could not be generated."
        );

        return;

      }

    }

    setGenerating(false);

    setGenerationMessage(
      "All clips have been created."
    );

    setShowApproval(true);

  }


  /* -------------------------------------------------------
     CREATE SINGLE CLIP
     ------------------------------------------------------- */

  async function createClip({
    index,
    total,
    previousClip,
    correction
  }) {

    const remainingCredits =
      credits;

    if (remainingCredits <= 0) {

      throw new Error(
        "Oops! Your credits are over for today! Come back tomorrow for more credits."
      );

    }


    const response =
      await fetch(
        "/api/cortex?action=generate",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            videoPrompt,

            voicePrompt,

            style,

            requestedDuration:
              duration,

            clipIndex:
              index,

            totalClips:
              total,

            previousClipUrl:
              previousClip?.url ||
              null,

            correction:
              correction || null

          })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      if (
        data.code ===
        "CREDITS_EXHAUSTED"
      ) {

        setCredits(0);

      }

      throw new Error(
        data.error ||
        "Unable to create the clip."
      );

    }


    if (
      typeof data.remaining ===
      "number"
    ) {

      setCredits(
        data.remaining
      );

    }


    return data;

  }


  /* -------------------------------------------------------
     WAIT FOR AI
     ------------------------------------------------------- */

  async function waitForPrediction(
    id
  ) {

    let attempts = 0;

    while (attempts < 180) {

      attempts++;

      const response =
        await fetch(
          `/api/cortex?action=status&id=${encodeURIComponent(
            id
          )}`
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          "Unable to check video status."
        );

      }


      if (
        data.status ===
        "succeeded"
      ) {

        if (!data.videoUrl) {

          throw new Error(
            "The AI finished but did not return a video."
          );

        }

        return data.videoUrl;

      }


      if (
        data.status === "failed" ||
        data.status === "canceled"
      ) {

        throw new Error(
          data.error ||
          "The AI failed to create this clip."
        );

      }


      await sleep(2000);

    }


    throw new Error(
      "This clip is taking too long. Please try again."
    );

  }


  function sleep(ms) {

    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );

  }


  /* -------------------------------------------------------
     USER REJECTED CLIPS
     ------------------------------------------------------- */

  function rejectClips() {

    setShowApproval(false);

    setCorrectionPrompt("");

    setScreen("correction");

  }


  /* -------------------------------------------------------
     APPLY CORRECTION
     ------------------------------------------------------- */

  function applyCorrection() {

    if (
      !correctionPrompt.trim()
    ) {

      setError(
        "Please describe what you want changed."
      );

      return;

    }

    setError("");

    /*
      Start the complete sequence again.

      The correction becomes part of every
      subsequent generation instruction.
    */

    generateAllClips();

  }


  /* -------------------------------------------------------
     APPROVE
     ------------------------------------------------------- */

  function approveClips() {

    setShowApproval(false);

    /*
      In this MVP, the browser creates a playlist
      from the generated clips.

      A production deployment should perform
      server-side FFmpeg stitching for a single
      downloadable MP4.
    */

    if (clips.length === 0) {

      setError(
        "There are no clips to combine."
      );

      return;

    }

    setFinalVideo(
      clips[0].url
    );

    setScreen("result");

  }


  /* -------------------------------------------------------
     DOWNLOAD
     ------------------------------------------------------- */

  async function downloadVideo() {

    if (!finalVideo) return;

    try {

      const response =
        await fetch(
          finalVideo
        );

      const blob =
        await response.blob();

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;

      link.download =
        "cortexclip-video.mp4";

      document.body.appendChild(
        link
      );

      link.click();

      link.remove();

      URL.revokeObjectURL(
        url
      );

    } catch {

      /*
        Some browsers prevent direct
        cross-origin downloads.
      */

      window.open(
        finalVideo,
        "_blank"
      );

    }

  }


  /* =======================================================
     SCREEN ROUTING
     ======================================================= */

  return (

    <div className="app">

      {screen === "welcome" && (

        <Welcome
          onStart={() =>
            setScreen("onboarding")
          }
        />

      )}


      {screen === "onboarding" && (

        <Onboarding
          profile={profile}
          setProfile={setProfile}
          onComplete={
            finishOnboarding
          }
        />

      )}


      {screen === "dashboard" && (

        <Dashboard
          profile={profile}
          credits={credits}
          onCreate={startCreate}
        />

      )}


      {screen === "style" && (

        <StyleScreen
          onSelect={chooseStyle}
        />

      )}


      {screen === "duration" && (

        <DurationScreen
          onSelect={chooseDuration}
        />

      )}


      {screen === "prompts" && (

        <PromptScreen
          videoPrompt={videoPrompt}
          setVideoPrompt={
            setVideoPrompt
          }
          voicePrompt={voicePrompt}
          setVoicePrompt={
            setVoicePrompt
          }
          style={style}
          duration={duration}
          credits={credits}
          onGenerate={
            beginGeneration
          }
          onBack={() =>
            setScreen("duration")
          }
        />

      )}


      {screen === "correction" && (

        <CorrectionScreen
          correction={
            correctionPrompt
          }
          setCorrection={
            setCorrectionPrompt
          }
          clips={clips}
          onSubmit={
            applyCorrection
          }
          onBack={() =>
            setScreen("prompts")
          }
        />

      )}


      {screen === "result" && (

        <ResultScreen
          videoUrl={finalVideo}
          clips={clips}
          videoRef={videoRef}
          onDownload={
            downloadVideo
          }
          onBack={() =>
            setScreen("dashboard")
          }
        />

      )}


      {generating && (

        <GenerationOverlay
          message={
            generationMessage
          }
          progress={
            generationProgress
          }
          clip={
            currentClip + 1
          }
          total={
            calculateClipCount(
              duration || 10
            )
          }
        />

      )}


      {showNote && (

        <NoteModal
          onContinue={
            generateAllClips
          }
        />

      )}


      {showApproval && (

        <ApprovalModal
          clips={clips}
          onYes={
            approveClips
          }
          onNo={
            rejectClips
          }
        />

      )}


      {error && (

        <ErrorModal
          message={error}
          onClose={() =>
            setError("")
          }
        />

      )}

    </div>

  );
}


/* =========================================================
   WELCOME
   ========================================================= */

function Welcome({
  onStart
}) {

  return (

    <main className="center-screen">

      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <div className="hero">

        <div className="logo">
          C
        </div>

        <div className="tag">
          AI VIDEO STUDIO
        </div>

        <h1>
          Cortex<span>Clip</span>
        </h1>

        <p>
          Your idea.
          <br />
          Your story.
          <br />
          Your video.
        </p>

        <button
          className="primary"
          onClick={onStart}
        >
          Enter CortexClip →
        </button>

        <small>
          50 free generations every day
        </small>

      </div>

    </main>

  );

}


/* =========================================================
   ONBOARDING
   ========================================================= */

function Onboarding({
  profile,
  setProfile,
  onComplete
}) {

  const [step, setStep] =
    useState(0);

  const questions = [

    {
      key: "name",
      title:
        "What should we call you?",
      subtitle:
        "Let's personalize your CortexClip experience.",
      type: "text",
      placeholder:
        "Your name"
    },

    {
      key: "dob",
      title:
        "When were you born?",
      subtitle:
        "This helps us understand your age group.",
      type: "date",
      placeholder:
        ""
    },

    {
      key: "purpose",
      title:
        "What will you use CortexClip for?",
      subtitle:
        "Tell us what you want to create.",
      type: "textarea",
      placeholder:
        "Stories, school projects, experiments, presentations..."
    }

  ];

  const question =
    questions[step];


  function next() {

    if (
      !profile[
        question.key
      ]?.trim()
    ) {

      return;

    }


    if (
      step <
      questions.length - 1
    ) {

      setStep(
        step + 1
      );

    } else {

      onComplete();

    }

  }


  return (

    <main className="center-screen">

      <div className="form-card">

        <div className="progress">
          <div
            style={{
              width:
                `${
                  ((step + 1) /
                    questions.length) *
                  100
                }%`
            }}
          />
        </div>

        <span className="tag">
          STEP {step + 1}
        </span>

        <h2>
          {question.title}
        </h2>

        <p>
          {question.subtitle}
        </p>

        {question.type ===
        "textarea" ? (

          <textarea
            autoFocus
            value={
              profile[
                question.key
              ]
            }
            placeholder={
              question.placeholder
            }
            onChange={e =>
              setProfile({
                ...profile,
                [question.key]:
                  e.target.value
              })
            }
          />

        ) : (

          <input
            autoFocus
            type={
              question.type
            }
            value={
              profile[
                question.key
              ]
            }
            placeholder={
              question.placeholder
            }
            onChange={e =>
              setProfile({
                ...profile,
                [question.key]:
                  e.target.value
              })
            }
          />

        )}

        <button
          className="primary full"
          onClick={next}
        >
          {step ===
          questions.length - 1
            ? "Enter CortexClip"
            : "Continue →"}
        </button>

      </div>

    </main>

  );

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function Dashboard({
  profile,
  credits,
  onCreate
}) {

  return (

    <main>

      <Header
        credits={credits}
      />

      <section className="dashboard">

        <span className="tag">
          CORTEXCLIP STUDIO
        </span>

        <h1>
          Hey,{" "}
          {profile.name ||
            "Creator"}.
        </h1>

        <p className="sub">
          What story are you going
          to bring to life?
        </p>

        <button
          className="create-card"
          onClick={onCreate}
        >

          <div className="create-icon">
            +
          </div>

          <div>
            <strong>
              Create a video
            </strong>

            <span>
              Build scenes, narration
              and audio with AI.
            </span>
          </div>

          <b>
            →
          </b>

        </button>


        <div className="feature-row">

          <div>
            🎬
            <strong>
              Scene-by-scene
            </strong>
            <span>
              Longer stories built
              from multiple clips.
            </span>
          </div>

          <div>
            🎙️
            <strong>
              Synchronized voice
            </strong>
            <span>
              Your script follows
              the visual story.
            </span>
          </div>

          <div>
            🧠
            <strong>
              Continuity
            </strong>
            <span>
              Characters and style
              stay consistent.
            </span>
          </div>

        </div>

      </section>

    </main>

  );

}


/* =========================================================
   STYLE SELECTION
   ========================================================= */

function StyleScreen({
  onSelect
}) {

  return (

    <main className="choice-screen">

      <span className="tag">
        STEP 1
      </span>

      <h1>
        What should your
        video look like?
      </h1>

      <p>
        CortexClip will follow this
        choice throughout the entire
        generation.
      </p>

      <div className="choice-grid">

        <button
          onClick={() =>
            onSelect(
              "realistic"
            )
          }
        >

          <div className="choice-art realistic">
            🎥
          </div>

          <strong>
            Realistic
          </strong>

          <span>
            Cinematic,
            photorealistic visuals
          </span>

        </button>


        <button
          onClick={() =>
            onSelect(
              "animated"
            )
          }
        >

          <div className="choice-art animated">
            ✨
          </div>

          <strong>
            Animated
          </strong>

          <span>
            Stylized animated
            storytelling
          </span>

        </button>

      </div>

    </main>

  );

}


/* =========================================================
   DURATION
   ========================================================= */

function DurationScreen({
  onSelect
}) {

  return (

    <main className="choice-screen">

      <span className="tag">
        STEP 2
      </span>

      <h1>
        How long would you
        like your video to be?
      </h1>

      <p>
        CortexClip will divide your
        requested length into AI-generated
        scenes.
      </p>

      <div className="duration-grid">

        {DURATIONS.map(
          option => (

            <button
              key={
                option.seconds
              }
              onClick={() =>
                onSelect(
                  option.seconds
                )
              }
            >

              <strong>
                {option.label}
              </strong>

              <span>
                Up to 8-second
                AI scenes
              </span>

            </button>

          )
        )}

      </div>

    </main>

  );

}


/* =========================================================
   PROMPTS
   ========================================================= */

function PromptScreen({
  videoPrompt,
  setVideoPrompt,
  voicePrompt,
  setVoicePrompt,
  style,
  duration,
  credits,
  onGenerate,
  onBack
}) {

  return (

    <main>

      <Header
        credits={credits}
      />

      <section className="creator">

        <span className="tag">
          STEP 3 · CREATIVE DIRECTION
        </span>

        <h1>
          Describe your movie.
        </h1>

        <p className="sub">
          CortexClip will turn your
          instructions into connected scenes.
        </p>


        <div className="selected-info">

          <span>
            STYLE
            <b>
              {style}
            </b>
          </span>

          <span>
            LENGTH
            <b>
              {formatDuration(
                duration
              )}
            </b>
          </span>

        </div>


        <div className="prompt-grid">

          <div className="prompt-box">

            <label>
              🎬 VIDEO & SCENE
            </label>

            <textarea
              value={
                videoPrompt
              }
              onChange={e =>
                setVideoPrompt(
                  e.target.value
                )
              }
              placeholder={
                "Describe the story, characters, locations, camera movements, actions, lighting, atmosphere and important visual details..."
              }
            />

            <small>
              Be specific. CortexClip
              will use this as the visual
              source of truth.
            </small>

          </div>


          <div className="prompt-box">

            <label>
              🎙️ VOICE & SCRIPT
            </label>

            <textarea
              value={
                voicePrompt
              }
              onChange={e =>
                setVoicePrompt(
                  e.target.value
                )
              }
              placeholder={
                "Describe the narrator or character voice, dialogue, emotion, pacing and exact script..."
              }
            />

            <small>
              CortexClip will synchronize
              the voice with the visual
              sequence.
            </small>

          </div>

        </div>


        <button
          className="primary generate"
          onClick={onGenerate}
        >
          Build my video ✦
        </button>

        <button
          className="back"
          onClick={onBack}
        >
          ← Back
        </button>

      </section>

    </main>

  );

}


/* =========================================================
   CORRECTION
   ========================================================= */

function CorrectionScreen({
  correction,
  setCorrection,
  clips,
  onSubmit,
  onBack
}) {

  return (

    <main className="creator">

      <span className="tag">
        REVISION MODE
      </span>

      <h1>
        What should CortexClip change?
      </h1>

      <p className="sub">
        Tell CortexClip which clip or
        visual detail wasn't right.
      </p>


      <div className="clip-strip">

        {clips.map(
          clip => (

            <div
              className="mini-clip"
              key={
                clip.index
              }
            >

              <video
                src={
                  clip.url
                }
                controls
              />

              <span>
                Clip{" "}
                {clip.index + 1}
              </span>

            </div>

          )
        )}

      </div>


      <textarea
        className="correction"
        value={
          correction
        }
        onChange={e =>
          setCorrection(
            e.target.value
          )
        }
        placeholder={
          "Example: Clip 3 is wrong. The main character's jacket changed. Keep the exact same character, clothing, hairstyle and appearance from the previous clips. Also make the next scene happen inside the spaceship instead of outside."
        }
      />


      <button
        className="primary generate"
        onClick={onSubmit}
      >
        Regenerate with my changes
      </button>


      <button
        className="back"
        onClick={onBack}
      >
        ← Back
      </button>

    </main>

  );

}


/* =========================================================
   GENERATION OVERLAY
   ========================================================= */

function GenerationOverlay({
  message,
  progress,
  clip,
  total
}) {

  return (

    <div className="overlay">

      <div className="generation-card">

        <div className="loader" />

        <span className="tag">
          CORTEXCLIP IS WORKING
        </span>

        <h2>
          {message}
        </h2>

        <p>
          Creating each scene one at a time
          to improve continuity.
        </p>

        <div className="progress-big">

          <div
            style={{
              width:
                `${progress}%`
            }}
          />

        </div>

        <small>
          Clip {clip} of {total}
        </small>

        <span className="warning">
          Please keep this page open.
        </span>

      </div>

    </div>

  );

}


/* =========================================================
   NOTE MODAL
   ========================================================= */

function NoteModal({
  onContinue
}) {

  return (

    <div className="overlay">

      <div className="modal">

        <div className="modal-symbol">
          ℹ
        </div>

        <h2>
          One important note
        </h2>

        <p>
          All the clips may not precisely
          add up to the requested time
          length of the video.
        </p>

        <button
          className="primary full"
          onClick={onContinue}
        >
          Ok
        </button>

      </div>

    </div>

  );

}


/* =========================================================
   APPROVAL MODAL
   ========================================================= */

function ApprovalModal({
  clips,
  onYes,
  onNo
}) {

  return (

    <div className="overlay">

      <div className="approval">

        <span className="tag">
          ALL CLIPS READY
        </span>

        <h2>
          Are you ready to push
          these clips into one
          single video?
        </h2>

        <div className="clip-preview-grid">

          {clips.map(
            clip => (

              <div
                key={
                  clip.index
                }
              >

                <video
                  src={
                    clip.url
                  }
                  controls
                  playsInline
                />

                <span>
                  Clip{" "}
                  {clip.index + 1}
                </span>

              </div>

            )
          )}

        </div>


        <div className="yes-no">

          <button
            className="primary"
            onClick={onYes}
          >
            Yes — combine them
          </button>

          <button
            className="secondary"
            onClick={onNo}
          >
            No — make changes
          </button>

        </div>

      </div>

    </div>

  );

}


/* =========================================================
   RESULT
   ========================================================= */

function ResultScreen({
  videoUrl,
  clips,
  videoRef,
  onDownload,
  onBack
}) {

  return (

    <main>

      <Header />

      <section className="result">

        <span className="tag">
          YOUR CORTEXCLIP
        </span>

        <h1>
          Your video is ready.
        </h1>


        <div className="final-video">

          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
          />

        </div>


        <div className="video-buttons">

          <button
            className="secondary"
            onClick={() => {

              if (
                videoRef.current
              ) {

                videoRef.current.requestFullscreen();

              }

            }}
          >
            ⛶ Fullscreen
          </button>


          <button
            className="secondary"
            onClick={() => {

              if (
                videoRef.current
              ) {

                videoRef.current.muted =
                  !videoRef.current.muted;

              }

            }}
          >
            🔊 Volume
          </button>


          <button
            className="primary"
            onClick={onDownload}
          >
            ↓ Save video
          </button>

        </div>


        <p className="result-note">
          {clips.length} AI-generated scenes
          were created for this project.
        </p>


        <button
          className="back"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>

      </section>

    </main>

  );

}


/* =========================================================
   HEADER
   ========================================================= */

function Header({
  credits
}) {

  return (

    <header>

      <div className="brand">
        <div className="brand-logo">
          C
        </div>

        CortexClip
      </div>

      <div className="credits">
        ⚡{" "}
        {typeof credits ===
        "number"
          ? credits
          : "—"}
        /50
      </div>

    </header>

  );

}


/* =========================================================
   ERROR
   ========================================================= */

function ErrorModal({
  message,
  onClose
}) {

  return (

    <div className="overlay">

      <div className="modal">

        <div className="modal-symbol">
          !
        </div>

        <h2>
          Oops!
        </h2>

        <p>
          {message}
        </p>

        <button
          className="primary full"
          onClick={onClose}
        >
          Ok
        </button>

      </div>

    </div>

  );

}


/* =========================================================
   UTILITIES
   ========================================================= */

function formatDuration(
  seconds
) {

  if (seconds < 60) {

    return `${seconds} secs`;

  }

  if (seconds === 60) {

    return "1 min";

  }

  if (seconds === 90) {

    return "1 min 30 secs";

  }

  return "2 mins";

}


/* =========================================================
   CSS
   ========================================================= */

const css = `

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
  width: 100%;
}

body {
  background: #070812;
  color: #f7f8ff;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

button,
input,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.app {
  min-height: 100vh;
  background:
    radial-gradient(
      circle at 10% 10%,
      rgba(115, 88, 255, .13),
      transparent 28%
    ),
    radial-gradient(
      circle at 90% 80%,
      rgba(35, 211, 238, .08),
      transparent 28%
    ),
    #070812;
}

.center-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 25px;
  position: relative;
  overflow: hidden;
}

.hero {
  text-align: center;
  max-width: 700px;
  position: relative;
  z-index: 2;
}

.logo,
.brand-logo {
  display: grid;
  place-items: center;
  background:
    linear-gradient(
      135deg,
      #7658ff,
      #22d3ee
    );
  color: white;
  font-weight: 900;
  box-shadow:
    0 0 45px
    rgba(118,88,255,.3);
}

.logo {
  width: 75px;
  height: 75px;
  border-radius: 23px;
  font-size: 34px;
  margin: auto auto 25px;
}

.brand-logo {
  width: 35px;
  height: 35px;
  border-radius: 10px;
}

.tag {
  color: #8e92aa;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .16em;
}

.hero h1 {
  font-size:
    clamp(
      60px,
      12vw,
      110px
    );
  line-height: .9;
  letter-spacing: -.07em;
  margin: 15px 0;
}

.hero h1 span {
  color: #8167ff;
}

.hero p {
  color: #999db3;
  font-size: 21px;
  line-height: 1.55;
}

.hero small {
  display: block;
  color: #666b82;
  margin-top: 16px;
}

.primary,
.secondary {
  border: 0;
  border-radius: 14px;
  padding: 14px 21px;
  font-weight: 800;
}

.primary {
  color: white;
  background:
    linear-gradient(
      135deg,
      #7658ff,
      #4d9cff
    );
  box-shadow:
    0 12px 30px
    rgba(90,70,255,.25);
}

.primary:hover {
  transform: translateY(-2px);
}

.secondary {
  color: white;
  background: #111423;
  border: 1px solid #2b3048;
}

.full {
  width: 100%;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(4px);
  opacity: .4;
}

.glow-a {
  width: 400px;
  height: 400px;
  background: #5e48ff;
  left: -200px;
  top: -200px;
}

.glow-b {
  width: 350px;
  height: 350px;
  background: #00c8ff;
  right: -200px;
  bottom: -180px;
}


/* HEADER */

header {
  height: 74px;
  padding: 0 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #1c2034;
  background: rgba(7,8,18,.85);
  backdrop-filter: blur(20px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
}

.credits {
  border: 1px solid #292e46;
  background: #101321;
  padding: 9px 14px;
  border-radius: 100px;
  font-size: 13px;
  color: #c1c5d5;
}


/* FORMS */

.form-card {
  width: min(550px,100%);
  padding: 32px;
  background: #0d0f1c;
  border: 1px solid #252a42;
  border-radius: 25px;
}

.progress {
  height: 5px;
  background: #20243a;
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 35px;
}

.progress div {
  height: 100%;
  background:
    linear-gradient(
      90deg,
      #7658ff,
      #22d3ee
    );
}

.form-card h2 {
  font-size: 32px;
  letter-spacing: -.04em;
  margin-bottom: 8px;
}

.form-card p {
  color: #85899f;
  line-height: 1.5;
}

input,
textarea {
  width: 100%;
  color: white;
  background: #080a13;
  border: 1px solid #292e45;
  outline: none;
  border-radius: 13px;
  padding: 15px;
}

input {
  margin: 15px 0;
}

textarea {
  resize: vertical;
  min-height: 150px;
}

input:focus,
textarea:focus {
  border-color: #7658ff;
}


/* DASHBOARD */

.dashboard {
  width: min(1100px,calc(100% - 40px));
  margin: auto;
  padding: 80px 0;
}

.dashboard h1,
.creator h1,
.choice-screen h1,
.result h1 {
  font-size:
    clamp(
      42px,
      7vw,
      72px
    );
  letter-spacing: -.06em;
  line-height: .98;
  margin: 12px 0;
}

.sub,
.dashboard > p {
  color: #85899f;
  font-size: 18px;
  line-height: 1.6;
}

.create-card {
  width: 100%;
  margin-top: 45px;
  display: flex;
  align-items: center;
  gap: 18px;
  text-align: left;
  color: white;
  background:
    linear-gradient(
      135deg,
      rgba(118,88,255,.14),
      rgba(34,211,238,.04)
    ),
    #0d0f1c;
  border: 1px solid #2a2e47;
  border-radius: 22px;
  padding: 25px;
}

.create-card:hover {
  border-color: #6b5fbb;
  transform: translateY(-2px);
}

.create-icon {
  width: 55px;
  height: 55px;
  display: grid;
  place-items: center;
  background: #7658ff;
  border-radius: 16px;
  font-size: 28px;
}

.create-card strong {
  display: block;
  font-size: 18px;
}

.create-card span {
  display: block;
  color: #777c92;
  margin-top: 5px;
}

.create-card b {
  margin-left: auto;
  font-size: 25px;
  color: #8589a0;
}

.feature-row {
  display: grid;
  grid-template-columns:
    repeat(3,1fr);
  gap: 15px;
  margin-top: 15px;
}

.feature-row > div {
  padding: 22px;
  border: 1px solid #1f2338;
  border-radius: 18px;
  background: #0b0d18;
  color: #aaaec0;
}

.feature-row strong,
.feature-row span {
  display: block;
}

.feature-row strong {
  color: white;
  margin-top: 13px;
}

.feature-row span {
  margin-top: 6px;
  color: #71758a;
  line-height: 1.5;
  font-size: 13px;
}


/* CHOICE */

.choice-screen {
  min-height: 100vh;
  width: min(900px,calc(100% - 35px));
  margin: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.choice-screen p {
  color: #85899f;
  font-size: 17px;
  max-width: 650px;
  line-height: 1.6;
}

.choice-grid {
  display: grid;
  grid-template-columns:
    repeat(2,1fr);
  gap: 18px;
  margin-top: 40px;
}

.choice-grid button {
  text-align: left;
  padding: 18px;
  color: white;
  background: #0d0f1c;
  border: 1px solid #282d45;
  border-radius: 22px;
}

.choice-grid button:hover {
  border-color: #7658ff;
  transform: translateY(-3px);
}

.choice-art {
  height: 190px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  font-size: 60px;
  margin-bottom: 18px;
}

.realistic {
  background:
    linear-gradient(
      135deg,
      #303743,
      #101521
    );
}

.animated {
  background:
    linear-gradient(
      135deg,
      #4c2c78,
      #111a39
    );
}

.choice-grid strong {
  display: block;
  font-size: 20px;
}

.choice-grid span {
  display: block;
  color: #777c91;
  margin-top: 6px;
}


/* DURATION */

.duration-grid {
  display: grid;
  grid-template-columns:
    repeat(3,1fr);
  gap: 14px;
  margin-top: 40px;
}

.duration-grid button {
  text-align: left;
  padding: 20px;
  color: white;
  background: #0d0f1c;
  border: 1px solid #282d45;
  border-radius: 17px;
}

.duration-grid button:hover {
  border-color: #7658ff;
}

.duration-grid strong,
.duration-grid span {
  display: block;
}

.duration-grid strong {
  font-size: 20px;
}

.duration-grid span {
  color: #70758a;
  margin-top: 8px;
  font-size: 12px;
}


/* CREATOR */

.creator {
  width: min(1100px,calc(100% - 40px));
  margin: auto;
  padding: 65px 0;
}

.selected-info {
  display: flex;
  gap: 12px;
  margin: 30px 0;
}

.selected-info span {
  padding: 10px 14px;
  background: #101321;
  border: 1px solid #292e46;
  border-radius: 12px;
  color: #6f7489;
  font-size: 10px;
  font-weight: 900;
}

.selected-info b {
  color: white;
  margin-left: 7px;
}

.prompt-grid {
  display: grid;
  grid-template-columns:
    repeat(2,1fr);
  gap: 18px;
}

.prompt-box {
  padding: 20px;
  border: 1px solid #262b43;
  border-radius: 19px;
  background: #0c0e1a;
}

.prompt-box label {
  display: block;
  font-size: 12px;
  font-weight: 900;
  margin-bottom: 12px;
}

.prompt-box small {
  display: block;
  color: #656a80;
  margin-top: 10px;
  line-height: 1.5;
}

.prompt-box textarea {
  min-height: 260px;
}

.generate {
  margin-top: 25px;
  min-width: 230px;
}

.back {
  display: block;
  margin-top: 15px;
  background: transparent;
  border: 0;
  color: #777c91;
}


/* CLIPS */

.clip-strip,
.clip-preview-grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fit,minmax(170px,1fr));
  gap: 12px;
  margin: 30px 0;
}

.mini-clip,
.clip-preview-grid > div {
  background: #0d0f1c;
  border: 1px solid #252a41;
  border-radius: 13px;
  overflow: hidden;
}

.mini-clip video,
.clip-preview-grid video {
  display: block;
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
}

.mini-clip span,
.clip-preview-grid span {
  display: block;
  padding: 8px;
  color: #85899e;
  font-size: 12px;
}

.correction {
  min-height: 190px;
  margin-top: 20px;
}


/* OVERLAYS */

.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0,0,0,.76);
  backdrop-filter: blur(12px);
}

.generation-card,
.modal,
.approval {
  width: min(700px,100%);
  padding: 35px;
  text-align: center;
  border: 1px solid #30354d;
  border-radius: 25px;
  background: #0d0f1c;
  box-shadow:
    0 35px 100px
    rgba(0,0,0,.5);
}

.generation-card h2,
.modal h2,
.approval h2 {
  font-size: 28px;
  letter-spacing: -.04em;
}

.generation-card p,
.modal p {
  color: #85899f;
  line-height: 1.6;
}

.loader {
  width: 52px;
  height: 52px;
  margin: auto auto 25px;
  border-radius: 50%;
  border: 3px solid #272c43;
  border-top-color: #7658ff;
  animation: spin .8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progress-big {
  height: 5px;
  background: #22273b;
  border-radius: 10px;
  margin: 25px 0 10px;
  overflow: hidden;
}

.progress-big div {
  height: 100%;
  background:
    linear-gradient(
      90deg,
      #7658ff,
      #22d3ee
    );
  transition: width .4s;
}

.warning {
  display: block;
  color: #5f6479;
  font-size: 11px;
  margin-top: 18px;
}

.modal-symbol {
  width: 55px;
  height: 55px;
  margin: auto;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: #191d32;
  color: #8d7cff;
  font-weight: 900;
  font-size: 25px;
}

.approval {
  max-height: 90vh;
  overflow-y: auto;
}

.yes-no {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}


/* RESULT */

.result {
  width: min(1100px,calc(100% - 35px));
  margin: auto;
  padding: 65px 0;
}

.final-video {
  margin-top: 35px;
  background: #000;
  border-radius: 18px;
  overflow: hidden;
}

.final-video video {
  display: block;
  width: 100%;
  max-height: 70vh;
}

.video-buttons {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.result-note {
  color: #666b80;
  font-size: 13px;
  margin-top: 18px;
}


/* RESPONSIVE */

@media(max-width:800px) {

  .feature-row,
  .prompt-grid,
  .choice-grid {
    grid-template-columns: 1fr;
  }

  .duration-grid {
    grid-template-columns:
      repeat(2,1fr);
  }

  .dashboard,
  .creator,
  .result {
    width: calc(100% - 25px);
  }

  .video-buttons,
  .yes-no {
    flex-direction: column;
  }

}

@media(max-width:500px) {

  header {
    padding: 0 15px;
  }

  .hero h1 {
    font-size: 60px;
  }

  .duration-grid {
    grid-template-columns: 1fr;
  }

  .creator,
  .dashboard,
  .result {
    padding-top: 40px;
  }

}

`;


/* Inject CSS */

if (
  typeof document !==
  "undefined"
) {

  const style =
    document.createElement(
      "style"
    );

  style.textContent = css;

  document.head.appendChild(
    style
  );

}


/* =========================================================
   MOUNT
   ========================================================= */

createRoot(
  document.getElementById("root")
).render(
  <App />
);
