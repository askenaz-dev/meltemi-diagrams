## ADDED Requirements

### Requirement: Injectable worker loader
`createElkEngine({ loadWorker })` SHALL use `loadWorker()` to obtain the constructor of the ELK worker instead of resolving `elkjs/lib/elk-worker.min.js` from the installed package, so that bundled hosts can ship the worker as a file. Without the option, it SHALL resolve the installed package as before. `loadElkWorkerFile(path)` SHALL evaluate the worker file as a CommonJS module with `self` hidden, in the default path too: the file starts ELK as a real web worker when `self` exists and `document` does not, which is the case in the VS Code extension host.

#### Scenario: A host that defines self
- **WHEN** the engine is created while `globalThis.self` exists, with the default loader or with `loadElkWorkerFile`
- **THEN** it arranges a chain exactly as without `self`, and leaves `self.onmessage` unset

#### Scenario: Bundled worker
- **WHEN** an engine is created with a loader that requires a copy of `elk-worker.min.js` from another folder
- **THEN** it arranges a chain exactly as the default engine does
