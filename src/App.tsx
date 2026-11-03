import { Planner, ContentManager } from "./pages/planner";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  Check,
  ChevronDown,
  CircleHelp,
  Globe2,
  LayoutDashboard,
  LogOut,
  Moon,
  ShoppingBasket,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type {
  DailyEntry,
  HouseholdState,
  Language,
  MealType,
  Proposal,
  Repository,
  Tab,
} from "./domain/types";
import { dayAt, deviceZone, formatDay, localDay } from "./domain/dates";
import { targetOn } from "./domain/state";
import { errorMessage, translator } from "./lib/i18n";
import {
  PreviewRepository,
  previewAvailable,
  supabase,
  SupabaseRepository,
} from "./lib/repository";
import type { Recipe } from "./lib/content";
import { Button, Modal } from "./components/ui";
import {
  BudgetForm,
  LogForm,
  ProfileForm,
  TargetReview,
} from "./components/forms";
import {
  Dashboard,
  Menu,
  ProfileView,
  RecipeDetail,
  Recipes,
  Shopping,
  type ViewProps,
} from "./pages/views";

type Dialog =
  | { kind: "maintenance" }
  | { kind: "profile" }
  | { kind: "target"; proposal: Proposal }
  | { kind: "log"; entryKind: DailyEntry["kind"]; entry?: DailyEntry }
  | { kind: "budget"; day: string }
  | { kind: "recipe"; recipe: Recipe }
  | { kind: "invite" }
  | {
      kind: "confirm";
      title: string;
      description: string;
      action: () => Promise<void>;
      reload?: boolean;
      after?: () => Promise<void>;
    };
