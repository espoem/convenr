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
    "available-strong": "#6A662B",
    "heat-0": "#EEE6DB",
    "heat-1": "#E6E2C4",
    "heat-2": "#BCB66B",
    "heat-3": "#898338",
    "heat-4": "#6A662B"
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

| Token                | Use                                                           | Measured contrast                                           |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `background`         | Page background                                               | Reference for the rows below                                |
| `surface`            | Cards, popovers, inputs                                       | `ink` on it: 11.42:1                                        |
| `ink`                | Text, icons                                                   | 10.76:1 on `background`                                     |
| `ink-muted`          | Secondary text                                                | 4.50:1 on `background`. Do not use it on `heat-0` or darker |
| `action`             | The primary button, links, the brand mark                     | 6.94:1 on `background`. `on-action` on it: 7.48:1           |
| `action-active`      | Hover and pressed state of `action`; destructive controls     | `on-action` on it: 6.82:1                                   |
| `earth`              | Input borders, cell outlines, focus ring, secondary controls  | 5.75:1 on `background`                                      |
| `line`               | Dividers that carry no meaning                                | Below 3:1 by design                                         |
| `available`          | Legend swatch and illustrations                               | 2.40:1 on `background`. Never the only edge of a control    |
| `heat-0` to `heat-4` | The five steps of the heat map, from nobody to more than 75 % | `heat-3`: 3.63:1 and `heat-4`: 5.49:1 on `background`       |

## Rules

1. **One red thing per screen.** `action` marks the single primary action. A second button on the same screen is outlined in `earth`.
2. **Olive means availability.** The `heat` and `available` tokens appear only in the grid, its legend and its summaries.
3. **Every grid cell has a 1-pixel `earth` outline.** The light heat steps have almost no contrast with the background, so the outline carries the shape.
4. **Color never carries the count alone.** A slot's count is also available as text.
5. **Text on the heat scale.** Grid cells contain no text, not even the time. Time labels sit on the edge of the grid, beside the first visible column, and stay there when the grid scrolls sideways. Where text must sit on a heat color, as in the legend, use `ink` on `heat-0` to `heat-2` (5.55:1 on `heat-2`) and `on-action` on `heat-4` (5.92:1). `heat-3` takes no text: white reaches 3.91:1 on it and `ink` 2.97:1.
6. **Destructive actions** use `action-active` as an outline and text color, and ask for confirmation inside the page.
7. **Focus** is a 2-pixel `earth` ring with a 2-pixel offset. It is never removed.
8. **Type.** Headings use the display face at weight 600 with tight tracking. Body text uses the body face at 16 pixels minimum. Times and counts use tabular figures.
9. **Sizes.** A grid cell is at least `cell-min-width` by `cell-min-height`. Any other control is at least `touch-target` high on a touch screen. Running text is at most `measure` wide.
10. **Motion.** Transitions are 150 ms or shorter and are disabled when the viewer asks for reduced motion.
11. **Dark theme.** Not defined yet. It arrives in phase F4 as a second token block.

## Components

Components come from shadcn and are copied into `apps/web/src/components/ui`. They read the variables that `tokens.css` defines, so a component is never given a literal color. Add a component with the shadcn CLI, then check it against the rules above.
