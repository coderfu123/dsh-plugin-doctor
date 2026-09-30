# dsh-plugin-doctor

Static health checks for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins:
**can it install, what can it touch, will it conflict.**

> **Status: v0.0.1 — early.** Only the `installability` category is being built
> right now, and five of its six checks are still stubs. See [Roadmap](#roadmap).

---

## Why this exists

DeepSeek Harness is built on the promise that *everything is a plugin*, and the
ecosystem grew fast: more than **11,000 repositories** carry the `dsh-plugin`
topic on GitHub. But the official side ships almost no governance — its entire
ecosystem guidance is one sentence, *"add the `dsh-plugin` topic so people can
find you."*

An independent audit of that ecosystem
([雷峰网, 2026-09](https://www.leiphone.com/category/yanxishe/nTnT9RZW5p5Q23hG.html))
measured what that costs:

| Finding | Number |
|---|---|
| Repositories tagged `dsh-plugin` | 11,000+ |
| …that are actually usable | under 1,000 |
| Rejected submissions whose reason was **"cannot be installed"** | **93%** (1,752 / 1,883) |
| Top-10 most-downloaded plugins installed together | **do not boot** (conflicts; two must be disabled) |
| A probe plugin under the strictest `read-only` tier | listed `~/.ssh/`, read the API key from the environment, wrote outside the workspace, reached the network |

Missing, per that audit: a plugin directory, search, a version compatibility
matrix, signing or verification, a security reporting channel, and a
recommended list.

The doctor answers the part of that gap that can be answered **statically, from
the files in a repository, with no network and no running DSH**.

## What it checks

### `installability` (in progress)

| Check id | Question |
|---|---|
| `dsh-dependency` | Does it depend on the DSH packages it builds against? |
| `bundle-declared` | Does it declare the bundle patch that `dsh plugin add` looks for? |
| `patch-file-exists` | Is the declared patch file actually in the package? |
| `entry-resolvable` | Does `main` point at a file that exists? |
| `publishable-name` | Could npm publish it at all (`name` + `version`, not `private`)? |
| `client-half-valid` | If it ships a browser half, is `dsh.client` well-formed? |

### Planned

`permissions` — does the plugin rewrite sandbox policy, force
`danger-full-access`, or read credential paths. · `compatibility` — does it
claim UI paths another popular plugin already owns. · `cost` — how much prompt
prefix (and therefore KV cache) its tool definitions add.

## Install

```bash
npm install -g dsh-plugin-doctor   # not published yet — build from source for now
```

From source:

```bash
git clone <this repo>
cd dsh-plugin-doctor
npm install
npm run build
node dist/index.js --help
```

## Usage

```bash
# check the plugin in the current directory
dsh-plugin-doctor .

# check one specific rule
dsh-plugin-doctor ./my-plugin --check bundle-declared

# machine-readable, for CI
dsh-plugin-doctor ./my-plugin --json > report.json
```

Exit codes: `0` nothing failed · `1` at least one check failed · `2` usage error
or no readable `package.json`.

## Development

```bash
npm run dev -- ./some-plugin   # run from TypeScript sources
npm run typecheck
npm test
```

The task queue lives in [`docs/`](docs/). If you are picking this up for the
first time, start with [TASK-001](docs/TASK-001-installability.md).

## Design rules

1. **Static and offline.** No network, no shelling out, no running DSH. Every
   check must be reproducible and fast enough for a pre-commit hook.
2. **Never throw.** A check that crashes reports a doctor bug, not a plugin bug.
3. **Actionable failures.** A `fail` must say what to change, using the literal
   key or file name.
4. **No double-counting.** One root cause should produce one `fail`; related
   checks report `warn` ("nothing to verify") instead of piling on.
5. **No scoring theatre.** A score is only useful if it separates plugins a
   human would agree are different. Weights come later, deliberately.

## Roadmap

- [x] Harness: context, check registry, scoring, text/JSON report, CLI, CI
- [ ] **TASK-001** installability checks (5 of 6 remaining)
- [ ] Run against every installed plugin and publish the first real report
- [ ] `permissions` category: sandbox-policy rewriting, credential paths
- [ ] `compatibility` category: UI path collisions between popular plugins
- [ ] `cost` category: prompt-prefix (KV cache) impact estimate
- [ ] GitHub Action for plugin authors
- [ ] Public report of the top-N plugins by downloads

## 中文简介

`dsh-plugin-doctor` 是给 DeepSeek Harness 插件做**静态体检**的工具：能不能装、
会碰什么、会不会冲突。

起因是一份公开审计发现：11,000+ 个标了 `dsh-plugin` 的仓库里可用不到 1,000 个，
而被拒的提交中 **93% 是因为"装不上"**——大多数仓库代码是真的，只是没声明 DSH 认的
东西。官方目前几乎没有插件治理机制。

体检器只做**静态、离线**的分析：不联网、不启动 DSH、不执行任何插件代码。

## License

MIT
