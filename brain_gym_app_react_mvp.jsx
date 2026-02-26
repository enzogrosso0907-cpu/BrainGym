import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dumbbell,
  Brain,
  Calendar,
  Sparkles,
  Timer,
  Plus,
  Trash2,
  Flame,
  CheckCircle2,
  Mic,
  Volume2,
} from "lucide-react";

/**
 * BrainGym (MVP)
 * - Plan d'entraînement + journal
 * - "Révision post-séance" auto (durée & intensité)
 * - Flashcards avec répétition espacée simplifiée (SM-2)
 * - Suivi fatigue / sommeil et recommandations
 * - Notifications in-app + "blagues" motivation
 *
 * Notes:
 * - Pas d'auth; stockage localStorage.
 * - Code orienté MVP, prêt à brancher sur une API plus tard.
 */

// ------------------------
// Utilities
// ------------------------
const LS_KEY = "braingym_mvp_v1";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatDate(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function humanTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function minutesBetween(a, b) {
  const A = typeof a === "string" ? new Date(a) : a;
  const B = typeof b === "string" ? new Date(b) : b;
  return Math.round((B.getTime() - A.getTime()) / 60000);
}

function nowIso() {
  return new Date().toISOString();
}

// ------------------------
// Spaced repetition (SM-2)
// ------------------------
/**
 * SM-2 (Anki-like)
 * quality: 0..5
 */
function sm2Update(card, quality) {
  const q = clamp(quality, 0, 5);
  const next = { ...card };

  // Init
  next.repetitions = next.repetitions ?? 0;
  next.intervalDays = next.intervalDays ?? 0;
  next.ease = next.ease ?? 2.5;

  if (q < 3) {
    next.repetitions = 0;
    next.intervalDays = 1;
  } else {
    next.repetitions += 1;
    if (next.repetitions === 1) next.intervalDays = 1;
    else if (next.repetitions === 2) next.intervalDays = 6;
    else next.intervalDays = Math.round(next.intervalDays * next.ease);
  }

  // Ease factor
  next.ease = clamp(next.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), 1.3, 2.8);

  const due = new Date();
  due.setDate(due.getDate() + next.intervalDays);
  next.dueAt = due.toISOString();
  next.updatedAt = nowIso();
  next.lastQuality = q;

  return next;
}

function isDue(card, ref = new Date()) {
  const dueAt = card.dueAt ? new Date(card.dueAt) : new Date(0);
  return dueAt <= ref;
}

// ------------------------
// Domain model
// ------------------------
const DEFAULT_JOKES = [
  "Pas de révision aujourd'hui ? Même ton biceps révise plus que toi 😌",
  "Si tu fais 10 cartes, je te laisse skipper… 0,5 squat mental.",
  "On révise 15 minutes. Après, tu peux redevenir une légende.",
  "Ton futur toi te remercie. Ton toi d'aujourd'hui râle. C'est normal.",
  "La discipline bat la motivation. Mais une bonne blague aide un peu 😏",
];

const SAMPLE_DECKS = [
  {
    id: "deck_mici",
    name: "MICI — essentiels",
    color: "bg-muted",
    cards: [
      {
        id: "c1",
        front: "Crohn vs RCH : 1 différence anatomique clé ?",
        back: "Crohn : atteinte discontinue, transmurale, tout le tube digestif (souvent iléon) ; RCH : continue, muqueuse, côlon/rectum.",
        ease: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueAt: new Date(0).toISOString(),
      },
      {
        id: "c2",
        front: "MICI : 1 complication extra-digestive fréquente ?",
        back: "Atteintes articulaires (arthrites/arthralgies), cutanées (érythème noueux), oculaires (uvéite), etc.",
        ease: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueAt: new Date(0).toISOString(),
      },
      {
        id: "c3",
        front: "RCH : quel risque à long terme augmente ?",
        back: "Risque de cancer colorectal (dépend de la durée/étendue) → surveillance endoscopique.",
        ease: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueAt: new Date(0).toISOString(),
      },
    ],
  },
  {
    id: "deck_pr",
    name: "PR — bases",
    color: "bg-muted",
    cards: [
      {
        id: "p1",
        front: "PR : quels auto-anticorps sont typiques ?",
        back: "Facteur rhumatoïde (FR) et anti-CCP (ACPA) ; anti-CCP plus spécifique.",
        ease: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueAt: new Date(0).toISOString(),
      },
      {
        id: "p2",
        front: "PR : triade clinique classique au réveil ?",
        back: "Douleurs inflammatoires, dérouillage matinal prolongé, gonflement articulaire.",
        ease: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueAt: new Date(0).toISOString(),
      },
    ],
  },
];