const navigation = [
  { id: "dashboard", en: "Overview", es: "Inicio", icon: LayoutDashboard },
  { id: "menu", en: "Menu", es: "Menú", icon: CalendarDays },
  { id: "shopping", en: "Shopping", es: "Compra", icon: ShoppingBasket },
  { id: "recipes", en: "Recipes", es: "Recetas", icon: ChefHat },
  { id: "profile", en: "Profile", es: "Perfil", icon: UserRound },
] as const;

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [checking, setChecking] = useState(!!supabase),
    [preview, setPreview] = useState(false),
    [authError, setAuthError] = useState("");
  const [language, setLanguage] = useState<Language>("en"),
    [theme, setTheme] = useState(
      () =>
        localStorage.getItem("week-menu-theme") ??
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("week-menu-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (alive) {
        setSession(data.session);
        setChecking(false);
        if (error) setAuthError(errorMessage(error, language));
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setChecking(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const t = translator(language);
  const auth = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setAuthError(errorMessage(error, language));
  };
  const repoRef = useRef<{ key: string; repo: Repository } | null>(null),
    identity = preview ? "preview" : session?.user.id;
  if (identity && repoRef.current?.key !== identity)
    repoRef.current = {
      key: identity,
      repo: preview
        ? new PreviewRepository(deviceZone())
        : new SupabaseRepository(supabase!),
    };
  if (!identity) repoRef.current = null;
  if (checking)
    return (
      <div className="loading-screen">
        <span className="brand-mark">w.</span>
        <p>{t("Setting the table…", "Preparando la mesa…")}</p>
      </div>
    );
  if (identity && repoRef.current)
    return (
      <Workspace
        key={identity}
        repository={repoRef.current.repo}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        setTheme={setTheme}
        onExit={() => {
          setPreview(false);
          setSession(null);
          repoRef.current = null;
        }}
      />
    );
  return (
    <div className="welcome">
      <header>
        <a className="brand" href="#">
          <span className="brand-mark">w.</span>
          <span>
            week<span className="brand-light">menu</span>
          </span>
        </a>
        <div className="button-row">
          <button
            className="icon-button"
            aria-label={t("Switch language", "Cambiar idioma")}
            onClick={() => setLanguage(language === "en" ? "es" : "en")}
          >
            <Globe2 size={19} />
            <span>{language.toUpperCase()}</span>
          </button>
          <button
            className="icon-button"
            aria-label={t("Switch theme", "Cambiar tema")}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>
      <main className="welcome-main">
        <div className="welcome-copy">
          <span className="eyebrow">
            {t("A seat for everyone", "Un sitio para todos")}
          </span>
          <h1>
            {t("Good food.", "Buena comida.")}
            <br />
            {t("A little less", "Menos")}
            <br />
            <span>{t("deciding.", "decisiones.")}</span>
          </h1>
          <p>
            {t(
              "Bring your household’s meals, personal goals and everyday planning to one table.",
              "Reúne las comidas de tu hogar, los objetivos personales y la planificación del día a día en una misma mesa.",
            )}
          </p>
          {supabase ? (
            <Button onClick={auth}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.3 2.9-7.4ZM12 22c2.7 0 5-.9 6.7-2.4L15.4 17c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H2.9v2.7A10 10 0 0 0 12 22ZM6.3 13.7a6 6 0 0 1 0-3.4V7.6H2.9a10 10 0 0 0 0 8.8l3.4-2.7ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.1 5.6l3.4 2.7A6 6 0 0 1 12 6.1Z"
                />
              </svg>
              {t("Continue with Google", "Continuar con Google")}
              <ArrowRight size={17} />
            </Button>
          ) : (
            <p className="setup-hint">
              {t(
                "Your household is not connected yet.",
                "Tu hogar aún no está conectado.",
              )}
            </p>
          )}
          {previewAvailable && (
            <Button secondary onClick={() => setPreview(true)}>
              {t("Explore the preview", "Explorar la vista previa")}
              <ArrowRight size={17} />
            </Button>
          )}
          {authError && (
            <p role="alert" className="inline-error">
              {authError}
            </p>
          )}
          <span className="welcome-invite">
            <Users size={15} />
            {t(
              "A private space. Approved household members only.",
              "Un espacio privado. Solo miembros del hogar aprobados.",
            )}
          </span>
        </div>
        <div className="welcome-visual" aria-hidden="true">
          <div className="visual-top">
            <span>WEEK / 01</span>
            <span>LESS IS MORE.</span>
          </div>
          <div className="plate">
            <div className="plate-inner">
              <ChefHat strokeWidth={0.8} size={90} />
            </div>
          </div>
          <div className="visual-bottom">
            <div>
              <span>{t("THE PLAN", "EL PLAN")}</span>
              <strong>
                {t("Together,", "Juntos,")}
                <br />
                {t("at your own pace.", "a vuestro ritmo.")}
              </strong>
            </div>
            <span className="visual-spark">✳</span>
          </div>
        </div>
      </main>
      <footer>
        {t(
          "Thoughtful meals. Shared simply.",
          "Comidas pensadas. Compartidas sin complicaciones.",
        )}
        <span>
          {t(
            "English & Español · Designed for everyday life",
            "English y Español · Para el día a día",
          )}
        </span>
      </footer>
    </div>
  );
}

function Workspace({
  repository: repo,
  language,
  setLanguage,
  theme,
  setTheme,
  onExit,
}: {
  repository: Repository;
  language: Language;
  setLanguage: (l: Language) => void;
  theme: string;
  setTheme: (t: string) => void;
  onExit: () => void;
}) {
  const [s, setS] = useState<HouseholdState | null>(null),
    [fatal, setFatal] = useState(""),
    [tab, setTab] = useState<Tab>("dashboard"),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [inviteEmail, setInviteEmail] = useState("");
  const mounted = useRef(true),
    sequence = useRef(0),
    languageRef = useRef(language),
    busyRef = useRef(false);
  languageRef.current = language;
  const t = translator(language);
  const refresh = useCallback(async () => {
    const n = ++sequence.current;
    let next: HouseholdState;
    try {
      next = await repo.load(deviceZone());
    } catch (e) {
      if (
        e instanceof Error &&
        /access_denied|google_identity_required/.test(e.message)
      ) {
        setS(null);
        setDialog(null);
        setFatal(errorMessage(e, languageRef.current));
      }
      throw e;
    }
    if (mounted.current && n === sequence.current) {
      setS(next);
      setSelected((id) =>
        next.members.some((m) => m.id === id) ? id : next.viewer_id,
      );
    }
    return next;
  }, [repo]);
  useEffect(() => {
    mounted.current = true;
    refresh()
      .then((next) => {
        const lang = next.members.find((m) => m.id === next.viewer_id)?.profile
          ?.language;
        if (lang) setLanguage(lang);
      })
      .catch((e) => setFatal(errorMessage(e, languageRef.current)));
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible")
        refresh().catch((e) =>
          setMessage({
            text: errorMessage(e, languageRef.current),
            error: true,
          }),
        );
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 60000);
    const channel =
      repo.mode === "supabase" && supabase
        ? supabase
            .channel("household-changes")
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "household_revision",
              },
              () => {
                refresh().catch(() => {});
              },
            )
            .subscribe()
        : null;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [refresh, repo]);
  useEffect(() => {
    const preference = s?.members.find((m) => m.id === s.viewer_id)?.profile
      ?.language;
    if (preference) setLanguage(preference);
  }, [s, setLanguage]);
  useEffect(() => {
    if (!message || message.error) return;
    const timeout = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [message]);
  const operate = async (
    task: () => Promise<void>,
    success?: string,
    load = true,
  ) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
      if (load) await refresh();
      if (success) setMessage({ text: success, error: false });
      return true;
    } catch (e) {
      setMessage({ text: errorMessage(e, language), error: true });
      if (
        e instanceof Error &&
        /stale_profile|stale_content|stale_plan/.test(e.message)
      )
        await refresh().catch(() => {});
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const signOut = async () => {
    if (await operate(() => repo.signOut(), undefined, false)) {
      setS(null);
      onExit();
    }
  };
  if (fatal)
    return (
      <div className="loading-screen">
        <span className="brand-mark">w.</span>
        <h1>{t("A private table", "Una mesa privada")}</h1>
        <p role="alert">{fatal}</p>
        <Button onClick={signOut} busy={busy}>
          {t("Back to sign-in", "Volver a iniciar sesión")}
        </Button>
      </div>
    );
  if (!s)
    return (
      <div className="loading-screen">
        <span className="brand-mark">w.</span>
        <p>{t("Setting the table…", "Preparando la mesa…")}</p>
      </div>
    );
  const me = s.members.find((m) => m.id === s.viewer_id)!,
    member = s.members.find((m) => m.id === selected) ?? me,
    own = member.id === me.id,
    day = dayAt(s.server_now, member.time_zone),
    target = targetOn(s, member.id, day);
  const offerReview = async () => {
    let next: Dialog | undefined;
    if (
      await operate(async () => {
        try {
          next = { kind: "target", proposal: await repo.proposal() };
        } catch (e) {
          if (e instanceof Error && e.message.includes("goal_reached"))
            next = { kind: "maintenance" };
          else throw e;
        }
      })
    )
      setDialog(next!);
  };
  const openTarget = () => {
    if (own) void offerReview();
  };
  const navigate = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };
  const v: ViewProps = {
    repository: repo,
    operate,
    s,
    member,
    language,
    own,
    target,
    day,
    openLog: (entryKind, entry) => {
      if (own) setDialog({ kind: "log", entryKind, entry });
    },
    openProfile: () => {
      if (own) setDialog({ kind: "profile" });
    },
    openTarget,
    openBudget: (date = day) => {
      if (own) setDialog({ kind: "budget", day: date });
    },
    openRecipe: (recipe) => setDialog({ kind: "recipe", recipe }),
    deleteEntry: (e) =>
      setDialog({
        kind: "confirm",
        title: t("Delete this entry?", "¿Eliminar este registro?"),
        description: t(
          "This entry will be removed from today. Past records stay locked.",
          "Este registro se eliminará de hoy. Los registros pasados se mantienen cerrados.",
        ),
        action: () => repo.deleteEntry(e.id),
        after: e.kind === "weight" ? offerReview : undefined,
      }),
    navigate,
    busy,
    preview: repo.mode === "preview",
  };
  const confirm = (
    title: string,
    description: string,
    action: () => Promise<void>,
    reload = true,
  ) => setDialog({ kind: "confirm", title, description, action, reload });
  const modalTitle =
    dialog?.kind === "maintenance"
      ? t("You reached your goal", "Has alcanzado tu objetivo")
      : dialog?.kind === "profile"
        ? t("Your personal profile", "Tu perfil personal")
        : dialog?.kind === "target"
          ? t("Review your calorie target", "Revisa tu objetivo calórico")
          : dialog?.kind === "budget"
            ? t("One meal, a different budget", "Una comida, otro presupuesto")
            : dialog?.kind === "recipe"
              ? dialog.recipe.name[language]
              : dialog?.kind === "invite"
                ? t("Invite someone to the table", "Invita a alguien a la mesa")
                : dialog?.kind === "confirm"
                  ? dialog.title
                  : dialog?.kind === "log"
                    ? dialog.entryKind === "food"
                      ? t("Log extra food", "Registrar comida adicional")
                      : dialog.entryKind === "weight"
                        ? t(
                            "A new weight check-in",
                            "Un nuevo registro de peso",
                          )
                        : t(
                            "Log today’s activity",
                            "Registrar actividad de hoy",
                          )
                    : "";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("Skip to content", "Ir al contenido")}
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-mark">w.</span>
          <span>
            week<span className="brand-light">menu</span>
          </span>
        </a>
        <div className="household-badge">
          <span className="household-icon">
            <Users size={17} />
          </span>
          <div>
            <b>{t("Our household", "Nuestro hogar")}</b>
            <span>
              {s.members.filter((m) => m.status === "active").length}{" "}
              {t("people, one table", "personas, una mesa")}
            </span>
          </div>
        </div>
        <span className="nav-eyebrow">{t("YOUR SPACE", "TU ESPACIO")}</span>
        <nav aria-label={t("Main navigation", "Navegación principal")}>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "nav-item active" : "nav-item"}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} strokeWidth={1.7} />
              <span>{n[language]}</span>
              {tab === n.id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <CircleHelp size={18} />
            <p>
              {t(
                "A little planning. A lot more room for life.",
                "Un poco de planificación. Más espacio para vivir.",
              )}
            </p>
          </div>
          <button
            className="signout"
            onClick={() =>
              confirm(
                t("Sign out?", "¿Cerrar sesión?"),
                t(
                  "Cached household information will be cleared from this session.",
                  "Se borrará la información del hogar de esta sesión.",
                ),
                async () => {
                  await repo.signOut();
                  setS(null);
                  onExit();
                },
                false,
              )
            }
          >
            <LogOut size={17} />
            {repo.mode === "preview"
              ? t("Exit preview", "Salir de vista previa")
              : t("Sign out", "Cerrar sesión")}
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{t("Our household", "Nuestro hogar")}</span>
            <span>/</span>
            <b>{navigation.find((n) => n.id === tab)?.[language]}</b>
          </div>
          <a
            className="mobile-brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("dashboard");
            }}
          >
            w.
          </a>
          <div className="topbar-tools">
            <span className="today-label">
              {formatDay(dayAt(s.server_now, me.time_zone), language, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-button"
              aria-label={t("Switch language", "Cambiar idioma")}
              onClick={async () => {
                const next = language === "en" ? "es" : "en";
                if (me.profile) {
                  if (
                    await operate(() =>
                      repo.saveProfile(
                        { ...me.profile!, language: next },
                        me.revision,
                      ),
                    )
                  )
                    setLanguage(next);
                } else setLanguage(next);
              }}
              disabled={busy}
            >
              <span className="language-label">{language.toUpperCase()}</span>
            </button>
            <button
              className="icon-button"
              aria-label={t("Switch theme", "Cambiar tema")}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="topbar-divider" />
            <span className="avatar small">{me.name.charAt(0)}</span>
          </div>
        </header>
        {repo.mode === "preview" && (
          <div className="preview-banner">
            <span>
              <span className="status-dot" />
              {t("PREVIEW", "VISTA PREVIA")}
              <span className="preview-description">
                {" "}
                ·{" "}
                {t(
                  "Sample household. Changes last for this session only.",
                  "Hogar de ejemplo. Los cambios solo duran esta sesión.",
                )}
              </span>
            </span>
            <button onClick={signOut}>
              {t("Exit", "Salir")}
              <X size={13} />
            </button>
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <div className="member-selector-row">
            <span className="eyebrow">{t("AT A GLANCE", "DE UN VISTAZO")}</span>
            <label className="member-select">
              <Users size={16} />
              <span className="sr-only">
                {t("View household member", "Ver miembro del hogar")}
              </span>
              <select
                value={member.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {s.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === me.id ? t(" (you)", " (tú)") : ""}
                    {m.status === "removed"
                      ? t(" · former member", " · antiguo miembro")
                      : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          {!own && (
            <div className="viewing-notice">
              <Users size={15} />
              {t(
                `Viewing ${member.name}’s shared details. Personal changes are limited to your own profile.`,
                `Viendo los datos compartidos de ${member.name}. Solo puedes modificar tu propio perfil.`,
              )}
            </div>
          )}
          {tab === "dashboard" ? (
            <Dashboard {...v} />
          ) : tab === "menu" ? (
            <Planner {...v} />
          ) : tab === "shopping" ? (
            <Shopping {...v} />
          ) : tab === "recipes" ? (
            <ContentManager {...v} />
          ) : (
            <ProfileView
              {...v}
              openInvite={() => {
                setInviteEmail("");
                setDialog({ kind: "invite" });
              }}
              removeMember={(id) =>
                confirm(
                  t("Remove this member?", "¿Eliminar este miembro?"),
                  t(
                    "Their future entries will be removed. Historical records stay in household history.",
                    "Se eliminarán sus registros futuros. Los registros anteriores se conservarán en el historial del hogar.",
                  ),
                  () => repo.remove(id),
                )
              }
              transfer={(id) =>
                confirm(
                  t("Transfer ownership?", "¿Transferir la propiedad?"),
                  t(
                    "This member will manage invitations and removals. You will become a regular member.",
                    "Este miembro gestionará invitaciones y eliminaciones. Pasarás a ser un miembro normal.",
                  ),
                  () => repo.transfer(id),
                )
              }
              leave={() =>
                confirm(
                  t("Leave this household?", "¿Salir de este hogar?"),
                  t(
                    "You will lose access. Your historical records will remain in household history.",
                    "Perderás el acceso. Tus registros anteriores se conservarán en el historial del hogar.",
                  ),
                  async () => {
                    await repo.leave();
                    await repo.signOut();
                    setS(null);
                    onExit();
                  },
                  false,
                )
              }
            />
          )}
          <footer className="app-footer">
            <span>
              weekmenu<span className="footer-dot"> / </span>
              {t("A little less deciding.", "Menos decisiones.")}
            </span>
            <span>
              {t(
                "Estimates, for everyday planning.",
                "Estimaciones para el día a día.",
              )}
            </span>
          </footer>
        </main>
      </div>
      <nav
        className="bottom-nav"
        aria-label={t("Mobile navigation", "Navegación móvil")}
      >
        {navigation.map((n) => (
          <button
            key={n.id}
            aria-current={tab === n.id ? "page" : undefined}
            className={tab === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} strokeWidth={tab === n.id ? 2 : 1.5} />
            <span>{n[language]}</span>
          </button>
        ))}
      </nav>
      {message && (
        <div
          className={`toast ${message.error ? "error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          {message.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{message.text}</span>
          <button
            className="icon-button"
            aria-label={t("Dismiss notification", "Cerrar aviso")}
            onClick={() => setMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={modalTitle}
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          wide={dialog.kind === "recipe" || dialog.kind === "profile"}
        >
          {dialog.kind === "maintenance" && (
            <>
              <p className="form-intro">
                {t(
                  "Your current weight has reached or passed your goal. We can propose a maintenance target. You will review it and all three meal budgets before accepting.",
                  "Tu peso actual ha alcanzado o superado el objetivo. Podemos proponerte un objetivo de mantenimiento. Lo revisarás junto con los tres presupuestos antes de aceptarlo.",
                )}
              </p>
              <Button
                busy={busy}
                onClick={async () => {
                  if (
                    me.profile &&
                    (await operate(() =>
                      repo.saveProfile(
                        {
                          ...me.profile!,
                          goal: "maintain",
                          target_weight_kg: null,
                          target_date: null,
                        },
                        me.revision,
                      ),
                    ))
                  )
                    await offerReview();
                }}
              >
                {t(
                  "Review maintenance target",
                  "Revisar objetivo de mantenimiento",
                )}
                <ArrowRight size={16} />
              </Button>
            </>
          )}
          {dialog.kind === "profile" && (
            <ProfileForm
              key={me.revision}
              member={me}
              catalogue={s.planning?.ingredients}
              today={dayAt(s.server_now, me.time_zone)}
              language={language}
              busy={busy}
              onSave={async (p) => {
                if (
                  await operate(
                    () => repo.saveProfile(p, me.revision),
                    t(
                      "Profile saved. Review your proposed target.",
                      "Perfil guardado. Revisa tu objetivo propuesto.",
                    ),
                  )
                ) {
                  setLanguage(p.language);
                  await offerReview();
                }
              }}
            />
          )}
          {dialog.kind === "target" && (
            <TargetReview
              language={language}
              busy={busy}
              proposal={dialog.proposal}
              current={
                targetOn(s, me.id, dayAt(s.server_now, me.time_zone))
                  ?.budgets ?? null
              }
              onAccept={async (b) => {
                if (
                  await operate(
                    () =>
                      repo.acceptTarget(b, dialog.proposal.context_revision!),
                    t(
                      "Target accepted. Your three meal budgets are saved.",
                      "Objetivo aceptado. Se han guardado los tres presupuestos.",
                    ),
                  )
                )
                  setDialog(null);
              }}
            />
          )}
          {dialog.kind === "log" && (
            <LogForm
              member={me}
              state={s}
              kind={dialog.entryKind}
              entry={dialog.entry}
              language={language}
              busy={busy}
              onSave={async (e) => {
                if (
                  await operate(
                    () => repo.saveEntry(e),
                    t("Entry saved.", "Registro guardado."),
                  )
                ) {
                  setDialog(null);
                  if (e.kind === "weight") await offerReview();
                }
              }}
            />
          )}
          {dialog.kind === "budget" && (
            <BudgetForm
              initialDay={dialog.day}
              member={me}
              state={s}
              language={language}
              busy={busy}
              onSave={async (day, meal, kcal) => {
                if (
                  await operate(
                    () => repo.saveBudgetOverride(day, meal, kcal),
                    t(
                      "Meal budget updated. Review existing portions manually.",
                      "Presupuesto actualizado. Revisa las porciones existentes manualmente.",
                    ),
                  )
                )
                  setDialog(null);
              }}
            />
          )}
          {dialog.kind === "recipe" && (
            <RecipeDetail recipe={dialog.recipe} language={language} />
          )}
          {dialog.kind === "confirm" && (
            <>
              <p className="form-intro">{dialog.description}</p>
              <div className="button-row">
                <Button
                  busy={busy}
                  onClick={async () => {
                    if (
                      await operate(
                        dialog.action,
                        t("Done.", "Hecho."),
                        dialog.reload !== false,
                      )
                    ) {
                      setDialog(null);
                      if (dialog.after) await dialog.after();
                    }
                  }}
                >
                  {t("Confirm", "Confirmar")}
                </Button>
                <Button
                  secondary
                  disabled={busy}
                  onClick={() => setDialog(null)}
                >
                  {t("Cancel", "Cancelar")}
                </Button>
              </div>
            </>
          )}
          {dialog.kind === "invite" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await operate(
                    () => repo.invite(inviteEmail),
                    t(
                      "Email approved. Share the app’s address with your invitee.",
                      "Correo aprobado. Comparte la dirección de la app con la persona invitada.",
                    ),
                  )
                )
                  setDialog(null);
              }}
            >
              <p className="form-intro">
                {t(
                  "Approve the exact email address they use with Google. They can then sign in at this app’s address. No invitation email is sent.",
                  "Aprueba la dirección exacta que usa con Google. Después podrá iniciar sesión en esta app. No se envía correo de invitación.",
                )}
              </p>
              <label>
                {t("Google email address", "Correo de Google")}
                <input
                  autoFocus
                  required
                  type="email"
                  autoComplete="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <Button busy={busy} type="submit">
                {t("Approve invitation", "Aprobar invitación")}
                <ArrowRight size={17} />
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
