const TENANT_ID = "praktikum-kielregion";

const TYPE_MAP = {
  Artikel: "article",
  "Vorlage (PDF)": "template",
  Link: "link",
};

// Initial Infos-Beiträge — mirrors the click-dummy sample content so /infos has
// posts on first run (like the taxonomy seed). Idempotent: only seeded on insert.
const SAMPLE_POSTS = [
  {
    slug: "praktikumsknigge",
    title: "Praktikumsknigge: So machst du einen guten Eindruck",
    audience: "students",
    type: "Artikel",
    tags: ["Knigge", "Tipps"],
    date: "2026-05-20",
    excerpt:
      "Pünktlichkeit, Neugier, Ehrlichkeit – die wichtigsten Verhaltensregeln für dein Praktikum.",
    body: [
      "Sei pünktlich und melde dich, wenn mal etwas dazwischenkommt.",
      "Bleib neugierig – frag nach, wenn du etwas nicht verstehst.",
      "Sei ehrlich zu dir selbst: Was gefällt dir, was nicht? Genau das findest du im Praktikum heraus.",
      "Zeig Eigeninitiative, pack mit an und lass das Handy in der Tasche.",
    ],
  },
  {
    slug: "welche-fragen-stellen",
    title: "Welche Fragen kannst du im Praktikum stellen?",
    audience: "students",
    type: "Artikel",
    tags: ["Tipps"],
    date: "2026-05-22",
    excerpt: "Gute Fragen zeigen Interesse – hier ein paar, die immer passen.",
    body: [
      "Wie sieht ein typischer Arbeitstag aus?",
      "Welche Aufgaben darf ich selbst übernehmen?",
      "Was sollte ich für den Beruf mitbringen?",
      "Gibt es die Möglichkeit einer Ausbildung danach?",
    ],
  },
  {
    slug: "muster-bewerbung",
    title: "Muster-Bewerbung (Vorlage)",
    audience: "students",
    type: "Vorlage (PDF)",
    tags: ["Vorlage"],
    date: "2026-04-10",
    excerpt:
      "Eine einfache Vorlage für deine Praktikumsbewerbung zum Herunterladen.",
    body: ["Lade die Vorlage herunter und passe sie an."],
  },
  {
    slug: "gutes-angebot-erstellen",
    title: "Ein gutes Praktikumsangebot erstellen",
    audience: "companies",
    type: "Artikel",
    tags: ["Tipps"],
    date: "2026-05-18",
    excerpt:
      "Wenige Pflichtfelder, klare Aufgaben, ein Foto – so wird euer Angebot sichtbar.",
    body: [
      "Beschreibe konkret, was Praktikant*innen bei euch erwartet.",
      "Nenne realistische Anforderungen – nicht zu viele.",
      "Bietet eine*n feste*n Ansprechpartner*in an und haltet das Angebot aktuell.",
    ],
  },
  {
    slug: "preboarding-leitfaden",
    title: "Preboarding & Begleitung",
    audience: "companies",
    type: "Artikel",
    tags: ["Preboarding", "Tipps"],
    date: "2026-05-12",
    excerpt:
      "So sorgt ihr für einen gelungenen ersten Tag und eine gute Betreuung.",
    body: [
      "Schickt vorab eine Begrüßungsmail mit dem Ablauf des ersten Tages.",
      "Bereitet Ansprechperson und Arbeitsplatz vor.",
      "Plant kleine Aufgaben mit echtem Bezug und ein Abschlussgespräch.",
    ],
  },
  {
    slug: "muster-praktikumsvertrag",
    title: "Muster-Praktikumsvertrag",
    audience: "companies",
    type: "Vorlage (PDF)",
    tags: ["Vorlage", "Recht"],
    date: "2026-04-05",
    excerpt: "Rechtssichere Vorlage für einen Praktikumsvertrag zum Anpassen.",
    body: ["Lade die Vorlage herunter und passt sie an eure Bedürfnisse an."],
  },
];

function toContentHtml(body) {
  return body
    .map(
      (p) =>
        `<p>${String(p)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</p>`,
    )
    .join("");
}

function publishedAtMs(date) {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

module.exports = {
  name: "09-07-2026-seed-posts",

  up: async function () {
    const Post = require("../../src/commons/data-managers/models/postModel");
    const now = Date.now();
    for (const post of SAMPLE_POSTS) {
      const id = `post-${post.slug}`;
      await Post.updateOne(
        { id, tenantId: TENANT_ID },
        {
          $setOnInsert: {
            id,
            tenantId: TENANT_ID,
            slug: post.slug,
            title: post.title,
            audience: post.audience,
            type: TYPE_MAP[post.type] || "article",
            tags: post.tags || [],
            excerpt: post.excerpt || "",
            contentHtml: toContentHtml(post.body || []),
            url: "",
            thumbnailUrl: "",
            attachments: [],
            published: true,
            companyDashboardOnly: false,
            publishedAt: publishedAtMs(post.date),
            created: now,
            updated: now,
          },
        },
        { upsert: true },
      );
    }
  },

  down: async function () {
    const Post = require("../../src/commons/data-managers/models/postModel");
    await Post.deleteMany({ tenantId: TENANT_ID });
  },
};