const SAMPLE_WORKOUT_TEMPLATES = [
  {
    id: "w_upper",
    name: "Haut du corps — Force",
    estMinutes: 60,
    target: "Force",
    exercises: [
      { name: "Développé couché", sets: 5, reps: "3-5", rpe: 8 },
      { name: "Row barre", sets: 4, reps: "6-8", rpe: 8 },
      { name: "Développé militaire", sets: 4, reps: "5-8", rpe: 8 },
      { name: "Tractions", sets: 4, reps: "AMRAP", rpe: 8 },
      { name: "Élévations latérales", sets: 3, reps: "12-20", rpe: 7 },
    ],
  },
  {
    id: "w_lower",
    name: "Bas du corps — Force",
    estMinutes: 70,
    target: "Force",
    exercises: [
      { name: "Squat", sets: 5, reps: "3-5", rpe: 8 },
      { name: "Soulevé de terre roumain", sets: 4, reps: "6-8", rpe: 8 },
      { name: "Fentes", sets: 3, reps: "8-12", rpe: 8 },
      { name: "Mollets", sets: 4, reps: "10-15", rpe: 7 },
    ],
  },
  {
    id: "w_end",
    name: "Cardio — Endurance",
    estMinutes: 45,
    target: "Endurance",
    exercises: [
      { name: "Zone 2 (vélo/course)", sets: 1, reps: "45 min", rpe: 6 },
      { name: "Mobilité", sets: 1, reps: "10 min", rpe: 3 },
    ],
  },
];

function initialState() {
  return {
    profile: {
      name: "",
      goal: "Force + Endurance",
      jokesEnabled: true,
      voiceEnabled: false,
      preferredStudyDeckId: "deck_mici",
      maxStudyMinutes: 35,
    },
    recovery: {
      // daily check-in
      sleepHours: 7.5,
      stress: 5, // 1..10
      soreness: 4, // 1..10
      updatedAt: nowIso(),
    },
    decks: SAMPLE_DECKS,
    workoutTemplates: SAMPLE_WORKOUT_TEMPLATES,
    workoutLog: [],
    notifications: [
      {
        id: uid("n"),
        createdAt: nowIso(),
        type: "tip",
        text: "Bienvenue sur BrainGym. Log une séance et laisse l'app te proposer une révision optimisée 🧠💪",
        read: false,
      },
    ],
  };
}

// ------------------------
// Recommendation engine
// ------------------------
function computeReadiness(recovery) {
  // Simple heuristic: sleep good improves, stress+soreness reduce
  // Normalize to 0..100
  const sleepScore = clamp((recovery.sleepHours - 4) / 5, 0, 1); // 4..9h => 0..1
  const stressScore = 1 - clamp((recovery.stress - 1) / 9, 0, 1);
  const soreScore = 1 - clamp((recovery.soreness - 1) / 9, 0, 1);
  const readiness = Math.round((sleepScore * 0.5 + stressScore * 0.3 + soreScore * 0.2) * 100);
  return readiness;
}

function proposeStudyBlock({ workout, readiness, maxStudyMinutes }) {
  // Workout intensity proxy: mean RPE from exercises or user RPE
  const rpeList = (workout.exercises || []).map((e) => e.rpe).filter((x) => typeof x === "number");
  const meanRpe = rpeList.length ? rpeList.reduce((a, b) => a + b, 0) / rpeList.length : workout.sessionRpe ?? 7;

  // Higher RPE => shorter study, more recall/quiz, less new content
  const base = maxStudyMinutes ?? 35;
  const intensityPenalty = clamp((meanRpe - 6) * 4, 0, 18); // 6->0, 10->16
  const readinessBonus = clamp((readiness - 60) * 0.2, -8, 8);
  const minutes = clamp(Math.round(base - intensityPenalty + readinessBonus), 10, base);

  const mode = meanRpe >= 8 ? "Rappel actif (QCM/flashcards)" : "Mix (flashcards + 1 mini-cas)";
  const focus = readiness < 40 ? "léger" : readiness < 70 ? "normal" : "intensif";

  // Cooldown: suggest start in 20-60 minutes depending on intensity
  const startIn = meanRpe >= 8 ? 45 : 25;

  return {
    minutes,
    startInMinutes: startIn,
    mode,
    focus,
    meanRpe: Math.round(meanRpe * 10) / 10,
  };
}

