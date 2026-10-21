// Lightweight planning templates, not a runnable scientific pipeline or governance package.
export const STARTER_VERSION = 1;
export const PROJECT_TYPES = Object.freeze({
  'data-analysis': Object.freeze({
    label: 'Dataset analysis',
    description: 'Start with data inventory, a stable observation key, and an analysis plan.',
    directories: Object.freeze(['notebooks/exploration/']),
    focus: 'Inventory source data and define the observation unit before analysis.',
    prompts: Object.freeze([
      'Identify authoritative source files, access restrictions, versions and hashes.',
      'Define observation keys, units, missingness, alignment and inclusion rules.',
      'Declare the analysis or evaluation regime, confounds and validation plan.',
      'Prespecify primary targets and metrics before inspecting confirmatory results.',
    ]),
  }),
  simulation: Object.freeze({
    label: 'Computational simulation',
    description: 'Start with a model specification, scenarios, parameters, units and seeds.',
    directories: Object.freeze(['config/scenarios/', 'docs/models/']),
    focus: 'Specify model equations, units and reference behavior before simulation.',
    prompts: Object.freeze([
      'Document equations, state variables, assumptions and reference evidence.',
      'Specify parameter units, initial conditions, solver settings and random seeds.',
      'Separate numerical/engineering checks from formal scientific experiments.',
      'Prespecify reference cases, convergence checks and interpretation limits.',
    ]),
  }),
  'figure-workflow': Object.freeze({
    label: 'Paper figure workflow',
    description: 'Start with source-to-panel traceability, captions and export specifications.',
    directories: Object.freeze(['figures/panels/', 'docs/captions/']),
    focus: 'Map each planned panel to authoritative inputs and a generating script.',
    prompts: Object.freeze([
      'List planned panels, their intended claims and authoritative source artifacts.',
      'Map every panel to a generator, configuration and exact input version.',
      'Record captions, units, colour mappings and required export dimensions.',
      'Review plotted source data and interpretation before marking a figure final.',
    ]),
  }),
});

