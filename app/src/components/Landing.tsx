"use client";

import Link from "next/link";
import { SignIn } from "@/components/SignIn";
import {
  ArrowRightIcon,
  BoltIcon,
  ChatIcon,
  CheckIcon,
  EyeOffIcon,
  FingerprintIcon,
  HandIcon,
  KeyIcon,
  LinkIcon,
  RupeeIcon,
  ShieldIcon,
  UndoIcon,
  WalletIcon,
} from "@/components/icons";
import { Footer, GITHUB_URL, Logo } from "@/components/ui";
import { formatInr, formatUsd } from "@/lib/format";
import { useInrRate } from "@/lib/hooks";
import { useStats } from "@/lib/useStats";

const DEMO_AMOUNT = BigInt(25_000_000); // $25

const steps = [
  {
    icon: WalletIcon,
    title: "Add dollars",
    body: "Your balance stays in US dollars, held as AUSD, Agora's digital dollar.",
  },
  {
    icon: LinkIcon,
    title: "Create a link",
    body: "Type an amount, or just say it: “Papa ko 2 hazaar bhej do”. Share the link on WhatsApp.",
  },
  {
    icon: HandIcon,
    title: "They tap to collect",
    body: "Your family signs in with a fingerprint, phone or email and collects in seconds. Nothing to install.",
  },
];

const features = [
  {
    icon: BoltIcon,
    title: "Seconds, not days",
    body: "Built on Monad, so a payment settles about as fast as a message sends.",
  },
  {
    icon: FingerprintIcon,
    title: "Your fingerprint is the key",
    body: "Mera passkeys: no password, no seed phrase. The same passkey works on your other devices.",
  },
  {
    icon: RupeeIcon,
    title: "A fair, public rate",
    body: "The rupee rate comes from a Chainlink workflow that takes the median of three sources.",
  },
  {
    icon: ChatIcon,
    title: "Say it how you'd say it",
    body: "An assistant drafts the payment from Hindi, Hinglish or English. Nothing moves until you confirm.",
  },
  {
    icon: KeyIcon,
    title: "Lose your phone, lose nothing",
    body: "Signing in again with your passkey rebuilds every link you've sent, straight from the chain.",
  },
  {
    icon: WalletIcon,
    title: "No fees for your family",
    body: "Anvay pays the network fee when they collect, so the full amount arrives.",
  },
];

const security = [
  {
    icon: ShieldIcon,
    title: "Held by a verified contract",
    body: "Money waits in an open, verified escrow contract on Monad, not in a company account.",
  },
  {
    icon: EyeOffIcon,
    title: "The link key never reaches us",
    body: "The secret part of a link lives after the # in the URL. Browsers never send it to any server.",
  },
  {
    icon: KeyIcon,
    title: "Nobody can redirect it",
    body: "Each claim is signed for the recipient's own address, so not even our gas relayer can change where it goes.",
  },
  {
    icon: UndoIcon,
    title: "Changed your mind? Cancel",
    body: "Until it's collected, you can cancel a link and your dollars come straight back.",
  },
];

const stack = [
  { name: "Monad", role: "Fast, low-cost settlement" },
  { name: "Agora AUSD", role: "The digital dollar" },
  { name: "Chainlink CRE", role: "USD/INR rate on-chain" },
  { name: "Envio", role: "Indexes every link" },
  { name: "Mera", role: "Passkey accounts" },
  { name: "Privy", role: "Email and phone sign-in" },
  { name: "Qwen", role: "Hinglish assistant" },
];

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
      <span className="text-xs font-semibold tracking-widest text-accent uppercase">{eyebrow}</span>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {body && <p className="text-muted">{body}</p>}
    </div>
  );
}

