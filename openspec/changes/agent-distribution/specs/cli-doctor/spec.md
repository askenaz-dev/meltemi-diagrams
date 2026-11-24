## Purpose

One command that says what this machine and this folder have for Meltemi Diagrams: the runtime,
the tools that the PNG, PDF and video exports need, the agents' skill and the sign-in, with what
to do about each thing that is missing.

## ADDED Requirements

### Requirement: The doctor command
`meltemi-diagrams doctor [folder]` SHALL run five checks, in this order: `node`, `browser`,
`ffmpeg`, `skill` and `sign-in`, for the working folder or the one given. It SHALL print one line
for each with `ok`, `warn` or `fail`, what it found and, unless `ok`, what to do, then a summary
line. The exit code SHALL be 0 unless a check fails, and 1 when one does.

#### Scenario: A machine with everything
- **WHEN** `mdg doctor` runs with Node 22.12 or later, a browser and FFmpeg installed and the skill of this version in the folder
- **THEN** five lines start with `ok`, the summary reads `5 ok, 0 warnings, 0 failures.` and the exit code is 0

#### Scenario: No browser
- **WHEN** `mdg doctor` runs on a machine without Edge or Chrome
- **THEN** the `browser` line starts with `warn`, says that PNG, PDF and video exports are unavailable and how to name a browser, and the exit code is 0

#### Scenario: An unknown option
- **WHEN** `mdg doctor --fix` runs
- **THEN** the exit code is 2 and the message names the option and `doctor --help`

#### Scenario: A folder that is not there
- **WHEN** `mdg doctor missing` runs
- **THEN** the exit code is 2 and the message names the folder

### Requirement: What each check reports
`node` SHALL fail below Node 22.12 and name the version found. `browser` and `ffmpeg` SHALL warn
when absent, naming the exports that need them, and give the path found otherwise. `skill` SHALL
list each copy found in the folder's and the person's agent folders with its version, and warn for
a copy of an earlier minor version than the command line's. `sign-in` SHALL say whether one is
stored for the cloud host.

#### Scenario: An old copy of the skill
- **WHEN** the folder holds `.claude/skills/meltemi-diagrams` of version 1.10.0 and the command line is 1.12.3
- **THEN** the `skill` line starts with `warn`, names the folder and both versions, and says to update it the way it was installed

#### Scenario: A copy of the same minor version
- **WHEN** the folder's copy of the skill is 1.12.0 and the command line is 1.12.3
- **THEN** the `skill` line starts with `ok`

#### Scenario: No skill and no sign-in
- **WHEN** no copy of the skill is found and no sign-in is stored
- **THEN** the `skill` and `sign-in` lines start with `ok` and say that there is none, with `skill install` and `login` as how to get each

#### Scenario: FFmpeg without a browser
- **WHEN** FFmpeg is installed and no browser is
- **THEN** the `ffmpeg` line starts with `ok` with its path and version, and the `browser` line says that video needs a browser too

### Requirement: The doctor's JSON
With `--json`, standard output SHALL hold one JSON object and nothing else: `version` (the command
line's), and `checks`, an array of the five checks in order, each with `id`, `status` (`ok`,
`warn` or `fail`), `detail` and, unless `ok`, `fix`. Keys SHALL be the same in both interface
languages, and the exit code the same as without `--json`.

#### Scenario: The object
- **WHEN** `mdg doctor --json` runs
- **THEN** standard output parses as JSON whose `checks` have the ids `node`, `browser`, `ffmpeg`, `skill` and `sign-in`, in that order

#### Scenario: In Spanish
- **WHEN** `mdg doctor --json --lang es` runs
- **THEN** the keys and the `status` values are the same as in English, and `detail` and `fix` are in Spanish

### Requirement: The doctor reads and changes nothing private
`doctor` SHALL write no file, start no server, make no request to the network and install nothing.
It SHALL learn of a sign-in only whether one is stored for the host, and SHALL print neither a
token nor any other value of the credentials file.

#### Scenario: Nothing leaves the machine
- **WHEN** `mdg doctor` runs with the network blocked
- **THEN** it prints the same five lines as with the network and no request is attempted

#### Scenario: A stored token
- **WHEN** a sign-in with a token `mdg_…` is stored and `mdg doctor --json` runs
- **THEN** the output says that a sign-in is stored for the host and holds no part of the token

### Requirement: The doctor in the skill and the guides
The skill's table of symptoms SHALL send an export that fails for a missing browser or FFmpeg to
`mdg doctor`, and `docs/cli.md`, `docs/getting-started.md` and their Spanish pairs SHALL document
the command, its checks, `--json` and its exit codes.

#### Scenario: The symptom in the skill
- **WHEN** the skills test reads the table of symptoms of `SKILL.md`
- **THEN** a row for a PNG, PDF or video export that fails for a missing tool names `mdg doctor`

#### Scenario: A guide without its pair
- **WHEN** `docs/cli.md` documents `doctor` and `docs/es/cli.md` does not
- **THEN** the localized documentation test fails naming `docs/es/cli.md`
