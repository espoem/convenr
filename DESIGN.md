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
    "heat-4": "#6E6D1C"
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
    "cell-min-width": "2.75rem",
    "cell-min-height": "1.5rem",
    "touch-target": "2.75rem",
    "measure": "65ch"
  }
}
```

## Color roles

| Token                | Use                                                           | Measured contrast                                                           |
| -------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `background`         | Page background                                               | Reference for the rows below                                                |
| `surface`            | Cards, popovers, inputs                                       | `ink` on it: 11.42:1                                                        |
| `ink`                | Text, icons                                                   | 10.76:1 on `background`                                                     |
| `ink-muted`          | Secondary text                                                | 4.50:1 on `background`. Do not use it on `heat-0` or darker                 |
| `action`             | The primary button, links, the brand mark                     | 6.94:1 on `background`. `on-action` on it: 7.48:1                           |
| `action-active`      | Hover and pressed state of `action`; destructive controls     | `on-action` on it: 6.82:1                                                   |
| `earth`              | Input borders, cell outlines, focus ring, secondary controls  | 5.75:1 on `background`                                                      |
| `line`               | Dividers that carry no meaning                                | Below 3:1 by design                                                         |
| `available`          | Legend swatch and illustrations                               | 2.40:1 on `background`. Never the only edge of a control                    |
| `locked`             | Fill of a control that cannot change (rule 12)                | `ink` on it: 9.38:1                                                         |
| `available-strong`   | A slot the participant marked available in their own grid     | Same value as `heat-4`                                                      |
| `heat-0` to `heat-4` | The five steps of the heat map, from nobody to more than 75 % | Neighbouring steps 1.19:1 to 1.75:1 apart. `heat-4`: 5.04:1 on `background` |

## Rules

1. **One red thing per screen.** `action` marks the single primary action. A second button on the same screen is outlined in `earth`.
2. **Olive means availability.** The `heat` and `available` tokens appear only in the grid, its legend and its summaries.
3. **The grid is drawn in 1-pixel lines.** Each week of a dated event is one block with a 1-pixel `earth` border, and the blocks stand apart with a gap. Inside a block, cells touch. A cell draws its own right and bottom line: `earth` on `heat-0` to `heat-2` (5.10, 4.28 and 3.13:1) and `surface` on `heat-3` and `heat-4` (3.06 and 5.34:1), where `earth` would vanish. Lines between days and whole hours are solid in that color; a line between slots within an hour is solid at 45 % of it mixed into the cell's fill. No grid line is dotted or dashed, because dashes belong to the best-window mark. The light heat steps have almost no contrast with the background, so the lines carry the shape.
4. **Color never carries the count alone.** A slot's count is also available as text.
5. **Text on the heat scale.** Grid cells contain no text, not even the time. Time labels sit on the edge of the grid, beside the first visible column, and stay there when the grid scrolls sideways. Where text must sit on a heat color, as in the legend, use `ink` on `heat-0` to `heat-2` (5.87:1 on `heat-2`) and `on-action` on `heat-4` (5.43:1). `heat-3` takes no text: white reaches 3.11:1 on it and `ink` 3.73:1.
6. **Destructive actions** use `action-active` as an outline and text color, and ask for confirmation inside the page.
7. **Focus** is a 2-pixel `earth` ring with a 2-pixel offset. It is never removed. A grid cell is the exception, because a ring outside it would cover its neighbours and be cut off at the edge of a scrolling grid: its focus sits inside the cell as a 3-pixel `ink` ring between two 1-pixel `surface` rings. `ink` reaches at least 3.73:1 on `heat-0` to `heat-3` and `surface` 5.34:1 on `heat-4`, so the ring shows on every step.
8. **Type.** Headings use the display face at weight 600 with tight tracking. Body text uses the body face at 16 pixels minimum. Times and counts use tabular figures.
9. **Sizes.** A grid cell is at least `cell-min-width` by `cell-min-height`. Any other control is at least `touch-target` high on a touch screen. Running text is at most `measure` wide.
10. **Motion.** Transitions are 150 ms or shorter and are disabled when the viewer asks for reduced motion.
11. **Dark theme.** Not defined yet. It arrives in phase F4 as a second token block.
12. **Locked controls.** A control that cannot change keeps its value in `ink` on a `locked` fill with a `line` border, so the value stays readable. Directly below it, a lock icon in `ink-muted` and one sentence say why. A locked control is inactive, so its `line` border may stay below 3:1.
13. **Marks in the grid.** The fill carries the count and nothing else. Every other mark has a shape of its own and stays inside the cells it marks, so it never changes the layout or covers another cell's grid line. Each mark is `ink` with a `surface` strip beside it, so one of the two reaches 3:1 on every heat step.
    - A selected best window is stitched: a 2-pixel dashed `ink` line 1 pixel inside the window's edge, on a `surface` strip. Dashed means suggested.
    - The final time is sewn: a 4-pixel solid `ink` frame between 1-pixel `surface` rings, inside the window's edge. Solid means decided. A flag stands beside the frame's first row: a Phosphor flag icon in `surface` on an `ink` tab with a 1-pixel `surface` rim. It sits on the right when a day column follows and on the left otherwise, never over the time labels and never outside the grid. Its accessible name says "final time"; the legend and the banner above the grid carry the word.
    - A slot marked "if need be" in the participant's own grid is hatched at 135 degrees: 3-pixel stripes of `heat-4` on `heat-1`, 8 pixels apart. The legend names it.

## Components

Components come from shadcn and are copied into `apps/web/src/components/ui`. They read the variables that `tokens.css` defines, so a component is never given a literal color. Add a component with the shadcn CLI, then check it against the rules above.
