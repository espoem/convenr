# convenr design

This file is the only place where colors, type, spacing and radii are defined. `apps/web/src/app/tokens.css` is generated from the token block below. Do not edit that file by hand. After changing a token, run `mise run theme`. CI fails when the generated file is out of date.

## Character

convenr is a small, warm tool for getting a group to agree on a time. It should feel like a paper sign-up sheet on a club noticeboard: earthy, legible, quick to fill in. The red is for the one action on a screen. The olive scale is for availability and nothing else.

## Tokens

```json tokens
{
  "color": {
    "background": "#FAF6EE",
    "surface": "#FFFDF9",
    "ink": "#4D3320",
    "ink-muted": "#816E5E",
    "action": "#AB0F0F",
    "action-active": "#B80909",
    "on-action": "#FFFFFF",
    "earth": "#80592F",
    "line": "#D9CBB6",
    "available": "#ABA446",
    "available-strong": "#6E6D1C",
    "locked": "#EEE6DB",
    "heat-0": "#F0E8DC",
    "heat-1": "#DCD9A4",
    "heat-2": "#BFBC6A",
    "heat-3": "#989638",
    "heat-4": "#6E6D1C",
    "heat-0-line": "earth",
    "heat-1-line": "earth",
    "heat-2-line": "earth",
    "heat-3-line": "surface",
    "heat-4-line": "surface"
  },
  "color-dark": {
    "background": "#1B1612",
    "surface": "#261F1A",
    "ink": "#F2E6D6",
    "ink-muted": "#B9A798",
    "action": "#ED7668",
    "action-active": "#F98F82",
    "on-action": "#22110E",
    "earth": "#BF956C",
    "line": "#453B32",
    "available": "#8E8A31",
    "available-strong": "#CFCE62",
    "locked": "#302A25",
    "heat-0": "#2D2823",
    "heat-1": "#4F4824",
    "heat-2": "#736E2F",
    "heat-3": "#A09D45",
    "heat-4": "#CFCE62",
    "heat-0-line": "earth",
    "heat-1-line": "earth",
    "heat-2-line": "surface",
    "heat-3-line": "surface",
    "heat-4-line": "surface"
  },
  "font": {
    "display": "'Bricolage Grotesque Variable', 'Avenir Next', 'Segoe UI', sans-serif",
    "body": "'Atkinson Hyperlegible Next Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
    "mono": "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
  },
  "radius": {
    "base": "0.375rem"
  },
  "size": {
    "cell-min-width": "3.25rem",
    "cell-min-height": "1.5rem",
    "touch-target": "2.75rem",
    "measure": "42rem",
    "form": "42rem",
    "column": "64rem",
    "picker": "22rem"
  }
}
```

## Color roles

The contrasts in this table are for the light theme. Measured contrast below states both themes.

| Token                          | Use                                                                  | Measured contrast                                                           |
| ------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `background`                   | Page background                                                      | Reference for the rows below                                                |
| `surface`                      | Cards, popovers, inputs                                              | `ink` on it: 11.42:1                                                        |
| `ink`                          | Text, icons                                                          | 10.76:1 on `background`                                                     |
| `ink-muted`                    | Secondary text                                                       | 4.50:1 on `background`. Do not use it on `heat-0` or darker                 |
| `action`                       | The primary button, links, the brand mark                            | 6.94:1 on `background`. `on-action` on it: 7.48:1                           |
| `action-active`                | Hover and pressed state of `action`; destructive controls            | `on-action` on it: 6.82:1                                                   |
| `earth`                        | Input borders, cell outlines, focus ring, secondary controls         | 5.75:1 on `background`                                                      |
| `line`                         | Dividers that carry no meaning                                       | Below 3:1 by design                                                         |
| `available`                    | Legend swatch and illustrations                                      | 2.40:1 on `background`. Never the only edge of a control                    |
| `locked`                       | Fill of a control that cannot change (rule 12)                       | `ink` on it: 9.38:1                                                         |
| `available-strong`             | A slot the participant marked available in their own grid            | Same value as `heat-4`                                                      |
| `heat-0` to `heat-4`           | The five steps of the heat map, from nobody to more than 75 %        | Neighbouring steps 1.19:1 to 1.75:1 apart. `heat-4`: 5.04:1 on `background` |
| `heat-0-line` to `heat-4-line` | The grid line on each heat step (rule 3); names `earth` or `surface` | At least 3.06:1 on its step                                                 |

### Measured contrast

`mise run theme` measures each pair below in both themes and fails when a stated value is wrong or below `min`. `fg` as a pair means the better of the two, as for a mark drawn in two colors. After a palette change, `nub apps/web/scripts/generate-theme.ts --contrast` prints the new values.

