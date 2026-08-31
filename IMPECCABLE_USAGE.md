# Impeccable -- Full Usage Guide for `my-Ai` (v7.0.0)

> **Update:** Have manual command na j nahi, `my-Ai` no potano autonomous
> agent (`autonomous-loop-agent-v7-free.js`) pan potej Impeccable use kare
> che -- `design_audit` native tool + automatic guidance injection. Detail
> `CHANGES.md` section 7 ma. Aa file (niche) `/impeccable` slash commands
> mate che -- jyare tame Claude Code thi j my-Ai na code par kaam karo tyare.

Recheck kari lidhu -- installation **fully self-contained** che. `npx impeccable
<command>` badha ma nathi jarur (fakt 2-3 optional CLI commands mate) --
badha main design commands direct `node .claude/skills/impeccable/scripts/*.mjs`
thi j chale che, koi extra `npm install` ni jarur nathi. Ek j requirement:
**Node 22+ PATH ma hovu joie** (tamara sandbox ma v22.22.2 mali gayu, so barabar che).

---

## 1. Automatic part -- kai j karvani jarur nathi

`.claude/settings.json` ma 2 hooks already wire thai gaya che:

- **Dar edit/write pachi** (`public/index.html`, `style.css`, `app.js`,
  `gesture-tracker.js`, `voice-engine.js`, `ultron-core.js` -- koi pan UI
  file): immediate design check chale, ~5 second budget.
- **Session Stop thay tyare**: deep full-rule pass chale (~30 sec budget).

Aa automatically chalu thai jashe have tame Claude Code ma `public/` folder
ni koi file edit karso -- tame kai command nathi type karvano.

---

## 2. Direct commands -- `/impeccable <command> <target>`

Claude Code ma type karo, e.g.:

```
/impeccable audit public
/impeccable polish public/index.html
```

### Design quality (audit/critique)
| Command | Su kare che |
|---|---|
| **audit** | Technical/measurable check -- a11y, performance, responsive, code-level issues. Fix nathi karto, report j generate kare. |
| **critique** | 2 independent AI assessment lai ne design critique synthesize kare, snapshot save kare, next step puche. |
| **doctor** | Tamara PRODUCT.md/DESIGN.md/hook config vachche drift check + repair kare -- maintenance, design nahi. |

### Visual/emotional adjustments (existing surface par)
| Command | Su kare che |
|---|---|
| **polish** | Refinement -- incumbent design world preserve kari ne j sudharo, redesign nahi. |
| **bolder** | Ek section ne bold banave, baki untouched rakhi ne. |
| **quieter** | Visual intensity ghatade, personality gumavya vagar (bold thi vadhare hard che). |
| **colorize** | Color ne hierarchy/meaning mate use kare, brand convention preserve kari ne. |
| **delight** | Ek moment ne memorable banave -- generic whimsy nahi, real product character. |
| **animate** | Motion thi state/hierarchy/relationship explain kare -- purpose vagar decoration nahi. |
| **layout** | Reading order, grouping, rhythm sudhare -- pehla structural problem diagnose kare. |
| **typeset** | Typography (hierarchy, voice) sudhare, existing identity ni andar j. |
| **overdrive** | Ambitious visual effects, technically extraordinary feel mate. |

### Content & structure
| Command | Su kare che |
|---|---|
| **clarify** | Unclear UI text ne rewrite kare -- factual meaning/brand voice preserve kari ne. |
| **distill** | Design ne essence sudhi strip kare -- redundant/decorative noise hatave. |
| **extract** | Reusable patterns/components/tokens ne design system ma consolidate kare. |
| **harden** | Real-world edge cases (bad data, errors, slow network, i18n) sathe UI ne robust banave. |
| **onboard** | Users ne fastest "aha moment" sudhi pahonchade. |
| **optimize** | Actual performance bottleneck fix kare (measure-first, guess nahi). |
| **adapt** | Design ne bija screen size/device/platform mate rethink kare (fakt scale nahi). |

### Setup & documentation
| Command | Su kare che |
|---|---|
| **init** | `PRODUCT.md` banave -- product truth (users, mechanism, constraints). **Pehla aa chalavo.** |
| **shape** | Design brief confirm kare (code vagar) -- su banavvu ane kevi rite kaam karvu joie. |
| **document** | `DESIGN.md` banave -- current visual system (tokens/colors/type) capture kare, jethi future AI-generated screens on-brand rahe. |
| **live** | Browser ma element select kari ne, AI-generated HTML/CSS variant hot-swap kare (HMR sathe). Live dev server jarur che. |

---

## 3. Tamara `my-Ai` mate specific recommended flow

Tamaru `public/` folder ma UI already che (`index.html`, `style.css`,
`app.js`, `gesture-tracker.js`, `voice-engine.js`, `ultron-core.js`) -- flow:

```bash
# Step 1: ek j vaar -- product context capture karo
/impeccable init

# Step 2: current UI ne audit karo (technical issues)
/impeccable audit public

# Step 3: design ni current state document karo (future consistency mate)
/impeccable document

# Step 4: pachi je jarur hoy -- polish, bolder, harden, optimize, etc.
/impeccable polish public/index.html
```

**Live mode mate** (browser ma direct click-to-edit):
```bash
npm run ultron:server        # tamaru express server, http://localhost:3000 par public/ serve kare
```
Server chalu hoy pachi:
```
/impeccable live public
```
(`live.md` na Prerequisites section pramane, running dev server jarur che --
tamaru `ultron:server` script j exact fit che.)

---

## 4. Automatic review agents (`.claude/agents/`)

Aa 4 agents Claude Code potej invoke kare che, jyare relevant hoy -- tamare
manually call karvani jarur nathi:

- **impeccable-finish-reviewer** -- kaam complete thaya pachi final quality check.
- **impeccable-documenter** -- DESIGN.md/PRODUCT.md update rakhva.
- **impeccable-asset-producer** -- images/assets jarur padta hoy tyare generate.
- **impeccable-manual-edit-applier** -- live mode ma manual edits ne apply kare.

---

## 5. Optional -- `npx impeccable` (fakt aa 3 kaam mate jarur)

Direct commands (upar na table) mate kai jarur nathi. `npx impeccable` fakt
aa optional maintenance kaamo mate che (internet + npm registry access jarur):

- `npx impeccable update` -- skill ni navi version check/apply kare.
- `npx impeccable detect <path>` -- manual raw detector scan, project config bypass kari ne.
- `npx impeccable ignores ...` -- specific detector rule ne ignore karva mate CRUD.

---

## 6. Re-check summary -- shu verify karyu

- ✅ `.claude/skills/impeccable/` na badha 100+ files source zip sathe byte-diff
  karya -- kai j missing nathi (fakt LICENSE/NOTICE.md, je mein attribution
  mate intentionally add karya).
- ✅ Hook scripts (`hook.mjs` etc.) koi external npm package (playwright/sharp)
  import nathi karta -- fully self-contained, `npm install` ni jarur nathi.
- ✅ `npx impeccable *` sirf 3 optional/manual commands mate use thay che, core
  workflow mate nahi.
- ✅ Node version check confirm karyu (Node 22+ required, sandbox ma already che).
- ✅ Tamara actual `public/` files ane `ultron-server.js` (port 3000, static
  serve) sathe cross-check kari ne j upar na commands lakhya che -- assume
  nathi karyu.

**Kai baki nathi.** Skill fully installed ane fully usable che, `/impeccable
init` thi shuru kari shako.
