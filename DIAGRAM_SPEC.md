# MSK Diagram Labeler: draw the diagrams for one brick (spec)

The "MSK Diagram Labeler" is a study game. For each brick it shows simple, hand-drawn
schematic diagrams with numbered pins. Students play it in three modes: type each
structure's name, drag names from a word bank, or match each structure to its function
from a function bank. You write the data file for the brick(s) in your task.

## Inputs
- Lecture text: `C:\study-tools\msk_build\text\brick_NN.txt`. Read all of it. Draw only what
  the lecture teaches, and use its terminology.
- Brick list: `C:\study-tools\msk_build\bricks.tsv` (title = the tsv title).
- Worked example of the format and quality bar: `C:\study-tools\msk-labeler\data\brick_13.json`
  (a brachial plexus schematic).

## Output: `C:\study-tools\msk-labeler\data\brick_NN.json`
```json
{"brick": NN, "title": "<tsv title>",
 "diagrams": [
  {"title": "Short caption, e.g. Rotator cuff, posterior view (schematic)",
   "viewBox": "0 0 800 500",
   "svg": "<rect .../> <path .../> ...",
   "labels": [
     {"name": "Supraspinatus", "accept": ["supraspinatus muscle"],
      "function": "Initiates abduction of the arm (first 15 degrees)",
      "x": 412, "y": 160, "lx": 520, "ly": 90}
   ]}
 ]}
```
- **1-3 diagrams per brick, 6-12 labels each.** Choose the brick's most testable visual
  content: anatomy (regions, compartments, nerves and their territories, vessels, lymph
  nodes, joints, bursae, tunnels), histology (bone and cartilage zones, osteon, growth
  plate), or a process schematic for non-anatomy bricks. Examples of process schematics:
  - sarcomere bands and lines, or NMJ steps and drug/antibody targets;
  - fiber types, energy systems and metabolic pathways;
  - collagen/fibrillin synthesis steps, somite derivatives;
  - the dystrophin-glycoprotein complex, injury sites along a muscle-tendon unit;
  - the pain pathway with the site of each drug class.
  A process diagram's "function" is the role of that labeled element.
- `svg` is the inner markup only (no outer `<svg>` tag). Allowed: rect, circle, ellipse,
  path, line, polyline, polygon, g, text. No script, no event handlers, no external
  references, no images. Start with a background `<rect>` filling the viewBox (#f8f5ee).
- `x,y` is the exact point ON the structure. Optional `lx,ly` moves the numbered pin
  off the structure, with a dashed leader line drawn to it; use it when pins would
  crowd or cover the drawing. Keep every pin at least 30 units from every other pin
  and inside the viewBox.
- **No giveaways:** no text in the SVG may name or abbreviate any labeled structure.
  Orientation or level text is fine (Anterior, Lateral, C5, T1, Proximal, a scale note).
- `name`: the lecture's term. `accept`: common synonyms and abbreviations students may
  type (e.g. "ECRL", "flexor digitorum superficialis muscle", "FDS"). Never accept a
  term that also names a different structure in the same diagram.
- `function`: one line, at most about 70 characters, true per the lecture (action,
  innervation, supply/drainage, role, or clinical consequence of injury). It must not
  contain the structure's own name or its distinctive root. Functions within a diagram
  must be distinct and must not point to each other by name.

## Drawing style (keep it consistent)
- Simple, clean schematic shapes. Being anatomically recognizable beats detail. Outline
  stroke widths 2-4.
- Palette:
  - bone #e8dcc4 with stroke #7c6a4f; cartilage #bfdbfe with stroke #3b82f6;
  - muscle #e07a5f with stroke #9a3412; tendon/ligament #f5f0e1 with stroke #a8a29e;
  - nerve #eab308 (stroke-width 5-7); artery #dc2626; vein #2563eb; lymph #16a34a;
  - skin and soft tissue #f1d3b3; text #3b1d0a, Segoe UI, 14-18px.
- Distinguish adjacent structures by color, position or a white outline, so each pin
  clearly points at one thing.

## Mandatory self-check
After writing the file, run
`py C:\study-tools\msk-labeler\_render.py NN` and **Read every PNG it prints**
(`_renders\brick_NN_dK.png`). The PNG shows the pins and an answer key. Check:
- each pin sits on the intended structure and nothing is ambiguous;
- no overlapping text or pins, and the drawing is recognizable;
- no text names a pinned structure.

Fix and re-render until all of that holds. Then run
`py C:\study-tools\msk-labeler\_build.py` and confirm it prints no validation errors
(it may list other bricks; ignore those).

If several agents work in parallel, write only your own brick files.

Reply per brick with: the diagrams (title and label count), anything from the lecture
you chose not to draw, and confirmation that you viewed the final renders.