```json contrast
[
  { "fg": "ink", "bg": "background", "min": 4.5, "light": 10.76, "dark": 14.58 },
  { "fg": "ink", "bg": "surface", "min": 4.5, "light": 11.42, "dark": 13.19 },
  { "fg": "ink-muted", "bg": "background", "min": 4.5, "light": 4.5, "dark": 7.73 },
  { "fg": "ink-muted", "bg": "surface", "min": 4.5, "light": 4.78, "dark": 6.99 },
  { "fg": "action", "bg": "background", "min": 4.5, "light": 6.94, "dark": 6.32 },
  { "fg": "on-action", "bg": "action", "min": 4.5, "light": 7.48, "dark": 6.4 },
  { "fg": "on-action", "bg": "action-active", "min": 4.5, "light": 6.82, "dark": 8.04 },
  { "fg": "action-active", "bg": "background", "min": 4.5, "light": 6.32, "dark": 7.93 },
  { "fg": "earth", "bg": "background", "min": 3, "light": 5.75, "dark": 6.61 },
  { "fg": "earth", "bg": "surface", "min": 3, "light": 6.1, "dark": 5.98 },
  { "fg": "ink", "bg": "locked", "min": 4.5, "light": 9.38, "dark": 11.5 },
  { "fg": "available-strong", "bg": "background", "min": 3, "light": 5.04, "dark": 10.82 },
  { "fg": "heat-4", "bg": "background", "min": 3, "light": 5.04, "dark": 10.82 },
  { "fg": "heat-0-line", "bg": "heat-0", "min": 3, "light": 5.1, "dark": 5.37 },
  { "fg": "heat-1-line", "bg": "heat-1", "min": 3, "light": 4.28, "dark": 3.38 },
  { "fg": "heat-2-line", "bg": "heat-2", "min": 3, "light": 3.13, "dark": 3.09 },
  { "fg": "heat-3-line", "bg": "heat-3", "min": 3, "light": 3.06, "dark": 5.72 },
  { "fg": "heat-4-line", "bg": "heat-4", "min": 3, "light": 5.34, "dark": 9.79 },
  { "fg": "heat-4", "bg": "heat-1", "min": 3, "light": 3.75, "dark": 5.54 },
  { "fg": ["ink", "surface"], "bg": "heat-0", "min": 3, "light": 9.55, "dark": 11.86 },
  { "fg": ["ink", "surface"], "bg": "heat-1", "min": 3, "light": 8.01, "dark": 7.47 },
  { "fg": ["ink", "surface"], "bg": "heat-2", "min": 3, "light": 5.87, "dark": 4.27 },
  { "fg": ["ink", "surface"], "bg": "heat-3", "min": 3, "light": 3.73, "dark": 5.72 },
  { "fg": ["ink", "surface"], "bg": "heat-4", "min": 3, "light": 5.34, "dark": 9.79 },
  { "fg": "heat-1", "bg": "heat-0", "min": 1.1, "light": 1.19, "dark": 1.59 },
  { "fg": "heat-2", "bg": "heat-1", "min": 1.1, "light": 1.37, "dark": 1.75 },
  { "fg": "heat-3", "bg": "heat-2", "min": 1.1, "light": 1.57, "dark": 1.85 },
  { "fg": "heat-4", "bg": "heat-3", "min": 1.1, "light": 1.75, "dark": 1.71 }
]
```

## Rules