// Aligned with the canonical universal project rules v2.2, including historical provenance.
export const REGISTRY_COLUMNS = Object.freeze([
  'canonical_id', 'historical_id', 'historical_order', 'first_run_timestamp',
  'historical_source_status', 'namespace', 'parent_id', 'unit_type', 'canonical_name',
  'stage', 'modality', 'scientific_question', 'experiment_role', 'evaluation_regime',
  'generator', 'input_dependencies', 'output_directory', 'selection_or_validation',
  'execution_status', 'scientific_outcome', 'lifecycle_status', 'depends_on',
  'supersedes', 'historical_aliases', 'git_commit', 'notes',
]);
export const ARTIFACT_COLUMNS = Object.freeze([
  'artifact_id', 'canonical_id', 'path', 'artifact_type', 'generated_by',
  'source_inputs', 'authoritative', 'reusable', 'lifecycle_status', 'sha256_or_version', 'notes',
]);
const RESERVED_ROOT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
const DIRECTORIES = [
  'config/', 'src/', 'scripts/', 'notebooks/', 'notebooks/scratch/', 'tests/', 'tests/smoke/',
  'data/', 'data/raw/', 'data/processed/', 'results/', 'results/active/', 'results/staging/',
  'results/archive/', 'results/archive/reference/', 'results/archive/branches/',
  'figures/', 'manuscript/', 'docs/', 'docs/methods/', 'docs/decisions/', 'docs/schemas/',
  'docs/plans/', 'metadata/', 'metadata/templates/', 'archive/',
  'archive/reference/', 'archive/branches/',
];
const jsonText = value => JSON.stringify(value, null, 2) + '\n';
const markdownText = value => value.replace(/[\\`*_{}[\]<>#+!|]/gu, '\\$&');
const quotedQuestion = question => (question || 'Not defined yet.').split('\n')
  .map(line => '> ' + markdownText(line)).join('\n');

function validate(options) {
  if (!options || typeof options !== 'object') throw new Error('Provide project settings.');
  if (!Object.hasOwn(PROJECT_TYPES, options.projectType)) throw new Error('Choose a supported project type.');
  if (typeof options.rootName !== 'string') throw new Error('Provide a project folder name.');
  const rootName = options.rootName.trim();
  if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(rootName) || RESERVED_ROOT.test(rootName)) {
    throw new Error('Use 1–64 lowercase letters, digits, hyphens or underscores; start with a letter and avoid reserved names.');
  }
  const title = options.title === undefined ? rootName : options.title;
  const question = options.question === undefined ? '' : options.question;
  if (typeof title !== 'string' || !title.isWellFormed() || !title.trim() || title.length > 120 ||
      /[\u0000-\u001f\u007f]/u.test(title)) throw new Error('Use a one-line project title of 1–120 characters.');
  if (typeof question !== 'string' || !question.isWellFormed() || question.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(question)) {
    throw new Error('Keep the scientific question under 2,000 characters, without control characters.');
  }
  return { rootName, title: title.trim(), question: question.replace(/\r\n?/gu, '\n').trim(), projectType: options.projectType };
}

export function buildProjectStarter(options) {
  const settings = validate(options);
  const { rootName, title, question, projectType } = settings;
  const preset = PROJECT_TYPES[projectType];
  const packageName = rootName.replace(/-/gu, '_');
  const files = new Map();
  files.set('README.md', `# ${markdownText(title)}

${preset.label} · lightweight planning scaffold · starter format ${STARTER_VERSION}

## Scientific question

${quotedQuestion(question)}

## Current status

PLANNING / NOT_RUN. No scientific unit has been assigned, no data have been loaded,
and no analysis, simulation or figure generation has been executed.

## Start here

1. Review PROJECT_STATE.md and STARTER_CHECKLIST.md.
2. Define scope, references, data/model contract and validation before execution.
3. Review config/project.json; it is a planning record, not runnable pipeline configuration.
4. Register a formal scientific unit only after its identity and dependencies are defined.
5. Implement and test a generator; then add its exact reproduction command here.

No runnable generator, dependency lockfile, dataset, licence or reproduction command
is supplied. Choose these explicitly for this project. This starter is not the full
Universal Scientific Project Rules package; apply reviewed project rules separately
when needed. Existing project rules take precedence over this starter.

## Directory responsibilities

- config/: one authoritative configuration source; avoid duplicated parameters.
- src/${packageName}/: reusable implementation; scripts/: executable generators.
- notebooks/: exploration; tests/smoke/: engineering checks without scientific IDs.
- data/raw/: preserve source bytes; data/processed/: separate derived inputs.
- results/staging/: unqualified attempts; results/active/: qualified outputs.
- results/archive/ and archive/: preserve completed reference/branch work and source.
- figures/: generated figures linked to inputs, configuration and generator.
- docs/: methods, schemas, decisions and deferred plans; manuscript/: writing.
- metadata/: experiment registry, artifact lineage and an unfilled run-metadata template.

## Safety and traceability

Extract into a new directory. Do not merge this ZIP over an existing project.
Raw data are read-only by policy, not by enforced filesystem permissions. Preserve
prior outputs; use separate output lineages for changed methods or new attempts.
The generated .gitignore is a convenience, not a privacy or secret-scanning guarantee.

Before a formal run, record generator, Git revision/dirty state, config, seed (if
applicable), input versions/hashes, environment, output path, actual timestamps and QC.
Engineering PASS and scientific outcome are separate. Never treat this scaffold as
completed research or a verified reproduction.
`);
  files.set('PROJECT_STATE.md', `# Project State

## Scientific goal

${quotedQuestion(question)}

- Intended claim: NOT_DEFINED
- Evaluation/deployment regime: NOT_DEFINED
- Primary targets and metrics: NOT_DEFINED

## Current phase

- Phase: PLANNING
- Run status: NOT_RUN
- Project type: ${preset.label}
- Current focus: ${preset.focus}

## Active scientific unit

- Canonical ID: Not assigned; no formal scientific unit has been registered.
- Namespace / parent / unit type: Not assigned.
- Generator: Not implemented.
- Expected output directory: Not assigned.
- Execution status: No registry entry yet; register as PLANNED before formal work.
- Scientific outcome: NOT_YET_EVALUATED

## Modality / pipeline stage matrix

Not defined. Add actual modalities/branches and their current stages after inventory.
Do not infer completed stages from generated directories.

## Frozen decisions

None. A starter preset is not a scientific design decision.

## Deferred branches

None registered. Record a justification and execution trigger before adding one.

## Unresolved dependencies

- Scope, references and data/model contract.
- Method, evaluation, QC and compute plan.
- Scientific identity, environment and executable generator.

## Next single task

${preset.focus}
`);
  files.set('STARTER_CHECKLIST.md', `# Starter checklist

This is a lightweight planning checklist, not the complete governing rules package.
All boxes are intentionally unchecked.

## Before formal execution

- [ ] Review any existing project rules; add reviewed governing rules if required.
- [ ] Define the scientific question, claim, observation unit and evaluation regime.
- [ ] Record reference papers/code/data and access or reuse restrictions.
- [ ] Define inputs, stable keys, units, time boundaries and zero-versus-missing semantics.
- [ ] Prespecify methods, targets, metrics, validation and stop rules.
- [ ] Choose environment/dependencies and record actual versions; do not assume this ZIP installs them.
- [ ] Define scientific identity and output lineage before registering a formal unit.
- [ ] Fill config/project.json only with justified parameters.
- [ ] Implement the generator and run engineering checks in tests/smoke/.
- [ ] Estimate compute cost and keep new outputs separate from earlier attempts.

## Scientific identity

E### is for a new mainline canonical artifact or a new mainline scientific question.
R### is for reference/reproduction/qualification; B### is for a valid non-mainline branch.
Within a defined parent, use G## for a generator, A## for formal QC, D## for diagnostics,
S## for prespecified sensitivity and M## for modeling. Scratch/smoke checks receive
no scientific ID. This ZIP does not allocate any of these IDs.

The experiment registry starts with headers only. Add reviewed units as PLANNED;
move to READY only when contracts and dependencies are resolved. Execution PASS
means execution/QC succeeded, not that the scientific result was positive.
Preserve historical identifiers and original run metadata. Do not automatically
renumber existing projects or overwrite valid negative results.

## After an actual run

- [ ] Inspect real outputs and declared QC gates before drawing conclusions.
- [ ] Record execution status separately from scientific outcome.
- [ ] Fill actual run metadata from metadata/templates/run_metadata.json.
- [ ] Register authoritative/reusable artifacts with generator and input lineage.
- [ ] Update PROJECT_STATE.md with the current state and next single task.
- [ ] Record exact commands for verified outputs in README.md.
- [ ] Review tracked files and data permissions before sharing or publishing.
`);
  files.set('.gitignore', `# Convenience defaults only; review before sharing.
__pycache__/
*.py[cod]
.venv/
.env
.env.*
.Rhistory
.RData
.Rproj.user/
.ipynb_checkpoints/
.DS_Store
Thumbs.db

# Do not commit datasets or generated outputs by default.
data/raw/*
!data/raw/README.md
data/processed/*
!data/processed/README.md
results/
figures/*
!figures/README.md
`);
  files.set('config/project.json', jsonText({
    starter_format_version: STARTER_VERSION, project_type: projectType, project_name: title,
    scientific_question: question || null, status: 'PLANNING', evaluation_regime: null,
    canonical_id: null, random_seed: null, parameters: {},
    paths: { raw_data: 'data/raw/', processed_data: 'data/processed/', staging: 'results/staging/',
      active_results: 'results/active/', figures: 'figures/' },
    note: 'Planning record only. Define the generator/config contract before execution.',
  }));
  files.set('data/raw/README.md', `# Raw inputs

Preserve original source bytes. Read-only is a project policy; the ZIP does not set
filesystem permissions. Never write derived data here or alter source files in place.
Record source, version/hash, access permissions and applicable consent/licence.
Keep sensitive or restricted inputs private. No dataset is included in this scaffold.
`);
  files.set('data/processed/README.md', `# Derived inputs

Write transformations here, never into data/raw/. Preserve source keys and explicit
missingness/QC reasons. Every reusable artifact must identify its generator,
configuration and source versions in metadata/ARTIFACT_MANIFEST.csv.
Do not overwrite earlier derived lineages when methods or assumptions change.
`);
  files.set('docs/methods/PLAN.md', `# ${preset.label} plan

Status: PLANNED / NOT_RUN. This document is an unfilled planning template.

## Question

${quotedQuestion(question)}

## Type-specific decisions

${preset.prompts.map(prompt => '- [ ] ' + prompt).join('\n')}

## Decisions still required

- Reference evidence and intended claim:
- Authoritative inputs and dependencies:
- Observation unit, units and timing:
- Method family and parameter provenance:
- Primary / sensitivity / diagnostic targets:
- Evaluation regime, selection and leakage boundaries:
- QC gates, stop rule and compute estimate:
- Generator, scientific identity and isolated output directory:
- Interpretation boundary:

Do not infer an implemented pipeline, validated method or scientific result from this plan.
`);
  files.set('docs/schemas/DATA_CONTRACT.md', `# Input and output contract

Project type: ${preset.label}. No input schema has been approved yet.

- Authoritative source and access restrictions:
- Stable observation / simulation / panel key:
- Shapes, field names, measurement units and time reference:
- Availability, QC and missingness reasons (zero is not missing):
- Merge/alignment and key uniqueness rules:
- Input versions or hashes:
- Expected output schema and generator:
- Validation and interpretation limits:

Use project-relative paths. Preserve raw sources and authoritative observation keys.
For prediction, define past-data and participant/calibration boundaries explicitly.
For simulation, include parameter/state units; for figures, include panel-to-source mapping.
`);
  files.set('docs/decisions/README.md', `# Decision records

Record consequential decisions with context, reference evidence, alternatives,
chosen assumptions, validation and consequences. Keep project-specific scientific
decisions separate from universal operating rules. No decision has been recorded yet.
`);
  files.set('metadata/EXPERIMENT_REGISTRY.csv', REGISTRY_COLUMNS.join(',') + '\n');
  files.set('metadata/ARTIFACT_MANIFEST.csv', ARTIFACT_COLUMNS.join(',') + '\n');
  files.set('metadata/templates/run_metadata.json', jsonText({
    template_only: true, canonical_id: null, canonical_name: null, namespace: null,
    parent_id: null, unit_type: null, generator: { path: null, sha256: null },
    git: { commit: null, dirty: null }, config: { path: null, sha256: null },
    random_seed: null, inputs: [], parameter_snapshot: {}, evaluation_regime: null,
    target_roles: [], environment: { runtime: null, packages: {}, lockfile_or_snapshot: null, device: null },
    started_at_utc: null, finished_at_utc: null, elapsed_seconds: null, output_directory: null,
    execution_status: 'NOT_RUN', scientific_outcome: 'NOT_YET_EVALUATED', qc: null,
    note: 'Unfilled template, not evidence of a run. Set template_only to false only for actual recorded execution.',
  }));
  files.set('figures/README.md', `# Figure provenance

Link every final figure or panel to its generator, exact source inputs and versions,
configuration, plotted source data, caption and export specification. Preserve shared
category colours across figures when appropriate. No figure has been generated.
Review conclusions against actual plotted inputs; a template is not publication approval.
`);
  files.set(`src/${packageName}/README.md`, `# Reusable implementation

Place reusable adapters, schemas, validation and scientific-library wrappers here.
Put runnable generators in scripts/ and exploratory work in notebooks/.
No executable implementation is supplied by this starter.
`);
  const dirs = new Set([...DIRECTORIES, `src/${packageName}/`, ...preset.directories]);
  // Sort siblings for a stable reviewable archive. Root is always the first entry.
  const entries = [{ path: rootName + '/', isDir: true }];
  const relative = [...dirs].map(path => ({ path, isDir: true }))
    .concat([...files].map(([path, content]) => ({ path, isDir: false, content })));
  relative.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  for (const entry of relative) entries.push({ ...entry, path: rootName + '/' + entry.path });
  return { ...settings, version: STARTER_VERSION, entries, fileCount: files.size,
    folderCount: dirs.size + 1, presetLabel: preset.label };
}

export function formatStarterTree(entries) {
  return entries.map(entry => {
    const cleanPath = entry.path.replace(/\/$/u, '');
    const segments = cleanPath.split('/');
    return '  '.repeat(segments.length - 1) + segments.at(-1) + (entry.isDir ? '/' : '');
  }).join('\n');
}
