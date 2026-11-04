## MODIFIED Requirements

### Requirement: Preview on the canvas
The canvas SHALL show the animated profile of a diagram that has effects from the moment it is shown, and the toolbar SHALL offer one toggle, **Pause effects** while playing and **Play effects** while paused, enabled only when the diagram has effects; while paused the canvas SHALL show the static drawing. The choice SHALL be remembered per diagram of the file in the canvas's persisted state, so a paused diagram is still paused after a reload and a diagram played again stays playing. Under `prefers-reduced-motion: reduce` a diagram without a remembered choice SHALL start paused. Live previews during drags SHALL keep the chosen state.

#### Scenario: Opens animated
- **WHEN** a file whose diagram has a pulse is opened on the canvas
- **THEN** the canvas SVG contains the animated style sheet and the toolbar shows Pause effects

#### Scenario: Play
- **WHEN** Play effects is pressed on a paused diagram with a pulse
- **THEN** the canvas SVG contains the animated style sheet and the toolbar shows Pause effects

#### Scenario: Pause survives a reload
- **WHEN** Pause effects is pressed and the canvas is reloaded
- **THEN** the canvas shows the static drawing, the toolbar shows Play effects, and pressing it shows the animated style sheet again

#### Scenario: Reduced motion starts paused
- **WHEN** the system asks for reduced motion and a diagram with effects that was never paused or played here is shown
- **THEN** the canvas shows the static drawing and the toolbar shows Play effects

#### Scenario: No effects
- **WHEN** a diagram without effects is shown
- **THEN** the canvas shows the static drawing, the toggle is disabled, and pressing it changes nothing