1. **One red thing per screen.** `action` marks the single primary action. A second button on the same screen is outlined in `earth`.
2. **Olive means availability.** The `heat` and `available` tokens appear only in the grid, its legend and its summaries.
3. **The grid is drawn in 1-pixel lines.** Each week of a dated event is one block with a 1-pixel `earth` border, and the blocks stand apart with a gap. Inside a block, cells touch. A cell draws its own right and bottom line in its step's `heat-N-line` color: `earth` where it shows on the fill and `surface` where `earth` would vanish. The light theme switches at `heat-3`, the dark theme at `heat-2`; every line reaches at least 3:1 on its fill (see Measured contrast). Lines between days and whole hours are solid in that color; a line between slots within an hour is solid at 45 % of it mixed into the cell's fill. No grid line is dotted or dashed, because dashes belong to the best-window mark. The light heat steps have almost no contrast with the background, so the lines carry the shape.
4. **Color never carries the count alone.** A slot's count is also available as text.
5. **Text on the heat scale.** Grid cells contain no text, not even the time. Time labels sit on the edge of the grid, beside the first visible column, and stay there when the grid scrolls sideways. Where text must sit on a heat color, as in the legend, use `ink` on `heat-0` to `heat-2` (5.87:1 on `heat-2`) and `on-action` on `heat-4` (5.43:1). `heat-3` takes no text: white reaches 3.11:1 on it and `ink` 3.73:1.
6. **Destructive actions** use `action-active` as an outline and text color, and ask for confirmation inside the page.
7. **Focus** is a 2-pixel `earth` ring with a 2-pixel offset. It is never removed. A grid cell is the exception, because a ring outside it would cover its neighbours and be cut off at the edge of a scrolling grid: its focus sits inside the cell as a 3-pixel `ink` ring between two 1-pixel `surface` rings. On every heat step one of `ink` and `surface` reaches at least 3.73:1 in the light theme and 4.27:1 in the dark one, so the ring shows on every step.
8. **Type.** Headings use the display face at weight 600 with tight tracking. Body text uses the body face at 16 pixels minimum. Times and counts use tabular figures.
9. **Sizes.** A grid cell is at least `cell-min-width` by `cell-min-height`. Any other control is at least `touch-target` high on a touch screen. Every page shares the centered `column` shell for its header, main area and footer. Inside the column, every region takes one of three widths and aligns to the column's left edge (floating status notices outside the column stay centered):
   - `column`: bands with the form they hold (such as the join band and the save bar), tabs, grids, tables, API reference sections and event lists.
   - `form`: a form, a row of fields such as a link with its copy button, the best-times filters and results, and a list edited in place. A single-month calendar picker stays within `picker`.
   - `measure`: running text, intros, notes and inline alerts. Both `measure` and `form` are `42rem`, so a note never ends short of the control above it.
10. **Motion.** Transitions are 150 ms or shorter and are disabled when the viewer asks for reduced motion.
11. **Dark theme.** `color-dark` holds the same tokens as `color`, derived from the light palette: the same hues on a dark brown ground, and a heat scale that brightens as more people can come. The device setting chooses the theme unless the visitor picked one in the theme menu; the server writes that choice on the root element as `data-theme`. Every pair under Measured contrast holds in both themes.
12. **Locked controls.** A control that cannot change keeps its value in `ink` on a `locked` fill with a `line` border, so the value stays readable. Directly below it, a lock icon in `ink-muted` and one sentence say why. A locked control is inactive, so its `line` border may stay below 3:1.
13. **Marks in the grid.** The fill carries the count and nothing else. Every other mark has a shape of its own and stays inside the cells it marks, so it never changes the layout or covers another cell's grid line. Each mark is `ink` with a `surface` strip beside it, so one of the two reaches 3:1 on every heat step.
    - A selected best window is stitched: a 2-pixel dashed `ink` line 1 pixel inside the window's edge, on a `surface` strip. Dashed means suggested.
    - The final time is sewn: a 4-pixel solid `ink` frame between 1-pixel `surface` rings, inside the window's edge. Solid means decided. A flag stands beside the frame's first row: a Phosphor flag icon in `surface` on an `ink` tab with a 1-pixel `surface` rim. It sits on the right when a day column follows and on the left otherwise, never over the time labels and never outside the grid. Its accessible name says "final time"; the legend and the banner above the grid carry the word.
    - A slot marked "if need be" in the participant's own grid, and in the group grid filtered to one participant, is hatched at 135 degrees: 3-pixel stripes of `heat-4` on `heat-1`, 8 pixels apart, measured across the stripes. The stripes keep at least 3:1 on `heat-1` (Measured contrast). The brush above the grid shows each level's mark beside its name, and so does the legend of a filtered grid. The heat map shows no hatching: there if need be only counts half.

14. **Flags.** The language menu shows each language's national flag in a 3:2 box with a 1-pixel `line` ring. A flag is an image of a national symbol, not an interface color, so its colors and those of provider marks are the only literal colors in a component.
15. **Header menus.** The theme and language menus are menu buttons in the header, a `surface` panel with an `earth` border below each. They show the current choice as an icon or a flag with the language code, so switching does not change their width.
16. **Provider marks.** A button that signs in through a provider, or adds it, shows the provider's own mark, unchanged and in its own colors, before the label. The mark is a 20-pixel image of a trademark, not an icon, and appears nowhere else. GitHub's mark has one color and takes `ink`. The button itself stays an outlined one.

## Components

Components come from shadcn and are copied into `apps/web/src/components/ui`. They read the variables that `tokens.css` defines, so a component is never given a literal color. Add a component with the shadcn CLI, then check it against the rules above.
