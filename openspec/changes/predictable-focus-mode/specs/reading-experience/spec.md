## ADDED Requirements

### Requirement: Focus mode dims all but the unit being read

The system SHALL offer a focus mode setting, defaulting off, that renders one
unit of the document at full prominence and every other unit visibly dimmed.
When focus mode is off, all content SHALL render at full prominence and no
focus-mode spacing or dimming SHALL remain. Focus mode SHALL affect rendering
only: the document source, its saved bytes, and any text copied out of the
reading pane SHALL be unchanged by it.

#### Scenario: Enabling focus mode dims non-focused content

- **WHEN** the user enables focus mode on an open document
- **THEN** exactly one unit renders at full prominence and the remaining units
  render visibly dimmed

#### Scenario: Disabling focus mode restores the document

- **WHEN** the user disables focus mode
- **THEN** every unit renders at full prominence and the document's scroll
  extent returns to what it was before focus mode was enabled

#### Scenario: Copied text is unaffected

- **WHEN** the user selects a span crossing focused and dimmed units and copies it
- **THEN** the copied text is identical to the same selection copied with focus
  mode off

### Requirement: Focus units are the smallest readable block

A focus unit SHALL be the smallest block a reader consumes as one step: a
paragraph, a heading, a code block, a table, a thematic break, a standalone
image, or a single top-level list item. A list SHALL NOT be a focus unit — its
top-level items SHALL be. Nested list items SHALL belong to their top-level
ancestor item rather than forming units of their own. A container that holds
focus units SHALL NOT itself be dimmed, so that a unit nested inside it renders
at full prominence while its siblings are dimmed.

#### Scenario: One list item focuses at a time

- **WHEN** focus mode is on and the reader reaches a list of several items
- **THEN** the single item being read renders at full prominence and the other
  items of the same list render dimmed

#### Scenario: Nested items follow their top-level item

- **WHEN** the focused top-level list item contains a nested list
- **THEN** the nested list renders at full prominence together with its parent
  item, and does not focus separately

#### Scenario: Block-level units focus whole

- **WHEN** the reader reaches a code block or a table
- **THEN** that block renders at full prominence in its entirety, however tall
  it is

### Requirement: The focal band is fixed and every unit can reach it

The focused unit SHALL be selected by a focal band at a fixed fraction of the
reading pane's height, which SHALL NOT move as the document is scrolled. The
system SHALL reserve scroll space above the first unit and below the last unit
so that every unit in the document, including the first and the last, can be
scrolled to the band. A focused unit SHALL NOT be clipped by the top or bottom
edge of the pane when it fits within the pane.

#### Scenario: First unit focuses without clipping

- **WHEN** focus mode is on and the document is scrolled to the very top
- **THEN** the first unit is the focused unit and it renders fully within the
  pane, away from the top edge

#### Scenario: Last unit focuses without clipping

- **WHEN** focus mode is on and the document is scrolled to the very bottom
- **THEN** the last unit is the focused unit and it renders fully within the
  pane, away from the bottom edge

#### Scenario: The band does not drift with scroll position

- **WHEN** the reader scrolls from the start of a long document to its end
- **THEN** each successive focused unit appears at the same vertical position in
  the pane

#### Scenario: A unit taller than the pane

- **WHEN** the focused unit is taller than the reading pane
- **THEN** it remains the focused unit for as long as the band lies within it,
  and scrolling through it does not transfer focus to a neighbor

### Requirement: Focus selection is stable

The focused unit SHALL be the unit whose vertical extent contains the focal
band. When the band falls in the space between two units, the system SHALL
retain the previously focused unit rather than choosing a neighbor. Focus SHALL
NOT alternate between units while the scroll position is unchanged.

#### Scenario: Gap between units holds focus

- **WHEN** the reader scrolls so that the band lies in the margin between two
  paragraphs
- **THEN** the paragraph that was focused before the scroll remains focused
  until the band enters the next unit

#### Scenario: No flicker at a boundary

- **WHEN** the reader scrolls slowly across the boundary between two units
- **THEN** focus transfers once, in the direction of travel, and does not
  oscillate

### Requirement: Navigation lands the target at the focal band

When focus mode is on, navigation that targets a location in the document —
outline heading, line-addressed link, backlink, or search result — SHALL bring
the targeted unit to the focal band, and that unit SHALL become the focused
unit. When focus mode is off, navigation SHALL keep its existing alignment.

#### Scenario: Outline jump aligns to the band

- **WHEN** focus mode is on and the user clicks a heading in the outline
- **THEN** that heading is scrolled to the focal band and renders as the focused
  unit

#### Scenario: Search result is readable

- **WHEN** focus mode is on and the user steps to a search match
- **THEN** the unit containing the match is scrolled to the focal band, renders
  as the focused unit, and the match highlight is visible against it

### Requirement: The reader can drive focus directly

The system SHALL let the reader move focus without scrolling: a keyboard command
SHALL step focus to the next or previous unit and bring it to the focal band,
and clicking a unit SHALL focus it. A focus set by keyboard or by click SHALL
persist until the reader next scrolls or moves focus again. A keyboard command
SHALL exit focus mode.

#### Scenario: Stepping forward

- **WHEN** focus mode is on and the reader issues the next-unit command
- **THEN** the following unit becomes focused and is scrolled to the focal band

#### Scenario: Stepping past the last unit

- **WHEN** the last unit is focused and the reader issues the next-unit command
- **THEN** the last unit stays focused and the view does not scroll past the
  end of the document

#### Scenario: Click focus survives

- **WHEN** the reader clicks a dimmed unit
- **THEN** that unit becomes the focused unit and stays focused until the reader
  scrolls or steps focus again

#### Scenario: Exiting by keyboard

- **WHEN** focus mode is on and the reader issues the exit command
- **THEN** focus mode turns off and the setting reflects that it is off

### Requirement: Focus mode preserves orientation and accessibility

The heading that owns the focused unit SHALL render more prominently than
ordinary dimmed content, so the reader keeps their place in the document. The
transition between focused and dimmed states SHALL be suppressed when the system
reports a reduced-motion preference. Dimmed content SHALL remain present to
assistive technology and to in-document search.

#### Scenario: Owning heading stays legible

- **WHEN** a paragraph under a heading is focused and the heading is on screen
- **THEN** the heading renders more prominently than the other dimmed units

#### Scenario: Reduced motion

- **WHEN** the system reports a reduced-motion preference and focus moves
  between units
- **THEN** the change in prominence is applied without an animated transition

#### Scenario: Dimmed content is still findable

- **WHEN** focus mode is on and the user searches for text that occurs in a
  dimmed unit
- **THEN** the match is counted and can be stepped to like any other match