function pickJoke() {
  return DEFAULT_JOKES[Math.floor(Math.random() * DEFAULT_JOKES.length)];
}

// ------------------------
// Speech (optional)
// ------------------------
function useSpeech() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const speak = (text) => {
    if (!supported) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  };
  return { supported, speak };
}

// ------------------------
// Main App
// ------------------------
export default function BrainGymMVP() {
  const [state, setState] = useState(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    if (!raw) return initialState();
    try {
      const parsed = JSON.parse(raw);
      // Defensive merges for future migrations
      return {
        ...initialState(),
        ...parsed,
        profile: { ...initialState().profile, ...(parsed.profile || {}) },
        recovery: { ...initialState().recovery, ...(parsed.recovery || {}) },
      };
    } catch {
      return initialState();
    }
  });

  const { supported: ttsSupported, speak } = useSpeech();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  const readiness = useMemo(() => computeReadiness(state.recovery), [state.recovery]);

  const unreadCount = useMemo(
    () => state.notifications.filter((n) => !n.read).length,
    [state.notifications]
  );

  const dueCountsByDeck = useMemo(() => {
    const ref = new Date();
    const map = {};
    for (const deck of state.decks) {
      map[deck.id] = deck.cards.filter((c) => isDue(c, ref)).length;
    }
    return map;
  }, [state.decks]);

  const totalDue = useMemo(() => Object.values(dueCountsByDeck).reduce((a, b) => a + b, 0), [dueCountsByDeck]);

  // --------
  // Actions
  // --------
  const pushNotification = (n) => {
    setState((s) => ({
      ...s,
      notifications: [{ id: uid("n"), createdAt: nowIso(), read: false, ...n }, ...s.notifications].slice(0, 80),
    }));
  };

  const markAllRead = () => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }));
  };

  const updateProfile = (patch) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  const updateRecovery = (patch) => setState((s) => ({ ...s, recovery: { ...s.recovery, ...patch, updatedAt: nowIso() } }));

  const addWorkoutFromTemplate = (templateId) => {
    const t = state.workoutTemplates.find((x) => x.id === templateId);
    if (!t) return;

    const workout = {
      id: uid("log"),
      date: formatDate(new Date()),
      startedAt: nowIso(),
      name: t.name,
      target: t.target,
      estMinutes: t.estMinutes,
      sessionRpe: Math.round(t.exercises.reduce((a, e) => a + (e.rpe || 7), 0) / t.exercises.length),
      exercises: t.exercises.map((e) => ({ ...e })),
      notes: "",
    };

    setState((s) => ({ ...s, workoutLog: [workout, ...s.workoutLog] }));

    const plan = proposeStudyBlock({ workout, readiness, maxStudyMinutes: state.profile.maxStudyMinutes });

    const msg = `Séance loggée: ${workout.name}. Révision conseillée dans ${plan.startInMinutes} min · ${plan.minutes} min · ${plan.mode} (${plan.focus}).`;
    pushNotification({ type: "plan", text: msg });

    if (state.profile.jokesEnabled) {
      pushNotification({ type: "joke", text: pickJoke() });
    }

    if (state.profile.voiceEnabled && ttsSupported) {
      speak(`Séance enregistrée. Révision conseillée dans ${plan.startInMinutes} minutes, pour ${plan.minutes} minutes.`);
    }
  };

  const deleteWorkout = (id) => {
    setState((s) => ({ ...s, workoutLog: s.workoutLog.filter((w) => w.id !== id) }));
  };

  const createDeck = (name) => {
    const deck = {
      id: uid("deck"),
      name: name.trim() || "Nouveau deck",
      color: "bg-muted",
      cards: [],
    };
    setState((s) => ({ ...s, decks: [deck, ...s.decks] }));
    pushNotification({ type: "tip", text: `Deck créé: ${deck.name}. Ajoute 5 cartes et lance une mini-session.` });
  };

  const deleteDeck = (deckId) => {
    setState((s) => ({
      ...s,
      decks: s.decks.filter((d) => d.id !== deckId),
      profile: {
        ...s.profile,
        preferredStudyDeckId:
          s.profile.preferredStudyDeckId === deckId ? (s.decks.find((d) => d.id !== deckId)?.id ?? "") : s.profile.preferredStudyDeckId,
      },
    }));
  };

  const addCard = (deckId, front, back) => {
    const card = {
      id: uid("card"),
      front: front.trim(),
      back: back.trim(),
      ease: 2.5,
      repetitions: 0,
      intervalDays: 0,
      dueAt: new Date(0).toISOString(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => (d.id === deckId ? { ...d, cards: [card, ...d.cards] } : d)),
    }));
  };

  const updateCard = (deckId, cardId, patch) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) =>
        d.id === deckId
          ? {
              ...d,
              cards: d.cards.map((c) => (c.id === cardId ? { ...c, ...patch, updatedAt: nowIso() } : c)),
            }
          : d
      ),
    }));
  };

  const deleteCard = (deckId, cardId) => {
    setState((s) => ({
      ...s,
      decks: s.decks.map((d) => (d.id === deckId ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d)),
    }));
  };

  // ------------------------
  // UI state
  // ------------------------
  const [newDeckName, setNewDeckName] = useState("");
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");

  const selectedDeck = useMemo(() => {
    const pref = state.profile.preferredStudyDeckId;
    return state.decks.find((d) => d.id === pref) || state.decks[0];
  }, [state.decks, state.profile.preferredStudyDeckId]);

  // Study session
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionDeckId, setSessionDeckId] = useState("");
  const [sessionQueue, setSessionQueue] = useState([]);
  const [sessionIdx, setSessionIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  const startSession = (deckId) => {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck) return;
    const due = deck.cards.filter((c) => isDue(c, new Date()));
    const queue = due.slice(0, 20); // MVP limit
    setSessionDeckId(deckId);
    setSessionQueue(queue);
    setSessionIdx(0);
    setShowBack(false);
    setSessionOpen(true);
    setSessionStartedAt(new Date());

    if (queue.length === 0) {
      pushNotification({ type: "tip", text: `Aucune carte due dans “${deck.name}”. Ajoute des cartes ou reviens demain 😌` });
    } else {
      pushNotification({ type: "tip", text: `Session démarrée: ${queue.length} cartes (deck: ${deck.name}).` });
      if (state.profile.voiceEnabled && ttsSupported) speak(`Session flashcards. ${queue.length} cartes.`);
    }
  };

  const currentCard = sessionQueue[sessionIdx];

  const grade = (quality) => {
    if (!currentCard) return;
    const updated = sm2Update(currentCard, quality);
    updateCard(sessionDeckId, currentCard.id, updated);

    const isLast = sessionIdx >= sessionQueue.length - 1;
    if (isLast) {
      setSessionOpen(false);
      const mins = sessionStartedAt ? Math.max(1, Math.round(minutesBetween(sessionStartedAt, new Date()))) : 1;
      pushNotification({ type: "done", text: `Session terminée ✅ (${sessionQueue.length} cartes, ~${mins} min).` });
      if (state.profile.jokesEnabled) pushNotification({ type: "joke", text: pickJoke() });
      return;
    }

    setSessionIdx((x) => x + 1);
    setShowBack(false);
  };

  const resetApp = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY);
    setState(initialState());
  };

  // ------------------------
  // Derived: today plan
  // ------------------------
  const today = formatDate(new Date());
  const todayWorkouts = useMemo(() => state.workoutLog.filter((w) => w.date === today), [state.workoutLog, today]);

  const suggestedDeckId = useMemo(() => state.profile.preferredStudyDeckId || (state.decks[0]?.id ?? ""), [state]);

  const todaySuggestedStudy = useMemo(() => {
    const last = todayWorkouts[0];
    if (!last) {
      return {
        minutes: clamp(Math.round((state.profile.maxStudyMinutes || 35) * (readiness / 100)), 10, state.profile.maxStudyMinutes || 35),
        startInMinutes: 0,
        mode: readiness < 50 ? "Rappel actif (flashcards)" : "Mix (flashcards + 1 mini-cas)",
        focus: readiness < 40 ? "léger" : readiness < 70 ? "normal" : "intensif",
        meanRpe: null,
      };
    }
    return proposeStudyBlock({ workout: last, readiness, maxStudyMinutes: state.profile.maxStudyMinutes });
  }, [todayWorkouts, readiness, state.profile.maxStudyMinutes]);

  // ------------------------
  // UI
  // ------------------------
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <Header
          name={state.profile.name}
          readiness={readiness}
          totalDue={totalDue}
          unreadCount={unreadCount}
          onReset={resetApp}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Sparkles className="h-5 w-5" />
                  Plan du jour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Dumbbell className="h-4 w-4" />
                        Séance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-sm text-muted-foreground">Aujourd'hui ({today})</div>
                      {todayWorkouts.length === 0 ? (
                        <div className="text-sm">Aucune séance loggée.</div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium">{todayWorkouts[0].name}</div>
                          <div className="text-sm text-muted-foreground">RPE ~ {todayWorkouts[0].sessionRpe} · {humanTime(todayWorkouts[0].estMinutes)}</div>
                        </div>
                      )}
                      <Separator />
                      <div className="grid grid-cols-1 gap-2">
                        {state.workoutTemplates.map((t) => (
                          <Button key={t.id} variant="secondary" className="justify-between rounded-2xl" onClick={() => addWorkoutFromTemplate(t.id)}>
                            <span className="truncate">{t.name}</span>
                            <Badge variant="outline" className="ml-2">{t.target}</Badge>
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        Révision recommandée
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">Readiness</div>
                        <div className="text-sm font-medium">{readiness}/100</div>
                      </div>
                      <Progress value={readiness} className="h-2" />
                      <div className="mt-2">
                        <div className="text-lg font-semibold">{humanTime(todaySuggestedStudy.minutes)}</div>
                        <div className="text-sm text-muted-foreground">
                          {todaySuggestedStudy.startInMinutes > 0 ? `Démarrer dans ~${todaySuggestedStudy.startInMinutes} min` : "Quand tu veux"}
                          {todaySuggestedStudy.meanRpe ? ` · intensité séance ~${todaySuggestedStudy.meanRpe} RPE` : ""}
                        </div>
                      </div>
                      <div className="text-sm">Mode: <span className="font-medium">{todaySuggestedStudy.mode}</span> (<span className="font-medium">{todaySuggestedStudy.focus}</span>)</div>
                      <Separator />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Deck: {state.decks.find((d) => d.id === suggestedDeckId)?.name ?? "—"}</Badge>
                        <Badge variant="outline">Due: {dueCountsByDeck[suggestedDeckId] ?? 0}</Badge>
                      </div>
                      <Button className="w-full rounded-2xl" onClick={() => startSession(suggestedDeckId)}>
                        <Timer className="mr-2 h-4 w-4" />
                        Lancer une mini-session
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Check-in (récup)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Sommeil (heures)</Label>
                          <div className="text-sm font-medium">{state.recovery.sleepHours.toFixed(1)}</div>
                        </div>
                        <Input
                          type="range"
                          min={4}
                          max={10}
                          step={0.5}
                          value={state.recovery.sleepHours}
                          onChange={(e) => updateRecovery({ sleepHours: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Stress (1-10)</Label>
                          <div className="text-sm font-medium">{state.recovery.stress}</div>
                        </div>
                        <Input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={state.recovery.stress}
                          onChange={(e) => updateRecovery({ stress: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Courbatures (1-10)</Label>
                          <div className="text-sm font-medium">{state.recovery.soreness}</div>
                        </div>
                        <Input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={state.recovery.soreness}
                          onChange={(e) => updateRecovery({ soreness: Number(e.target.value) })}
                        />
                      </div>
                      <Separator />
                      <div className="text-xs text-muted-foreground">Dernière maj: {new Date(state.recovery.updatedAt).toLocaleString()}</div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <div className="mt-6">
              <Tabs defaultValue="study" className="w-full">
                <TabsList className="rounded-2xl">
                  <TabsTrigger value="study" className="rounded-2xl">
                    <Brain className="mr-2 h-4 w-4" />
                    Révision
                  </TabsTrigger>
                  <TabsTrigger value="workouts" className="rounded-2xl">
                    <Dumbbell className="mr-2 h-4 w-4" />
                    Entraînement
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="rounded-2xl">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Réglages
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="study" className="mt-4">
                  <StudyPanel
                    decks={state.decks}
                    dueCountsByDeck={dueCountsByDeck}
                    preferredDeckId={state.profile.preferredStudyDeckId}
                    onPreferredDeck={(id) => updateProfile({ preferredStudyDeckId: id })}
                    onStartSession={startSession}
                    newDeckName={newDeckName}
                    setNewDeckName={setNewDeckName}
                    onCreateDeck={() => {
                      if (!newDeckName.trim()) return;
                      createDeck(newDeckName);
                      setNewDeckName("");
                    }}
                    onDeleteDeck={deleteDeck}
                    selectedDeck={selectedDeck}
                    newCardFront={newCardFront}
                    setNewCardFront={setNewCardFront}
                    newCardBack={newCardBack}
                    setNewCardBack={setNewCardBack}
                    onAddCard={() => {
                      if (!selectedDeck) return;
                      if (!newCardFront.trim() || !newCardBack.trim()) return;
                      addCard(selectedDeck.id, newCardFront, newCardBack);
                      setNewCardFront("");
                      setNewCardBack("");
                    }}
                    onDeleteCard={deleteCard}
                  />
                </TabsContent>

                <TabsContent value="workouts" className="mt-4">
                  <WorkoutPanel workoutLog={state.workoutLog} onDeleteWorkout={deleteWorkout} />
                </TabsContent>

                <TabsContent value="settings" className="mt-4">
                  <SettingsPanel
                    profile={state.profile}
                    ttsSupported={ttsSupported}
                    onUpdate={updateProfile}
                    onPing={() => {
                      pushNotification({ type: "tip", text: "Ping ✅ Si tu vois ça, tes notifications in-app marchent." });
                      if (state.profile.voiceEnabled && ttsSupported) speak("Ping. Notifications actives.");
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="lg:col-span-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Flame className="h-5 w-5" />
                  Feed
                </CardTitle>
                <Button variant="secondary" className="rounded-2xl" onClick={markAllRead}>
                  Tout lire
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {state.notifications.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Aucune notification.</div>
                  ) : (
                    state.notifications.map((n) => (
                      <div key={n.id} className={`rounded-2xl border p-3 ${n.read ? "opacity-70" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={n.type === "joke" ? "secondary" : n.type === "done" ? "default" : "outline"}>
                                {n.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="text-sm">{n.text}</div>
                          </div>
                          {!n.read && <div className="h-2 w-2 rounded-full bg-foreground mt-1" />}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Stats rapides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatRow label="Cartes dues (total)" value={`${totalDue}`} />
                <StatRow label="Séances aujourd'hui" value={`${todayWorkouts.length}`} />
                <StatRow label="Objectif révision max" value={humanTime(state.profile.maxStudyMinutes)} />
                <Separator />
                <div className="text-xs text-muted-foreground">
                  MVP local. Prochaine étape: comptes, sync cloud, import PDF, decks partagés, analytics.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <StudySessionModal
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        deck={state.decks.find((d) => d.id === sessionDeckId) || null}
        card={currentCard || null}
        idx={sessionIdx}
        total={sessionQueue.length}
        showBack={showBack}
        setShowBack={setShowBack}
        onGrade={grade}
        voiceEnabled={state.profile.voiceEnabled}
        ttsSupported={ttsSupported}
        speak={speak}
      />
    </div>
  );
}

// ------------------------
// Components
// ------------------------
function Header({ name, readiness, totalDue, unreadCount, onReset }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <div className="text-3xl font-semibold tracking-tight">BrainGym</div>
        <div className="text-sm text-muted-foreground">
          {name ? `Salut ${name}. ` : ""}
          Optimise ta mémoire *après* l'entraînement.
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="rounded-xl">Readiness: {readiness}/100</Badge>
        <Badge variant="secondary" className="rounded-xl">Due: {totalDue}</Badge>
        <Badge variant={unreadCount ? "default" : "outline"} className="rounded-xl">Feed: {unreadCount}</Badge>
        <Button variant="ghost" className="rounded-2xl" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function StudyPanel({
  decks,
  dueCountsByDeck,
  preferredDeckId,
  onPreferredDeck,
  onStartSession,
  newDeckName,
  setNewDeckName,
  onCreateDeck,
  onDeleteDeck,
  selectedDeck,
  newCardFront,
  setNewCardFront,
  newCardBack,
  setNewCardBack,
  onAddCard,
  onDeleteCard,
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <Card className="rounded-2xl lg:col-span-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Decks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              placeholder="Nouveau deck (ex: Infectio)"
              className="rounded-2xl"
            />
            <Button onClick={onCreateDeck} className="rounded-2xl">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {decks.map((d) => (
              <div key={d.id} className="rounded-2xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={d.id === preferredDeckId ? "default" : "outline"} className="rounded-xl">
                        {d.id === preferredDeckId ? "Deck principal" : "Secondaire"}
                      </Badge>
                      <Badge variant="secondary" className="rounded-xl">Due: {dueCountsByDeck[d.id] ?? 0}</Badge>
                      <Badge variant="outline" className="rounded-xl">Cartes: {d.cards.length}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" className="rounded-2xl" onClick={() => onPreferredDeck(d.id)}>
                      Choisir
                    </Button>
                    <Button variant="ghost" className="rounded-2xl" onClick={() => onDeleteDeck(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <Button className="w-full rounded-2xl" onClick={() => onStartSession(d.id)}>
                    <Timer className="mr-2 h-4 w-4" />
                    Démarrer (max 20 cartes)
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl lg:col-span-7">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Cartes — {selectedDeck ? selectedDeck.name : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedDeck ? (
            <div className="text-sm text-muted-foreground">Crée un deck pour commencer.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Recto</Label>
                  <Input
                    value={newCardFront}
                    onChange={(e) => setNewCardFront(e.target.value)}
                    placeholder="Question / prompt"
                    className="rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Verso</Label>
                  <Input
                    value={newCardBack}
                    onChange={(e) => setNewCardBack(e.target.value)}
                    placeholder="Réponse"
                    className="rounded-2xl"
                  />
                </div>
              </div>
              <Button onClick={onAddCard} className="rounded-2xl">
                <Plus className="mr-2 h-4 w-4" />
                Ajouter la carte
              </Button>

              <Separator />

              <div className="space-y-2">
                {selectedDeck.cards.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aucune carte. Ajoute-en 5 et lance une session.</div>
                ) : (
                  selectedDeck.cards.slice(0, 30).map((c) => (
                    <div key={c.id} className="rounded-2xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{c.front}</div>
                          <div className="text-xs text-muted-foreground">
                            Due: {c.dueAt ? new Date(c.dueAt).toLocaleDateString() : "—"} · Ease: {(c.ease ?? 2.5).toFixed(2)} · Reps: {c.repetitions ?? 0}
                          </div>
                        </div>
                        <Button variant="ghost" className="rounded-2xl" onClick={() => onDeleteCard(selectedDeck.id, c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkoutPanel({ workoutLog, onDeleteWorkout }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5" />
          Journal d'entraînement
        </CardTitle>
      </CardHeader>
      <CardContent>
        {workoutLog.length === 0 ? (
          <div className="text-sm text-muted-foreground">Log une séance depuis le Plan du jour.</div>
        ) : (
          <div className="space-y-3">
            {workoutLog.slice(0, 20).map((w) => (
              <div key={w.id} className="rounded-2xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">{w.date} · {w.target} · {humanTime(w.estMinutes)} · RPE {w.sessionRpe}</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {w.exercises.slice(0, 6).map((e, idx) => (
                        <div key={idx} className="rounded-xl bg-muted p-2 text-xs">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-muted-foreground">{e.sets}×{e.reps} · RPE {e.rpe}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" className="rounded-2xl" onClick={() => onDeleteWorkout(w.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsPanel({ profile, ttsSupported, onUpdate, onPing }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Réglages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Ton prénom</Label>
            <Input
              value={profile.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="(optionnel)"
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Objectif</Label>
            <Input
              value={profile.goal}
              onChange={(e) => onUpdate({ goal: e.target.value })}
              placeholder="Force, Endurance, etc."
              className="rounded-2xl"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Durée max révision post-séance</Label>
            <div className="text-sm font-medium">{humanTime(profile.maxStudyMinutes)}</div>
          </div>
          <Input
            type="range"
            min={10}
            max={60}
            step={5}
            value={profile.maxStudyMinutes}
            onChange={(e) => onUpdate({ maxStudyMinutes: Number(e.target.value) })}
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl border p-3">
          <div className="space-y-1">
            <div className="font-medium flex items-center gap-2"><Sparkles className="h-4 w-4" /> Blagues motivation</div>
            <div className="text-xs text-muted-foreground">Notifications fun après session / séance</div>
          </div>
          <Switch checked={profile.jokesEnabled} onCheckedChange={(v) => onUpdate({ jokesEnabled: v })} />
        </div>

        <div className="flex items-center justify-between rounded-2xl border p-3">
          <div className="space-y-1">
            <div className="font-medium flex items-center gap-2"><Volume2 className="h-4 w-4" /> Voix (TTS)</div>
            <div className="text-xs text-muted-foreground">Lecture audio (si supporté par ton navigateur)</div>
            {!ttsSupported && <div className="text-xs text-muted-foreground">Non supporté sur cet appareil.</div>}
          </div>
          <Switch disabled={!ttsSupported} checked={profile.voiceEnabled} onCheckedChange={(v) => onUpdate({ voiceEnabled: v })} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="rounded-2xl" onClick={onPing}>
            Tester notifications
          </Button>
        </div>

        <Separator />
        <div className="text-xs text-muted-foreground">
          Pour aller plus loin: login, import PDF→cartes, decks partagés par promo, mode oral (STT), stats SRS avancées.
        </div>
      </CardContent>
    </Card>
  );
}

function StudySessionModal({
  open,
  onClose,
  deck,
  card,
  idx,
  total,
  showBack,
  setShowBack,
  onGrade,
  voiceEnabled,
  ttsSupported,
  speak,
}) {
  const [micStatus, setMicStatus] = useState("idle");
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setMicStatus("idle");
    }
  }, [open]);

  const canMic = typeof window !== "undefined" && !!navigator?.mediaDevices?.getUserMedia;

  const toggleMic = async () => {
    // MVP: record only (no STT). Good hook for later.
    if (!canMic) return;

    if (micStatus === "recording") {
      try {
        mediaRecorderRef.current?.stop?.();
      } catch {
        // ignore
      }
      setMicStatus("idle");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = () => {};
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setMicStatus("recording");
    } catch {
      setMicStatus("blocked");
    }
  };

  if (!open) return null;

  const title = deck ? `Session — ${deck.name}` : "Session";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-background p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            <div className="text-sm text-muted-foreground">{total > 0 ? `Carte ${idx + 1}/${total}` : "Aucune carte due"}</div>
          </div>
          <Button variant="ghost" className="rounded-2xl" onClick={onClose}>Fermer</Button>
        </div>

        <Separator className="my-3" />

        {!card ? (
          <div className="rounded-3xl border p-6 text-sm text-muted-foreground">Ajoute des cartes ou reviens quand elles seront dues.</div>
        ) : (
          <>
            <div className="rounded-3xl border p-6">
              <div className="text-xs text-muted-foreground">Recto</div>
              <div className="mt-1 text-lg font-semibold">{card.front}</div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => {
                    setShowBack((v) => !v);
                    if (!showBack && voiceEnabled && ttsSupported) speak(card.back);
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {showBack ? "Cacher" : "Voir"} la réponse
                </Button>

                <Button
                  variant="ghost"
                  className="rounded-2xl"
                  disabled={!canMic}
                  onClick={toggleMic}
                >
                  <Mic className="mr-2 h-4 w-4" />
                  {micStatus === "recording" ? "Stop micro" : "Répondre à l'oral"}
                </Button>

                {!canMic && <span className="text-xs text-muted-foreground">Micro non dispo ici</span>}
                {micStatus === "blocked" && <span className="text-xs text-muted-foreground">Accès micro refusé</span>}
              </div>

              {showBack && (
                <div className="mt-4 rounded-2xl bg-muted p-4">
                  <div className="text-xs text-muted-foreground">Verso</div>
                  <div className="mt-1 text-sm">{card.back}</div>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <GradeButton label="Dur" hint="Je me suis planté" onClick={() => onGrade(2)} />
              <GradeButton label="Moyen" hint="Je m'en sors" onClick={() => onGrade(3)} />
              <GradeButton label="Bien" hint="OK" onClick={() => onGrade(4)} />
              <GradeButton label="Easy" hint="Trop facile" onClick={() => onGrade(5)} />
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Astuce: si séance lourde (RPE haut), privilégie le rappel actif (QCM/flashcards) plutôt que du nouveau cours.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GradeButton({ label, hint, onClick }) {
  return (
    <Button onClick={onClick} className="rounded-2xl" variant="secondary">
      <div className="flex flex-col items-start">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </Button>
  );
}