/** A phone showing what the recipient sees: a chat message with an Anvay link. */
function PhoneMockup() {
  const inrPerUsd = useInrRate();
  return (
    <div className="animate-float relative mx-auto w-full max-w-[290px]">
      <div className="absolute -inset-6 rounded-[3rem] bg-accent opacity-15 blur-3xl" aria-hidden="true" />
      <div className="relative rounded-[2.5rem] border border-stone-700 bg-stone-900 p-2.5 shadow-2xl">
        <div className="overflow-hidden rounded-[2rem] bg-background">
          <div className="flex items-center gap-3 border-b border-border bg-card px-4 pt-6 pb-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              R
            </span>
            <div className="leading-tight">
              <p className="text-sm font-medium">Rahul</p>
              <p className="text-[11px] text-muted">online</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-3 py-4 text-[13px]">
            <p className="max-w-[80%] self-start rounded-2xl rounded-tl-sm bg-card px-3 py-2 shadow-soft">
              Papa, sent you this month&apos;s money
            </p>
            <div className="max-w-[88%] self-start overflow-hidden rounded-2xl rounded-tl-sm bg-card shadow-soft">
              <div className="hero-gradient flex flex-col gap-0.5 px-4 py-4">
                <span className="text-[11px] opacity-80">Someone sent you</span>
                <span className="text-3xl font-semibold tracking-tight">{formatUsd(DEMO_AMOUNT)}</span>
                <span className="text-xs opacity-90">
                  About {inrPerUsd ? formatInr(DEMO_AMOUNT, inrPerUsd) : "₹2,400"}
                </span>
              </div>
              <div className="px-3 py-2">
                <p className="font-medium">Anvay · Tap to collect</p>
                <p className="text-[11px] text-muted">anvay-pay.vercel.app</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 self-end rounded-2xl rounded-tr-sm bg-accent-soft px-3 py-2 text-accent">
              <CheckIcon className="h-4 w-4" />
              <span className="font-medium">Collected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveStrip() {
  const { stats } = useStats();
  const items = [
    { label: "Payment links sent", value: stats ? String(stats.links) : "…" },
    { label: "Dollars sent", value: stats ? formatUsd(BigInt(stats.volume)) : "…" },
    {
      label: "Links collected",
      value: stats ? (stats.links ? `${Math.round((stats.collected / stats.links) * 100)}%` : "–") : "…",
    },
    { label: "Today's rate, via Chainlink", value: stats?.rate ? `₹${stats.rate.inrPerUsd.toFixed(2)}` : "…" },
  ];
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live on Monad testnet, real usage only
        </span>
        <Link href="/stats" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          See all stats <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="text-3xl font-semibold tracking-tight tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The signed-out home page. */
export function Landing() {
  return (
    <div className="page-glow flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <header className="flex items-center justify-between py-5">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-muted hover:text-foreground sm:block">
              How it works
            </a>
            <a href="#security" className="hidden rounded-lg px-3 py-2 text-muted hover:text-foreground sm:block">
              Security
            </a>
            <Link href="/stats" className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
              Stats
            </Link>
            <a
              href="#start"
              className="ml-1 rounded-xl bg-accent px-4 py-2 font-medium text-accent-foreground hover:opacity-90"
            >
              Get started
            </a>
          </nav>
        </header>

        <main className="flex flex-col gap-24 pb-8 sm:gap-32">
          {/* Hero */}
          <section className="grid items-center gap-12 pt-8 sm:pt-14 lg:grid-cols-[1.15fr_1fr]">
            <div className="animate-rise flex flex-col gap-6">
              <span className="w-fit rounded-full border border-border bg-card px-3 py-1 text-xs text-muted shadow-soft">
                For Indians abroad and the families they support
              </span>
              <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
                Send dollars home <span className="text-accent">with a link.</span>
              </h1>
              <p className="max-w-xl text-lg text-muted">
                Type an amount, share the link on WhatsApp, and your family collects it in seconds. No bank details,
                no waiting days, no fees for them.
              </p>
              <div id="start" className="w-full max-w-sm scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-soft">
                <SignIn />
              </div>
            </div>
            <PhoneMockup />
          </section>

          <LiveStrip />

          {/* How it works */}
          <section id="how" className="flex scroll-mt-8 flex-col gap-12">
            <SectionHeading
              eyebrow="How it works"
              title="Three steps. About a minute."
              body="If you can send a WhatsApp message, you can send money with Anvay. So can the person receiving it."
            />
            <ol className="grid gap-4 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-soft">
                  <span className="absolute top-5 right-6 text-5xl font-semibold text-border">{i + 1}</span>
                  <span className="hero-gradient grid h-11 w-11 place-items-center rounded-xl">
                    <step.icon />
                  </span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Features */}
          <section className="flex flex-col gap-12">
            <SectionHeading eyebrow="Why Anvay" title="Built for the people at both ends." />
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <f.icon />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="text-sm text-muted">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Security */}
          <section
            id="security"
            className="hero-gradient flex scroll-mt-8 flex-col gap-10 rounded-3xl px-6 py-12 shadow-soft sm:px-12 sm:py-16"
          >
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="text-xs font-semibold tracking-widest uppercase opacity-80">Security</span>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Safe by design, not by promise.</h2>
              <p className="opacity-85">
                Anvay never holds your money and never sees the key to a link. Here is what keeps a payment safe.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {security.map((s) => (
                <div key={s.title} className="flex gap-4 rounded-2xl bg-white/10 p-5 ring-1 ring-white/15">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                    <s.icon />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold">{s.title}</h3>
                    <p className="text-sm opacity-85">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              Read the code and tests on GitHub <ArrowRightIcon className="h-4 w-4" />
            </a>
          </section>

          {/* Built with */}
          <section className="flex flex-col gap-10">
            <SectionHeading eyebrow="Built with" title="Open infrastructure, end to end." />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {stack.map((s) => (
                <li key={s.name} className="flex flex-col justify-center rounded-2xl border border-border bg-card px-3 py-4 text-center shadow-soft">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-xs text-muted">{s.role}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Final call to action */}
          <section className="flex flex-col items-center gap-5 text-center">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Try it now. It takes less than a minute.
            </h2>
            <p className="max-w-md text-muted">
              Anvay is in test mode: sign up and get $100 in test dollars to send to a friend.
            </p>
            <a
              href="#start"
              className="flex h-12 items-center gap-2 rounded-xl bg-accent px-6 font-medium text-accent-foreground shadow-soft hover:opacity-90"
            >
              Create your account <ArrowRightIcon className="h-4 w-4" />
            </a>
          </section>
        </main>

        <Footer />
        <div className="h-8" />
      </div>
    </div>
  );
}
